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

def test_later_availability_cannot_restart_the_absolute_shift_window():
    p=problem()
    p.vehicles[0].available_at=100
    p.vehicles[0].shift_minutes=150
    p.loads[0].pickup_window=(100,140)
    p.loads[0].delivery_window=(140,240)
    assert solve(p)['routes']==[]  # 70 minutes needed; only 50 remain, not a fresh 150.
    p.vehicles[0].shift_minutes=180
    assert len(solve(p)['routes'])==1
    p.vehicles[0].available_at=200
    assert solve(p)['routes']==[]  # Exhausted vehicle remains an unused optional vehicle.


def test_return_pickup_before_committed_release_explains_rejection_and_selects_alternative():
    p=problem()
    p.vehicles[0].available_at=120
    p.loads[0].pickup_window=(100,100)
    alternate=p.loads[0].model_copy(update={'id':'RETURN-LATER','pickup_window':(150,150),'delivery_window':(150,300)})
    p.loads.append(alternate)
    # Closest pickup takes zero minutes, but its appointment already closed.
    p.matrices=[[[0,0,30,10,40,0],[0,0,30,10,40,0],[30,30,0,20,0,0],[10,10,20,0,30,0],[40,40,0,30,0,0],[0,0,0,0,0,0]]]
    result=solve(Problem.model_validate(p.model_dump()))
    assert [s['load_id'] for s in result['routes'][0]['stops']]==['RETURN-LATER','RETURN-LATER']
    assert result['infeasible_loads']==[{'load_id':'L1','reason':'Pickup closes before every compatible vehicle finishes its committed work.'}]
    # Release the vehicle earlier; now the closest return can serve.
    p.vehicles[0].available_at=90
    result=solve(p)
    assert any(s['load_id']=='L1' for r in result['routes'] for s in r['stops'])
    assert not any('every compatible' in r['reason'] for r in result['infeasible_loads'])


def test_reported_duty_includes_planned_wait_so_following_load_cannot_reuse_it():
    p=problem()
    p.loads[0].pickup_window=(100,100)
    result=solve(p)
    route=result['routes'][0]
    assert route['driving_minutes']==40
    # Start 0, travel 10, wait 90, pickup 15, travel 30, delivery 15.
    assert route['duty_minutes']==160
    # Persisted pre-fix proposals must fail the existing approval hash check.
    from hashlib import sha256
    import json
    legacy_hash=sha256(json.dumps(p.model_dump(mode='json'),sort_keys=True).encode()).hexdigest()
    assert result['input_hash']!=legacy_hash
    # Waiting is on duty, never an inferred rest break or a fresh HOS budget.
    p.vehicles[0].duty_minutes=159
    assert solve(p)['routes']==[]


def test_ltl_axle_groups_limit_simultaneous_cargo_even_when_gross_payload_fits():
    p=problem()
    p.vehicles[0].axle_capacity_g=(1000000,1000000,10000000)
    p.loads[0].mode='LTL'
    p.loads[0].allowed_vehicles=['truck-1']
    p.loads[0].axle_demands_g={'truck-1':(0,0,6000000)}
    p.loads[0].pickup_window=(10,10)
    p.loads[0].delivery_window=(100,200)
    p.loads.append(p.loads[0].model_copy(deep=True,update={'id':'L2'}))
    # Both pickups are at minute 10, deliveries >=100. Serving both requires
    # 12t on a group with 10t remaining, although 40k lb gross payload fits.
    p.loads[0].pickup_service=0
    p.loads[1].pickup_service=0
    p.matrices=[[[0,10,40,10,40,0],[10,0,30,0,30,0],[40,30,0,30,0,0],[10,0,30,0,30,0],[40,30,0,30,0,0],[0,0,0,0,0,0]]]
    result=solve(Problem.model_validate(p.model_dump()))
    assert len(result['routes'])==1
    assert len({s['load_id'] for s in result['routes'][0]['stops']})==1
    assert len(result['infeasible_loads'])==1
    p.vehicles[0].axle_capacity_g=(1000000,1000000,12000000)
    result=solve(p)
    assert len({s['load_id'] for s in result['routes'][0]['stops']})==2


def test_assessed_vehicle_requires_per_load_reactions_and_respects_pair_exclusions():
    import pytest
    p=problem()
    p.vehicles[0].axle_capacity_g=(1,1,1)
    with pytest.raises(ValueError):
        Problem.model_validate(p.model_dump())
    p.loads[0].allowed_vehicles=[]
    p.loads[0].axle_demands_g={'truck-1':(-1,0,0)}
    with pytest.raises(ValueError):
        Problem.model_validate(p.model_dump())
    p.loads[0].axle_demands_g={}
    result=solve(Problem.model_validate(p.model_dump()))
    assert result['routes']==[]
