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
 const invoice=s.invoices.find(i=>i.visit_id===s.visits[0].id)!;const bill:any={...invoice.body,status:invoice.status};assert.equal(bill.automatic,true);assert.equal(bill.billableMinutes,45);assert.equal(bill.amountCents,7500);assert.deepEqual(bill.evidence,['arrive','depart']);assert.equal(bill.status,'draft');
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

test('maintenance hold blocks dispatch and release preserves history while stale resources conflict',async()=>{const {dispatcher,carrierId}=await setup();const held:any=await store.maintenance(dispatcher,command(),{action:'hold',resourceId:'T-101',startAt:'2026-09-13T12:00:00Z',endAt:'2026-09-13T18:00:00Z',reason:'Synthetic brake inspection'});await assert.rejects(store.dispatch(dispatcher,command(),input),{code:'INELIGIBLE'});await assert.rejects(store.maintenance(dispatcher,command(),{action:'release',resourceId:'T-101',holdId:held.id}),{code:'STALE_VERSION'});await store.maintenance(dispatcher,command(2),{action:'release',resourceId:'T-101',holdId:held.id});await store.dispatch(dispatcher,command(),input);assert.ok((await db.query('SELECT resolved_at FROM maintenance_holds WHERE carrier_id=$1',[carrierId])).rows[0].resolved_at);});
test('reviewed document corrections keep source/model evidence and facility notes stay on the same shipment',async()=>{const {dispatcher,driver,carrierId}=await setup();const id=randomUUID();await db.query("INSERT INTO documents(carrier_id,id,load_id,object_name,sha256,media_type,status,extraction) VALUES($1,$2::uuid,'RS-1042',$2::text,'review-sha','image/png','stored',$3)",[carrierId,id,JSON.stringify({fields:{billNumber:'wrong'},reviewStatus:'unreviewed'})]);const payload={documentId:id,fields:{billNumber:'corrected',signedBy:null,observedDate:null,notes:null},reason:'Verified against the original visible source'};await assert.rejects(Promise.resolve().then(()=>store.reviewDocument(driver,command(),payload)),{code:'FORBIDDEN'});await store.reviewDocument(dispatcher,command(),payload);await assert.rejects(store.reviewDocument(dispatcher,command(),payload),{code:'STALE_VERSION'});await assert.rejects(store.facilityNote(dispatcher,command(2),{documentId:id,stopId:'barrie-dock',instructions:'Use the south entrance.'}),{code:'STOP_MISMATCH'});await store.facilityNote(dispatcher,command(2),{documentId:id,stopId:london.id,instructions:'Use south entrance and call receiving.'});const snapshot=await store.snapshot(dispatcher);assert.equal(snapshot.documents[0].extraction.fields.billNumber,'wrong');assert.equal(snapshot.documents[0].extraction.reviewedFields.billNumber,'corrected');assert.equal(snapshot.facilityNotes.length,1);});
test('detention approval creates an immutable reviewed revision and stale contract cannot approve',async()=>{const {dispatcher,simulator,driver,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});const event=(id:string,at:string,position:any)=>({id,at,assignmentId:a.id,position,speedKph:0,odometerKm:0,accuracyM:5,duty:'on_duty' as const,provenance:'synthetic' as const});await store.ingest(simulator,command(),event('invoice-arrive','2026-09-13T12:30:00Z',milton));await store.ingest(simulator,command(),event('invoice-depart','2026-09-13T15:15:00Z',london));const visit=(await store.snapshot(dispatcher)).visits.find(x=>x.departure);assert.ok(visit);const draft=(await store.snapshot(dispatcher)).invoices.find(i=>i.visit_id===visit.id)!;const body={invoiceId:draft.id,acknowledgeObservedSamples:true,evidenceNote:'Reviewed same-stop samples and agreed synthetic contract terms.'};await db.query("UPDATE contracts SET version=2 WHERE carrier_id=$1",[carrierId]);await assert.rejects(store.approveInvoice(dispatcher,command(),body),{code:'STALE_CONTRACT'});const second:any=await store.detentionDraft(dispatcher,command(1),{visitId:visit.id,contractId:'demo-ftl'});const cmd=command(2),approved:any=await store.approveInvoice(dispatcher,cmd,{...body,invoiceId:second.id});assert.equal(approved.revision,3);assert.equal(approved.precision,'observed_samples');assert.deepEqual(await store.approveInvoice(dispatcher,cmd,{...body,invoiceId:second.id}),approved);assert.equal((await store.snapshot(dispatcher)).invoices.filter(x=>x.status==='approved').length,1);});

