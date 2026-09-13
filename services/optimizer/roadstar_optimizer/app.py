from fastapi import FastAPI, HTTPException
import httpx
from .solver import Problem, Vehicle, Shipment, solve
from .routing import RouteRequest, TruckProfile, Point, valhalla_route, truck_matrix
from pydantic import BaseModel, Field
from datetime import datetime
import os
import asyncio
app = FastAPI(title='Rhode planning worker')
@app.get('/health')
def health():
    return {'ok': True, 'engine': 'OR-Tools', 'authority': 'proposal-only'}
@app.post('/optimize')
def optimize(problem: Problem):
    return solve(problem)
@app.post('/route')
async def route(request:RouteRequest):
    try:
        return await valhalla_route(request)
    except (RuntimeError,ValueError,httpx.HTTPError) as e:
        raise HTTPException(503,str(e)) from e

class RoadProblem(BaseModel):
    now:datetime
    vehicles:list[Vehicle]=Field(min_length=1,max_length=8)
    loads:list[Shipment]=Field(min_length=1,max_length=20)
    locations:list[Point]
    profiles:list[TruckProfile]
    evidence_ref:str
    time_limit_seconds:int=Field(default=3,ge=1,le=10)

@app.post('/optimize-roads')
async def optimize_roads(data:RoadProblem):
    if len(data.locations)!=len(data.vehicles)+2*len(data.loads) or len(data.profiles)!=len(data.vehicles):
        raise HTTPException(400,'One start and profile per vehicle and two stops per load required')
    try:
        # Bounded parallelism prevents a planning request from flooding the routing VM.
        semaphore=asyncio.Semaphore(2)
        async def matrix(profile):
            async with semaphore: return await truck_matrix(data.locations,profile)
        matrices=await asyncio.gather(*(matrix(p) for p in data.profiles))
        for matrix in matrices:
            for row in matrix: row.append(0)
            matrix.append([0]*len(matrix[0]))
        problem=Problem(now=data.now,vehicles=data.vehicles,loads=data.loads,matrices=matrices,routing_evidence='valhalla-truck',evidence_ref=data.evidence_ref,time_limit_seconds=data.time_limit_seconds)
        result=await asyncio.to_thread(solve,problem)
        result['dataset']=os.environ.get('VALHALLA_DATASET','unverified')
        result['vehicle_profiles']=[p.model_dump() for p in data.profiles]
        return result
    except (RuntimeError,ValueError,httpx.HTTPError) as e:
        raise HTTPException(503,str(e)) from e
