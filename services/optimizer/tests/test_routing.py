import pytest
from roadstar_optimizer.routing import decode_polyline6

def test_polyline6_decodes_coordinate_order_and_precision():
    assert decode_polyline6('_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI') == [[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]

def test_incomplete_geometry_is_rejected():
    with pytest.raises(ValueError):decode_polyline6('_izlhA')

from roadstar_optimizer.routing import ClosureArea,RouteRequest,valhalla_route
import asyncio,json,httpx


def test_closed_area_checks_crossings_and_boundary_contact_between_samples():
    area=ClosureArea(id='closed',west=0,south=0,east=.1,north=.1)
    for a,b in [([-1,.05],[1,.05]),([.05,-1],[.05,1]),([0,0],[-1,-1]),([-.1,0],[.2,0]),([.05,.05],[.05,.05])]:
        assert area.intersects_segment(a,b)
    assert not area.intersects_segment([-.1,-.1],[-.01,.2])
    assert not area.intersects_segment([.2,0],[.2,.2])
    for values in [dict(west=.1,east=0,south=0,north=.1),dict(west=0,east=.6,south=0,north=.1)]:
        with pytest.raises(ValueError):ClosureArea(id='bad',**values)


def route_request(closures):
    return RouteRequest(locations=[{'lat':38.5,'lon':-120.2},{'lat':43.252,'lon':-126.453}],truck={'height':4.1,'width':2.6,'length':23,'weight':40,'axle_load':9,'hazmat':False,'evidence':'synthetic-scenario'},closures=closures)


def test_adapter_passes_truck_and_polygons_and_rejects_ignored_exclusions(monkeypatch):
    area={'id':'closed','west':-121,'east':-120.8,'south':40.6,'north':40.8}
    monkeypatch.setenv('VALHALLA_URL','http://router');requests=[]
    def handler(request):
        body=json.loads(request.content);requests.append(body)
        return httpx.Response(200,json={'trip':{'status':0,'legs':[{'shape':'_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI'}]}})
    original=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:original(**kwargs,transport=httpx.MockTransport(handler)))
    with pytest.raises(ValueError,match='intersects closure'):
        asyncio.run(valhalla_route(route_request([area])))
    assert requests[0]['costing']=='truck'
    assert requests[0]['costing_options']['truck']['axle_load']==9
    assert requests[0]['exclude_polygons']==[ClosureArea(**area).polygon()]
    safe={**area,'south':40.1,'north':40.2}
    result=asyncio.run(valhalla_route(route_request([safe])))
    assert result['closures']==[safe] and result['routing_evidence']=='valhalla-truck'


def test_required_stop_inside_closure_fails_before_routing(monkeypatch):
    monkeypatch.setenv('VALHALLA_URL','http://router')
    def forbidden(**kwargs):raise AssertionError('No route should be requested')
    monkeypatch.setattr(httpx,'AsyncClient',forbidden)
    with pytest.raises(ValueError,match='required location'):
        asyncio.run(valhalla_route(route_request([{'id':'blocked-destination','west':-126.5,'east':-126.4,'south':43.2,'north':43.3}])))
