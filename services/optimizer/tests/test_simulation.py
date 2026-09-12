from roadstar_optimizer.simulation import Replay

def test_pause_reset_replay_identical_conditions():
    r=Replay([[-79.9,43.5],[-79.91,43.5],[-79.91,43.51]],1000,dock_wait_seconds=120,route_evidence='synthetic-test-route')
    assert r.advance(100)['at_ms']==1000
    r.paused=False
    wait=r.advance(60)
    assert wait['odometerKm']==0
    point=r.advance(70)
    assert point['odometerKm']>0
    assert point['position']['lat']==43.5
    original=r.conditions_hash()
    r.reset();r.paused=False
    r.advance(60)
    assert r.advance(70)==point
    assert r.conditions_hash()==original
    r.disruption_seconds=60
    assert r.conditions_hash()!=original


def replay(**options):
    return Replay([[-79.9,43.5],[-79.901,43.5],[-79.902,43.5],[-79.903,43.5]],1000,stop_indices=[0,1,3],stop_wait_seconds=[3,13,7],route_evidence='synthetic-test-route',**options)


def test_acceleration_emits_identical_canonical_stop_and_road_events():
    expected=None
    for size in [1,7,60,3600]:
        r=replay();r.paused=False;events=[]
        remaining=3600
        while remaining:
            step=min(size,remaining);events.extend(r.advance_samples(step));remaining-=step
        if expected is None:
            expected=events
        assert events==expected
        assert len({e['at_ms'] for e in events})==3601
        at_stop=[e for e in events if e['position']=={'lng':-79.901,'lat':43.5}]
        assert len(at_stop)==14  # Arrival sample and all 13 seconds of dwell.


def test_seed_changes_motion_and_odometer_matches_integrated_speed():
    first=replay(seed=42);second=replay(seed=43)
    first.paused=False;second.paused=False
    events=first.advance_samples(60)
    assert events!=second.advance_samples(60)
    assert abs(sum(e['speedKph']/3600 for e in events)-events[-1]['odometerKm'])<1e-9
    assert all(a['odometerKm']<=b['odometerKm'] for a,b in zip(events,events[1:]))


def test_midroute_hold_consumes_time_without_teleporting_or_granting_rest():
    r=Replay([[-79.9,43.5],[-80,43.5]],1000,disruption_start_seconds=10,disruption_seconds=30,route_evidence='synthetic-test-route')
    r.paused=False;events=r.advance_samples(60)
    assert len({e['odometerKm'] for e in events[10:41]})==1
    assert all(e['duty']=='on_duty' for e in events[10:40])
    assert events[41]['odometerKm']>events[40]['odometerKm']
    r.reset();r.paused=False;assert r.advance_samples(60)==events


def test_pause_emits_nothing_and_geometry_and_stops_are_validated():
    import pytest
    r=replay();assert r.advance_samples(100)==[];assert r.elapsed_seconds==0
    with pytest.raises(ValueError):
        Replay([[0,0],[1,1]],0,stop_indices=[0,0,1],route_evidence='synthetic-test-route')
    with pytest.raises(ValueError):
        Replay([[0,0],[float('nan'),1]],0,route_evidence='synthetic-test-route')


