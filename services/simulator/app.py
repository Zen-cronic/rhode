# Run separately: poetry run uvicorn app:app --app-dir ../simulator --host 127.0.0.1 --port 4020
# No operational database connection; observations enter through authenticated commands.
import asyncio
import os
import json
import re
import copy
import fcntl
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
from uuid import uuid4
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from roadstar_optimizer.route_transition import replace_remaining_route
from roadstar_optimizer.simulation import Replay
from roadstar_optimizer.routing import RouteRequest, valhalla_route

def state_directory():
    directory = Path(os.environ.get('SIMULATOR_STATE_DIR', Path(__file__).resolve().parents[2] / 'data' / 'simulator'))
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    return directory


@asynccontextmanager
async def lifespan(_):
    # One local writer. Independent preview processes must use different directories.
    with (state_directory() / '.writer.lock').open('a') as owner:
        try:
            fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('Simulator state directory already has a writer; use one worker or a separate directory') from error
        yield


app = FastAPI(title='RoadStar independent simulator', lifespan=lifespan)
runs: dict[str, dict] = {}
lock = asyncio.Lock()


PROGRESS_FIELDS = ('elapsed_seconds', '_distance', '_next_stop', '_wait', '_last_speed', '_initial_emitted', '_lengths')


def checkpoint_path(run_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', run_id):
        raise HTTPException(400, 'Invalid run identity')
    return state_directory() / f'{run_id}.json'


def save_run(run):
    replay = run['replay']
    # Credentials, clients and in-flight flags are never serialized. Cached forecasts
    # are recomputed; pending command bodies, versions and receipts are retained.
    data = {k: v for k, v in run.items() if k not in ('replay', 'advancing', 'completion_forecasts')}
    data['replay'] = {'initial': replay.initial_conditions(), 'progress': {k: getattr(replay, k) for k in PROGRESS_FIELDS}, 'paused': replay.paused, 'conditions_hash': replay.conditions_hash()}
    encoded = json.dumps({'format': 1, 'run': data}, allow_nan=False).encode()
    try:
        target = checkpoint_path(run['run_id'])
        temporary = target.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
        directory_fd = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except OSError as error:
        replay.paused = True
        raise HTTPException(503, 'Simulator checkpoint could not be saved; run paused. Repair storage before resuming.') from error


def restore_run(run_id):
    target = checkpoint_path(run_id)
    if not target.exists():
        raise HTTPException(404, 'Run not found; no persisted checkpoint for this identity')
    try:
        envelope = json.loads(target.read_text())
        if envelope['format'] != 1:
            raise ValueError('Unsupported checkpoint format')
        run = envelope['run']
        saved = run.pop('replay')
        initial = saved['initial'].copy()
        if initial.pop('model_version') != 'road-events-v2' or run['run_id'] != run_id:
            raise ValueError('Run identity or model version changed')
        replay = Replay(**initial)
        if saved['conditions_hash'] != replay.conditions_hash():
            raise ValueError('Initial conditions changed')
        for field in PROGRESS_FIELDS:
            if field == '_lengths' and field not in saved['progress']:
                continue  # Legacy checkpoints reconstruct unchanged geometry lengths.
            setattr(replay, field, saved['progress'][field])
        if replay.elapsed_seconds < 0 or not 0 <= replay._distance <= replay._lengths[-1] or not 1 <= replay._next_stop <= len(replay.stop_indices) or replay._wait < 0:
            raise ValueError('Invalid motion checkpoint')
        pending = run['pending']
        if pending is not None and not 0 <= pending['sent'] <= len(pending['events']):
            raise ValueError('Invalid pending receipt cursor')
        replay.paused = True  # A restart never begins emitting without an explicit resume.
        run.update(replay=replay, advancing=False, restored=True)
        return run
    except (OSError, ValueError, KeyError, TypeError, AttributeError, IndexError) as error:
        raise HTTPException(503, 'Run checkpoint is unreadable or incompatible; preserve it for review, do not silently recreate the run') from error


class Start(BaseModel):
    assignment_id: str
    carrier_id: str
    start_time: datetime
    route: RouteRequest
    dock_wait_seconds: int = Field(default=0, ge=0, le=86400)
    stop_wait_seconds: list[int] | None = None
    disruption_seconds: int = Field(default=0, ge=0, le=86400)
    disruption_start_seconds: int = Field(default=60, ge=0, le=86400)
    seed: int = 42


class Advance(BaseModel):
    seconds: int = Field(ge=1, le=3600)
    emit: bool = True


@app.post('/runs')
async def create(data: Start):
    if data.start_time.tzinfo is None:
        raise HTTPException(400, 'Scenario time requires timezone')
    try:
        routed = await valhalla_route(data.route)
    except (RuntimeError, ValueError, httpx.HTTPError) as error:
        raise HTTPException(503, str(error)) from error
    coordinates, stops = [], [0]
    for leg in routed['route']['trip']['legs']:
        shape = leg['shape']
        if not isinstance(shape, dict) or shape.get('type') != 'LineString' or len(shape.get('coordinates', [])) < 2:
            raise HTTPException(502, 'Valhalla GeoJSON route legs required')
        points = shape['coordinates']
        if coordinates and any(abs(a-b) > 1e-6 for a, b in zip(coordinates[-1], points[0])):
            raise HTTPException(502, 'Disconnected route legs; no straight-line bridge is inferred')
        coordinates.extend(points[1:] if coordinates else points)
        stops.append(len(coordinates)-1)
    try:
        replay = Replay(coordinates, int(data.start_time.timestamp()*1000), seed=data.seed, dock_wait_seconds=data.dock_wait_seconds, stop_indices=stops, stop_wait_seconds=data.stop_wait_seconds, disruption_seconds=data.disruption_seconds, disruption_start_seconds=data.disruption_start_seconds, route_evidence='valhalla-truck')
    except (ValueError, IndexError) as error:
        raise HTTPException(400, str(error)) from error
    run_id = str(uuid4())
    runs[run_id] = {'run_id': run_id, 'api_origin': os.environ.get('ROADSTAR_API', 'http://127.0.0.1:4010').rstrip('/'), 'replay': replay, 'assignment_id': data.assignment_id, 'carrier_id': data.carrier_id, 'events': [], 'pending': None, 'emit_mode': None, 'closure_checks': True}
    save_run(runs[run_id])
    return {'id': run_id, 'conditions_hash': replay.conditions_hash(), 'paused': True, 'route': routed, 'provenance': 'synthetic', 'stop_indices': stops}


def get(run_id):
    if run_id not in runs:
        runs[run_id] = restore_run(run_id)
    runs[run_id].setdefault('run_id', run_id)
    runs[run_id].setdefault('closure_checks', True)
    runs[run_id].setdefault('api_origin', os.environ.get('ROADSTAR_API', 'http://127.0.0.1:4010').rstrip('/'))
    return runs[run_id]


@app.post('/runs/{run_id}/resume')
async def resume(run_id: str):
    async with lock:
        run = get(run_id)
        run['replay'].paused = False
        save_run(run)
        return {'paused': False}


@app.post('/runs/{run_id}/pause')
async def pause(run_id: str):
    async with lock:
        run = get(run_id)
        run['replay'].paused = True
        save_run(run)
        return {'paused': True}


@app.post('/runs/{run_id}/reset')
async def reset(run_id: str):
    async with lock:
        run = get(run_id)
        if run.get('advancing') or run['pending'] is not None:
            raise HTTPException(409, 'Retry the pending batch before reset; accepted observations cannot be discarded')
        if run.get('original_initial'):
            initial=copy.deepcopy(run['original_initial']);initial.pop('model_version')
            run['replay']=Replay(**initial)
            run['transition_cursor']=0
        else:
            run['replay'].reset()
        run['events'] = []
        run['emit_mode'] = None
        save_run(run)
        return {'paused': True, 'conditions_hash': run['replay'].conditions_hash(), 'note': 'Same-trip replay reuses IDs and never rewinds operational time. Use a fresh scenario assignment for an independent comparison.'}



def emitted_seconds(run):
    if not run['events']:
        return 0
    latest = datetime.fromisoformat(run['events'][-1]['at']).timestamp()*1000
    return round((latest-run['replay'].start_time_ms)/1000)

async def synchronize_clock(client, run, at, headers):
    response = await client.get('/api/simulation-clock', headers=headers)
    response.raise_for_status()
    clock = response.json()
    if datetime.fromisoformat(at) <= datetime.fromisoformat(clock['clock'].replace('Z', '+00:00')):
        return
    key = sha256(f"clock:{run['carrier_id']}:{at}".encode()).hexdigest()
    response = await client.post('/api/simulation-clock', headers={**headers, 'Idempotency-Key': key, 'If-Match': str(clock['version'])}, json={'at': at})
    response.raise_for_status()


async def report_delay(client, run, event, headers):
    if event.get('phase') not in ('dock_wait', 'road_hold'):
        return
    # Keep exact commands and receipts across retries and same-trip resets. A lost
    # acknowledgement must not silently acquire a different expected version.
    reports = run.setdefault('delay_reports', {})
    key = sha256(f"delay:{event['id']}".encode()).hexdigest()
    report = reports.get(key)
    if report is None:
        include_hold = event['phase'] == 'road_hold' or run.get('road_hold_observed', False)
        run['road_hold_observed'] = include_hold
        forecasts = run.setdefault('completion_forecasts', {})
        if include_hold not in forecasts:
            forecasts[include_hold] = run['replay'].forecast_completion_ms(include_hold)
        end_ms = forecasts[include_hold]
        if end_ms <= run.get('reported_end_ms', 0):
            return
        response = await client.get('/api/simulation-assignment', params={'assignmentId': run['assignment_id']}, headers=headers)
        response.raise_for_status()
        assignment = response.json()
        if end_ms <= datetime.fromisoformat(assignment['endAt'].replace('Z', '+00:00')).timestamp()*1000:
            run['reported_end_ms'] = end_ms
            return
        report = {'key': key, 'version': assignment['version'], 'end_ms': end_ms, 'body': {
            'assignmentId': run['assignment_id'],
            'expectedEnd': datetime.fromtimestamp(end_ms/1000, timezone.utc).isoformat(),
            'observedAt': event['at'],
            'reason': f"Simulator observed {event['phase']}; modeled completion uses seeded road speeds and configured stop dwell. Road disruption included: {include_hold}. Conditions {run['replay'].conditions_hash()}. Dispatcher review required."
        }, 'result': None}
        reports[key] = report
        save_run(run)  # Durable exact expected version before the consequential POST.
    if report['result'] is None:
        response = await client.post('/api/delay', headers={**headers, 'Idempotency-Key': report['key'], 'If-Match': str(report['version'])}, json=report['body'])
        response.raise_for_status()
        report['result'] = response.json()
        save_run(run)
    run['reported_end_ms'] = max(run.get('reported_end_ms', 0), report['end_ms'])


@app.post('/runs/{run_id}/advance')
async def advance(run_id: str, data: Advance):
    run = get(run_id)
    replay = run['replay']
    if data.emit and run['api_origin'] != os.environ.get('ROADSTAR_API', 'http://127.0.0.1:4010').rstrip('/'):
        raise HTTPException(409, 'Run is bound to a different operational API; restore the original API configuration')
    if run.get('advancing'):
        raise HTTPException(409, 'This run already has an active advance request')
    if replay.paused:
        return {'events': [], 'paused': True, 'elapsed_seconds': emitted_seconds(run), 'emitted': False, 'pending': run['pending'] is not None}
    if run['emit_mode'] is not None and run['emit_mode'] != data.emit:
        raise HTTPException(409, 'Reset or create another run to change emission mode; pending observations are retained')
    if run['pending'] is None:
        if data.emit and run.get('closure_checks'):
            run['advancing']=True
            try:
                await check_route_guard(run)
            finally:
                run['advancing']=False
        events = generate_samples(run, data.seconds)
        replay = run['replay']
        if not events:
            return {'events': [], 'paused': True, 'elapsed_seconds': replay.elapsed_seconds, 'emitted': False}
        for event in events:
            fingerprint = event.pop('_conditions_hash')
            at_ms = event.pop('at_ms')
            event.update(at=datetime.fromtimestamp(at_ms/1000, timezone.utc).isoformat(), assignmentId=run['assignment_id'])
            event['id'] = sha256(f'{run_id}:{fingerprint}:{at_ms}'.encode()).hexdigest()
        run['emit_mode'] = data.emit
        run['pending'] = {'events': events, 'sent': 0}
        save_run(run)  # Generated samples become durable before any network delivery.
    pending = run['pending']
    save_run(run)  # Also recheck storage before retrying a previously unsaved batch.
    run['advancing'] = True
    try:
        if data.emit:
            token = os.environ.get('SIMULATOR_TOKEN')
            if not token:
                raise HTTPException(503, 'SIMULATOR_TOKEN required; pending batch retained')
            headers = {'Authorization': f'Bearer {token}', 'X-Carrier-Id': run['carrier_id']}
            try:
                async with httpx.AsyncClient(base_url=os.environ.get('ROADSTAR_API', 'http://127.0.0.1:4010'), timeout=15) as client:
                    if pending['sent']:
                        await synchronize_clock(client, run, pending['events'][pending['sent']-1]['at'], headers)
                        await report_delay(client, run, pending['events'][pending['sent']-1], headers)
                    while pending['sent'] < len(pending['events']) and not replay.paused:
                        event = pending['events'][pending['sent']]
                        response = await client.post('/api/telemetry', headers={**headers, 'Idempotency-Key': event['id'], 'If-Match': '1'}, json=event)
                        response.raise_for_status()
                        run['events'].append(event)
                        pending['sent'] += 1
                        if pending['sent'] % 2 == 0 or event.get('phase') in ('dock_wait', 'road_hold'):
                            await synchronize_clock(client, run, event['at'], headers)
                        await report_delay(client, run, event, headers)
                    if pending['sent']:
                        await synchronize_clock(client, run, pending['events'][pending['sent']-1]['at'], headers)
                        await report_delay(client, run, pending['events'][pending['sent']-1], headers)
            except (httpx.HTTPError, ValueError) as error:
                raise HTTPException(503, {'error': 'Operational API did not confirm observations, clock or delay report; retry unchanged pending commands', 'acknowledged': pending['sent'], 'total': len(pending['events'])}) from error
        else:
            run['events'].extend(pending['events'])
            pending['sent'] = len(pending['events'])
        events = pending['events'][:pending['sent']]
        complete = pending['sent'] == len(pending['events'])
        if complete:
            run['pending'] = None
        return {'event': events[-1] if events else None, 'events': events, 'emitted': data.emit, 'conditions_hash': replay.conditions_hash(), 'elapsed_seconds': emitted_seconds(run), 'generated_until_seconds': replay.elapsed_seconds, 'phase': replay.phase() if complete else 'paused_with_pending_batch', 'pending': not complete, 'modeled': True}
    finally:
        run['advancing'] = False
        save_run(run)


@app.get('/runs/{run_id}')
async def state(run_id: str):
    async with lock:
        run = get(run_id)
        replay = run['replay']
        return {'paused': replay.paused, 'elapsed_seconds': emitted_seconds(run), 'generated_until_seconds': replay.elapsed_seconds, 'advancing': run.get('advancing', False), 'phase': replay.phase() if run['pending'] is None else 'streaming_or_paused', 'conditions_hash': replay.conditions_hash(), 'pending': run['pending'], 'events': run['events'], 'initial_conditions': replay.initial_conditions(), 'emit_mode': run['emit_mode'], 'delay_reports': list(run.get('delay_reports', {}).values()), 'restored': run.get('restored', False), 'persistence': 'atomic local checkpoint; restart restores paused with pending commands intact', 'route_transitions': run.get('route_transitions', []), 'transition_cursor': run.get('transition_cursor',0), 'closure_block': run.get('closure_block'), 'original_initial_conditions': run.get('original_initial'), 'provenance': 'synthetic'}


@app.get('/runs')
async def list_runs():
    return {'runs': sorted({*runs.keys(), *(p.stem for p in state_directory().glob('*.json'))}), 'restart_policy': 'restored runs are paused; explicitly resume to retry pending commands'}


def replay_snapshot(replay):
    return {'initial': replay.initial_conditions(), 'progress': {k:copy.deepcopy(getattr(replay,k)) for k in PROGRESS_FIELDS}}


def replay_from_snapshot(saved):
    initial=copy.deepcopy(saved['initial']);initial.pop('model_version')
    replay=Replay(**initial)
    for key in PROGRESS_FIELDS:
        setattr(replay,key,copy.deepcopy(saved['progress'][key]))
    replay.paused=True
    return replay


def generate_samples(run, seconds):
    events=[]
    for _ in range(seconds):
        replay=run['replay']
        cursor=run.get('transition_cursor',0);transitions=run.get('route_transitions',[])
        while cursor<len(transitions):
            transition=transitions[cursor]
            if replay.elapsed_seconds<transition['at_seconds']:break
            if replay.elapsed_seconds>transition['at_seconds']:
                raise HTTPException(409,'Recorded route transition was missed; pause and review the checkpoint')
            if replay.elapsed_seconds==transition['at_seconds']:
                if replay.conditions_hash()!=transition['previous_conditions_hash'] or replay.sample()!=transition['previous_sample']:
                    raise HTTPException(409,'Historical motion no longer matches the saved route transition')
                paused=replay.paused;replay=replay_from_snapshot(transition['snapshot']);replay.paused=paused
                run['replay']=replay;cursor+=1;run['transition_cursor']=cursor
        fingerprint=replay.conditions_hash()
        for event in replay.advance_samples(1):
            event['_conditions_hash']=fingerprint;events.append(event)
    return events


async def route_request(run, path, params):
    token=os.environ.get('SIMULATOR_TOKEN')
    if not token:raise HTTPException(503,'SIMULATOR_TOKEN required for operational route evidence')
    if run['api_origin']!=os.environ.get('ROADSTAR_API','http://127.0.0.1:4010').rstrip('/'):
        raise HTTPException(409,'Run belongs to another operational API')
    try:
        async with httpx.AsyncClient(base_url=run['api_origin'],timeout=30) as client:
            response=await client.get(path,params=params,headers={'Authorization':f'Bearer {token}','X-Carrier-Id':run['carrier_id']})
            response.raise_for_status();return response.json()
    except (httpx.HTTPError,ValueError) as error:
        raise HTTPException(409,'Operational route evidence was not confirmed; keep the run paused and review the dispatcher response') from error


async def check_route_guard(run):
    try:
        data=await route_request(run,'/api/route-reviews',{'assignmentId':run['assignment_id']})
        if data.get('assignmentStatus')!='accepted':raise ValueError('Simulation trip is no longer accepted')
        if not data['closures']:return
        approved=sorted((r for r in data['revisions'] if r['status']=='approved'),key=lambda r:(r['approved_at'],r['id']),reverse=True)
        adopted=run.get('route_transitions',[])
        if not approved or not adopted:raise ValueError('Closure requires an approved, received and adopted route')
        latest=approved[0];selection=adopted[-1]
        if latest['id']!=selection['revision_id'] or latest['body']['routeFingerprint']!=selection['route_fingerprint'] or {c['id'] for c in data['closures']}!={c['id'] for c in latest['body']['closures']}:
            raise ValueError('Closure or approved route changed after adoption')
        if not any(r['route_revision_id']==latest['id'] and r['route_fingerprint']==selection['route_fingerprint'] for r in data['receipts']):
            raise ValueError('Driver receipt is unavailable')
        run.pop('closure_block',None)
    except (HTTPException,ValueError,KeyError,TypeError) as error:
        run['replay'].paused=True;run['closure_block']=str(error);save_run(run)
        raise HTTPException(409,'Route evidence requires review; run paused before generating a new batch') from error


class AdoptRoute(BaseModel):
    revision_id: str = Field(min_length=1,max_length=100)
    expected_revision: int = Field(ge=1)


@app.post('/runs/{run_id}/adopt-route')
async def adopt_route(run_id: str, data: AdoptRoute):
    async with lock:
        run=get(run_id);previous=run['replay']
        # A lost local HTTP acknowledgment can repeat the exact selection safely.
        for transition in run.get('route_transitions',[]):
            if transition['revision_id']==data.revision_id:
                if transition['revision']!=data.expected_revision:raise HTTPException(409,'Adoption revision differs from the retained receipt')
                return {'adopted':True,'transition':transition,'repeated':True,'paused':previous.paused}
        if not previous.paused or run.get('advancing') or run['pending'] is not None:
            raise HTTPException(409,'Pause and finish the pending batch before adopting a route')
        if run.get('transition_cursor',0)!=len(run.get('route_transitions',[])):
            raise HTTPException(409,'Finish the retained transition replay before appending a new adoption')
        if run['emit_mode'] is not True or not run['events']:
            raise HTTPException(409,'Adoption requires an acknowledged operational telemetry origin')
        evidence=await route_request(run,'/api/simulation-route',{'revisionId':data.revision_id})
        proof=evidence['proof'];last=run['events'][-1]
        if evidence['assignmentId']!=run['assignment_id'] or evidence['revision']!=data.expected_revision or proof['telemetryId']!=last['id'] or proof['odometerKm']!=last['odometerKm'] or proof['origin']!=last['position']:
            raise HTTPException(409,'Approved route does not match this run and its exact latest acknowledged GPS')
        if datetime.fromisoformat(proof['originAt'].replace('Z','+00:00'))!=datetime.fromisoformat(last['at']):
            raise HTTPException(409,'Approved origin time differs from the retained observation')
        points=[];stops=[0]
        for leg in proof['route']['route']['trip']['legs']:
            shape=leg['shape']['coordinates']
            if points and points[-1]!=shape[0]:raise HTTPException(409,'Disconnected approved route legs')
            points.extend(shape[1:] if points else shape);stops.append(len(points)-1)
        try:changed=replace_remaining_route(previous,points,stops)
        except ValueError as error:raise HTTPException(409,str(error)) from error
        transition={'adopted_at':datetime.now(timezone.utc).isoformat(),'at_seconds':changed.at_seconds,'revision_id':data.revision_id,'revision':data.expected_revision,'receipt':evidence['receipt'],'route_fingerprint':proof['routeFingerprint'],'previous_conditions_hash':changed.previous_conditions_hash,'conditions_hash':changed.conditions_hash,'previous_sample':previous.sample(),'snapshot':replay_snapshot(changed.replay),'origin_telemetry_id':last['id']}
        candidate={**run,'original_initial':run.get('original_initial',previous.initial_conditions()),'route_transitions':[*run.get('route_transitions',[]),transition],'transition_cursor':len(run.get('route_transitions',[]))+1,'replay':changed.replay,'completion_forecasts':{},'closure_checks':True}
        candidate.pop('closure_block',None)
        save_run(candidate)  # Publish the new selection in memory only after durable storage.
        runs[run_id]=candidate
        return {'adopted':True,'paused':True,'transition':transition,'note':'Simulation plan selected; resume separately. Original observations remain unchanged.'}
