import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {pool} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';

const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar');
const store=new Store(db),carrier=`ranked-recovery-${randomUUID()}`,command=(expectedVersion=1)=>({key:randomUUID(),expectedVersion});
try{
  await store.seed(carrier);
  const dispatcher=await store.membership('demo-dispatcher',carrier),driver=await store.membership('demo-driver-1',carrier),simulator=await store.membership('demo-simulator',carrier);
  const resources={loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'};
  const first:any=await store.dispatch(dispatcher,command(),resources);
  await store.respond(driver,command(),{assignmentId:first.id,action:'accept'});
  const next:any=await store.dispatch(dispatcher,command(),{...resources,loadId:'RS-1043'});
  const delay:any=await store.delay(simulator,command(2),{assignmentId:first.id,expectedEnd:'2026-09-13T17:00:00Z',observedAt:'2026-09-13T15:30:00Z',reason:'Synthetic dock departure delay for ranked recovery verification'});
  assert.ok(delay.impactedLoads.some((item:any)=>item.id===next.id));
  const fixture={createdAt:new Date().toISOString(),carrier,firstAssignmentId:first.id,affectedAssignmentId:next.id,affectedLoadId:'RS-1043',delayId:delay.id,expectedChoice:{driverId:'D-02',truckId:'T-102',trailerId:'V-102'},limits:'Synthetic fixture. Recommendation uses current server-side route, reservation, capacity, reviewed axle and declared HOS evidence.'};
  await mkdir('docs/evidence/ranked-recovery-2026-09-12',{recursive:true});
  await writeFile('data/ranked-recovery-fixture.json',JSON.stringify(fixture,null,2)+'\n');
  console.log(JSON.stringify(fixture));
}finally{await db.end();}
