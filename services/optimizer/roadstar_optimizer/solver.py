from datetime import datetime
from hashlib import sha256
import json
from typing import Literal
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from pydantic import BaseModel, Field, model_validator

class Vehicle(BaseModel):
    id: str
    equipment: str
    capacity_lb: int = Field(gt=0)
    pallet_capacity: int = Field(gt=0)
    driving_minutes: int = Field(ge=0, le=1440)
    duty_minutes: int = Field(ge=0, le=1440)
    shift_minutes: int = Field(ge=0, le=1440)
    cycle_minutes: int = Field(ge=0)
    available_at: int = Field(ge=0, le=1440)
    evidence_at: datetime
    maintenance_hold: bool = False

class Shipment(BaseModel):
    id: str
    equipment: str
    weight_lb: int = Field(gt=0)
    pallets: int = Field(gt=0)
    mode: Literal['FTL', 'LTL']
    pickup_window: tuple[int, int]
    delivery_window: tuple[int, int]
    pickup_service: int = Field(ge=0)
    delivery_service: int = Field(ge=0)

class Problem(BaseModel):
    now: datetime
    vehicles: list[Vehicle] = Field(min_length=1, max_length=131)
    loads: list[Shipment] = Field(min_length=1, max_length=200)
    # For each truck, start nodes (one per truck), then pickup/delivery pairs,
    # and a final zero-cost open-route sink. Values are integer road minutes.
    matrices: list[list[list[int]]]
    routing_evidence: Literal['valhalla-truck', 'synthetic-test-matrix']
    evidence_ref: str = Field(min_length=1)
    time_limit_seconds: int = Field(default=3, ge=1, le=15)

    @model_validator(mode='after')
    def valid_matrices(self):
        n = len(self.vehicles) + 2 * len(self.loads) + 1
        if self.now.tzinfo is None or any(v.evidence_at.tzinfo is None for v in self.vehicles):
            raise ValueError('Planning and HOS evidence timestamps require timezones')
        if len(self.matrices) != len(self.vehicles):
            raise ValueError('One vehicle-specific route matrix is required per truck')
        for m in self.matrices:
            if len(m) != n or any(len(row) != n or any(not isinstance(x, int) or x < 0 for x in row) for row in m):
                raise ValueError('Matrix shape or nonnegative integer minutes invalid')
            if any(row[-1] != 0 for row in m):
                raise ValueError('Open-route sink must have zero travel cost')
        for load in self.loads:
            if any(not 0 <= lo <= hi <= 1440 for lo, hi in [load.pickup_window, load.delivery_window]):
                raise ValueError('Time windows require 0 <= start <= end <= 1440')
        if len({v.id for v in self.vehicles}) != len(self.vehicles) or len({l.id for l in self.loads}) != len(self.loads):
            raise ValueError('Duplicate vehicle/load IDs')
        return self

