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
