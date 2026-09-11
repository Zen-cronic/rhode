import asyncio
import importlib.util
from pathlib import Path
import sys
import httpx
import pytest
from roadstar_optimizer.simulation import Replay

spec=importlib.util.spec_from_file_location('roadstar_simulator_test',Path(__file__).resolve().parents[2]/'simulator'/'app.py')
sim=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=sim
spec.loader.exec_module(sim)


def install_run(monkeypatch):
    replay=Replay([[-79.9,43.5],[-79.91,43.5]],1000,route_evidence='synthetic-test-route')
    replay.paused=False
    run={'replay':replay,'assignment_id':'assignment','carrier_id':'test','events':[],'pending':None,'emit_mode':None}
    monkeypatch.setattr(sim,'runs',{'run':run})
    monkeypatch.setattr(sim,'lock',asyncio.Lock())
    return run


def test_lost_ack_retries_exact_batch_and_cannot_discard_pending(monkeypatch):
    run=install_run(monkeypatch)
    monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    saved={};requests=[];clock={'clock':'1970-01-01T00:00:01Z','version':1};failed=False
    def handler(request):
        nonlocal failed
        import json
        if request.url.path=='/api/telemetry':
            event=json.loads(request.content);requests.append(event['id']);saved[event['id']]=event
            if len(saved)==3 and not failed:
                failed=True
                return httpx.Response(503,json={'error':'lost acknowledgment'})
            return httpx.Response(200,json={'disposition':'applied'})
        if request.method=='GET':
            return httpx.Response(200,json=clock)
        body=json.loads(request.content)
        assert request.headers['If-Match']==str(clock['version'])
        clock.update(clock=body['at'],version=clock['version']+1)
        return httpx.Response(200,json=clock)
    original=httpx.AsyncClient
    monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
    async def exercise():
        with pytest.raises(sim.HTTPException):
            await sim.advance('run',sim.Advance(seconds=10))
        assert run['pending']['sent']==2
        with pytest.raises(sim.HTTPException):
            await sim.reset('run')
        with pytest.raises(sim.HTTPException):
            await sim.advance('run',sim.Advance(seconds=10,emit=False))
        result=await sim.advance('run',sim.Advance(seconds=100))
        assert result['elapsed_seconds']==10  # Retry does not advance the clock another 100 seconds.
        assert len(saved)==len(run['events'])==11
        assert len(requests)==12 and requests[2]==requests[3]
        assert run['pending'] is None
        before=[e['id'] for e in result['events']]
        await sim.reset('run');await sim.resume('run')
        replayed=await sim.advance('run',sim.Advance(seconds=10))
        assert [e['id'] for e in replayed['events']]==before
        assert len(saved)==11
    asyncio.run(exercise())


def test_pause_and_missing_token_preserve_observations(monkeypatch):
    run=install_run(monkeypatch);monkeypatch.delenv('SIMULATOR_TOKEN',raising=False)
    async def exercise():
        await sim.pause('run')
        assert (await sim.advance('run',sim.Advance(seconds=60)))['events']==[]
        await sim.resume('run')
        with pytest.raises(sim.HTTPException):
            await sim.advance('run',sim.Advance(seconds=60))
        assert len(run['pending']['events'])==61
        assert run['pending']['sent']==0
    asyncio.run(exercise())


def test_service_preserves_route_leg_boundaries_and_per_stop_waits(monkeypatch):
    install_run(monkeypatch)
    async def routed(_):
        return {'route':{'trip':{'legs':[{'shape':{'type':'LineString','coordinates':[[-79.9,43.5],[-79.901,43.5]]}},{'shape':{'type':'LineString','coordinates':[[-79.901,43.5],[-79.902,43.5]]}}]}}}
    monkeypatch.setattr(sim,'valhalla_route',routed)
    data=sim.Start(assignment_id='a',carrier_id='c',start_time='2026-09-13T12:00:00Z',stop_wait_seconds=[0,7200,0],route={'locations':[{'lat':43.5,'lon':-79.9},{'lat':43.5,'lon':-79.902}],'truck':{'height':4.1,'width':2.6,'length':23,'weight':40,'axle_load':9,'hazmat':False,'evidence':'synthetic-scenario'}})
    result=asyncio.run(sim.create(data))
    assert result['stop_indices']==[0,1,2]
    assert sim.runs[result['id']]['replay'].stop_wait_seconds==[0,7200,0]


