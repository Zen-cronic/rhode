import {axleProof} from './axles.ts';
import type pg from 'pg';
import type {Store,Actor} from './store.ts';
import {demand,DomainError,timestamp,distanceKm,type Driver,type Truck,type Trailer} from '../../../packages/domain/src/index.ts';
import {computation} from './planning.ts';
import {groupFor} from './trip-groups.ts';
import {createHash} from 'node:crypto';
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function closureAreas(c:Pick<pg.Pool,'query'>|pg.PoolClient,carrierId:string,assignmentIds:string[]){
 return (await c.query('SELECT id,area FROM road_closures WHERE carrier_id=$1 AND assignment_id=ANY($2::uuid[]) ORDER BY id',[carrierId,assignmentIds])).rows.map(r=>({id:r.id,...r.area}));
}
export async function requireReviewedClosure(c:pg.PoolClient,carrierId:string,assignmentId:string){
 const areas=await closureAreas(c,carrierId,[assignmentId]);if(!areas.length)return;
 const reviewed=(await c.query("SELECT body FROM route_revisions WHERE carrier_id=$1 AND assignment_id=$2 AND status='approved' ORDER BY approved_at DESC LIMIT 1",[carrierId,assignmentId])).rows[0];
 demand(reviewed&&canonical(reviewed.body.closures)===canonical(areas),'CLOSURE_UNRESOLVED','Prior trip has an unresolved road closure; review its remaining route before committing further work.');
}
export async function routeRevisionProof(store:Store,c:pg.PoolClient,a:Actor,assignmentId:string){
 const assignment=await store.getAssignment(c,a,assignmentId),load=await store.load(c,a,assignment.loadId);
 demand(assignment.status==='accepted','INVALID_TRANSITION','A route revision requires an accepted trip.');
 const closures=await closureAreas(c,a.carrierId,[assignmentId]);demand(closures.length,'NO_CLOSURE','Record an observed closure first.');
 const now=await store.now(c,a,load.provenance);
 const base={assignmentId,assignmentVersion:assignment.version,loadVersion:load.version,closures,evaluatedAt:now,provenance:load.provenance};
 try{
  demand(!await groupFor(c,a.carrierId,assignmentId),'GROUP_ROUTE_REVIEW','Consolidated manifest reroutes require review of the complete group.');
  const driver=await store.resource<Driver>(c,a,assignment.driverId,'driver'),truck=await store.resource<Truck>(c,a,assignment.truckId,'truck'),trailer=await store.resource<Trailer>(c,a,assignment.trailerId,'trailer');
  const resources=(await c.query('SELECT id,version FROM resources WHERE carrier_id=$1 AND id=ANY($2::text[]) ORDER BY id',[a.carrierId,[driver.id,truck.id,trailer.id]])).rows;
  const latest=(await c.query('SELECT id,at,accuracy_m,disposition,body FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY at DESC,id DESC LIMIT 1',[a.carrierId,assignmentId])).rows[0];
  demand(latest&&new Date(latest.at).getTime()>=timestamp(assignment.startAt)&&timestamp(now)-new Date(latest.at).getTime()>=0&&timestamp(now)-new Date(latest.at).getTime()<=120000&&latest.accuracy_m<=100&&['applied','retained_out_of_order'].includes(latest.disposition)&&latest.body.provenance===load.provenance,'GPS_UNAVAILABLE','Current same-trip GPS is missing, future-dated, stale or uncertain.');
  const completed=(await c.query('SELECT stop_id FROM stop_completions WHERE carrier_id=$1 AND assignment_id=$2 AND occurred_at<=$3 ORDER BY stop_id',[a.carrierId,assignmentId,now])).rows.map(r=>r.stop_id);
  const stops=[load.pickup,load.delivery].filter(s=>!completed.includes(s.id));demand(stops.length,'TRIP_COMPLETE','No remaining stops need a new route.');
  const locations=[latest.body.position,...stops].map(p=>({lat:p.lat,lon:p.lng}));
  demand(!closures.some(b=>locations.some(p=>p.lon>=b.west&&p.lon<=b.east&&p.lat>=b.south&&p.lat<=b.north)),'CLOSURE_BLOCKS_STOP','A required remaining location is inside the closure; no supported route.');
  demand(truck.routingProfile&&(load.provenance==='synthetic'||truck.routingProfile.evidence==='operator-verified'),'ROUTING_INPUT_UNVERIFIED','Reviewed truck dimensions are required.');
  const route=await computation('/route',{locations,truck:truck.routingProfile,closures});const legs=route.route?.trip?.legs;
  demand(route.routing_evidence==='valhalla-truck'&&canonical(route.closures)===canonical(closures)&&legs?.length===locations.length-1&&legs.every((l:any)=>Number.isFinite(l.summary?.time)&&l.summary.time>=0&&l.shape?.type==='LineString'&&l.shape.coordinates.length>=2),'ROUTING_INVALID','Closure-aware truck geometry could not be verified.',503);
  const first=legs[0].shape.coordinates[0];demand(distanceKm(latest.body.position,{lng:first[0],lat:first[1]})<=.05,'ROUTE_SNAP_GAP','The alternate route begins too far from current GPS; a physical access review is required.');
  const drivingMinutes=Math.ceil(legs.reduce((sum:number,l:any)=>sum+l.summary.time,0)/60),dutyMinutes=drivingMinutes+load.serviceMinutes;
  const completionAt=new Date(timestamp(now)+dutyMinutes*60000).toISOString(),reasons:string[]=[];
  if(!driver.budget||!driver.budgetAsOf)reasons.push('Current HOS evidence is unavailable.');
  else{if(drivingMinutes>driver.budget.drivingMinutes)reasons.push('Insufficient driving budget.');if(dutyMinutes>driver.budget.onDutyMinutes)reasons.push('Insufficient on-duty budget.');if(dutyMinutes>driver.budget.cycleMinutes)reasons.push('Insufficient cycle budget.');if(dutyMinutes>driver.budget.shiftMinutes)reasons.push('Elapsed shift window would be exceeded.');}
  const axle=await axleProof(c,a.carrierId,load,truck,trailer);reasons.push(...axle.reasons);
  if(load.weightLb===null||load.weightLb<=0||load.weightLb>trailer.capacityLb)reasons.push('Payload capacity or weight is unverified.');
  if(trailer.equipment!==load.equipment||truck.axleClearance!=='verified')reasons.push('Equipment or axle clearance is unverified.');
  if(timestamp(completionAt)>timestamp(load.endAt))reasons.push('Alternate completion exceeds the load appointment; dispatcher recovery is unresolved.');
  if(timestamp(completionAt)>timestamp(assignment.endAt))reasons.push('Alternate work exceeds the current reserved interval; a schedule revision is required.');
  const conflicts=(await c.query("SELECT resource_id FROM reservations WHERE carrier_id=$1 AND assignment_id<>$2 AND active AND resource_id=ANY($3::text[]) AND period && tstzrange($4,$5,'[)')",[a.carrierId,assignmentId,[driver.id,truck.id,trailer.id],now,completionAt])).rows;
  if(conflicts.length)reasons.push('Alternate work conflicts with another resource reservation.');
  const holds=(await c.query("SELECT reason FROM maintenance_holds WHERE carrier_id=$1 AND resource_id=ANY($2::text[]) AND resolved_at IS NULL AND period && tstzrange($3,$4,'[)')",[a.carrierId,[driver.id,truck.id,trailer.id],now,completionAt])).rows;
  reasons.push(...holds.map(r=>`Maintenance hold: ${r.reason}`));
  const routeFingerprint=createHash('sha256').update(JSON.stringify({closures,profile:truck.routingProfile,legs})).digest('hex');
  return {...base,axle,eligible:!reasons.length,reasons,resources,telemetryId:latest.id,origin:latest.body.position,originAt:new Date(latest.at).toISOString(),odometerKm:latest.body.odometerKm,completedStops:completed,remainingStops:stops,drivingMinutes,dutyMinutes,completionAt,routeFingerprint,route,hasToll:!!route.route.trip.summary?.has_toll,note:'Remaining route from same-trip GPS. Full service allowance retained; no rest inferred. Routing is modeled and requires dispatcher approval; original observations remain unchanged.'};
 }catch(error){if(!(error instanceof DomainError))throw error;return {...base,eligible:false,reasons:[error.message],failureCode:error.code};}
}
