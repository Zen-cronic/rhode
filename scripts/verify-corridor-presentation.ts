import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {pool} from '../services/api/src/db.ts';
const fixture=JSON.parse(await readFile('data/complete-replay-fixture.json','utf8'));
const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar');
const dir='docs/evidence/corridor-presentation-2026-09-12';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function durable(){
 const tables=(await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='carrier_id' ORDER BY table_name")).rows;
 const result:Record<string,{count:number;hash:string}>={};
 for(const {table_name} of tables){assert.match(table_name,/^[a-z_]+$/);const rows=(await db.query(`SELECT * FROM "${table_name}" WHERE carrier_id=$1`,[fixture.carrier])).rows.map((x:unknown)=>JSON.stringify(x)).sort();result[table_name]={count:rows.length,hash:hash(rows)};}
 return result;
}
async function files(){const result:Record<string,string>={};for(const file of (await readdir('data/simulator')).filter(x=>x.endsWith('.json')).sort())result[file]=hash(await readFile('data/simulator/'+file,'utf8'));return result;}
async function request(path:string,role='demo-dispatcher',expected=200){const response=await fetch('http://127.0.0.1:4010/api/'+path,{headers:{authorization:'Bearer '+role,'x-carrier-id':fixture.carrier}});const body:any=await response.json();assert.equal(response.status,expected,JSON.stringify(body));return {body,cache:response.headers.get('cache-control')};}
try{
 const before=await durable(),checkpoints=await files();
 const saved=JSON.parse(await readFile('data/simulator/'+fixture.run.id+'.json','utf8')).run;
 assert.equal(saved.emit_mode,true);assert.equal(saved.events.length,10201);
 let offset=0,snapshot='',all:any[]=[],routes:any[]=[],pages=0;const ms:number[]=[];
 do{
  const query=new URLSearchParams({offset:String(offset),limit:'1000'});if(snapshot)query.set('snapshot',snapshot);
  const start=performance.now();const {body,cache}=await request('simulator/'+fixture.run.id+'/presentation?'+query);ms.push(performance.now()-start);
  assert.equal(cache,'private, no-store');assert.equal(body.total,10201);assert.equal(body.offset,offset);
  assert.equal(body.run_id,fixture.run.id);assert.equal(body.assignment_id,fixture.trip.id);
  assert.ok(!('carrier_id' in body)&&!('api_origin' in body)&&!('pending' in body));
  assert.ok(body.events.length<=1000);if(snapshot)assert.equal(body.snapshot,snapshot);else{snapshot=body.snapshot;routes=body.routes;}
  all.push(...body.events);offset=body.next_offset;pages++;
 }while(offset!==null);
 assert.equal(pages,11);assert.equal(all.length,10201);
 const sampleFields=['id','assignmentId','at','position','speedKph','odometerKm','duty','phase','accuracyM','provenance'];
 assert.deepEqual(all.map(x=>x.sample),saved.events.map((e:any)=>Object.fromEntries(sampleFields.map(k=>[k,e[k]??null]))));
 assert.equal(routes.length,1);assert.equal(routes[0].source,'valhalla-truck');assert.deepEqual(routes[0].geometry.coordinates,saved.replay.initial.coordinates);
 assert.ok(all.every(x=>x.route_key===routes[0].key));assert.equal(all.at(-1).elapsed_seconds,10200);
 await request('simulator/'+fixture.run.id+'/presentation','demo-driver-1',403);
 await request('simulator/'+fixture.run.id+'/presentation?offset=1000','demo-dispatcher',400);
 await request('simulator/'+fixture.run.id+'/presentation?snapshot='+'0'.repeat(64),'demo-dispatcher',409);
 const inventory=(await request('simulator')).body;
 const otherRun=(await Promise.all(Object.keys(checkpoints).map(async file=>JSON.parse(await readFile('data/simulator/'+file,'utf8')).run))).find(x=>x.carrier_id!==fixture.carrier);
 if(otherRun)await request('simulator/'+otherRun.run_id+'/presentation','demo-dispatcher',404);
 assert.equal(inventory.runs.find((x:any)=>x.run_id===fixture.run.id).paused,true);
 assert.deepEqual(await durable(),before);assert.deepEqual(await files(),checkpoints);
 await mkdir(dir,{recursive:true});
 const proof={verifiedAt:new Date().toISOString(),runId:fixture.run.id,snapshot,pages,samples:all.length,eventHash:hash(all.map(x=>x.sample)),routeCoordinates:routes[0].geometry.coordinates.length,pageMilliseconds:ms.map(x=>Math.round(x)),recordSets:before,checkpointCount:Object.keys(checkpoints).length,checks:['All 10201 acknowledged samples exactly match preserved source fields in order','Real Valhalla geometry and event route keys preserved','Private/no-store response omits internal checkpoint metadata','Driver and other-carrier reads refused; unpinned and stale pages refused','All carrier record sets and all simulator checkpoint files unchanged; run remains paused'],limits:'Read-only local presentation feed, not a corridor renderer or hosted simulator. Sequential page latency is not a 131-driver load test. Historical duty is an observation, not a reconstructed HOS balance or authoritative detention time.'};
 await writeFile(dir+'/verification.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({pages,samples:all.length,snapshot,checkpointCount:proof.checkpointCount,maxPageMs:Math.round(Math.max(...ms)),unchangedRecordSets:Object.keys(before).length}));
}finally{await db.end();}
