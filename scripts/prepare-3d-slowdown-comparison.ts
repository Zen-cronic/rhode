import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pool} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {milton,london} from '../services/api/src/fixtures.ts';

const pointer='data/3d-slowdown-comparison.json';
const databaseUrl=process.env.TEST_DATABASE_URL??'postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar';
const db=pool(databaseUrl);

async function api(carrier:string,path:string,body?:unknown,version=1,actor='demo-dispatcher'){
 const response=await fetch(`http://127.0.0.1:4010/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:`Bearer ${actor}`,'x-carrier-id':carrier,'idempotency-key':randomUUID(),'if-match':String(version)},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const result=await response.json();assert.ok(response.ok,`${response.status} ${JSON.stringify(result)}`);return result as any;
}

async function simulator(path:string,body?:unknown){
 const response=await fetch(`http://127.0.0.1:4020${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(300000)});
 const result=await response.json();assert.ok(response.ok,`${response.status} ${JSON.stringify(result)}`);return result as any;
}

async function runTo(runId:string,seconds:number){
 await simulator(`/runs/${runId}/resume`,{});let state=await simulator(`/runs/${runId}`);
 while(state.elapsed_seconds<seconds){await simulator(`/runs/${runId}/advance`,{seconds:Math.min(300,seconds-state.elapsed_seconds)});state=await simulator(`/runs/${runId}`);console.log(JSON.stringify({runId,elapsedSeconds:state.elapsed_seconds,phase:state.phase}));}
 await simulator(`/runs/${runId}/pause`,{});return simulator(`/runs/${runId}`);
}

async function alignLoads(carrier:string){
 const template=(await db.query("SELECT body FROM loads WHERE carrier_id=$1 AND id='RS-1042'",[carrier])).rows[0].body;
 const times={startAt:'2026-09-13T12:30:00Z',endAt:'2026-09-13T16:30:00Z'};
 for(const [id,customer] of [['RS-1042','Demo baseline · Highway 401'],['RS-1043','Demo slowdown · Highway 401']]){
  const body={...template,id,customer,...times,status:'open',version:1,pickup:milton,delivery:london};
  await db.query('UPDATE loads SET version=1,status=$3,body=$4 WHERE carrier_id=$1 AND id=$2',[carrier,id,'open',JSON.stringify(body)]);
  await db.query('DELETE FROM stops WHERE carrier_id=$1 AND load_id=$2',[carrier,id]);
  for(const [ordinal,stop] of [milton,london].entries())await db.query('INSERT INTO stops VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8)',[carrier,id,stop.id,ordinal,stop.lng,stop.lat,stop.radiusM,JSON.stringify(stop)]);
 }
}

try{
 assert.ok(!process.env.K_SERVICE,'The 3D comparison fixture is local-only.');
 try{await readFile(pointer);throw new Error(`Retained comparison pointer already exists at ${pointer}. Preserve it.`);}catch(error:any){if(error.code!=='ENOENT')throw error;}
 const carrier=`corridor-compare-${randomUUID()}`;assert.ok(!carrier.startsWith('presenter-recovery-'));
 await new Store(db).seed(carrier);await alignLoads(carrier);
 const definitions=[
  {kind:'baseline',loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101',actor:'demo-driver-1'},
  {kind:'road_slowdown',loadId:'RS-1043',driverId:'D-02',truckId:'T-102',trailerId:'V-102',actor:'demo-driver-2'},
 ] as const;
 const branches=[] as any[];
 for(const definition of definitions){
  const assignment=await api(carrier,'dispatch',{loadId:definition.loadId,driverId:definition.driverId,truckId:definition.truckId,trailerId:definition.trailerId});
  await api(carrier,'respond',{assignmentId:assignment.id,action:'accept'},1,definition.actor);
  const run=await simulator('/runs',{assignment_id:assignment.id,carrier_id:carrier,start_time:assignment.startAt,seed:42,route:{locations:[milton,london].map(point=>({lat:point.lat,lon:point.lng})),truck:{height:4.1,width:2.6,length:23,weight:40,axle_load:9,hazmat:false,evidence:'synthetic-scenario'}},...(definition.kind==='road_slowdown'?{slowdown_start_seconds:600,slowdown_seconds:1800,slowdown_factor:.1}:{})});
  branches.push({...definition,assignmentId:assignment.id,runId:run.id,conditionsHash:run.conditions_hash});
 }
 await writeFile(pointer,JSON.stringify({createdAt:new Date().toISOString(),carrier,branches,status:'running'},null,2)+'\n');
 for(const branch of branches){const state=await runTo(branch.runId,2400);branch.eventCount=state.events.length;branch.distanceKm=state.events.at(-1)?.odometerKm;branch.eventId=state.events.at(-1)?.id;}
 const inventory=await simulator(`/control/runs?carrier_id=${encodeURIComponent(carrier)}`),matched=inventory.runs.filter((run:any)=>branches.some(branch=>branch.runId===run.run_id));
 assert.equal(matched.length,2);assert.equal(new Set(matched.map((run:any)=>run.comparison_basis_hash)).size,1,'Runs must share one server-derived comparison basis');
 assert.deepEqual(new Set(matched.map((run:any)=>run.intervention.kind)),new Set(['baseline','road_slowdown']));
 assert.equal(branches[0].eventCount,2401);assert.equal(branches[1].eventCount,2401);assert.ok(branches[1].distanceKm<branches[0].distanceKm);
 const output={createdAt:new Date().toISOString(),carrier,status:'ready',comparisonBasisHash:matched[0].comparison_basis_hash,branches:branches.map(branch=>({...branch,modeledCompletionMs:matched.find((run:any)=>run.run_id===branch.runId)?.modeled_completion_ms,intervention:matched.find((run:any)=>run.run_id===branch.runId)?.intervention})),limits:'Local synthetic matched replay. No live traffic, revenue, certified GPS, billing, physical GPU or hosted-control claim.'};
 await writeFile(pointer,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{await db.end();}
