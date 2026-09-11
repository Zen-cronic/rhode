import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {createApi} from '../services/api/src/server.ts';
import {fixtures,DEMO_NOW} from '../services/api/src/fixtures.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db),carrierId=`loadtest-${randomUUID()}`;
const clients=131,cycles=4,ids:Array<{uid:string;assignmentId:string}>=[];
try{
 await migrate(db);await store.seed(carrierId);const f=fixtures();const c=await db.connect();
 try{await c.query('BEGIN');for(let i=0;i<clients;i++){
  const uid=`driver-${i}`,driverId=`perf-driver-${i}`,truckId=`perf-truck-${i}`,trailerId=`perf-trailer-${i}`,loadId=`perf-load-${i}`,assignmentId=randomUUID();ids.push({uid,assignmentId});
  for(const [kind,id,body] of [['driver',driverId,f.drivers[0]],['truck',truckId,f.trucks[0]],['trailer',trailerId,f.trailers[0]]] as const)await c.query('INSERT INTO resources(carrier_id,id,kind,body) VALUES($1,$2,$3,$4)',[carrierId,id,kind,JSON.stringify({...body,id})]);
  await c.query('INSERT INTO hos_bases VALUES($1,$2,$3,$4,$5,$6)',[carrierId,driverId,DEMO_NOW,f.drivers[0].duty,JSON.stringify(f.drivers[0].budget),'synthetic']);
  await c.query("INSERT INTO memberships VALUES($1,$2,'driver',$3)",[carrierId,uid,driverId]);
  const load={...f.loads[0],id:loadId,status:'accepted'};await c.query('INSERT INTO loads VALUES($1,$2,2,$3,$4)',[carrierId,loadId,'accepted',JSON.stringify(load)]);
  for(const [j,s] of [load.pickup,load.delivery].entries())await c.query('INSERT INTO stops VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8)',[carrierId,loadId,s.id,j,s.lng,s.lat,s.radiusM,JSON.stringify(s)]);
  await c.query("INSERT INTO assignments VALUES($1,$2,$3,$4,$5,$6,$7,$8,2,'accepted')",[carrierId,assignmentId,loadId,driverId,truckId,trailerId,load.startAt,load.endAt]);
 }await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 const app=createApi(store,{verifyToken:async token=>token});await app.listen({port:0,host:'127.0.0.1'});const base=`http://127.0.0.1:${(app.server.address() as any).port}`;
 const committedAt=new Map<string,number>();const telemetryMs:number[]=[],syncMs:number[]=[],lagMs:number[]=[],failures:string[]=[];let cursor='0';
 try{for(let tick=0;tick<cycles;tick++){
  const start=performance.now();
  await Promise.all(ids.map(async({assignmentId,uid})=>{const t=performance.now();const result=await fetch(base+'/api/telemetry',{method:'POST',headers:{Authorization:'Bearer demo-simulator','X-Carrier-Id':carrierId,'Content-Type':'application/json','Idempotency-Key':randomUUID(),'If-Match':'2'},body:JSON.stringify({id:`${tick}-${assignmentId}`,assignmentId,at:new Date(Date.parse(DEMO_NOW)+tick*2000).toISOString(),position:f.loads[0].pickup,accuracyM:5,speedKph:0,odometerKm:0,duty:'on_duty',provenance:'synthetic'})});if(!result.ok)failures.push(await result.text());else await result.json();committedAt.set(uid,performance.now());telemetryMs.push(performance.now()-t);}));
  const committed=performance.now();
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,2000-(performance.now()-start))));
  await Promise.all(ids.map(async({uid})=>{const t=performance.now(),headers={Authorization:`Bearer ${uid}`,'X-Carrier-Id':carrierId};const updates=await fetch(base+`/api/updates?cursor=${cursor}`,{headers});const changes=await updates.json() as any;if(!updates.ok)failures.push(JSON.stringify(changes));const state=await fetch(base+'/api/state',{headers});const snapshot=await state.json() as any;if(!state.ok||snapshot.assignments?.length!==1||!snapshot.resources?.find((r:any)=>r.id===`perf-driver-${uid.replace('driver-','')}`)?.budget)failures.push('Invalid driver snapshot');syncMs.push(performance.now()-t);lagMs.push(performance.now()-committedAt.get(uid)!);}));
  cursor=(await db.query('SELECT max(cursor)::text AS cursor FROM events WHERE carrier_id=$1',[carrierId])).rows[0].cursor;
 }}finally{await app.close();}
 const summary=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);return {count:s.length,p50Ms:Math.round(s[Math.floor(s.length*.5)]),p95Ms:Math.round(s[Math.floor(s.length*.95)]),maxMs:Math.round(s.at(-1)!)};};
 const size=(await db.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes;
 const result={measuredAt:new Date().toISOString(),environment:'Local Docker PostgreSQL16/PostGIS + Node24 Fastify over loopback HTTP; not Cloud SQL capacity proof',clients,cycles,pollIntervalMs:2000,telemetry:summary(telemetryMs),syncRequests:summary(syncMs),commitToSnapshotLag:summary(lagMs),failures:failures.length,databaseBytes:size,assumptions:['131 synthetic drivers, one accepted trip and explicit HOS basis each','4 synchronized bursts; no WAN or mobile radio latency','Database includes separate private workbook import and other test carriers','Fixture setup directly inserted accepted records; assignment integrity tested separately']};await mkdir('docs/evidence',{recursive:true});await writeFile('docs/evidence/load-test-131.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(failures.length)throw new Error(`Load test failures: ${failures.slice(0,3).join(';')}`);
}finally{await db.end();}
