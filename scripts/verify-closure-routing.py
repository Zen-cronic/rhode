import asyncio,json,sys,os
from pathlib import Path
from hashlib import sha256
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/optimizer'))
from roadstar_optimizer.routing import RouteRequest,ClosureArea,valhalla_route
async def main():
    request=RouteRequest(locations=[{'lat':43.5183,'lon':-79.8774},{'lat':42.987,'lon':-81.176}],truck={'height':4.1,'width':2.6,'length':23,'weight':40,'axle_load':9,'hazmat':False,'evidence':'synthetic-scenario'})
    baseline=await valhalla_route(request);points=baseline['route']['trip']['legs'][0]['shape']['coordinates'];lon,lat=points[len(points)//2]
    area=ClosureArea(id='synthetic-mid-route-closure',west=lon-.001,east=lon+.001,south=lat-.001,north=lat+.001)
    assert any(area.intersects_segment(a,b) for a,b in zip(points,points[1:]))
    revised=request.model_copy(update={'closures':[area]});alternate=await valhalla_route(revised);new=alternate['route']['trip']['legs'][0]['shape']['coordinates'];assert points!=new;assert not any(area.intersects_segment(a,b) for a,b in zip(new,new[1:]));assert baseline['profile']==alternate['profile']
    blocked=ClosureArea(id='synthetic-terminal-closed',west=-79.88,east=-79.87,south=43.51,north=43.52)
    try:await valhalla_route(request.model_copy(update={'closures':[blocked]}))
    except ValueError as error:unresolved=str(error)
    else:raise AssertionError('Closed terminal silently routed')
    result={'request':request.model_dump(),'closure':area.model_dump(),'baseline':baseline['route']['trip']['summary'],'alternate':alternate['route']['trip']['summary'],'baselineGeometrySha256':sha256(json.dumps(points).encode()).hexdigest(),'alternateGeometrySha256':sha256(json.dumps(new).encode()).hexdigest(),'baselineCrossesClosure':True,'alternateAllSegmentsOutsideClosure':True,'truckProfilePreserved':True,'blockedTerminal':unresolved,'baselineGeometry':points,'alternateGeometry':new,'scope':'Actual existing Ontario Valhalla; synthetic rectangle, no live traffic claim. Routing capability only, no operational route revision applied.'}
    Path('docs/evidence/closure-routing-2026-09-11.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if not k.endswith('Geometry')},indent=2))
asyncio.run(main())
