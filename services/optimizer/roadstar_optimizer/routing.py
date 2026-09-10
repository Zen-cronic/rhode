import os
import math
from typing import Literal
import httpx
from pydantic import BaseModel, Field

class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)

class TruckProfile(BaseModel):
    height: float = Field(gt=0, le=6)
    width: float = Field(gt=0, le=5)
    length: float = Field(gt=0, le=50)
    weight: float = Field(gt=0, le=100)
    axle_load: float = Field(gt=0, le=30)
    hazmat: bool
    evidence: Literal['operator-verified', 'synthetic-scenario']

class RouteRequest(BaseModel):
    locations: list[Point] = Field(min_length=2, max_length=100)
    truck: TruckProfile

async def valhalla_route(request: RouteRequest):
    base = os.environ.get('VALHALLA_URL')
    if not base:
        raise RuntimeError('VALHALLA_URL is required; no car-route or straight-line fallback is permitted')
    payload = {'locations':[p.model_dump() for p in request.locations], 'costing':'truck', 'costing_options':{'truck':request.truck.model_dump(exclude={'evidence'})}, 'units':'kilometers', 'shape_format':'geojson'}
    async with httpx.AsyncClient(timeout=30) as client:
        response=await client.post(base.rstrip('/')+'/route',json=payload)
        response.raise_for_status()
        route=response.json()
    if route.get('trip',{}).get('status') != 0:
        raise ValueError('Truck routing failed')
    return {'route':route,'profile':request.truck.model_dump(),'routing_evidence':'valhalla-truck','dataset':os.environ.get('VALHALLA_DATASET','Ontario OSM; tile build timestamp must be configured'),'warning':'Route quality depends on OSM restriction coverage; not a legal clearance certificate'}

async def truck_matrix(locations:list[Point],truck:TruckProfile):
    base=os.environ.get('VALHALLA_URL')
    if not base:
        raise RuntimeError('VALHALLA_URL required')
    async with httpx.AsyncClient(timeout=60) as client:
        response=await client.post(base.rstrip('/')+'/sources_to_targets',json={'sources':[p.model_dump() for p in locations],'targets':[p.model_dump() for p in locations],'costing':'truck','costing_options':{'truck':truck.model_dump(exclude={'evidence'})}})
        response.raise_for_status()
        body=response.json()
    rows=body['sources_to_targets']
    if any(cell.get('time') is None for row in rows for cell in row):
        raise ValueError('One or more locations have no supported truck route')
    return [[math.ceil(cell['time']/60) for cell in row] for row in rows]
