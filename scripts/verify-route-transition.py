"""Run via RoadStar Poetry env with VALHALLA_URL pointing at Ontario tiles."""
import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from roadstar_optimizer.routing import RouteRequest, valhalla_route
from roadstar_optimizer.simulation import Replay
from roadstar_optimizer.route_transition import replace_remaining_route, distance_km

async def main():
    truck=dict(height=4.1,width=2.6,length=23,weight=40,axle_load=9,hazmat=False,evidence='synthetic-scenario')
    request=RouteRequest(locations=[{'lat':43.5183,'lon':-79.8774},{'lat':42.987,'lon':-81.176}],truck=truck)
    routed=await valhalla_route(request)
    coordinates=routed['route']['trip']['legs'][0]['shape']['coordinates']
    old=Replay(coordinates,1789302600000,stop_indices=[0,10,len(coordinates)-1],stop_wait_seconds=[20,0,0],route_evidence='valhalla-truck')
    old.paused=False;history=old.advance_samples(35);old.paused=True
    point=old.sample()['position']
    closure=dict(id='synthetic-401-closure',west=-80.5314,east=-80.5294,south=43.273031,north=43.275031)
    async def remaining(point, targets):
        return await valhalla_route(RouteRequest(locations=[{'lat':point['lat'],'lon':point['lng']}]+[{'lat':p[1],'lon':p[0]} for p in targets],truck=truck,closures=[closure]))
    # Interior chord position may differ from the router's unsimplified road geometry.
    moving=await remaining(point,[coordinates[10],coordinates[-1]])
    moving_gap=distance_km([point['lng'],point['lat']],moving['route']['trip']['legs'][0]['shape']['coordinates'][0])*1000
    moving_points=[];moving_stops=[0]
    for leg in moving['route']['trip']['legs']:
        points=leg['shape']['coordinates'];moving_points.extend(points[1:] if moving_points else points);moving_stops.append(len(moving_points)-1)
    try:
        replace_remaining_route(old,moving_points,moving_stops)
    except ValueError as error:
        assert 'no bridge' in str(error)
    else:
        raise AssertionError('Observed provider gap was silently accepted')
    # Record the observed gap; the actual successful fork uses an exact road vertex.
    old.paused=False
    while old._next_stop<2:history.extend(old.advance_samples(1))
    old.paused=True;retained=copy.deepcopy(old.__dict__);point=old.sample()['position']
    alternate=await remaining(point,[coordinates[-1]])
    geometry=alternate['route']['trip']['legs'][0]['shape']['coordinates']
    change=replace_remaining_route(old,geometry,[0,len(geometry)-1])
    assert old.__dict__==retained
    assert change.replay.sample()==old.sample()
    assert change.at_seconds==old.elapsed_seconds and change.replay._distance==old._distance
    change.replay.paused=False;future=change.replay.advance_samples(20)
    assert len(future)==20 and future[0]['at_ms']==history[-1]['at_ms']+1000
    assert all(b['odometerKm']>=a['odometerKm'] for a,b in zip([history[-1]]+future,future))
    receipt=dict(verifiedAt=datetime.now(timezone.utc).isoformat(),routeEvidence='Actual Ontario Valhalla truck route',baselinePoints=len(coordinates),alternatePoints=len(geometry),hasToll=alternate['route']['trip']['summary'].get('has_toll',False),transitionAtSeconds=change.at_seconds,retainedOdometerKm=change.retained_odometer_km,retainedWaitSeconds=change.retained_wait_seconds,previousConditionsHash=change.previous_conditions_hash,conditionsHash=change.conditions_hash,interiorSampleProviderGapMeters=moving_gap,interiorGapRejected=True,providerOriginGapMeters=distance_km([point['lng'],point['lat']],geometry[0])*1000,originalReplayUnchanged=True,transitionSampleExactlyEqual=True,lastOriginalSample=history[-1],firstAlternateSample=future[0],lastAlternateSample=future[-1],scope='Motion prerequisite only. No operational adoption command, driver receipt consumption, checkpoint transition timeline or historical-ID replay integration is claimed.')
    path=Path(__file__).resolve().parents[1]/'docs/evidence/route-transition-2026-09-11.json';path.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
asyncio.run(main())