test('concurrent trip commits retain a gap-free observable update cursor',async()=>{const {dispatcher}=await setup();let finished=false;const seen=new Set<string>();let cursor='0';const writes=Promise.all(Array.from({length:30},(_,i)=>store.command(dispatcher,command(),'telemetry.received',{assignmentId:randomUUID(),i},async c=>{await c.query('SELECT pg_sleep($1)',[(i%4)*.002]);return {i};}))).finally(()=>{finished=true;});while(!finished){const updates=await store.updates(dispatcher,cursor);for(const change of updates.changes)seen.add(change.cursor);cursor=updates.cursor;await new Promise(resolve=>setTimeout(resolve,1));}await writes;const tail=await store.updates(dispatcher,cursor);for(const change of tail.changes)seen.add(change.cursor);assert.equal(seen.size,30);});
test('late model extraction never overwrites a human-reviewed field set',async()=>{const {claimDocumentJob,finishDocumentJob}=await import('../services/api/src/jobs.ts');const {dispatcher,carrierId}=await setup(),id=randomUUID(),jobId=randomUUID();await db.query("INSERT INTO documents(carrier_id,id,load_id,object_name,sha256,media_type,status,extraction) VALUES($1,$2::uuid,'RS-1042',$2::text,'late-sha','image/png','stored','{}')",[carrierId,id]);await db.query("INSERT INTO jobs(carrier_id,id,kind,status,payload) VALUES($1,$2,'document.extract','pending',$3)",[carrierId,jobId,JSON.stringify({documentId:id,sha256:'late-sha'})]);const claim=await claimDocumentJob(db,carrierId,jobId);const fields={billNumber:'HUMAN-42',signedBy:null,observedDate:null,notes:null};await store.reviewDocument(dispatcher,command(),{documentId:id,fields,reason:'Source read by dispatcher before extraction finished.'});await finishDocumentJob(db,{carrierId,jobId,attempt:claim.attempt!,model:'fixture-late',fields:{...fields,billNumber:'MODEL-42'}});const doc=(await store.snapshot(dispatcher)).documents[0];assert.equal(doc.extraction.reviewStatus,'reviewed');assert.equal(doc.extraction.reviewedFields.billNumber,'HUMAN-42');assert.equal(doc.extraction.fields.billNumber,'MODEL-42');});

