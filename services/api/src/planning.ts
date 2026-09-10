import {GoogleAuth} from 'google-auth-library';
import {createHash} from 'node:crypto';
import type pg from 'pg';
import type {Load,Truck,Point} from '../../../packages/domain/src/index.ts';
import {demand,DomainError} from '../../../packages/domain/src/index.ts';
const auth=new GoogleAuth();
export async function computation(path:string,input:unknown){
 const base=process.env.OPTIMIZER_URL;demand(base,'ROUTING_UNAVAILABLE','Truck routing service is not configured.',503);
 try{
  if(process.env.K_SERVICE){const client=await auth.getIdTokenClient(base);return (await client.request({url:base+path,method:'POST',data:input,timeout:55000})).data as any;}
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(55000)});if(!response.ok)throw new Error('Worker unavailable');return await response.json() as any;
 }catch{throw new DomainError('ROUTING_UNAVAILABLE','Truck routing could not be verified. Retry when the routing service is ready.',503);}
}
export async function roadRoute(c:pg.PoolClient,carrierId:string,load:Load,truck:Truck,origin?:Point){
 const profile=truck.routingProfile;demand(profile,'ROUTING_INPUT_MISSING','Vehicle dimensions, gross weight, axle load and evidence are required.');
 demand(load.provenance==='synthetic'||profile.evidence==='operator-verified','ROUTING_INPUT_UNVERIFIED','Live truck dimensions require reviewed evidence.');
 const locations=[...(origin?[origin]:[]),load.pickup,load.delivery].map(p=>({lat:p.lat,lon:p.lng}));
 const fingerprint=createHash('sha256').update(JSON.stringify({locations,profile,loadId:load.id,truckId:truck.id,dataset:process.env.ROUTING_DATASET})).digest('hex');
 const cached=await c.query("SELECT body FROM route_evidence WHERE carrier_id=$1 AND fingerprint=$2 AND recorded_at>now()-interval '24 hours'",[carrierId,fingerprint]);if(cached.rows[0])return cached.rows[0].body;
 const result=await computation('/route',{locations,truck:profile});demand(result.routing_evidence==='valhalla-truck'&&result.route?.trip?.legs?.length===locations.length-1,'ROUTING_INVALID','Routing service returned incomplete route evidence.',503);
 const legs=result.route.trip.legs;demand(legs.every((l:any)=>Number.isFinite(l.summary?.time)&&Number.isFinite(l.summary?.length)&&l.shape?.type==='LineString'),'ROUTING_INVALID','Truck route geometry is incomplete.',503);
 const body={fingerprint,loadId:load.id,truckId:truck.id,...result,coordinates:legs.flatMap((l:any)=>l.shape.coordinates),drivingMinutes:Math.ceil(legs.at(-1).summary.time/60),deadheadMinutes:origin?Math.ceil(legs[0].summary.time/60):0,deadheadKm:origin?legs[0].summary.length:0};
 await c.query('INSERT INTO route_evidence(carrier_id,fingerprint,load_id,truck_id,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(carrier_id,fingerprint) DO UPDATE SET body=excluded.body,recorded_at=now()',[carrierId,fingerprint,load.id,truck.id,JSON.stringify(body)]);return body;
}
