import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';import {Store} from '../services/api/src/store.ts';import {createApi} from '../services/api/src/server.ts';import {milton} from '../services/api/src/fixtures.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db);before(()=>migrate(db));after(()=>db.end());const cmd=(expectedVersion=1)=>({key:randomUUID(),expectedVersion});
const area={west:-80.5314,east:-80.5294,south:43.273031,north:43.275031};
async function setup(){const carrierId='closure-'+randomUUID();await store.seed(carrierId);const dispatcher=await store.membership('demo-dispatcher',carrierId),driver=await store.membership('demo-driver-1',carrierId),simulator=await store.membership('demo-simulator',carrierId);const trip:any=await store.dispatch(dispatcher,cmd(),{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await store.respond(driver,cmd(),{assignmentId:trip.id,action:'accept'});await store.advanceSimulationClock(simulator,cmd(),{at:trip.startAt});await store.ingest(simulator,cmd(),{id:randomUUID(),assignmentId:trip.id,at:trip.startAt,position:milton,accuracyM:5,speedKph:0,odometerKm:100,duty:'on_duty',provenance:'synthetic'} as any);await store.completeStop(driver,cmd(2),{assignmentId:trip.id,stopId:milton.id,occurredAt:trip.startAt});return {carrierId,dispatcher,driver,simulator,trip};}
const report=(trip:any,bounds=area)=>({assignmentId:trip.id,area:bounds,observedAt:trip.startAt,sourceRef:'synthetic route closure fixture',reason:'Declared synthetic road closure ahead of the active trip'});
test('closure record survives an unresolved route, is idempotent, scoped and blocks optimistic follow-on dispatch',async()=>{
 const {carrierId,dispatcher,driver,simulator,trip}=await setup(),key=cmd(3),input=report(trip,{west:-79.88,east:-79.87,south:43.51,north:43.52});const recorded:any=await store.reportClosure(simulator,key,input);assert.deepEqual(await store.reportClosure(simulator,key,input),recorded);
 const review:any=await store.rehearseRoute(dispatcher,cmd(4),{assignmentId:trip.id});assert.equal(review.status,'unresolved');assert.equal(review.body.failureCode,'CLOSURE_BLOCKS_STOP');assert.equal((await db.query('SELECT * FROM road_closures WHERE carrier_id=$1',[carrierId])).rows.length,1);
 await assert.rejects(store.approveRoute(dispatcher,cmd(),{routeRevisionId:review.id,acknowledgeModeledRoute:true}),{code:'STALE_PROPOSAL'});
 await assert.rejects(store.dispatch(dispatcher,cmd(),{loadId:'RS-1043',driverId:'D-01',truckId:'T-101',trailerId:'V-101'}),{code:'CLOSURE_UNRESOLVED'});
 await assert.rejects(store.propose(dispatcher,cmd(4),{loadId:'RS-1042',driverId:'D-02',truckId:'T-102',trailerId:'V-102'}),{code:'CLOSURE_ROUTE_REVIEW_REQUIRED'});
 await assert.rejects(store.reportClosure(driver,cmd(4),input),{code:'FORBIDDEN'});await assert.rejects(async()=>store.rehearseRoute(simulator,cmd(4),{assignmentId:trip.id}),{code:'FORBIDDEN'});
 const other=await store.membership('demo-driver-2',carrierId);await assert.rejects(store.routeReviews(other,trip.id),{code:'FORBIDDEN'});assert.equal((await store.routeReviews(driver,trip.id)).revisions.length,1);
 const app=createApi(store,{localDemo:true});const bad=await app.inject({method:'POST',url:'/api/report-closure',headers:{authorization:'Bearer demo-dispatcher','x-carrier-id':carrierId,'idempotency-key':randomUUID(),'if-match':'4'},payload:{...input,area:{...area,east:area.west}}});assert.equal(bad.statusCode,400);await app.close();
});
test('real truck alternate route is reviewed and approved once without modifying original telemetry or reservations',async()=>{
 const {carrierId,dispatcher,driver,simulator,trip}=await setup();await store.reportClosure(simulator,cmd(3),report(trip));
 const observations=(await db.query('SELECT * FROM telemetry WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,reservations=(await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows;
 const review:any=await store.rehearseRoute(dispatcher,cmd(4),{assignmentId:trip.id});assert.equal(review.status,'pending',JSON.stringify(review));assert.equal(review.body.hasToll,true);assert.equal(review.body.route.closures.length,1);
 await assert.rejects(async()=>store.approveRoute(driver,cmd(),{routeRevisionId:review.id,acknowledgeModeledRoute:true}),{code:'FORBIDDEN'});
 const key=cmd(),approved:any=await store.approveRoute(dispatcher,key,{routeRevisionId:review.id,acknowledgeModeledRoute:true});assert.equal(approved.status,'approved');assert.deepEqual(await store.approveRoute(dispatcher,key,{routeRevisionId:review.id,acknowledgeModeledRoute:true}),approved);
 assert.deepEqual((await db.query('SELECT * FROM telemetry WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,observations);assert.deepEqual((await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,reservations);
 const record=(await store.routeReviews(driver,trip.id)).revisions[0];assert.equal(record.approved_by,dispatcher.uid);assert.equal(record.revision,2);assert.equal((await db.query("SELECT * FROM outbox WHERE carrier_id=$1 AND payload->>'routeRevisionId'=$2",[carrierId,review.id])).rows.length,1);
});
test('new GPS makes a reviewed route stale without applying it',async()=>{
 const {carrierId,dispatcher,simulator,trip}=await setup();await store.reportClosure(simulator,cmd(3),report(trip));const review:any=await store.rehearseRoute(dispatcher,cmd(4),{assignmentId:trip.id});assert.equal(review.status,'pending',JSON.stringify(review));
 await store.ingest(simulator,cmd(),{id:randomUUID(),assignmentId:trip.id,at:trip.startAt,position:milton,accuracyM:5,speedKph:0,odometerKm:100,duty:'on_duty',provenance:'synthetic'} as any);
 await assert.rejects(store.approveRoute(dispatcher,cmd(),{routeRevisionId:review.id,acknowledgeModeledRoute:true}),{code:'STALE_PROPOSAL'});
 assert.equal((await db.query('SELECT status FROM route_revisions WHERE carrier_id=$1',[carrierId])).rows[0].status,'pending');
});

test('new closure or exhausted HOS cannot approve a previously feasible alternate',async()=>{
 const {dispatcher,simulator,trip,carrierId}=await setup();await store.reportClosure(simulator,cmd(3),report(trip));const review:any=await store.rehearseRoute(dispatcher,cmd(4),{assignmentId:trip.id});assert.equal(review.status,'pending');
 await store.reportClosure(simulator,cmd(4),{...report(trip),area:{west:-79.88,east:-79.87,south:43.51,north:43.52}});
 await assert.rejects(store.approveRoute(dispatcher,cmd(),{routeRevisionId:review.id,acknowledgeModeledRoute:true}),{code:'STALE_PROPOSAL'});
 const other=await setup();await store.reportClosure(other.simulator,cmd(3),report(other.trip));await db.query("UPDATE hos_bases SET budget=jsonb_set(budget,'{cycleMinutes}','0') WHERE carrier_id=$1 AND driver_id='D-01'",[other.carrierId]);const exhausted:any=await store.rehearseRoute(other.dispatcher,cmd(4),{assignmentId:other.trip.id});assert.equal(exhausted.status,'unresolved');assert.ok(exhausted.body.reasons.includes('Insufficient cycle budget.'));
 assert.equal((await db.query("SELECT * FROM route_revisions WHERE carrier_id=$1 AND status='approved'",[carrierId])).rows.length,0);
});

async function approvedFixture(){const f=await setup();await store.reportClosure(f.simulator,cmd(3),report(f.trip));const review:any=await store.rehearseRoute(f.dispatcher,cmd(4),{assignmentId:f.trip.id});assert.equal(review.status,'pending');await store.approveRoute(f.dispatcher,cmd(),{routeRevisionId:review.id,acknowledgeModeledRoute:true});return {...f,review};}
test('assigned driver acknowledges the exact route once over HTTP and receipt survives retry without changing motion',async()=>{
 const f=await approvedFixture(),{carrierId,trip,review}=f,app=createApi(store,{localDemo:true});
 const before=(await db.query('SELECT * FROM telemetry WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,reserved=(await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows;
 const request={method:'POST' as const,url:'/api/acknowledge-route',headers:{authorization:'Bearer demo-driver-1','x-carrier-id':carrierId,'idempotency-key':randomUUID(),'if-match':'2'},payload:{routeRevisionId:review.id,acknowledgeReceipt:true}};
 try{const first=await app.inject(request);assert.equal(first.statusCode,200,first.body);const result=first.json();assert.equal(result.receipt.approved_revision,2);assert.equal(result.receipt.driver_id,'D-01');assert.equal(result.receipt.route_fingerprint,review.body.routeFingerprint);assert.equal(result.revision,3);assert.deepEqual((await app.inject(request)).json(),result);
 const different=await app.inject({...request,headers:{...request.headers,'idempotency-key':randomUUID()}});assert.equal(different.statusCode,409);
 const read=await store.routeReviews(f.dispatcher,trip.id);assert.equal(read.receipts.length,1);assert.equal(read.revisions[0].revision,3);assert.equal(read.receipts[0].acknowledged_by,'demo-driver-1');assert.equal((await store.routeReviews(f.driver,trip.id)).receipts.length,1);
 assert.equal((await db.query("SELECT * FROM events WHERE carrier_id=$1 AND kind='route.acknowledged'",[carrierId])).rowCount,1);
 assert.deepEqual((await db.query('SELECT * FROM telemetry WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,before);assert.deepEqual((await db.query('SELECT * FROM reservations WHERE carrier_id=$1 ORDER BY id',[carrierId])).rows,reserved);
 }finally{await app.close();}
});
test('route receipt excludes wrong driver, carrier, dispatcher, simulator and missing confirmation',async()=>{
 const f=await approvedFixture(),input={routeRevisionId:f.review.id,acknowledgeReceipt:true};
 for(const actor of [f.dispatcher,f.simulator,await store.membership('demo-driver-2',f.carrierId)])await assert.rejects(async()=>store.acknowledgeRoute(actor,cmd(2),input),{code:'FORBIDDEN'});
 const other=await setup();await assert.rejects(async()=>store.acknowledgeRoute(other.driver,cmd(2),input),{code:'NOT_FOUND'});
 await assert.rejects(async()=>store.acknowledgeRoute(f.driver,cmd(2),{routeRevisionId:f.review.id}),{code:'REVIEW_REQUIRED'});
 assert.equal((await store.routeReviews(f.dispatcher,f.trip.id)).receipts.length,0);
});
test('new closures and newer approved routes cannot receive a stale driver acknowledgement',async()=>{
 const f=await approvedFixture(),input={routeRevisionId:f.review.id,acknowledgeReceipt:true};
 const newer:any=await store.rehearseRoute(f.dispatcher,cmd(5),{assignmentId:f.trip.id});assert.equal(newer.status,'pending');await store.approveRoute(f.dispatcher,cmd(),{routeRevisionId:newer.id,acknowledgeModeledRoute:true});
 await assert.rejects(store.acknowledgeRoute(f.driver,cmd(2),input),{code:'STALE_ROUTE'});
 await store.reportClosure(f.simulator,cmd(6),report(f.trip));await assert.rejects(store.acknowledgeRoute(f.driver,cmd(2),{routeRevisionId:newer.id,acknowledgeReceipt:true}),{code:'STALE_ROUTE'});
 assert.equal((await store.routeReviews(f.driver,f.trip.id)).receipts.length,0);
});

test('simulator adoption evidence requires current approval, exact receipt and unchanged current GPS',async()=>{
 const f=await approvedFixture();await assert.rejects(store.simulationRoute(f.simulator,f.review.id),{code:'ROUTE_NOT_RECEIVED'});
 await store.acknowledgeRoute(f.driver,cmd(2),{routeRevisionId:f.review.id,acknowledgeReceipt:true});
 const evidence=await store.simulationRoute(f.simulator,f.review.id);assert.equal(evidence.revision,3);assert.equal(evidence.assignmentId,f.trip.id);assert.equal(evidence.receipt.route_fingerprint,f.review.body.routeFingerprint);
 await assert.rejects(async()=>store.simulationRoute(f.driver,f.review.id),{code:'FORBIDDEN'});
 await store.ingest(f.simulator,cmd(),{id:randomUUID(),assignmentId:f.trip.id,at:f.trip.startAt,position:milton,accuracyM:5,speedKph:0,odometerKm:100,duty:'on_duty',provenance:'synthetic'} as any);
 await assert.rejects(store.simulationRoute(f.simulator,f.review.id),{code:'STALE_ROUTE'});
});