test('tracking history preserves uncertainty and unknown values, paginates and enforces role ownership',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const v:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:v.id,action:'accept'});
 for(const [id,at,accuracy] of [['a','2026-09-13T12:30:00Z',10],['c','2026-09-13T12:32:00Z',600],['b','2026-09-13T12:29:00Z',10]] as const)await store.ingest(simulator,command(),{id,assignmentId:v.id,at,position:milton,accuracyM:accuracy,odometerKm:null,speedKph:null,duty:'on_duty',provenance:'synthetic'});
 const history=await store.tracking(driver,v.id);assert.deepEqual(history.points.map(p=>p.id),['b','a','c']);assert.deepEqual(history.points.map(p=>p.disposition),['retained_out_of_order','applied','uncertain']);assert.equal(history.points[0].speedKph,null);assert.equal(history.points[0].odometerKm,null);
 await assert.rejects(store.tracking(await store.membership('demo-driver-2',carrierId),v.id),{code:'FORBIDDEN'});await assert.rejects(store.tracking(simulator,v.id),{code:'FORBIDDEN'});await assert.rejects(store.tracking(driver,v.id,'not-a-cursor'),{code:'INVALID_CURSOR'});
 await db.query("INSERT INTO telemetry(carrier_id,id,assignment_id,at,location,accuracy_m,body,disposition) SELECT $1,'history-'||n,$2,'2026-09-13T14:00Z'::timestamptz+n*interval '1 second',ST_SetSRID(ST_MakePoint(0,0),4326)::geography,10,jsonb_build_object('id','history-'||n,'at','2026-09-13T14:00Z'::timestamptz+n*interval '1 second'),'uncertain' FROM generate_series(1,501) n",[carrierId,v.id]);
 const page1=await store.tracking(dispatcher,v.id),page2=await store.tracking(dispatcher,v.id,page1.nextBefore!);assert.equal(page1.points.length,500);assert.equal(page2.points.length,4);assert.equal(new Set([...page1.points,...page2.points].map(p=>p.id)).size,504);assert.equal(page2.nextBefore,null);
 await db.query("UPDATE telemetry SET recorded_at='2026-09-11T15:01:00Z' WHERE carrier_id=$1 AND assignment_id=$2",[carrierId,v.id]);await db.query("UPDATE telemetry SET recorded_at='2026-09-11T15:02:00Z' WHERE carrier_id=$1 AND id='b'",[carrierId]);
 const freshPage=await store.tracking(dispatcher,v.id);assert.equal(freshPage.latestReceivedAt,'2026-09-11T15:02:00.000Z');assert.ok(!freshPage.points.some(p=>p.id==='b'));assert.equal((await store.tracking(driver,v.id,freshPage.nextBefore!)).latestReceivedAt,freshPage.latestReceivedAt);assert.ok(Number.isFinite(Date.parse(freshPage.serverTime)));

});

test('completion inside the delivery fence preserves one authorized departure and separate occurrence evidence',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
 await store.completeStop(driver,command(2),{assignmentId:a.id,stopId:milton.id});
 const event=(id:string,at:string,position:any,accuracyM=5)=>({id,at,assignmentId:a.id,position,speedKph:0,odometerKm:100,accuracyM,duty:'on_duty' as const,provenance:'synthetic' as const});
 await store.ingest(simulator,command(),event('completed-arrive','2026-09-13T14:00:00Z',london));
 const cmd=command(3),payload={assignmentId:a.id,stopId:london.id,occurredAt:'2026-09-13T16:30:00Z'};
 const done:any=await store.completeStop(driver,cmd,payload);assert.equal(done.billingTimestamp,false);assert.equal(done.assignment.status,'completed');assert.deepEqual(await store.completeStop(driver,cmd,payload),done);
 const record=(await db.query('SELECT * FROM stop_completions WHERE carrier_id=$1 AND stop_id=$2',[carrierId,london.id])).rows[0];assert.equal(record.occurred_at.toISOString(),'2026-09-13T16:30:00.000Z');assert.ok(record.recorded_at);assert.equal((await db.query('SELECT * FROM stop_completions WHERE carrier_id=$1 AND stop_id=$2',[carrierId,milton.id])).rows[0].occurred_at,null);
 const outside={...london,lat:london.lat+.02};
 assert.equal((await store.ingest(simulator,command(),event('completed-old','2026-09-13T13:59:00Z',outside)) as any).disposition,'retained_out_of_order');
 assert.equal((await store.ingest(simulator,command(),event('completed-uncertain','2026-09-13T16:40:00Z',outside,500)) as any).disposition,'uncertain');
 assert.equal((await store.snapshot(dispatcher)).visits[0].departure,null);
 const exit=event('completed-exit','2026-09-13T16:45:00Z',outside);await store.ingest(simulator,command(),exit);
 assert.equal((await store.ingest(simulator,command(),exit) as any).duplicate,true);
 await assert.rejects(store.ingest(simulator,command(),event('completed-reentry','2026-09-13T17:00:00Z',london)),{code:'NOT_ACCEPTED'});
 const visits=(await store.snapshot(dispatcher)).visits;assert.equal(visits.length,1);assert.equal(new Date(visits[0].departure).toISOString(),'2026-09-13T16:45:00.000Z');
 const invoices=(await store.snapshot(dispatcher)).invoices;assert.equal(invoices.length,1);const draft=invoices[0].body;assert.equal(draft.automatic,true);assert.equal(draft.billableMinutes,45);assert.equal(draft.amountCents,7500);assert.deepEqual(draft.evidence,['completed-arrive','completed-exit']);
});

