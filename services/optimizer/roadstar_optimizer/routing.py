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
    payload = {'locations':[p.model_dump() for p in request.locations], 'costing':'truck', 'costing_options':{'truck':request.truck.model_dump(exclude={'evidence'})}, 'units':'kilometers', 'shape_format':'polyline6'}
    async with httpx.AsyncClient(timeout=30) as client:
        response=await client.post(base.rstrip('/')+'/route',json=payload)
        response.raise_for_status()
        route=response.json()
    if route.get('trip',{}).get('status') != 0:
        raise ValueError('Truck routing failed')
    for leg in route['trip']['legs']:
        # Valhalla native JSON uses encoded polyline6; normalize at the adapter boundary.
        leg['shape']={'type':'LineString','coordinates':decode_polyline6(leg['shape'])}
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

def decode_polyline6(encoded:str):
    if not isinstance(encoded,str):
        raise ValueError('Expected Valhalla polyline6 geometry')
    index=0; lat=0; lon=0; coordinates=[]
    while index<len(encoded):
        deltas=[]
        for _ in range(2):
            value=0; shift=0
            while True:
                if index>=len(encoded) or shift>35:
                    raise ValueError('Malformed route geometry')
                byte=ord(encoded[index])-63;index+=1
                if not 0<=byte<=63:raise ValueError('Invalid route geometry character')
                value|=(byte&31)<<shift;shift+=5
                if byte<32:break
            deltas.append(~(value>>1) if value&1 else value>>1)
        lat+=deltas[0];lon+=deltas[1]
        if not -90000000<=lat<=90000000 or not -180000000<=lon<=180000000:
            raise ValueError('Route coordinate out of range')
        coordinates.append([lon/1000000,lat/1000000])
    if len(coordinates)<2:raise ValueError('Incomplete route geometry')
    return coordinates
