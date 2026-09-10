from roadstar_optimizer.solver import Problem, solve

def problem(**vehicle_changes):
    vehicle = dict(id='truck-1',equipment='Dry Van',capacity_lb=44000,pallet_capacity=26,driving_minutes=300,duty_minutes=400,shift_minutes=480,cycle_minutes=600,available_at=0,evidence_at='2026-09-13T12:00:00Z',**vehicle_changes)
    return Problem.model_validate(dict(now='2026-09-13T12:00:00Z',vehicles=[vehicle],loads=[dict(id='L1',equipment='Dry Van',weight_lb=20000,pallets=10,mode='FTL',pickup_window=[0,60],delivery_window=[30,240],pickup_service=15,delivery_service=15)],matrices=[[[0,10,40,0],[10,0,30,0],[40,30,0,0],[0,0,0,0]]],routing_evidence='synthetic-test-matrix',evidence_ref='test fixture',time_limit_seconds=1))

def test_feasible_route_has_pickup_then_delivery_and_real_solver_cost():
    result=solve(problem())
    assert result['status']=='proposal'
    assert [s['stop'] for s in result['routes'][0]['stops']]==['pickup','delivery']
    assert result['routes'][0]['driving_minutes']==40
    assert result['infeasible_loads']==[]

def test_maintenance_rejects_instead_of_fabricating_assignment():
    result=solve(problem(maintenance_hold=True))
    assert result['routes']==[]
    assert result['infeasible_loads'][0]['load_id']=='L1'

def test_input_hash_is_stable_and_delay_recomputes():
    p=problem()
    first=solve(p)
    assert solve(p)['input_hash']==first['input_hash']
    p.vehicles[0].available_at=250
    delayed=solve(p)
    assert delayed['routes']==[]
    assert delayed['input_hash']!=first['input_hash']

def test_overweight_and_stale_hos_are_exposed():
    p=problem()
    p.loads[0].weight_lb=45000
    assert solve(p)['routes']==[]
    p=problem()
    p.now=p.now.replace(hour=13)
    assert solve(p)['routes']==[]