test('completed live trip exit still requires its driver and an active explicit work session',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
 await store.completeStop(driver,command(2),{assignmentId:a.id,stopId:milton.id});
 await db.query("UPDATE loads SET body=jsonb_set(body,'{provenance}','\"live\"') WHERE carrier_id=$1 AND id=$2",[carrierId,input.loadId]);
 const session:any=await store.workSession(driver,command(0),{action:'start'}),at=new Date(Date.now()+100).toISOString();
 const event={id:'live-completed-arrive',assignmentId:a.id,sessionId:session.id,at,position:london,accuracyM:5,speedKph:0,odometerKm:null,duty:'on_duty' as const,provenance:'live' as const};
 await store.ingest(driver,command(),event);await store.completeStop(driver,command(3),{assignmentId:a.id,stopId:london.id,occurredAt:new Date().toISOString()});
 const exit={...event,id:'live-completed-exit',at:new Date(Date.now()+200).toISOString(),position:milton};
 assert.equal((await store.snapshot(driver)).visits.length,1);const other=await store.membership('demo-driver-2',carrierId);assert.equal((await store.snapshot(other)).visits.length,0);await assert.rejects(store.ingest(other,command(),exit),{code:'FORBIDDEN'});
 await assert.rejects(store.ingest(simulator,command(),exit),{code:'PROVENANCE_MISMATCH'});
 await store.workSession(driver,command(1),{action:'end',sessionId:session.id});await assert.rejects(store.ingest(driver,command(),exit),{code:'NO_WORK_SESSION'});
 assert.equal((await store.snapshot(dispatcher)).visits[0].departure,null);
});

