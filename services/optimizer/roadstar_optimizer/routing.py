import os
import math
from typing import Literal
import httpx
from pydantic import BaseModel, Field, model_validator

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

class ClosureArea(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode='after')
    def valid_area(self):
        if not self.west < self.east or not self.south < self.north:
            raise ValueError('Closure bounds must have positive area without crossing the antimeridian')
        if self.east-self.west > .5 or self.north-self.south > .5:
            raise ValueError('Closure area exceeds the supported regional extent')
        return self

    def polygon(self):
        return [[self.west,self.south],[self.east,self.south],[self.east,self.north],[self.west,self.north],[self.west,self.south]]

    def contains(self, lon, lat):
        return self.west <= lon <= self.east and self.south <= lat <= self.north

    def intersects_segment(self, a, b):
        # Slab clipping includes boundary contact and catches crossings whose
        # sampled endpoints both lie outside the declared closed rectangle.
        low, high = 0., 1.
        for axis, minimum, maximum in [(0,self.west,self.east),(1,self.south,self.north)]:
            delta = b[axis]-a[axis]
            if delta == 0:
                if not minimum <= a[axis] <= maximum:
                    return False
            else:
                entry, leave = sorted(((minimum-a[axis])/delta,(maximum-a[axis])/delta))
                low, high = max(low,entry), min(high,leave)
                if low > high:
                    return False
        return True


class RouteRequest(BaseModel):
    locations: list[Point] = Field(min_length=2, max_length=100)
    truck: TruckProfile
    closures: list[ClosureArea] = Field(default_factory=list, max_length=10)

    @model_validator(mode='after')
    def unique_closures(self):
        if len({c.id for c in self.closures}) != len(self.closures):
            raise ValueError('Closure identities must be unique')
        return self

async def valhalla_route(request: RouteRequest):
    base = os.environ.get('VALHALLA_URL')
    if not base:
        raise RuntimeError('VALHALLA_URL is required; no car-route or straight-line fallback is permitted')
    for closure in request.closures:
        if any(closure.contains(p.lon,p.lat) for p in request.locations):
            raise ValueError(f'No supported route: required location lies within closure {closure.id}')
    payload = {'locations':[p.model_dump() for p in request.locations], 'costing':'truck', 'costing_options':{'truck':request.truck.model_dump(exclude={'evidence'})}, 'units':'kilometers', 'shape_format':'polyline6'}
    if request.closures:
        payload['exclude_polygons'] = [c.polygon() for c in request.closures]
    async with httpx.AsyncClient(timeout=30) as client:
        response=await client.post(base.rstrip('/')+'/route',json=payload)
        response.raise_for_status()
        route=response.json()
    if route.get('trip',{}).get('status') != 0:
        raise ValueError('Truck routing failed')
    if not route['trip'].get('legs'):
        raise ValueError('Truck route has no geometry legs')
    for leg in route['trip']['legs']:
        # Valhalla native JSON uses encoded polyline6; normalize at the adapter boundary.
        coordinates = decode_polyline6(leg['shape'])
        for closure in request.closures:
            if any(closure.intersects_segment(a,b) for a,b in zip(coordinates,coordinates[1:])):
                raise ValueError(f'Returned truck route intersects closure {closure.id}; no alternate route accepted')
        leg['shape']={'type':'LineString','coordinates':coordinates}
    return {'closures':[c.model_dump() for c in request.closures], 'closure_check':'all decoded route segments outside declared bounds' if request.closures else 'no closures supplied','route':route,'profile':request.truck.model_dump(),'routing_evidence':'valhalla-truck','dataset':os.environ.get('VALHALLA_DATASET','Ontario OSM; tile build timestamp must be configured'),'warning':'Route quality depends on OSM restriction coverage; not a legal clearance certificate'}

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
