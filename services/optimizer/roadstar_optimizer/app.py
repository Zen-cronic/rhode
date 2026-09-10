from fastapi import FastAPI, HTTPException
import httpx
from .solver import Problem, solve
from .routing import RouteRequest, valhalla_route
app = FastAPI(title='RoadStar planning worker')
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