test('automatic billing honors the exact threshold, whole-minute floor, mode and missing shipment terms',async()=>{
 for(const [seconds,mode,bound,expected] of [[7199,'FTL',true,0],[7200,'FTL',true,0],[7201,'FTL',true,0],[7260,'FTL',true,1],[10800,'LTL',true,0],[10800,'FTL',false,0]] as const){
  const {dispatcher,driver,simulator,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
  if(mode==='LTL')await db.query("UPDATE loads SET body=jsonb_set(body,'{mode}','\"LTL\"') WHERE carrier_id=$1 AND id=$2",[carrierId,input.loadId]);
  if(!bound)await db.query('DELETE FROM load_contracts WHERE carrier_id=$1 AND load_id=$2',[carrierId,input.loadId]);
  const start=Date.parse('2026-09-13T14:00:00Z');const event=(id:string,at:number,position:any)=>({id,at:new Date(at).toISOString(),assignmentId:a.id,position,speedKph:0,odometerKm:0,accuracyM:5,duty:'on_duty' as const,provenance:'synthetic' as const});
  await store.ingest(simulator,command(),event('threshold-enter',start,london));assert.equal((await store.snapshot(dispatcher)).invoices.length,0);
  const exit=event('threshold-exit',start+seconds*1000,{...london,lat:london.lat+.02});await store.ingest(simulator,command(),exit);await store.ingest(simulator,command(),exit);
  const state=await store.snapshot(dispatcher);assert.equal(state.invoices.length,expected,`${seconds}/${mode}/${bound}`);
  if(expected){assert.equal(state.invoices[0].body.amountCents,167);assert.equal(state.invoices[0].status,'draft');assert.equal(state.invoices[0].body.requiresEvidenceReview,true);assert.equal(state.invoices[0].body.shipmentTerms.loadId,input.loadId);}
  if(!bound||mode==='LTL')await assert.rejects(store.detentionDraft(dispatcher,command(0),{visitId:state.visits[0].id,contractId:'demo-ftl'}),{code:!bound?'CONTRACT_REQUIRED':'MODE_UNSUPPORTED'});
 }
});
test('shipment terms require dispatcher ownership, current version and binding before observed visits',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const payload={loadId:input.loadId,contractId:'demo-ftl'};
 await assert.rejects(Promise.resolve().then(()=>store.bindContract(driver,command(),payload)),{code:'FORBIDDEN'});
 const other=await setup();await db.query("INSERT INTO contracts VALUES($1,'other-only',1,120,100,'CAD','test')",[other.carrierId]);await assert.rejects(store.bindContract(dispatcher,command(),{...payload,contractId:'other-only'}),{code:'CONTRACT_REQUIRED'});
 const cmd=command();const result=await store.bindContract(dispatcher,cmd,payload);assert.deepEqual(await store.bindContract(dispatcher,cmd,payload),result);await assert.rejects(store.bindContract(dispatcher,command(),payload),{code:'STALE_VERSION'});
 const a:any=await store.dispatch(dispatcher,command(2),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
 await store.ingest(simulator,command(),{id:'terms-entry',assignmentId:a.id,at:'2026-09-13T14:00:00Z',position:london,speedKph:0,odometerKm:0,accuracyM:5,duty:'on_duty',provenance:'synthetic'});
 await assert.rejects(store.bindContract(dispatcher,command(4),payload),{code:'TERMS_LOCKED'});
 await db.query("INSERT INTO contracts VALUES($1,'unrelated',1,0,999999,'CAD','test')",[carrierId]);
 await store.ingest(simulator,command(),{id:'terms-exit',assignmentId:a.id,at:'2026-09-13T17:00:00Z',position:milton,speedKph:0,odometerKm:0,accuracyM:5,duty:'on_duty',provenance:'synthetic'});
 const state=await store.snapshot(dispatcher);await assert.rejects(store.detentionDraft(dispatcher,command(1),{visitId:state.visits.find(v=>v.departure)!.id,contractId:'unrelated'}),{code:'CONTRACT_MISMATCH'});assert.equal((await store.snapshot(dispatcher)).invoices.length,1);
});

test('dated duty history changes dispatch budgets and rejects a formerly feasible follow-on load',async()=>{
 const {dispatcher,driver,carrierId}=await setup();assert.equal((await store.snapshot(dispatcher)).resources.find(r=>r.id==='D-01')!.budget.onDutyMinutes,480);
 await store.duty(driver,command(),{at:'2026-09-13T12:30:00Z',duty:'driving'});
 await store.duty(driver,command(2),{at:'2026-09-13T14:00:00Z',duty:'on_duty'});
 await db.query("UPDATE scenarios SET clock='2026-09-13T16:00:00Z' WHERE carrier_id=$1",[carrierId]);
 const state=await store.snapshot(dispatcher),d=state.resources.find(r=>r.id==='D-01')!;
 assert.equal(d.budget.drivingMinutes,330);assert.equal(d.budget.onDutyMinutes,240);assert.equal(d.budget.shiftMinutes,300);assert.equal(d.hosEvidence.profile,'declared-budget-history');
 // A long dock interval consumes the remaining cycle budget; history, not a new resource declaration, changes feasibility.
 await db.query("UPDATE hos_bases SET budget=jsonb_set(budget,'{cycleMinutes}','200') WHERE carrier_id=$1 AND driver_id='D-01'",[carrierId]);
 await assert.rejects(store.dispatch(dispatcher,command(),{...input,loadId:'RS-1043'}),{code:'INELIGIBLE'});
 assert.equal((await store.snapshot(dispatcher)).resources.find(r=>r.id==='D-01')!.budget.cycleMinutes,0);
});

test('late duty observations revise feasibility evidence without rewinding current GPS',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const a:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:a.id,action:'accept'});
 const event=(id:string,at:string,duty:'driving'|'on_duty',position:any)=>({id,at,assignmentId:a.id,duty,position,speedKph:0,odometerKm:null,accuracyM:5,provenance:'synthetic' as const});
 await store.ingest(simulator,command(),event('hos-latest','2026-09-13T14:00:00Z','on_duty',london));
 await db.query("UPDATE scenarios SET clock='2026-09-13T14:00:00Z' WHERE carrier_id=$1",[carrierId]);
 const before=(await store.snapshot(dispatcher)).resources.find(r=>r.id==='D-01')!;
 await store.ingest(simulator,command(),event('hos-late','2026-09-13T12:30:00Z','driving',milton));
 const after=(await store.snapshot(dispatcher)).resources.find(r=>r.id==='D-01')!;
 assert.equal(after.version,before.version+1);assert.equal(after.budget.drivingMinutes,330);assert.deepEqual(after.position,london);
});

