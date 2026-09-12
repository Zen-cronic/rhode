import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {pool} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {fixtures,london,milton} from '../services/api/src/fixtures.ts';
import {distanceKm} from '../packages/domain/src/index.ts';
// Local synthetic fixture only. Real operational commands go through the HTTP API.
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db),carrier='return-load-'+randomUUID();
const api=process.env.ROADSTAR_LOCAL_API??'http://127.0.0.1:4010';
assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));
const headers={authorization:'Bearer demo-dispatcher','x-carrier-id':carrier};
const command=(version=1)=>({...headers,'content-type':'application/json','idempotency-key':randomUUID(),'if-match':String(version)});
async function post(path:string,body:unknown,h=command(),expected=200){const response=await fetch(api+'/api/'+path,{method:'POST',headers:h,body:JSON.stringify(body)});const result=await response.json() as any;assert.equal(response.status,expected,JSON.stringify(result));return result;}
async function state(){const response=await fetch(api+'/api/state',{headers});assert.equal(response.status,200);return response.json() as any;}
try{
 const ready=await fetch('http://127.0.0.1:4040/health');assert.equal(ready.status,200,'Start the local optimizer and wait for /health before preparing the fixture');
 await store.seed(carrier);
 const base=fixtures().loads[0],kitchener={id:'kitchener-return',name:'Kitchener return pickup · synthetic location',lat:43.412,lng:-80.448,radiusM:180};
 const returns=[{...base,id:'RS-1043',customer:'Synthetic nearby return · pickup too early',pickup:london,delivery:milton,weightLb:18000,pallets:12,serviceMinutes:30,startAt:'2026-09-13T15:45:00Z',endAt:'2026-09-13T19:00:00Z'}, {...base,id:'RS-1044',customer:'Synthetic feasible return · later appointment',pickup:kitchener,delivery:milton,weightLb:18000,pallets:12,serviceMinutes:30,startAt:'2026-09-13T17:30:00Z',endAt:'2026-09-13T20:00:00Z'}];
 for(const load of returns){await db.query('UPDATE loads SET body=$3 WHERE carrier_id=$1 AND id=$2',[carrier,load.id,JSON.stringify(load)]);await db.query('DELETE FROM stops WHERE carrier_id=$1 AND load_id=$2',[carrier,load.id]);for(const [i,p] of [load.pickup,load.delivery].entries())await db.query('INSERT INTO stops VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8)',[carrier,load.id,p.id,i,p.lng,p.lat,p.radiusM,JSON.stringify(p)]);}
 const pairing={driverId:'D-01',truckId:'T-101',trailerId:'V-101'};
 const prior=await post('dispatch',{loadId:'RS-1042',...pairing});
 await post('respond',{assignmentId:prior.id,action:'accept'},{...command(),authorization:'Bearer demo-driver-1'});
 const before=await state();
 // Direct dispatch cannot bypass the appointment failure seen by batch planning.
 const blocked=await post('dispatch',{loadId:'RS-1043',...pairing},command(),409);assert.equal(blocked.error.code,'INELIGIBLE');
 const input={loadIds:returns.map(l=>l.id),vehicles:[pairing]},key=command(0);
 const stale=await post('optimize',input,key);assert.deepEqual(await post('optimize',input,key),stale);
 assert.equal(stale.result.routing_evidence,'valhalla-truck');assert.equal(stale.result.routes.length,1);
 assert.deepEqual(stale.result.routes[0].stops.map((s:any)=>s.load_id),['RS-1044','RS-1044']);
 assert.deepEqual(stale.result.infeasible_loads,[{load_id:'RS-1043',reason:'Pickup closes before every compatible vehicle finishes its committed work.'}]);
 const held=await post('maintenance',{action:'hold',resourceId:'T-101',startAt:'2026-09-13T20:30:00Z',endAt:'2026-09-13T21:00:00Z',reason:'Synthetic stale evidence verification'});
 const conflict=await post('approve-plan',{planId:stale.id},command(),409);assert.equal(conflict.error.code,'STALE_PLAN');
 await post('maintenance',{action:'release',resourceId:'T-101',holdId:held.id},command(2));
 const fresh=await post('optimize',input,command(0)),after=await state();
 assert.equal(after.assignments.length,1);assert.deepEqual(after.assignments,before.assignments);
 assert.equal(after.tripGroups.length,0);
 const saved=after.planningRuns.find((p:any)=>p.id===fresh.id);assert.equal(saved.input.vehicles[0].available_at,240);
 assert.deepEqual(saved.input.locations[0],{lat:london.lat,lon:london.lng});
 assert.equal(saved.input.vehicles[0].driving_minutes,315);assert.equal(saved.input.vehicles[0].duty_minutes,315);
 const reservations=(await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrier])).rows;
 await writeFile('/tmp/roadstar-return-load-fixture.json',JSON.stringify({carrier,priorAssignment:prior.id,planId:fresh.id,stalePlanId:stale.id,beforeAssignments:before.assignments,beforeReservations:reservations,plan:saved,blocked,conflict,comparison:{nearbyPickupKm:distanceKm(london,london),alternatePickupStraightLineKm:distanceKm(london,kitchener),priorRelease:'2026-09-13T16:00:00Z',nearbyPickup:returns[0].startAt,alternativePickup:returns[1].startAt},limitations:['Synthetic appointments and declared budgets; actual Valhalla truck matrix','Attractive means nearby pickup, not a verified rate or revenue estimate','Prior trip is projected from its full plan; no observed live delivery progress','Bounded search does not prove optimality; no new axle-group calculation']},null,2)+'\n');
 console.log(JSON.stringify({carrier,planId:fresh.id,checks:'Real-road later return selected; closest return rejected; stale approval and exact retry verified'}));
}finally{await db.end();}
