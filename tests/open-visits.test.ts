import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {milton} from '../services/api/src/fixtures.ts';
import {driverHeadroom} from '../packages/domain/src/open-visit.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db),cmd=(expectedVersion=1)=>({key:randomUUID(),expectedVersion});
before(()=>migrate(db));after(()=>db.end());
test('open estimates use fresh inside evidence and configured free time without creating billing records',async()=>{
 const carrierId='open-estimate-'+randomUUID();await store.seed(carrierId);
 const dispatcher=await store.membership('demo-dispatcher',carrierId),driver=await store.membership('demo-driver-1',carrierId),sim=await store.membership('demo-simulator',carrierId);
 const trip:any=await store.dispatch(dispatcher,cmd(),{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await store.respond(driver,cmd(),{assignmentId:trip.id,action:'accept'});
 const point=(id:string,at:string,accuracyM=10)=>({id,at,assignmentId:trip.id,position:milton,accuracyM,odometerKm:1000,speedKph:0,duty:'on_duty' as const,provenance:'synthetic' as const});
 const clock=async(at:string)=>{const c=await store.simulationClock(sim);await store.advanceSimulationClock(sim,cmd(c.version),{at});};
 const estimate=async()=>{const s=await store.snapshot(dispatcher);assert.equal(s.invoices.length,0);assert.equal(s.visits[0].departure,null);return s.openVisitEstimates[0];};
 await store.ingest(sim,cmd(),point('arrive','2026-09-13T12:30:00Z'));
 for(const [at,amount]of [['2026-09-13T14:30:00Z',0],['2026-09-13T15:00:00Z',5000],['2026-09-13T15:15:00Z',7500]] as const){const p=point(at,at);await store.ingest(sim,cmd(),p);await clock(at);const e=await estimate();assert.equal(e.status,'estimate');assert.equal('amountCents'in e&&e.amountCents,amount);assert.equal(e.arrivalEvent,'arrive');assert.equal(e.evidenceId,at);assert.equal(e.evidenceAgeSeconds,0);await store.ingest(sim,cmd(),p);assert.deepEqual(await estimate(),e);}
 assert.deepEqual((await store.snapshot(driver)).openVisitEstimates,[]);
 const other='other-estimate-'+randomUUID();await store.seed(other);assert.deepEqual((await store.snapshot(await store.membership('demo-dispatcher',other))).openVisitEstimates,[]);
 await clock('2026-09-13T15:17:00Z');assert.equal((await estimate()).status,'estimate');await clock('2026-09-13T15:17:01Z');const stale=await estimate();assert.equal(stale.status,'held');assert.equal('amountCents'in stale,false);
 await store.ingest(sim,cmd(),point('uncertain','2026-09-13T15:17:02Z',500));await clock('2026-09-13T15:17:02Z');assert.equal((await estimate()).status,'held');
 await store.ingest(sim,cmd(),point('fresh','2026-09-13T15:17:03Z'));await clock('2026-09-13T15:17:03Z');assert.equal((await estimate()).status,'estimate');
 await store.ingest(sim,cmd(),point('late','2026-09-13T13:00:00Z'));assert.equal((await estimate()).status,'held');
});
test('HOS display uses all supported budgets, including exhausted on-duty and unavailable evidence',()=>{
 assert.equal(driverHeadroom({drivingMinutes:780,onDutyMinutes:0,shiftMinutes:60,cycleMinutes:300}),'Driving held · on-duty limit');
 assert.equal(driverHeadroom({drivingMinutes:100,onDutyMinutes:200,shiftMinutes:90,cycleMinutes:25}),'25 min HOS headroom');
 assert.equal(driverHeadroom(null),'HOS unavailable · review history');
});