test('simulator clock advancement is explicit, versioned, monotonic and isolated from live time',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const before=await store.simulationClock(simulator),cmd=command(before.version),at='2026-09-13T15:00:00Z';
 await assert.rejects(store.simulationClock(driver),{code:'FORBIDDEN'});
 const liveBefore=Date.now();const result:any=await store.advanceSimulationClock(simulator,cmd,{at});assert.equal(result.version,2);assert.deepEqual(await store.advanceSimulationClock(simulator,cmd,{at}),result);
 await assert.rejects(store.advanceSimulationClock(simulator,command(1),{at:'2026-09-13T16:00:00Z'}),{code:'STALE_VERSION'});
 await assert.rejects(store.advanceSimulationClock(simulator,command(2),{at:DEMO_NOW}),{code:'CLOCK_REWIND'});
 const state=await store.snapshot(dispatcher);assert.ok(Date.parse(state.serverTime)>=liveBefore);assert.ok(Date.parse(state.serverTime)<=Date.now());assert.equal(new Date(state.scenarios[0].clock).toISOString(),'2026-09-13T15:00:00.000Z');assert.equal(state.resources.find(r=>r.id==='D-01')!.budget.onDutyMinutes,300);
 const another=await setup();assert.equal((await store.simulationClock(another.simulator)).clock,DEMO_NOW);assert.notEqual(another.carrierId,carrierId);
});

 test('an idle database disconnect is observed and the pool reconnects for the next request',async()=>{
 const probe=pool(process.env.TEST_DATABASE_URL);try{const pid=(await probe.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;const closed=new Promise<unknown>(resolve=>probe.once('error',resolve));await db.query('SELECT pg_terminate_backend($1)',[pid]);await closed;assert.equal((await probe.query('SELECT 42 AS answer')).rows[0].answer,42);}finally{await probe.end();}
});

test('recovery compares late current pickup readiness with a feasible replacement on the same clock',async()=>{
 const {dispatcher,driver,simulator}=await setup();await db.query("UPDATE resources SET body=jsonb_set(body,'{position}',$2::jsonb),version=version+1 WHERE carrier_id=$1 AND id='D-02'",[dispatcher.carrierId,JSON.stringify(london)]);const first:any=await store.dispatch(dispatcher,command(),input);await store.respond(driver,command(),{assignmentId:first.id,action:'accept'});
 await store.dispatch(dispatcher,command(),{...input,loadId:'RS-1043'});
 await store.delay(simulator,command(2),{assignmentId:first.id,expectedEnd:'2026-09-13T17:30:00Z',observedAt:'2026-09-13T15:00:00Z',reason:'Synthetic dock wait'});
 await store.advanceSimulationClock(simulator,command(),{at:'2026-09-13T15:00:00Z'});
 const p:any=await store.propose(dispatcher,command(2),{loadId:'RS-1043',driverId:'D-02',truckId:'T-102',trailerId:'V-102'});
 assert.equal(p.body.comparison.current.eligible,false);assert.ok(p.body.comparison.current.reasons.length);assert.equal(p.body.comparison.current.timing.pickupReadyAt,'2026-09-13T17:30:00.000Z');assert.equal(p.body.comparison.current.timing.pickupLateMinutes,75);
 assert.equal(p.body.comparison.proposed.timing.pickupReadyAt,'2026-09-13T16:15:00.000Z');assert.equal(p.body.comparison.proposed.timing.pickupLateMinutes,0);assert.equal(p.body.comparison.proposed.eligible,true);assert.equal(p.body.comparison.current.timing.evaluatedAt,p.body.comparison.proposed.timing.evaluatedAt);assert.equal(p.body.comparison.evaluatedAt,'2026-09-13T15:00:00.000Z');
 assert.equal((await store.approve(dispatcher,command(),{proposalId:p.id}) as any).assignment.driverId,'D-02');
});

test('recovery comparison approval invalidates when the current driver evidence changes',async()=>{
 const {dispatcher,carrierId}=await setup();await store.dispatch(dispatcher,command(),input);const p:any=await store.propose(dispatcher,command(2),{...input,driverId:'D-02',truckId:'T-102',trailerId:'V-102'});
 await db.query("UPDATE resources SET version=version+1 WHERE carrier_id=$1 AND id='D-01'",[carrierId]);await assert.rejects(store.approve(dispatcher,command(),{proposalId:p.id}),{code:'STALE_PROPOSAL'});assert.equal((await store.snapshot(dispatcher)).assignments.length,1);
});

test('simulator context and delay preserve tenant, synthetic-data and approval boundaries',async()=>{
 const {dispatcher,driver,simulator,carrierId}=await setup();const trip:any=await store.dispatch(dispatcher,command(),input);
 await assert.rejects(store.simulationAssignment(simulator,trip.id),{code:'INVALID_TRANSITION'});
 await store.respond(driver,command(),{assignmentId:trip.id,action:'accept'});
 const next:any=await store.dispatch(dispatcher,command(),{...input,loadId:'RS-1043'});
 const app=createApi(store,{localDemo:true});
 try{
 const headers={Authorization:'Bearer demo-simulator','X-Carrier-Id':carrierId};
 const context=await app.inject({url:`/api/simulation-assignment?assignmentId=${trip.id}`,headers});assert.equal(context.statusCode,200);assert.equal(context.json().version,2);
 assert.equal((await app.inject({url:`/api/simulation-assignment?assignmentId=${trip.id}`,headers:{...headers,Authorization:'Bearer demo-driver-1'}})).statusCode,403);
 const other=await setup();assert.equal((await app.inject({url:`/api/simulation-assignment?assignmentId=${trip.id}`,headers:{...headers,'X-Carrier-Id':other.carrierId}})).statusCode,404);
 const reservations=(await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows;
 const cmd=command(2),body={assignmentId:trip.id,expectedEnd:'2026-09-13T17:30:00Z',observedAt:'2026-09-13T15:00:00Z',reason:'Modeled simulator dock hold'};
 const result:any=await store.delay(simulator,cmd,body);assert.equal(result.status,'awaiting_recovery');assert.ok(result.impactedLoads.some((x:any)=>x.id===next.id));
 assert.deepEqual(await store.delay(simulator,cmd,body),JSON.parse(JSON.stringify(result)));
 assert.deepEqual((await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,reservations);
 assert.equal((await db.query('SELECT * FROM approvals WHERE carrier_id=$1',[carrierId])).rows.length,0);
 await db.query("UPDATE loads SET body=jsonb_set(body,'{provenance}','\"live\"') WHERE carrier_id=$1 AND id='RS-1042'",[carrierId]);
 await assert.rejects(store.simulationAssignment(simulator,trip.id),{code:'FORBIDDEN'});
 await assert.rejects(store.delay(simulator,command(3),body),{code:'FORBIDDEN'});
 }finally{await app.close();}
});