def test_pause_and_status_remain_responsive_during_a_slow_batch(monkeypatch):
    run=install_run(monkeypatch);monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    original=httpx.AsyncClient
    async def exercise():
        started=asyncio.Event();release=asyncio.Event();held=False
        async def handler(request):
            nonlocal held
            if request.url.path=='/api/telemetry':
                if not held:
                    held=True;started.set();await release.wait()
                return httpx.Response(200,json={'disposition':'applied'})
            return httpx.Response(200,json={'clock':'1970-01-01T00:00:01Z','version':1})
        monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
        task=asyncio.create_task(sim.advance('run',sim.Advance(seconds=10)))
        await asyncio.wait_for(started.wait(),1)
        assert (await asyncio.wait_for(sim.state('run'),1))['advancing']
        with pytest.raises(sim.HTTPException):
            await sim.advance('run',sim.Advance(seconds=10))
        await asyncio.wait_for(sim.pause('run'),1)
        release.set();result=await task
        assert result['pending'] and result['elapsed_seconds']==0
        assert len(run['events'])==1
        await sim.resume('run')
        resumed=await sim.advance('run',sim.Advance(seconds=999))
        assert resumed['elapsed_seconds']==10 and not resumed['pending']
        assert len(run['events'])==11
    asyncio.run(exercise())


def test_delay_lost_ack_retries_exact_command_after_observation_and_clock(monkeypatch):
    import json
    run=install_run(monkeypatch)
    run['replay']=Replay([[-79.9,43.5],[-79.91,43.5]],1000,disruption_start_seconds=2,disruption_seconds=120,route_evidence='synthetic-test-route')
    run['replay'].paused=False
    monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    posts=[];stored={};observed=[];contexts=[];clock={'clock':'1970-01-01T00:00:01Z','version':1}
    def handler(request):
        if request.url.path=='/api/simulation-assignment':
            contexts.append(request)
            return httpx.Response(200,json={'version':2+len(stored),'endAt':'1970-01-01T00:01:00Z'})
        if request.method=='GET':
            return httpx.Response(200,json=clock)
        body=json.loads(request.content)
        if request.url.path=='/api/telemetry':
            observed.append(body['at']);return httpx.Response(200,json={})
        if request.url.path=='/api/simulation-clock':
            clock.update(clock=body['at'],version=clock['version']+1);return httpx.Response(200,json=clock)
        assert request.url.path=='/api/delay'
        assert body['observedAt']==clock['clock']==observed[-1]
        posts.append((request.headers['Idempotency-Key'],request.headers['If-Match'],body))
        stored[posts[-1][0]]={'status':'awaiting_recovery','impactedLoads':[{'load_id':'next-load'}]}
        return httpx.Response(503 if len(posts)==1 else 200,json=stored[posts[-1][0]])
    original=httpx.AsyncClient
    monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
    async def exercise():
        await sim.advance('run',sim.Advance(seconds=1))
        assert not posts and not contexts  # A future configured road hold is not yet observed.
        with pytest.raises(sim.HTTPException):
            await sim.advance('run',sim.Advance(seconds=4))
        assert run['pending']['sent']==1
        result=await sim.advance('run',sim.Advance(seconds=999))
        assert result['elapsed_seconds']==5 and not result['pending']
        assert posts[0]==posts[1] and len(posts)==2 and len(stored)==len(contexts)==1
        assert (await sim.state('run'))['delay_reports'][0]['result']['impactedLoads'][0]['load_id']=='next-load'
        await sim.reset('run');await sim.resume('run')
        await sim.advance('run',sim.Advance(seconds=5))
        assert len(posts)==2
    asyncio.run(exercise())


def test_export_dock_wait_never_calls_operational_api(monkeypatch):
    run=install_run(monkeypatch)
    run['replay']=Replay([[-79.9,43.5],[-79.91,43.5]],1000,dock_wait_seconds=7200,route_evidence='synthetic-test-route')
    run['replay'].paused=False
    def forbidden(**kwargs):
        raise AssertionError('Export must not call operational API')
    monkeypatch.setattr(sim.httpx,'AsyncClient',forbidden)
    result=asyncio.run(sim.advance('run',sim.Advance(seconds=10,emit=False)))
    assert not result['emitted'] and run.get('delay_reports') is None
