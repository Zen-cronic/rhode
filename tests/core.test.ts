import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {Store} from '../services/api/src/store.ts';
import {fixtures,DEMO_NOW,milton,london} from '../services/api/src/fixtures.ts';
import {detention,screen} from '../packages/domain/src/index.ts';
import type {Telemetry, Point} from '../packages/domain/src/index.ts';

const proposal={loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101',expectedVersion:1};
function accepted(store:Store) {const a=store.dispatch(proposal);return store.respond(a.id,'D-01',1,'accept');}
function point(assignmentId:string,id:string,at:string,position: Point=milton,odometerKm=1000):Telemetry {
  return {assignmentId,id,at,position,odometerKm,speedKph:0,duty:'on_duty',provenance:'synthetic'};
}
test('dispatch and acceptance use versions; rejected stale actions leave state unchanged',()=>{
  const store=new Store();
  try {
    const a=store.dispatch(proposal),snapshot=store.snapshot();
    assert.throws(()=>store.dispatch(proposal),{code:'STALE_VERSION'});
    assert.deepEqual(store.snapshot(),snapshot);
    assert.throws(()=>store.respond(a.id,'D-02',1,'accept'),{code:'WRONG_DRIVER'});
    assert.equal(store.respond(a.id,'D-01',1,'accept').status,'accepted');
    assert.throws(()=>store.respond(a.id,'D-01',1,'reject'),{code:'STALE_VERSION'});
  } finally {store.close();}
});
test('acceptance rechecks HOS evidence changed after offer',()=>{
  const s=new Store();try {const a=s.dispatch(proposal);s.setClock('2026-09-13T12:16:00Z');assert.throws(()=>s.respond(a.id,'D-01',1,'accept'),{code:'INELIGIBLE'});assert.equal(s.all<any>('assignments')[0].status,'offered');}finally{s.close();}
});
test('unknown axle, overweight trailer, missing HOS and incompatible equipment reject matching',()=>{
  const {loads,drivers,trucks,trailers}=fixtures();
  assert.equal(screen(loads[0],drivers[0],trucks[0],trailers[0],[],DEMO_NOW).eligible,true);
  assert.equal(screen(loads[0],drivers[0],trucks[2],trailers[0],[],DEMO_NOW).eligible,false);
  assert.equal(screen({...loads[0],weightLb:45000},drivers[0],trucks[0],trailers[0],[],DEMO_NOW).eligible,false);
  assert.equal(screen(loads[0],drivers[2],trucks[0],trailers[0],[],DEMO_NOW).eligible,false);
  assert.equal(screen(loads[0],drivers[0],trucks[0],trailers[2],[],DEMO_NOW).eligible,false);
});
test('same-stop visit computes detention, duplicate event cannot bill twice and old events cannot rewind',()=>{
  const store=new Store();try {
    const a=accepted(store);
    const arrive=point(a.id,'arrival','2026-09-13T12:30:00Z');
    assert.equal(store.ingest(arrive).duplicate,false);
    assert.equal(store.ingest(arrive).duplicate,true);
    assert.throws(()=>store.ingest({...arrive,speedKph:10}),{code:'EVENT_ID_COLLISION'});
    assert.equal(store.ingest(point(a.id,'waiting','2026-09-13T15:00:00Z')).disposition,'applied');
    assert.equal(store.ingest(point(a.id,'old','2026-09-13T13:00:00Z',london,1002)).disposition,'retained_out_of_order');
    assert.equal(store.snapshot().drivers.find(d=>d.id==='D-01')!.position.lat,milton.lat);
    store.ingest(point(a.id,'departure','2026-09-13T15:15:00Z',{lat:43.52,lng:-79.89},1001));
    const visits=store.snapshot().visits;
    assert.equal(visits.length,1);
    const bill=store.detentionDraft(visits[0].id as string,10000);
    assert.equal(bill.dwellMinutes,165);assert.equal(bill.billableMinutes,45);assert.equal(bill.amountCents,7500);
    assert.deepEqual(bill.evidence,['arrival','departure']);
    assert.throws(()=>store.ingest(point(a.id,'rewind','2026-09-13T15:20:00Z',london,999)),{code:'ODOMETER_REWIND'});
    assert.equal(store.snapshot().telemetry.length,4);
  }finally{store.close();}
});
test('detention threshold and contract boundaries are explicit',()=>{
  assert.equal(detention(DEMO_NOW,'2026-09-13T14:00:00Z','FTL',10000).billableMinutes,0);
  assert.equal(detention(DEMO_NOW,'2026-09-13T14:01:00Z','FTL',null).amountCents,null);
  assert.equal(detention(DEMO_NOW,'2026-09-13T15:00:00Z','LTL',10000).status,'contract_required');
  assert.throws(()=>detention(DEMO_NOW,'2026-09-13T11:00:00Z','FTL',10000),{code:'INVALID_STOP_TIME'});
});
test('two actual database writers cannot reserve the same truck concurrently; result survives reopening',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'roadstar-race-')),path=join(dir,'state.sqlite');
  const seed=new Store(path);seed.close();
  try {
    const run=(input:unknown)=>new Promise<any>((resolve,reject)=>{
      const worker=new Worker(new URL('./race-worker.ts',import.meta.url),{workerData:{path,input}});
      worker.on('message',resolve);worker.on('error',reject);worker.on('exit',code=>{if(code!==0)reject(new Error(`Worker exited ${code}`));});
    });
    const results=await Promise.all([run(proposal),run({loadId:'RS-1044',driverId:'D-02',truckId:'T-101',trailerId:'R-101',expectedVersion:1})]);
    assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='INELIGIBLE').length,1);
    const reopened=new Store(path);try{assert.equal(reopened.all('assignments').length,1);assert.equal(reopened.snapshot().loads.filter(l=>l.status==='offered').length,1);}finally{reopened.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
