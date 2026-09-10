import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {createApi} from '../services/api/src/server.ts';
import {Store} from '../services/api/src/store.ts';
test('HTTP hero path and invalid input responses',async()=>{
  const store=new Store(),server=createApi(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await fetch(base+'/api/health')).status,200);
    const matches=await (await fetch(base+'/api/matches?loadId=RS-1042')).json();assert.equal(matches[0].eligible,true);
    const proposal={loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101',expectedVersion:1};
    const response=await post('/api/dispatch',proposal);assert.equal(response.status,201);const a=await response.json();
    assert.equal((await post('/api/dispatch',proposal)).status,409);
    assert.equal((await post('/api/respond',{assignmentId:a.id,driverId:'D-01',expectedVersion:1,action:'accept'})).status,200);
    const state=await(await fetch(base+'/api/state')).json();assert.equal(state.loads[0].status,'accepted');
    assert.equal((await post('/api/dispatch',{})).status,400);
    assert.equal((await post('/api/telemetry',{id:'bad'})).status,400);
    assert.equal((await post('/api/respond',{assignmentId:a.id,driverId:'D-01',expectedVersion:2,action:'oops'})).status,400);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
});
