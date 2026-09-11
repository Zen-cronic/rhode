# Run separately: poetry run uvicorn app:app --app-dir ../simulator --host 127.0.0.1 --port 4020
# No operational database connection; observations enter through authenticated commands.
import asyncio
import os
from datetime import datetime, timezone
from hashlib import sha256
from uuid import uuid4
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from roadstar_optimizer.simulation import Replay
from roadstar_optimizer.routing import RouteRequest, valhalla_route

app = FastAPI(title='RoadStar independent simulator')
runs: dict[str, dict] = {}
lock = asyncio.Lock()


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
    runs[run_id] = {'replay': replay, 'assignment_id': data.assignment_id, 'carrier_id': data.carrier_id, 'events': [], 'pending': None, 'emit_mode': None}
    return {'id': run_id, 'conditions_hash': replay.conditions_hash(), 'paused': True, 'route': routed, 'provenance': 'synthetic', 'stop_indices': stops}


def get(run_id):
    if run_id not in runs:
        raise HTTPException(404, 'Run not found; recreate from exported initial conditions')
    return runs[run_id]


@app.post('/runs/{run_id}/resume')
async def resume(run_id: str):
    async with lock:
        get(run_id)['replay'].paused = False
        return {'paused': False}


@app.post('/runs/{run_id}/pause')
async def pause(run_id: str):
    async with lock:
        get(run_id)['replay'].paused = True
        return {'paused': True}


@app.post('/runs/{run_id}/reset')
async def reset(run_id: str):
    async with lock:
        run = get(run_id)
        if run.get('advancing') or run['pending'] is not None:
            raise HTTPException(409, 'Retry the pending batch before reset; accepted observations cannot be discarded')
        run['replay'].reset()
        run['events'] = []
        run['emit_mode'] = None
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
    if report['result'] is None:
        response = await client.post('/api/delay', headers={**headers, 'Idempotency-Key': report['key'], 'If-Match': str(report['version'])}, json=report['body'])
        response.raise_for_status()
        report['result'] = response.json()
    run['reported_end_ms'] = max(run.get('reported_end_ms', 0), report['end_ms'])


@app.post('/runs/{run_id}/advance')
async def advance(run_id: str, data: Advance):
    run = get(run_id)
    replay = run['replay']
    if run.get('advancing'):
        raise HTTPException(409, 'This run already has an active advance request')
    if replay.paused:
        return {'events': [], 'paused': True, 'elapsed_seconds': emitted_seconds(run), 'emitted': False, 'pending': run['pending'] is not None}
    if run['emit_mode'] is not None and run['emit_mode'] != data.emit:
        raise HTTPException(409, 'Reset or create another run to change emission mode; pending observations are retained')
    if run['pending'] is None:
        events = replay.advance_samples(data.seconds)
        if not events:
            return {'events': [], 'paused': True, 'elapsed_seconds': replay.elapsed_seconds, 'emitted': False}
        fingerprint = replay.conditions_hash()
        for event in events:
            at_ms = event.pop('at_ms')
            event.update(at=datetime.fromtimestamp(at_ms/1000, timezone.utc).isoformat(), assignmentId=run['assignment_id'])
            event['id'] = sha256(f'{run_id}:{fingerprint}:{at_ms}'.encode()).hexdigest()
        run['emit_mode'] = data.emit
        run['pending'] = {'events': events, 'sent': 0}
    pending = run['pending']
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


@app.get('/runs/{run_id}')
async def state(run_id: str):
    async with lock:
        run = get(run_id)
        replay = run['replay']
        return {'paused': replay.paused, 'elapsed_seconds': emitted_seconds(run), 'generated_until_seconds': replay.elapsed_seconds, 'advancing': run.get('advancing', False), 'phase': replay.phase() if run['pending'] is None else 'streaming_or_paused', 'conditions_hash': replay.conditions_hash(), 'pending': run['pending'], 'events': run['events'], 'initial_conditions': replay.initial_conditions(), 'emit_mode': run['emit_mode'], 'delay_reports': list(run.get('delay_reports', {}).values()), 'persistence': 'process-local; export this response to preserve replay', 'provenance': 'synthetic'}
