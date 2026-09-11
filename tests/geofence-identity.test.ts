import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {milton,london} from '../services/api/src/fixtures.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db),cmd=()=>({key:randomUUID(),expectedVersion:1});
before(()=>migrate(db));after(()=>db.end());
async function setup(){const carrierId=`fence-${randomUUID()}`;await store.seed(carrierId);const dispatcher=await store.membership('demo-dispatcher',carrierId),driver=await store.membership('demo-driver-1',carrierId),simulator=await store.membership('demo-simulator',carrierId);const trip:any=await store.dispatch(dispatcher,cmd(),{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await store.respond(driver,cmd(),{assignmentId:trip.id,action:'accept'});return {carrierId,dispatcher,driver,simulator,trip};}
const event=(trip:any,id:string,at:string,position=milton,accuracyM=10)=>({id,assignmentId:trip.id,at,position,accuracyM,odometerKm:1000,speedKph:0,duty:'on_duty' as const,provenance:'synthetic' as const});
async function overlap(carrier:string,distance=0){await db.query("UPDATE stops SET location=ST_Project(ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4::double precision,0::double precision) WHERE carrier_id=$1 AND load_id='RS-1042' AND id='london-dock'",[carrier,milton.lng,milton.lat,distance]);}
test('overlapping trip stops retain source and ambiguity without duplicate arrivals or detention',async()=>{
 const f=await setup();await overlap(f.carrierId);const source=event(f.trip,'overlap','2026-09-13T12:30:00Z');await store.ingest(f.simulator,cmd(),source);await store.ingest(f.simulator,cmd(),source);
 await store.ingest(f.simulator,cmd(),event(f.trip,'wait','2026-09-13T15:30:00Z'));
 await store.ingest(f.simulator,cmd(),event(f.trip,'exit','2026-09-13T15:31:00Z',{...milton,lat:43.53}));
 const s=await store.snapshot(f.dispatcher);assert.equal(s.visits.length,0);assert.equal(s.invoices.length,0);
 const history=await store.tracking(f.driver,f.trip.id),point=history.points.find(p=>p.id==='overlap');assert.equal(point.disposition,'applied');assert.deepEqual(point.geofenceEvidence.stopIds,['london-dock','milton-yard']);assert.equal(point.geofenceEvidence.status,'ambiguous');
 const raw=(await db.query('SELECT body FROM telemetry WHERE carrier_id=$1 AND id=$2',[f.carrierId,source.id])).rows[0].body;assert.deepEqual(raw,source);assert.equal(history.points.length,3);
 const other=await store.membership('demo-driver-2',f.carrierId);await assert.rejects(store.tracking(other,f.trip.id),{code:'FORBIDDEN'});
});
test('an accuracy disk touching a second stop holds arrival even when its center uniquely belongs to the first',async()=>{
 const f=await setup();await overlap(f.carrierId,185);await store.ingest(f.simulator,cmd(),event(f.trip,'possible-second','2026-09-13T12:30:00Z',milton,10));assert.equal((await store.snapshot(f.dispatcher)).visits.length,0);
 // A later, more accurate observation is unambiguous. It must not backdate arrival.
 await store.ingest(f.simulator,cmd(),event(f.trip,'unique','2026-09-13T12:31:00Z',milton,1));const s=await store.snapshot(f.dispatcher);assert.equal(s.visits.length,1);assert.equal(s.visits[0].stop_id,milton.id);assert.equal(s.visits[0].arrival_event,'unique');assert.equal(new Date(s.visits[0].arrival).toISOString(),'2026-09-13T12:31:00.000Z');
});
test('ambiguity cannot freeze a proven departure from a different open stop',async()=>{
 const f=await setup();await store.ingest(f.simulator,cmd(),event(f.trip,'arrive','2026-09-13T12:30:00Z'));
 await db.query("INSERT INTO stops(carrier_id,load_id,id,sequence,location,radius_m,body) SELECT carrier_id,load_id,'adjacent-dock',3,location,radius_m,body FROM stops WHERE carrier_id=$1 AND load_id='RS-1042' AND id='london-dock'",[f.carrierId]);
 await store.ingest(f.simulator,cmd(),event(f.trip,'leave-for-overlap','2026-09-13T15:15:00Z',london));const s=await store.snapshot(f.dispatcher);assert.equal(s.visits.length,1);assert.equal(s.visits[0].departure_event,'leave-for-overlap');assert.equal(s.invoices.length,1);assert.equal(s.invoices[0].body.billableMinutes,45);
});
