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


@pytest.fixture(autouse=True)
def isolated_checkpoints(monkeypatch, tmp_path):
    monkeypatch.setenv('SIMULATOR_STATE_DIR', str(tmp_path))


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
        sim.runs.clear()
        restored=sim.get('run')
        assert restored['replay'].paused and restored['pending']==run['pending']
        await sim.resume('run')
        result=await sim.advance('run',sim.Advance(seconds=100))
        run.update(restored)
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
        sim.runs.clear()
        restored=sim.get('run')
        assert restored['replay'].paused
        await sim.resume('run')
        result=await sim.advance('run',sim.Advance(seconds=999))
        run.update(restored)
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


def test_corrupt_checkpoint_is_not_silently_recreated(monkeypatch):
    install_run(monkeypatch)
    sim.checkpoint_path('broken').write_text('{broken')
    with pytest.raises(sim.HTTPException) as error:
        sim.get('broken')
    assert error.value.status_code == 503
    assert sim.checkpoint_path('broken').read_text() == '{broken'
    with pytest.raises(sim.HTTPException):
        sim.get('../escape')


def test_storage_failure_prevents_network_delivery(monkeypatch):
    run=install_run(monkeypatch)
    def fail(_):
        raise sim.HTTPException(503,'Storage unavailable')
    monkeypatch.setattr(sim,'save_run',fail)
    def forbidden(**kwargs):
        raise AssertionError('No network delivery before durable pending batch')
    monkeypatch.setattr(sim.httpx,'AsyncClient',forbidden)
    with pytest.raises(sim.HTTPException):
        asyncio.run(sim.advance('run',sim.Advance(seconds=3)))
    assert run['pending']['sent']==0


def test_actual_service_restart_preserves_run_identity_and_motion(monkeypatch, tmp_path):
    import os, socket, subprocess, time
    run=install_run(monkeypatch)
    run['run_id']='run'
    sim.save_run(run)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    command=[sys.executable,'-m','uvicorn','app:app','--app-dir',str(Path(sim.__file__).parent),'--host','127.0.0.1','--port',str(port),'--log-level','error']
    env={**os.environ,'SIMULATOR_STATE_DIR':str(tmp_path)}
    def launch():
        process=subprocess.Popen(command,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        for _ in range(100):
            if process.poll() is not None:
                raise AssertionError(process.stderr.read().decode())
            try:
                if httpx.get(f'http://127.0.0.1:{port}/runs',timeout=.2).status_code==200:return process
            except httpx.HTTPError:pass
            time.sleep(.05)
        process.kill();process.wait();raise AssertionError('Simulator startup timed out')
    process=launch()
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}') as client:
            assert client.get('/runs').json()['runs']==['run']
            assert client.get('/runs/run').json()['paused']
            client.post('/runs/run/resume').raise_for_status()
            first=client.post('/runs/run/advance',json={'seconds':7,'emit':False}).json()
            process.kill();process.wait();process=launch()
            restored=client.get('/runs/run').json()
            assert restored['paused'] and restored['restored']
            assert restored['events']==first['events']
            assert restored['generated_until_seconds']==7
            client.post('/runs/run/resume').raise_for_status()
            following=client.post('/runs/run/advance',json={'seconds':7,'emit':False}).json()
            assert following['generated_until_seconds']==14
            baseline=Replay([[-79.9,43.5],[-79.91,43.5]],1000,route_evidence='synthetic-test-route');baseline.paused=False;baseline.advance(14)
            assert following['event']['odometerKm']==baseline.sample()['odometerKm']
            assert following['event']['position']==baseline.sample()['position']
            client.post('/runs/run/reset').raise_for_status();client.post('/runs/run/resume').raise_for_status()
            replayed=client.post('/runs/run/advance',json={'seconds':7,'emit':False}).json()
            assert replayed['events']==first['events']
    finally:
        process.kill();process.wait()


def test_recovered_run_cannot_be_retargeted_to_another_api(monkeypatch):
    run=install_run(monkeypatch)
    sim.get('run')
    sim.save_run(run)
    sim.runs.clear()
    monkeypatch.setenv('ROADSTAR_API','https://different.invalid')
    with pytest.raises(sim.HTTPException) as error:
        asyncio.run(sim.advance('run',sim.Advance(seconds=1)))
    assert error.value.status_code==409


def test_atomic_replace_failure_preserves_prior_checkpoint_and_pauses(monkeypatch):
    run=install_run(monkeypatch);sim.get('run');sim.save_run(run)
    before=sim.checkpoint_path('run').read_bytes()
    def fail(*args):raise OSError('disk unavailable')
    monkeypatch.setattr(sim.os,'replace',fail)
    with pytest.raises(sim.HTTPException) as error:
        asyncio.run(sim.advance('run',sim.Advance(seconds=2)))
    assert error.value.status_code==503 and run['replay'].paused
    assert sim.checkpoint_path('run').read_bytes()==before
    assert run['pending']['sent']==0
