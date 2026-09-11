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
    run={'replay':replay,'assignment_id':'assignment','carrier_id':'test','events':[],'pending':None,'emit_mode':None,'closure_checks':False}
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


def test_adopted_route_retains_history_across_checkpoint_reset_and_unequal_replay(monkeypatch):
    import copy,json
    run=install_run(monkeypatch);monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    original=httpx.AsyncClient;stored={};review={'assignmentStatus':'accepted','closures':[],'revisions':[],'receipts':[]};proof={};clock={'clock':'1970-01-01T00:00:01Z','version':1}
    def handler(request):
        if request.url.path=='/api/route-reviews':return httpx.Response(200,json=review)
        if request.url.path=='/api/simulation-route':return httpx.Response(200,json=proof)
        if request.url.path=='/api/simulation-clock':
            if request.method=='POST':clock.update(clock=json.loads(request.content)['at'],version=clock['version']+1)
            return httpx.Response(200,json=clock)
        event=json.loads(request.content);assert request.url.path=='/api/telemetry'
        if event['id'] in stored:assert stored[event['id']]==event
        stored[event['id']]=event;return httpx.Response(200,json={})
    monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
    async def exercise():
        await sim.advance('run',sim.Advance(seconds=10));await sim.pause('run')
        history=copy.deepcopy(run['events']);last=history[-1];point=last['position'];receipt={'route_revision_id':'revision','route_fingerprint':'fingerprint'}
        route={'route':{'trip':{'legs':[{'shape':{'coordinates':[[point['lng'],point['lat']],[-79.905,43.501],[-79.91,43.5]]}}]}}}
        proof.update(assignmentId='assignment',revision=3,receipt=receipt,proof={'telemetryId':last['id'],'odometerKm':last['odometerKm'],'origin':point,'originAt':last['at'],'route':route,'routeFingerprint':'fingerprint'})
        review.update(closures=[{'id':'closure'}],revisions=[{'id':'revision','status':'approved','approved_at':'2026-09-11T19:00:00Z','body':{'routeFingerprint':'fingerprint','closures':[{'id':'closure'}]}}],receipts=[receipt])
        adopted=await sim.adopt_route('run',sim.AdoptRoute(revision_id='revision',expected_revision=3));assert adopted['paused']
        assert sim.get('run')['events']==history and sim.get('run')['replay'].elapsed_seconds==10
        assert (await sim.adopt_route('run',sim.AdoptRoute(revision_id='revision',expected_revision=3)))['repeated']
        sim.runs.clear();restored=sim.get('run');assert restored['replay'].paused and restored['transition_cursor']==1
        await sim.resume('run');await sim.advance('run',sim.Advance(seconds=10));await sim.pause('run')
        expected=copy.deepcopy(sim.get('run')['events']);assert len(stored)==21
        await sim.reset('run');await sim.resume('run')
        await sim.advance('run',sim.Advance(seconds=7));await sim.advance('run',sim.Advance(seconds=6));await sim.advance('run',sim.Advance(seconds=7))
        assert sim.get('run')['events']==expected and len(stored)==21
        assert sim.get('run')['transition_cursor']==1
        # A new closure pauses before generating or changing any new motion.
        review['closures'].append({'id':'new-closure'});before=copy.deepcopy(sim.get('run')['replay'].__dict__)
        with pytest.raises(sim.HTTPException):await sim.advance('run',sim.Advance(seconds=60))
        assert sim.get('run')['pending'] is None and sim.get('run')['replay'].elapsed_seconds==before['elapsed_seconds']
        assert sim.get('run')['replay'].paused and len(stored)==21
    asyncio.run(exercise())


def test_unadopted_closure_blocks_new_batch_without_discardable_generated_events(monkeypatch):
    run=install_run(monkeypatch);run['closure_checks']=True;monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    original=httpx.AsyncClient
    monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(lambda req:httpx.Response(200,json={'assignmentStatus':'accepted','closures':[{'id':'c'}],'revisions':[],'receipts':[]}))))
    async def exercise():
        with pytest.raises(sim.HTTPException):await sim.advance('run',sim.Advance(seconds=100))
        assert run['replay'].elapsed_seconds==0 and run['pending'] is None and run['replay'].paused
    asyncio.run(exercise())


def test_adoption_rejects_unconfirmed_origin_and_preserves_run(monkeypatch):
    run=install_run(monkeypatch);run['replay'].paused=True;run['emit_mode']=True;run['events']=[{'id':'latest','odometerKm':1,'position':{'lng':-79.9,'lat':43.5},'at':'1970-01-01T00:00:01+00:00'}]
    async def wrong(*args):return {'assignmentId':'another-trip','revision':3,'proof':{'telemetryId':'other'}}
    monkeypatch.setattr(sim,'route_request',wrong)
    async def exercise():
        with pytest.raises(sim.HTTPException):await sim.adopt_route('run',sim.AdoptRoute(revision_id='r',expected_revision=3))
        assert not run.get('route_transitions') and run['replay'].paused
    asyncio.run(exercise())


def test_completed_trip_cannot_generate_new_observations(monkeypatch):
    run=install_run(monkeypatch);run['closure_checks']=True;monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    async def completed(*args):return {'assignmentStatus':'completed','closures':[]}
    monkeypatch.setattr(sim,'route_request',completed)
    async def exercise():
        with pytest.raises(sim.HTTPException):await sim.advance('run',sim.Advance(seconds=10))
        assert run['replay'].paused and run['replay'].elapsed_seconds==0 and run['events']==[]
    asyncio.run(exercise())