def solve(problem: Problem):
    count = len(problem.vehicles)
    n = count + len(problem.loads) * 2 + 1
    manager = pywrapcp.RoutingIndexManager(n, count, list(range(count)), [n - 1] * count)
    routing = pywrapcp.RoutingModel(manager)
    services = [0] * n
    weights = [0] * n
    pallets = [0] * n
    for i, load in enumerate(problem.loads):
        p = count + 2 * i
        services[p:p+2] = [load.pickup_service, load.delivery_service]
        weights[p:p+2] = [load.weight_lb, -load.weight_lb]
        pallets[p:p+2] = [load.pallets, -load.pallets]
    drives, works = [], []
    for vehicle, matrix in enumerate(problem.matrices):
        drive = routing.RegisterTransitCallback(lambda a, b, m=matrix: m[manager.IndexToNode(a)][manager.IndexToNode(b)])
        work = routing.RegisterTransitCallback(lambda a, b, m=matrix: m[manager.IndexToNode(a)][manager.IndexToNode(b)] + services[manager.IndexToNode(a)])
        drives.append(drive)
        works.append(work)
        routing.SetArcCostEvaluatorOfVehicle(drive, vehicle)
    routing.AddDimensionWithVehicleTransitAndCapacity(drives, 0, [v.driving_minutes for v in problem.vehicles], True, 'Drive')
    routing.AddDimensionWithVehicleTransitAndCapacity(works, 0, [min(v.duty_minutes, v.cycle_minutes) for v in problem.vehicles], True, 'Duty')
    routing.AddDimensionWithVehicleTransits(works, 1440, 1440, False, 'Time')
    time = routing.GetDimensionOrDie('Time')
    for vehicle, v in enumerate(problem.vehicles):
        time.CumulVar(routing.Start(vehicle)).SetRange(v.available_at, v.available_at)
        time.CumulVar(routing.End(vehicle)).SetRange(v.available_at, max(v.available_at, min(1440, v.shift_minutes, v.available_at + min(v.duty_minutes, v.cycle_minutes))))
    for name, demands, capacities in [('Weight', weights, [v.capacity_lb for v in problem.vehicles]), ('Pallets', pallets, [v.pallet_capacity for v in problem.vehicles])]:
        callback = routing.RegisterUnaryTransitCallback(lambda a, d=demands: d[manager.IndexToNode(a)])
        routing.AddDimensionWithVehicleCapacity(callback, 0, capacities, True, name)
    rejected = []
    compatible_by_load = {}
    for i, load in enumerate(problem.loads):
        p, d = manager.NodeToIndex(count + 2*i), manager.NodeToIndex(count + 2*i + 1)
        routing.AddPickupAndDelivery(p, d)
        routing.solver().Add(routing.VehicleVar(p) == routing.VehicleVar(d))
        routing.solver().Add(time.CumulVar(p) <= time.CumulVar(d))
        routing.solver().Add(routing.ActiveVar(p) == routing.ActiveVar(d))
        time.CumulVar(p).SetRange(*load.pickup_window)
        time.CumulVar(d).SetRange(*load.delivery_window)
        routing.AddDisjunction([p], 1000000)
        routing.AddDisjunction([d], 1000000)
        allowed = [j for j, v in enumerate(problem.vehicles) if v.available_at < v.shift_minutes and v.equipment == load.equipment and v.capacity_lb >= load.weight_lb and v.pallet_capacity >= load.pallets and not v.maintenance_hold and 0 <= (problem.now - v.evidence_at).total_seconds() <= 900]
        compatible_by_load[load.id] = allowed
        # SetValues includes -1 so optional incompatible shipments can be dropped.
        routing.VehicleVar(p).SetValues([-1] + allowed)
        routing.VehicleVar(d).SetValues([-1] + allowed)
        if load.mode == 'FTL':
            # An FTL pickup goes straight to its delivery (no intervening LTL stop).
            routing.solver().Add(routing.ActiveVar(p) * (routing.NextVar(p) - d) == 0)
            # Do not pick up FTL while another shipment is already aboard.
            routing.solver().Add(routing.ActiveVar(p) * routing.GetDimensionOrDie('Weight').CumulVar(p) == 0)
        if not allowed:
            rejected.append({'load_id': load.id, 'reason': 'No equipment/capacity/maintenance/HOS-evidence compatible vehicle'})
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = problem.time_limit_seconds
    solution = routing.SolveWithParameters(params)
    # Approval must reject proposals computed before waiting counted as duty.
    fingerprint = sha256(json.dumps({'policy': 'on-duty-wait-v2', 'problem': problem.model_dump(mode='json')}, sort_keys=True).encode()).hexdigest()
    if not solution:
        return {'status': 'no_solution_found', 'routes': [], 'infeasible_loads': [{'load_id': l.id, 'reason': 'No solution found within bounded search; infeasibility not proven'} for l in problem.loads], 'input_hash': fingerprint}
    routes = []
    for vehicle, v in enumerate(problem.vehicles):
        index, stops = routing.Start(vehicle), []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if count <= node < n - 1:
                i, side = divmod(node-count, 2)
                stops.append({'load_id': problem.loads[i].id, 'stop': 'pickup' if side == 0 else 'delivery', 'minute': solution.Value(time.CumulVar(index))})
            index = solution.Value(routing.NextVar(index))
        if stops:
            routes.append({'vehicle_id': v.id, 'stops': stops, 'driving_minutes': solution.Value(routing.GetDimensionOrDie('Drive').CumulVar(index)), 'duty_minutes': solution.Value(time.CumulVar(index)) - v.available_at})
    for i, load in enumerate(problem.loads):
        p = manager.NodeToIndex(count+2*i)
        if solution.Value(routing.NextVar(p)) == p and not any(x['load_id'] == load.id for x in rejected):
            compatible = compatible_by_load[load.id]
            before_release = compatible and all(problem.vehicles[j].available_at > load.pickup_window[1] for j in compatible)
            reason = ('Pickup closes before every compatible vehicle finishes its committed work.' if before_release else 'Unserved under supported time-window, capacity and declared duty limits; optimality not proven')
            rejected.append({'load_id': load.id, 'reason': reason})
    return {'status': 'proposal', 'routes': routes, 'infeasible_loads': rejected, 'input_hash': fingerprint, 'routing_evidence': problem.routing_evidence, 'evidence_ref': problem.evidence_ref, 'assumptions': ['Declared HOS budgets, not certified ELD', 'Planned waiting counts as on-duty time', 'No legal break/rest scheduling', 'Open routes; no forced depot return', 'No independent dispatch authority'], 'modeled': True}