def test_completion_forecast_is_exact_bounded_and_does_not_mutate_replay():
    import copy
    import pytest
    r=replay(disruption_seconds=60,disruption_start_seconds=5)
    before=copy.deepcopy(r.__dict__)
    end=r.forecast_completion_ms(True)
    assert r.__dict__==before
    assert r.forecast_completion_ms(False)<end
    r.paused=False
    r.advance_samples((end-r.start_time_ms)//1000-1)
    assert r.phase()!='route_complete'
    r.advance_samples(1)
    assert r.phase()=='route_complete'
    with pytest.raises(ValueError,match='forecast horizon'):
        r.forecast_completion_ms(True,max_seconds=1)


def test_slowdown_moves_continuously_consumes_driving_and_preserves_speed_integral():
    options=dict(coordinates=[[-79.9,43.5],[-80.4,43.5]],start_time_ms=1000,route_evidence='synthetic-test-route')
    baseline=Replay(**options);slow=Replay(**options,slowdown_start_seconds=60,slowdown_seconds=600,slowdown_factor=.25)
    baseline.paused=slow.paused=False
    normal=baseline.advance_samples(720);events=slow.advance_samples(720)
    assert events[:60]==normal[:60]
    assert events[60]['phase']=='road_slowdown' and events[660]['phase']=='driving'
    assert all(e['duty']=='driving' for e in events)
    assert all(b['odometerKm']>a['odometerKm'] for a,b in zip(events,events[1:]))
    for i in range(61,661):
        assert abs(events[i]['speedKph']-normal[i]['speedKph']*.25)<1e-9
    assert abs(events[661]['speedKph']-normal[661]['speedKph'])<1e-9
    assert abs(sum(e['speedKph']/3600 for e in events)-events[-1]['odometerKm'])<1e-9
    assert events[-1]['odometerKm']<normal[-1]['odometerKm']
    # Phase/duty is effective at t; speed records the interval ending at t.
    assert events[60]['speedKph']==normal[60]['speedKph']
    slow.reset();slow.paused=False
    assert slow.advance_samples(7)+slow.advance_samples(713)==events


def test_slowdown_forecast_excludes_unobserved_events_and_is_exact_without_mutation():
    import copy
    r=Replay([[-79.9,43.5],[-80,43.5]],1000,disruption_start_seconds=400,disruption_seconds=120,
             slowdown_start_seconds=20,slowdown_seconds=300,slowdown_factor=.3,route_evidence='synthetic-test-route')
    before=copy.deepcopy(r.__dict__)
    neutral=r.forecast_completion_ms(False,include_slowdown=False)
    slowdown=r.forecast_completion_ms(False,include_slowdown=True)
    all_events=r.forecast_completion_ms(True,include_slowdown=True)
    assert neutral<slowdown<all_events and r.__dict__==before
    r.paused=False;r.advance_samples((all_events-r.start_time_ms)//1000-1)
    assert r.phase()!='route_complete'
    r.advance_samples(1);assert r.phase()=='route_complete'


def test_slowdown_does_not_turn_dock_or_stationary_hold_into_driving():
    r=Replay([[-79.9,43.5],[-80,43.5]],0,dock_wait_seconds=10,disruption_start_seconds=15,disruption_seconds=5,
             slowdown_start_seconds=0,slowdown_seconds=30,slowdown_factor=.2,route_evidence='synthetic-test-route')
    r.paused=False;events=r.advance_samples(40)
    assert all(e['phase']=='dock_wait' and e['duty']=='on_duty' for e in events[:10])
    assert all(e['phase']=='road_hold' and e['duty']=='on_duty' for e in events[15:20])
    assert events[20]['phase']=='road_slowdown' and events[20]['duty']=='driving'
    assert events[30]['phase']=='driving'


def test_legacy_fingerprint_and_slowdown_validation():
    import pytest
    options=dict(coordinates=[[-79.9,43.5],[-79.91,43.5]],start_time_ms=1000,route_evidence='synthetic-test-route')
    legacy=Replay(**options)
    assert legacy.conditions_hash()=='b70fd2ce8df280aa4272b9eed6566f976340ead3669824fe4ff890f045d49452'
    assert legacy.initial_conditions()['model_version']=='road-events-v2'
    assert Replay(**options,slowdown_seconds=60).initial_conditions()['model_version']=='road-events-v3'
    for factor in [0,1,-1,float('nan'),float('inf')]:
        with pytest.raises(ValueError,match='Slowdown factor'):Replay(**options,slowdown_factor=factor)
    for key in ['slowdown_seconds','slowdown_start_seconds']:
        with pytest.raises(ValueError,match='event durations'):Replay(**options,**{key:-1})
