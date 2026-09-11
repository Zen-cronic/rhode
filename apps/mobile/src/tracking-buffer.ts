import {Queue} from './queue.ts';
import {trackingBlock,validSample,type TrackingGrant,type TrackingState} from './tracking-policy.ts';
export const MAX_OFFLINE_SESSION_MS=60*60*1000;
type Duty='off_duty'|'on_duty'|'driving'|'sleeper';
export type VerifiedTracking={grantId:string;state:TrackingState&{resources:{id:string;duty?:Duty}[]};verifiedAt:string};
export type CapturedLocation={timestamp:number;coords:{latitude:number;longitude:number;accuracy:number|null;speed:number|null}};
export async function retainTrackingSamples(queue:Queue,grant:TrackingGrant,saved:VerifiedTracking|null,locations:CapturedLocation[],options:{now:number;permission:boolean;current:()=>Promise<TrackingGrant|null>;hash:(body:string)=>Promise<string>}){
 if(!saved||saved.grantId!==grant.id||queue.scope!==grant.scope)throw new Error('No verified session for this tracking grant.');
 const verifiedAt=Date.parse(saved.verifiedAt);if(!Number.isFinite(verifiedAt)||options.now<verifiedAt||options.now-verifiedAt>MAX_OFFLINE_SESSION_MS)throw new Error('Reconnect to verify this work session before retaining more GPS.');
 const blocked=trackingBlock(grant,saved.state,options.now,options.permission);if(blocked)throw new Error(blocked);
 const declared=saved.state.resources.find(r=>r.id===grant.driverId)?.duty;
 if(!declared)throw new Error('Last verified declared duty is unavailable.');
 const commands=await queue.list();
 const dutyChanges=commands.filter(c=>c.path==='/api/duty'&&c.status==='pending').map(c=>JSON.parse(c.body)).filter(c=>['off_duty','on_duty','driving','sleeper'].includes(c.duty)&&Number.isFinite(Date.parse(c.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let retained=0;
 for(const location of locations){
  const current=await options.current();
  if(current?.id!==grant.id||!current.enabled)throw new Error('Tracking stopped before capture.');
  if(!validSample(grant,location.timestamp,location.coords.accuracy,options.now)||!Number.isFinite(location.coords.latitude)||!Number.isFinite(location.coords.longitude)||Math.abs(location.coords.latitude)>90||Math.abs(location.coords.longitude)>180)continue;
  const duty=dutyChanges.filter(c=>Date.parse(c.at)<=location.timestamp&&Date.parse(c.at)>=Date.parse(saved.verifiedAt)).at(-1)?.duty??declared;
  const body={assignmentId:grant.assignmentId,sessionId:grant.sessionId,at:new Date(location.timestamp).toISOString(),position:{lat:location.coords.latitude,lng:location.coords.longitude},accuracyM:location.coords.accuracy,speedKph:location.coords.speed===null||!Number.isFinite(location.coords.speed)||location.coords.speed<0?null:location.coords.speed*3.6,odometerKm:null,duty,dutyEvidence:'cached-declaration',provenance:'live'};
  const id=await options.hash(JSON.stringify({grantId:grant.id,...body}));
  const latest=await options.current();if(latest?.id!==grant.id||!latest.enabled)throw new Error('Tracking stopped before capture.');
  await queue.enqueue(id,'/api/telemetry',{id,...body},0,'Device GPS · awaiting server confirmation');retained++;
 }
 return retained;
}
