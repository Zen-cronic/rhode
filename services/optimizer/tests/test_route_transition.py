import copy
import pytest
from roadstar_optimizer.simulation import Replay
from roadstar_optimizer.route_transition import replace_remaining_route


def base(waits=None):
    return Replay([[-79.9,43.5],[-79.89,43.5],[-79.88,43.5]],1000,seed=4,
                  stop_indices=[0,1,2],stop_wait_seconds=waits or [0,20,30],route_evidence='synthetic-test-route')


def alternate(replay):
    p=replay.sample()['position']; points=[[p['lng'],p['lat']]]; stops=[0]
    for index in replay.stop_indices[replay._next_stop:]:
        endpoint=replay.coordinates[index]
        points.extend([[endpoint[0]-.001,endpoint[1]+.001],list(endpoint)])
        stops.append(len(points)-1)
    return points,stops


def test_transition_preserves_elapsed_distance_history_and_remaining_dock_work():
    old=base();old.paused=False;history=old.advance_samples(10);old.paused=True
    original=copy.deepcopy(old.__dict__);points,stops=alternate(old)
    result=replace_remaining_route(old,points,stops);new=result.replay
    assert old.__dict__==original
    assert result.at_seconds==10 and result.retained_odometer_km==old._distance
    assert new.sample()==old.sample()
    assert new.paused and new._next_stop==old._next_stop
    assert new.stop_wait_seconds==old.stop_wait_seconds
    assert result.remaining_stop_wait_seconds==[20,30]
    assert result.previous_conditions_hash!=result.conditions_hash
    assert history[-1]['at_ms']==new.sample()['at_ms']
    new.paused=False;events=new.advance_samples(1)
    assert len(events)==1 and events[0]['at_ms']==history[-1]['at_ms']+1000
    assert events[0]['odometerKm']>history[-1]['odometerKm']


def test_transition_keeps_remaining_queue_and_global_road_hold_without_rest_credit():
    old=base([100,20,30]);old.disruption_start_seconds=20;old.disruption_seconds=40
    old.paused=False;old.advance_samples(10);old.paused=True
    result=replace_remaining_route(old,*alternate(old));new=result.replay
    assert result.retained_wait_seconds==90 and new._wait==90
    assert new.disruption_seconds==40 and new.disruption_start_seconds==20
    new.paused=False;events=new.advance_samples(20)
    assert all(e['duty']=='on_duty' and e['odometerKm']==0 for e in events)
    assert new._wait==70


def test_transition_at_intermediate_dock_retains_completed_stop_and_future_dwell():
    old=base();old.paused=False
    while old._next_stop<2:old.advance_samples(1)
    old.advance_samples(5);old.paused=True
    new=replace_remaining_route(old,*alternate(old)).replay
    assert new._wait==15 and new._next_stop==2
    assert new.stop_wait_seconds==[0,20,30]
    assert new.sample()==old.sample()


def test_post_transition_motion_is_independent_of_advance_batch_sizes():
    old=base();old.paused=False;old.advance_samples(10);old.paused=True
    a=replace_remaining_route(old,*alternate(old)).replay
    b=replace_remaining_route(old,*alternate(old)).replay
    a.paused=b.paused=False
    expected=a.advance_samples(100)
    actual=b.advance_samples(7)+b.advance_samples(23)+b.advance_samples(70)
    assert actual==expected


def test_transition_refuses_motion_gaps_missing_stops_and_changed_stop_order():
    old=base();points,stops=alternate(old)
    old.paused=False
    with pytest.raises(ValueError,match='Pause'):replace_remaining_route(old,points,stops)
    old.paused=True
    moved=copy.deepcopy(points);moved[0][0]+=.001
    with pytest.raises(ValueError,match='no bridge'):replace_remaining_route(old,moved,stops)
    with pytest.raises(ValueError,match='every outstanding'):replace_remaining_route(old,[points[0],points[-1]],[0,1])
    wrong=copy.deepcopy(points);wrong[stops[1]],wrong[stops[2]]=wrong[stops[2]],wrong[stops[1]]
    with pytest.raises(ValueError,match='order or location'):replace_remaining_route(old,wrong,stops)
    old.paused=False
    while old.phase()!='route_complete':old.advance_samples(1)
    old.paused=True
    with pytest.raises(ValueError,match='completed'):replace_remaining_route(old,points,stops)


def test_transition_keeps_completed_stop_index_at_duplicate_leg_vertex():
    old=Replay([[-79.9,43.5],[-79.899,43.5],[-79.899,43.5],[-79.89,43.5]],1000,
               stop_indices=[0,2,3],stop_wait_seconds=[0,0,5],route_evidence='synthetic-test-route')
    old.paused=False
    while old._next_stop<2:old.advance_samples(1)
    old.paused=True
    new=replace_remaining_route(old,*alternate(old)).replay
    assert new.sample()==old.sample()
    assert new.stop_indices[1]==2 and new.coordinates[1]==new.coordinates[2]


def test_transition_retains_active_global_slowdown_without_resetting_duration():
    old=base();old.slowdown_start_seconds=5;old.slowdown_seconds=60;old.slowdown_factor=.25
    old.paused=False;old.advance_samples(10);old.paused=True
    new=replace_remaining_route(old,*alternate(old)).replay
    assert new.sample()==old.sample() and new.phase()=='road_slowdown'
    assert (new.slowdown_start_seconds,new.slowdown_seconds,new.slowdown_factor)==(5,60,.25)
    assert new.initial_conditions()['model_version']=='road-events-v3'
    new.paused=False;events=new.advance_samples(60)
    assert events[-1]['at_ms']==old.start_time_ms+70000
    assert new.elapsed_seconds==70 and not new._slowed()
