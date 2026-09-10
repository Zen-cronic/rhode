import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {createApi} from '../services/api/src/server.ts';
import {milton,london,DEMO_NOW} from '../services/api/src/fixtures.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db);
before(async()=>{await migrate(db);});after(async()=>db.end());
const command=(expectedVersion=1)=>({key:randomUUID(),expectedVersion});
const input={loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'};
async function setup(){const carrierId=`test-${randomUUID()}`;await store.seed(carrierId);return {carrierId,dispatcher:await store.membership('demo-dispatcher',carrierId),driver:await store.membership('demo-driver-1',carrierId),simulator:await store.membership('demo-simulator',carrierId)};}
test('PostgreSQL 16 supports required extensions and migrations are repeatable',async()=>{await migrate(db);const r=await db.query("SELECT extname FROM pg_extension WHERE extname IN ('postgis','btree_gist')");assert.equal(r.rows.length,2);assert.match((await db.query('SHOW server_version')).rows[0].server_version,/^16\./);});
test('commands retry exactly once; changed payload and stale versions have no side effects',async()=>{const {dispatcher}=await setup(),cmd=command();const v:any=await store.dispatch(dispatcher,cmd,input);assert.deepEqual(await store.dispatch(dispatcher,cmd,input),v);await assert.rejects(store.dispatch(dispatcher,cmd,{...input,driverId:'D-02'}),{code:'KEY_REUSED'});const before=await store.snapshot(dispatcher);await assert.rejects(store.dispatch(dispatcher,command(),input),{code:'STALE_VERSION'});const after=await store.snapshot(dispatcher);assert.deepEqual(after.assignments,before.assignments);assert.equal(after.cursor,before.cursor);});
test('concurrent assignments cannot reserve a truck',async()=>{const {dispatcher}=await setup();const r=await Promise.allSettled([store.dispatch(dispatcher,command(),input),store.dispatch(dispatcher,command(),{loadId:'RS-1044',driverId:'D-02',truckId:'T-101',trailerId:'R-101'})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await store.snapshot(dispatcher)).assignments.length,1);});
test('database exclusion constraints protect driver, truck, trailer and dock even outside API',async()=>{const {dispatcher,carrierId}=await setup();const v:any=await store.dispatch(dispatcher,command(),input);await db.query("INSERT INTO resources(carrier_id,id,kind,body) VALUES($1,'dock-1','dock','{}')",[carrierId]);await db.query("INSERT INTO reservations VALUES($1,$2,$3,'dock-1',tstzrange($4,$5,'[)'),true)",[carrierId,randomUUID(),v.id,v.startAt,v.endAt]);for(const id of ['D-01','T-101','V-101','dock-1'])await assert.rejects(db.query("INSERT INTO reservations VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),true)",[carrierId,randomUUID(),v.id,id,v.startAt,v.endAt]),{code:'23P01'});});
test('stale approval rolls back all changes and approvals recheck resource evidence',async()=>{const {dispatcher,carrierId}=await setup();const p:any=await store.propose(dispatcher,command(),input);await db.query("UPDATE resources SET version=version+1 WHERE carrier_id=$1 AND id='D-01'",[carrierId]);await assert.rejects(store.approve(dispatcher,command(),{proposalId:p.id}),{code:'STALE_PROPOSAL'});assert.equal((await store.snapshot(dispatcher)).assignments.length,0);assert.equal((await db.query('SELECT * FROM approvals WHERE carrier_id=$1',[carrierId])).rows.length,0);});
test('approved recovery atomically supersedes prior assignment and queues affected drivers',async()=>{const {dispatcher}=await setup();await store.dispatch(dispatcher,command(),input);const p:any=await store.propose(dispatcher,command(2),{...input,driverId:'D-02',truckId:'T-102',trailerId:'V-102',reason:'Dock departure delay'});const cmd=command(),result:any=await store.approve(dispatcher,cmd,{proposalId:p.id});assert.equal(result.assignment.driverId,'D-02');assert.deepEqual(await store.approve(dispatcher,cmd,{proposalId:p.id}),result);const s=await store.snapshot(dispatcher);assert.equal(s.assignments.filter(x=>x.status==='offered').length,1);assert.equal(s.assignments.filter(x=>String(x.status)==='superseded').length,1);});
test('driver and carrier boundaries reject reads and approvals',async()=>{const {dispatcher,driver}=await setup(),other=await setup();const app=createApi(store,{localDemo:true});await store.dispatch(dispatcher,command(),input);const headers={authorization:'Bearer demo-driver-2','x-carrier-id':dispatcher.carrierId};const r=await app.inject({url:'/api/state',headers});assert.equal(r.statusCode,200);assert.equal(r.json().loads.length,0);assert.equal((await app.inject({url:'/api/state',headers:{authorization:'Bearer demo-driver-1','x-carrier-id':'missing'}})).statusCode,403);await assert.rejects(Promise.resolve().then(()=>store.approve(driver,command(),{proposalId:randomUUID()})),{code:'FORBIDDEN'});const s=await store.snapshot(other.dispatcher);assert.equal(s.assignments.length,0);await app.close();});
test('duplicate, old and uncertain GPS never double-count a same-stop visit or advance scenario time',async()=>{const {dispatcher,driver,simulator}=await setup();const v:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:v.id,action:'accept'});const point=(id:string,at:string,position=milton,accuracyM=10,odometerKm=1000)=>({id,assignmentId:v.id,at,position,accuracyM,odometerKm,speedKph:0,duty:'on_duty' as const,provenance:'synthetic' as const});
 const arrive=point('arrive','2026-09-13T12:30:00Z');await store.ingest(simulator,command(),arrive);assert.equal((await store.ingest(simulator,command(),arrive) as any).duplicate,true);await assert.rejects(store.ingest(simulator,command(),{...arrive,speedKph:1}),{code:'EVENT_ID_COLLISION'});
 await store.ingest(simulator,command(),point('wait','2026-09-13T15:00:00Z'));
 assert.equal((await store.ingest(simulator,command(),point('old','2026-09-13T13:00:00Z',london)) as any).disposition,'retained_out_of_order');
 assert.equal((await store.ingest(simulator,command(),point('uncertain','2026-09-13T15:05:00Z',london,500)) as any).disposition,'uncertain');
 const open=await store.snapshot(dispatcher);assert.equal(open.visits[0].departure,null);
 await store.ingest(simulator,command(),point('depart','2026-09-13T15:15:00Z',{...milton,lat:43.52,lng:-79.89},10,1001));const s=await store.snapshot(dispatcher);assert.equal(s.visits.length,1);assert.equal(new Date(s.scenarios[0].clock).toISOString(),DEMO_NOW);
 const bill:any=await store.detentionDraft(dispatcher,command(0),{visitId:s.visits[0].id,contractId:'demo-ftl'});assert.equal(bill.billableMinutes,45);assert.equal(bill.amountCents,7500);assert.deepEqual(bill.evidence,['arrive','depart']);assert.equal(bill.status,'draft');
});
test('API rejects missing auth, malformed body, missing command metadata and returns repeatable response',async()=>{const {dispatcher}=await setup(),app=createApi(store,{localDemo:true});assert.equal((await app.inject({url:'/api/state'})).statusCode,401);const headers={authorization:'Bearer demo-dispatcher','x-carrier-id':dispatcher.carrierId,'idempotency-key':randomUUID(),'if-match':'1'};assert.equal((await app.inject({method:'POST',url:'/api/dispatch',headers,payload:{}})).statusCode,400);const a=await app.inject({method:'POST',url:'/api/dispatch',headers,payload:input}),b=await app.inject({method:'POST',url:'/api/dispatch',headers,payload:input});assert.equal(a.statusCode,200);assert.deepEqual(a.json(),b.json());await app.close();});
test('delay identifies next load and recovery removes delayed resource conflict',async()=>{
  const {dispatcher,driver,simulator,carrierId}=await setup();const first:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:first.id,action:'accept'});
  const next:any=await store.dispatch(dispatcher,command(),{...input,loadId:'RS-1043'});
  const delay:any=await store.delay(simulator,command(2),{assignmentId:first.id,expectedEnd:'2026-09-13T17:00:00Z',observedAt:'2026-09-13T15:30:00Z',reason:'Dock departure delayed'});
  assert.equal(delay.impactedLoads[0].load_id,'RS-1043');
  await assert.rejects(store.propose(dispatcher,command(2),{...input,loadId:'RS-1043'}),{code:'INELIGIBLE'});
  const p:any=await store.propose(dispatcher,command(2),{loadId:'RS-1043',driverId:'D-02',truckId:'T-102',trailerId:'V-102'});
  const approved:any=await store.approve(dispatcher,command(),{proposalId:p.id});assert.equal(approved.assignment.driverId,'D-02');
  assert.equal((await store.snapshot(dispatcher)).assignments.find(a=>a.id===next.id)?.status,'superseded');
});
test('driver completes stops in sequence; retries do not duplicate and completion releases reservations',async()=>{
  const {dispatcher,driver,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
  await assert.rejects(store.completeStop(driver,command(2),{assignmentId:a.id,stopId:london.id}),{code:'STOP_ORDER'});
  const cmd=command(2),pickup:any=await store.completeStop(driver,cmd,{assignmentId:a.id,stopId:milton.id});assert.deepEqual(await store.completeStop(driver,cmd,{assignmentId:a.id,stopId:milton.id}),pickup);
  const done:any=await store.completeStop(driver,command(3),{assignmentId:a.id,stopId:london.id});assert.equal(done.assignment.status,'completed');
  assert.equal((await db.query('SELECT * FROM reservations WHERE carrier_id=$1 AND active',[carrierId])).rows.length,0);
});
test('duty logging is versioned and explicit work sessions can end safely',async()=>{
  const {driver}=await setup();const result:any=await store.duty(driver,command(),{duty:'on_duty',at:new Date().toISOString()});assert.equal(result.certifiedELD,false);await assert.rejects(store.duty(driver,command(),{duty:'off_duty',at:new Date().toISOString()}),{code:'STALE_VERSION'});
  const start:any=await store.workSession(driver,command(0),{action:'start'});assert.equal(start.status,'active');const stop:any=await store.workSession(driver,command(),{action:'end',sessionId:start.id});assert.equal(stop.status,'ended');assert.ok((await store.snapshot(driver)).workSessions[0].ended_at);
});
test('document registration, immutable upload, authorized download and retries work end to end',async()=>{
 const {dispatcher,driver}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'roadstar-docs-'));process.env.FILE_ROOT=dir;const app=createApi(store,{localDemo:true});
 try{const headers={Authorization:'Bearer demo-driver-1','X-Carrier-Id':driver.carrierId,'Idempotency-Key':randomUUID(),'If-Match':'3'};
 const reg=await app.inject({method:'POST',url:'/api/document',headers,payload:{loadId:'RS-1042',mediaType:'image/png',kind:'pod',filename:'synthetic.png'}});assert.equal(reg.statusCode,200,reg.body);const doc=reg.json();
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQF0AAAAASUVORK5CYII=','base64');
 const uploadHeaders={...headers,'Idempotency-Key':randomUUID(),'If-Match':'1','Content-Type':'image/png'};
 const uploaded=await app.inject({method:'PUT',url:`/api/documents/${doc.id}/content`,headers:uploadHeaders,payload:bytes});assert.equal(uploaded.statusCode,200,uploaded.body);assert.equal(uploaded.json().status,'stored');
 const retry=await app.inject({method:'PUT',url:`/api/documents/${doc.id}/content`,headers:uploadHeaders,payload:bytes});assert.deepEqual(retry.json(),uploaded.json());
 const downloaded=await app.inject({url:`/api/documents/${doc.id}/content`,headers});assert.equal(downloaded.statusCode,200);assert.deepEqual(downloaded.rawPayload,bytes);
 const denied=await app.inject({url:`/api/documents/${doc.id}/content`,headers:{...headers,Authorization:'Bearer demo-driver-2'}});assert.equal(denied.statusCode,403);
 assert.equal((await store.snapshot(driver)).documents.length,1);
 }finally{await app.close();delete process.env.FILE_ROOT;await rm(dir,{recursive:true,force:true});}
});