def test_guarded_run_with_missing_token_does_not_generate_an_unreviewed_batch(monkeypatch):
    run=install_run(monkeypatch);run['closure_checks']=True;monkeypatch.delenv('SIMULATOR_TOKEN',raising=False)
    async def exercise():
        with pytest.raises(sim.HTTPException):await sim.advance('run',sim.Advance(seconds=10))
        assert run['replay'].paused and run['pending'] is None and run['replay'].elapsed_seconds==0
    asyncio.run(exercise())


def control_request(action, key, **kwargs):
    return sim.Control(key=key,expected_state=sim.control_view(sim.get('run'))['state_hash'],action=action,requested_by='dispatcher',**kwargs)


def control_transport(monkeypatch, fail_after=None):
    original=httpx.AsyncClient
    seen=[]
    def handler(request):
        import json
        if request.url.path=='/api/telemetry':
            seen.append(json.loads(request.content)['id'])
            if fail_after and len(seen)==fail_after:return httpx.Response(503,json={'error':'lost ack'})
        return httpx.Response(200,json={})
    monkeypatch.setattr(sim.httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
    async def no_op(*args):pass
    monkeypatch.setattr(sim,'synchronize_clock',no_op)
    monkeypatch.setattr(sim,'report_delay',no_op)
    monkeypatch.setenv('SIMULATOR_TOKEN','synthetic-test-token')
    return seen


def test_dispatcher_controls_repeat_once_and_reject_stale_or_changed_commands(monkeypatch):
    install_run(monkeypatch);seen=control_transport(monkeypatch)
    async def exercise():
        command=control_request('advance','advance-1',seconds=3)
        result=await sim.control('run',command);assert result['state']['generated_until_seconds']==3
        assert await sim.control('run',command)==result
        assert len(seen)==4
        with pytest.raises(sim.HTTPException):await sim.control('run',command.model_copy(update={'seconds':4}))
        with pytest.raises(sim.HTTPException):await sim.control('run',command.model_copy(update={'key':'stale-new'}))
        await sim.control('run',control_request('pause','pause-01'))
        assert sim.get('run')['replay'].paused
        await sim.control('run',control_request('reset','reset-01'))
        assert sim.get('run')['replay'].elapsed_seconds==0
        assert len(seen)==4
    asyncio.run(exercise())


def test_pending_control_survives_pause_restart_resume_and_exact_retry(monkeypatch):
    install_run(monkeypatch);seen=control_transport(monkeypatch,fail_after=3)
    async def exercise():
        command=control_request('advance','advance-1',seconds=5)
        with pytest.raises(sim.HTTPException):await sim.control('run',command)
        assert sim.get('run')['control_pending']['key']=='advance-1'
        await sim.control('run',control_request('pause','pause-01'))
        assert sim.restore_run('run')['control_pending']['key']=='advance-1'
        with pytest.raises(sim.HTTPException):await sim.advance('run',sim.Advance(seconds=20))
        with pytest.raises(sim.HTTPException):await sim.control('run',control_request('reset','reset-01'))
        sim.runs.clear();restored=sim.get('run');assert restored['replay'].paused
        with pytest.raises(sim.HTTPException):await sim.control('run',command)
        await sim.control('run',control_request('resume','resume-01'))
        result=await sim.control('run',command)
        assert result['state']['generated_until_seconds']==5
        assert len(set(seen))==6
        assert len(sim.get('run')['events'])==6
        assert not sim.get('run').get('control_pending')
    asyncio.run(exercise())


def test_completed_advance_with_lost_control_receipt_cannot_advance_twice_after_restart(monkeypatch):
    install_run(monkeypatch);seen=control_transport(monkeypatch)
    original=sim.finish_control
    def crash(*args,**kwargs):raise RuntimeError('simulated process failure before receipt')
    async def exercise():
        command=control_request('advance','advance-1',seconds=5)
        monkeypatch.setattr(sim,'finish_control',crash)
        with pytest.raises(RuntimeError):await sim.control('run',command)
        assert sim.get('run')['pending'] is None
        assert sim.get('run')['control_pending']
        sim.runs.clear();monkeypatch.setattr(sim,'finish_control',original)
        result=await sim.control('run',command)
        assert result['state']['generated_until_seconds']==5
        assert result['state']['paused']
        assert len(seen)==6
    asyncio.run(exercise())


def test_control_run_inventory_is_carrier_scoped_and_closed_route_errors_are_retryable_new_actions(monkeypatch):
    run=install_run(monkeypatch);control_transport(monkeypatch);run['closure_checks']=True
    async def blocked(*args):
        run['replay'].paused=True
        raise sim.HTTPException(409,'Closure requires review')
    monkeypatch.setattr(sim,'check_route_guard',blocked)
    async def exercise():
        assert not (await sim.control_runs('other'))['runs']
        assert len((await sim.control_runs('test'))['runs'])==1
        result=await sim.control('run',control_request('advance','advance-1'))
        assert result['error']['status']==409
        assert not sim.get('run').get('control_pending')
        assert sim.get('run')['replay'].paused
    asyncio.run(exercise())
