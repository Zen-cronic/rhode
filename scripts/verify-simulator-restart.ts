import {execFileSync} from 'node:child_process';
import {pool} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {milton,london} from '../services/api/src/fixtures.ts';
import {randomUUID} from 'node:crypto';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar'),store=new Store(db),carrier='sim-restart-'+randomUUID(),cmd=(expectedVersion=1)=>({key:randomUUID(),expectedVersion});
async function call(path:string,body?:unknown){const r=await fetch('http://127.0.0.1:4020'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value as any;}
try{
await store.seed(carrier);const dispatcher=await store.membership('demo-dispatcher',carrier),driver=await store.membership('demo-driver-1',carrier),input={loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'};
const a:any=await store.dispatch(dispatcher,cmd(),input);await store.respond(driver,cmd(),{assignmentId:a.id,action:'accept'});const next:any=await store.dispatch(dispatcher,cmd(),{...input,loadId:'RS-1043'});
const before=(await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrier])).rows;
const run=await call('/runs',{assignment_id:a.id,carrier_id:carrier,start_time:a.startAt,dock_wait_seconds:18000,route:{locations:[milton,london].map(p=>({lat:p.lat,lon:p.lng})),truck:{height:4.1,width:2.6,length:23,weight:40,axle_load:9,hazmat:false,evidence:'synthetic-scenario'}}});
await call(`/runs/${run.id}/resume`,{});await call(`/runs/${run.id}/advance`,{seconds:2});const state=await call(`/runs/${run.id}`);
await call(`/runs/${run.id}/pause`,{});
execFileSync('systemctl',['--user','restart','roadstar-preview-simulator.service']);
let restored:any;for(let n=0;n<50;n++){try{restored=await call(`/runs/${run.id}`);break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
assert.ok(restored?.paused&&restored.restored);assert.equal(restored.conditions_hash,state.conditions_hash);assert.deepEqual(restored.events,state.events);assert.deepEqual(restored.delay_reports,state.delay_reports);
await call(`/runs/${run.id}/resume`,{});await call(`/runs/${run.id}/advance`,{seconds:2});
assert.equal((await call(`/runs/${run.id}`)).generated_until_seconds,4);
assert.equal(state.delay_reports.length,1);assert.ok(state.delay_reports[0].result.impactedLoads.some((x:any)=>x.id===next.id));
assert.deepEqual((await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrier])).rows,before);
assert.equal((await db.query('SELECT * FROM disruptions WHERE carrier_id=$1',[carrier])).rows.length,1);
assert.equal((await db.query('SELECT * FROM approvals WHERE carrier_id=$1',[carrier])).rows.length,0);
await call(`/runs/${run.id}/reset`,{});await call(`/runs/${run.id}/resume`,{});await call(`/runs/${run.id}/advance`,{seconds:4});await call(`/runs/${run.id}/pause`,{});
assert.equal((await db.query('SELECT * FROM disruptions WHERE carrier_id=$1',[carrier])).rows.length,1);
assert.equal(Number((await db.query('SELECT count(*) FROM telemetry WHERE carrier_id=$1',[carrier])).rows[0].count),5);
const receipt={restoredPaused:true,eventsAndDelayReceiptsEqualAfterRestart:true,resumedFromSeconds:2,continuedUntilSeconds:4,verifiedAt:new Date().toISOString(),carrier,assignmentId:a.id,nextAssignmentId:next.id,runId:run.id,conditionsHash:run.conditions_hash,routeEvidence:'actual Valhalla truck route, Milton to London synthetic facilities',routePoints:state.initial_conditions.coordinates.length,configuredDockWaitSeconds:18000,delay:state.delay_reports[0],uniqueTelemetry:(await db.query('SELECT count(*) FROM telemetry WHERE carrier_id=$1',[carrier])).rows[0].count,reservationsUnchanged:true,approvals:0,resetDuplicateDisruptions:0,scope:'Local separate simulator process → authenticated Fastify API → PostgreSQL; seeded speed/dwell model, not real traffic or a physical dock timestamp. No cloud deployment of this packet yet.'};
await writeFile('docs/evidence/simulator-restart-2026-09-11.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await db.end()}