test('document leases reject old workers and repeated successful results do not revise evidence twice',async()=>{
 const {claimDocumentJob,finishDocumentJob}=await import('../services/api/src/jobs.ts');const {carrierId,dispatcher}=await setup();const id=randomUUID(),jobId=randomUUID();
 await db.query("INSERT INTO documents(carrier_id,id,load_id,object_name,sha256,media_type,status,extraction) VALUES($1,$2::uuid,'RS-1042',$2::text,'synthetic-sha','image/png','stored','{}')",[carrierId,id]);
 await db.query("INSERT INTO jobs(carrier_id,id,kind,status,payload) VALUES($1,$2,'document.extract','pending',$3)",[carrierId,jobId,JSON.stringify({documentId:id,sha256:'synthetic-sha'})]);
 const first=await claimDocumentJob(db,carrierId,jobId);assert.equal(first.attempt,1);assert.equal((await claimDocumentJob(db,carrierId,jobId)).status,'not_claimable');
 await db.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE carrier_id=$1 AND id=$2",[carrierId,jobId]);const second=await claimDocumentJob(db,carrierId,jobId);assert.equal(second.attempt,2);
 const result={carrierId,jobId,attempt:1,model:'fixture-extractor',fields:{billNumber:'TEST-42',signedBy:null,observedDate:null,notes:null}};await assert.rejects(finishDocumentJob(db,result),{code:'STALE_JOB'});
 assert.equal((await finishDocumentJob(db,{...result,attempt:2})).duplicate,false);const snapshot=await store.snapshot(dispatcher);assert.equal((await finishDocumentJob(db,{...result,attempt:2})).duplicate,true);assert.deepEqual((await store.snapshot(dispatcher)).documents,snapshot.documents);
 const app=createApi(store,{localDemo:true});assert.notEqual((await app.inject({method:'POST',url:'/internal/jobs/claim',payload:{carrierId,jobId}})).statusCode,200);await app.close();
});
test('incomplete driver membership cannot become a carrier-wide read',async()=>{const {carrierId}=await setup();await db.query("INSERT INTO memberships VALUES($1,'unlinked-driver','driver',NULL)",[carrierId]);await assert.rejects(store.membership('unlinked-driver',carrierId),{code:'FORBIDDEN'});});
