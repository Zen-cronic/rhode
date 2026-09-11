import {closureAreas} from './closures.ts';
import type pg from 'pg';
import type {Point,Truck} from '../../../packages/domain/src/index.ts';
import {computation} from './planning.ts';
import {demand,timestamp} from '../../../packages/domain/src/index.ts';

type Stop={assignmentId:string;stopId:string;point:Point};
export async function remainingWork(c:pg.PoolClient,carrierId:string,input:{
 assignmentIds:string[];stops:Stop[];truck:Truck;provenance:string;now:string;startAt:string;
 releaseAt:string;availableAt:string;drivingMinutes:number;serviceMinutes:number;
}){
 const activeClosures=await closureAreas(c,carrierId,input.assignmentIds);
 const now=timestamp(input.now),start=timestamp(input.startAt);
 let drivingMinutes=input.drivingMinutes,source='full declared work; current trip progress unavailable';
 let telemetryId:string|null=null,completedStops=0;
 if(start<=now&&process.env.OPTIMIZER_URL){
  // Examine the latest sample, not the latest sample that happens to pass accuracy.
  const latest=(await c.query("SELECT id,at,accuracy_m,disposition,body FROM telemetry WHERE carrier_id=$1 AND assignment_id=ANY($2::uuid[]) AND at<=$3 ORDER BY at DESC,id DESC LIMIT 1",[carrierId,input.assignmentIds,input.now])).rows[0];
  const age=latest?now-new Date(latest.at).getTime():Infinity;
  if(latest&&age<=120000&&new Date(latest.at).getTime()>=start&&latest.accuracy_m<=100&&latest.accuracy_m!==null&&['applied','retained_out_of_order'].includes(latest.disposition)&&latest.body.provenance===input.provenance){
   const completed=(await c.query('SELECT assignment_id,stop_id FROM stop_completions WHERE carrier_id=$1 AND assignment_id=ANY($2::uuid[]) AND occurred_at<=$3',[carrierId,input.assignmentIds,input.now])).rows;
   const stops=input.stops.filter(stop=>!completed.some(x=>x.assignment_id===stop.assignmentId&&x.stop_id===stop.stopId));
   completedStops=input.stops.length-stops.length;
   const profile=input.truck.routingProfile;
   demand(profile&&(input.provenance==='synthetic'||profile.evidence==='operator-verified'),'ROUTING_INPUT_UNVERIFIED','Remaining work requires reviewed truck dimensions.');
   const locations=[latest.body.position,...stops.map(s=>s.point)].map(p=>({lat:p.lat,lon:p.lng}));
   if(stops.length){
    const closures=await closureAreas(c,carrierId,input.assignmentIds);
    const route=await computation('/route',{locations,truck:profile,closures});
    const legs=route.route?.trip?.legs;
    demand(route.routing_evidence==='valhalla-truck'&&legs?.length===locations.length-1&&legs.every((l:any)=>Number.isFinite(l.summary?.time)&&l.summary.time>=0&&l.shape?.type==='LineString'),'ROUTING_INVALID','Remaining truck route could not be verified.',503);
    drivingMinutes=Math.ceil(legs.reduce((total:number,l:any)=>total+l.summary.time,0)/60);
   }else drivingMinutes=0;
   telemetryId=latest.id;source='Valhalla from recent same-trip GPS through dated uncompleted manifest stops';
  }
 }
 demand(!activeClosures.length||telemetryId,'CLOSURE_PROGRESS_UNAVAILABLE','A closure-affected trip requires current GPS to project remaining work.');
 // Time already consumed belongs to the historical budget. Future dock/road waits
 // until release remain on duty; no rest is inferred from unused appointment time.
 const futureWindow=Math.max(0,(timestamp(input.releaseAt)-Math.max(now,start,timestamp(input.availableAt)))/60000);
 const dutyMinutes=Math.max(drivingMinutes+input.serviceMinutes,Math.ceil(futureWindow));
 const availableAt=new Date(Math.max(timestamp(input.releaseAt),timestamp(input.availableAt),telemetryId?Math.max(now,start,timestamp(input.availableAt))+(drivingMinutes+input.serviceMinutes)*60000:0)).toISOString();
 return {drivingMinutes,dutyMinutes,availableAt,source,telemetryId,completedStops,serviceMinutes:input.serviceMinutes,note:'Full declared service retained because per-stop service allocation is unavailable; future waiting assumed on duty. GPS freshness threshold: 120 seconds.'};
}
