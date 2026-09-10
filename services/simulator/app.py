# Run as a separate process: poetry run uvicorn app:app --app-dir ../simulator --port 4020
# No operational database connection. All telemetry enters through the authenticated API.
import asyncio
import os
from datetime import datetime, timezone
from hashlib import sha256
import json
from uuid import uuid4
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from roadstar_optimizer.simulation import Replay
from roadstar_optimizer.routing import RouteRequest, valhalla_route
app=FastAPI(title='RoadStar independent simulator')
runs:dict[str,dict]={}
lock=asyncio.Lock()
class Start(BaseModel):
    assignment_id:str
    carrier_id:str
    start_time:datetime
    route:RouteRequest
    dock_wait_seconds:int=Field(default=0,ge=0,le=86400)
    disruption_seconds:int=Field(default=0,ge=0,le=86400)
    seed:int=42
class Advance(BaseModel):
    seconds:int=Field(ge=1,le=3600)
    emit:bool=True

@app.post('/runs')
async def create(data:Start):
    if data.start_time.tzinfo is None:
        raise HTTPException(400,'Scenario time requires timezone')
    try:
        routed=await valhalla_route(data.route)
    except (RuntimeError,ValueError,httpx.HTTPError) as e:
        raise HTTPException(503,str(e)) from e
    coordinates=[]
    for leg in routed['route']['trip']['legs']:
        shape=leg['shape']
        if not isinstance(shape,dict) or shape.get('type')!='LineString':
            raise HTTPException(502,'Valhalla GeoJSON route shape required')
        points=shape['coordinates']
        coordinates.extend(points[1:] if coordinates else points)
    replay=Replay(coordinates,int(data.start_time.timestamp()*1000),seed=data.seed,dock_wait_seconds=data.dock_wait_seconds,disruption_seconds=data.disruption_seconds,route_evidence='valhalla-truck')
    run_id=str(uuid4())
    runs[run_id]={'replay':replay,'assignment_id':data.assignment_id,'carrier_id':data.carrier_id,'events':[],'pending':None}
    return {'id':run_id,'conditions_hash':replay.conditions_hash(),'paused':True,'route':routed,'provenance':'synthetic'}

def get(run_id):
    if run_id not in runs:
        raise HTTPException(404,'Run not found; recreate from saved initial conditions')
    return runs[run_id]

@app.post('/runs/{run_id}/resume')
def resume(run_id:str):
    get(run_id)['replay'].paused=False
    return {'paused':False}
@app.post('/runs/{run_id}/pause')
def pause(run_id:str):
    get(run_id)['replay'].paused=True
    return {'paused':True}
@app.post('/runs/{run_id}/reset')
def reset(run_id:str):
    run=get(run_id)
    run['replay'].reset()
    # Replay uses identical IDs; server dedup preserves operational truth.
    # A comparison with independent side effects requires a fresh scenario/assignment.
    run['events']=[];run['pending']=None
    return {'paused':True,'conditions_hash':run['replay'].conditions_hash(),'note':'Same-trip replay reuses event IDs. Create a separate scenario assignment for independent comparison.'}
@app.post('/runs/{run_id}/advance')
async def advance(run_id:str,data:Advance):
    async with lock:
        run=get(run_id);replay=run['replay']
        if run['pending'] is None:
            event=replay.advance(data.seconds)
            at_ms=event.pop('at_ms')
            event.update(at=datetime.fromtimestamp(at_ms/1000,timezone.utc).isoformat(),assignmentId=run['assignment_id'])
            event['id']=sha256(f'{run_id}:{at_ms}'.encode()).hexdigest()
            run['pending']=event
        event=run['pending']
        if data.emit:
            token=os.environ.get('SIMULATOR_TOKEN')
            if not token:
                raise HTTPException(503,'SIMULATOR_TOKEN required; pending telemetry retained')
            async with httpx.AsyncClient(timeout=15) as client:
                r=await client.post(os.environ.get('ROADSTAR_API','http://127.0.0.1:4010')+'/api/telemetry',headers={'Authorization':f'Bearer {token}','X-Carrier-Id':run['carrier_id'],'Idempotency-Key':event['id'],'If-Match':'1'},json=event)
                if r.status_code>=400:
                    raise HTTPException(r.status_code,{'error':r.text,'pending_event_id':event['id']})
        run['events'].append(event);run['pending']=None
        return {'event':event,'emitted':data.emit,'conditions_hash':replay.conditions_hash(),'elapsed_seconds':replay.elapsed_seconds,'modeled':True}
@app.get('/runs/{run_id}')
def state(run_id:str):
    run=get(run_id);r=run['replay']
    return {'paused':r.paused,'elapsed_seconds':r.elapsed_seconds,'conditions_hash':r.conditions_hash(),'pending':run['pending'],'events':run['events'],'initial_conditions':{'coordinates':r.coordinates,'start_time_ms':r.start_time_ms,'seed':r.seed,'speed_kph':r.speed_kph,'dock_wait_seconds':r.dock_wait_seconds,'disruption_seconds':r.disruption_seconds},'persistence':'process-local; export this response to preserve replay','provenance':'synthetic'}
