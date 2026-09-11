import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';
import {DomainError} from '../packages/domain/src/index.ts';
import {Store} from '../services/api/src/store.ts';
import {simulatorInventory,simulatorControl} from '../services/api/src/simulator-controls.ts';
const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db);before(()=>migrate(db));after(()=>db.end());
test('simulator adapter scopes runs, forces actor identity, retains retry keys and refuses hosted or live control',async()=>{
 const carrierId='sim-control-'+randomUUID();await store.seed(carrierId);const actor=await store.membership('demo-dispatcher',carrierId),driver=await store.membership('demo-driver-1',carrierId),trip:any=await store.dispatch(actor,{key:randomUUID(),expectedVersion:1},{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});
 const run={run_id:'own-run',carrier_id:carrierId,assignment_id:trip.id,api_origin:'http://127.0.0.1:4010',state_hash:'a'.repeat(64)},foreign={...run,run_id:'foreign',carrier_id:'another'},wrongApi={...run,run_id:'wrong-api',api_origin:'https://cloud.example'};
 let posted:any[]=[],pending=false;
 const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.method==='POST'){let body='';for await(const c of req)body+=c;posted.push(JSON.parse(body));res.end(JSON.stringify(pending?{pending:true}:{state:run}));}else res.end(JSON.stringify(req.url?.startsWith('/control/runs?')?{runs:[run,foreign,wrongApi]}:req.url?.endsWith('foreign')?foreign:req.url?.endsWith('wrong-api')?wrongApi:run));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};const saved={url:process.env.SIMULATOR_CONTROL_URL,service:process.env.K_SERVICE,origin:process.env.SIMULATOR_OPERATIONAL_ORIGIN};process.env.SIMULATOR_CONTROL_URL='http://127.0.0.1:'+address.port;process.env.SIMULATOR_OPERATIONAL_ORIGIN='http://127.0.0.1:4010';delete process.env.K_SERVICE;
 try{
  assert.deepEqual((await simulatorInventory(store,actor)).runs,[run]);await assert.rejects(simulatorInventory(store,driver),/dispatcher/i);
  const command={key:randomUUID(),expectedVersion:0},input={runId:'own-run',expectedState:run.state_hash,action:'advance',seconds:10,requested_by:'forged'};
  await simulatorControl(store,actor,command,input);await simulatorControl(store,actor,command,input);assert.deepEqual(posted[0],posted[1]);assert.equal(posted[0].key,command.key);assert.equal(posted[0].requested_by,actor.uid);
  await assert.rejects(simulatorControl(store,driver,command,input),/dispatcher/i);for(const runId of ['foreign','wrong-api','mismatched-id'])await assert.rejects(simulatorControl(store,actor,command,{...input,runId}),e=>e instanceof DomainError&&e.code==='NOT_FOUND');assert.equal(posted.length,2);
  pending=true;await assert.rejects(simulatorControl(store,actor,command,input),e=>e instanceof DomainError&&e.code==='SIMULATOR_PENDING'&&e.status===503);
  await db.query("UPDATE loads SET body=jsonb_set(body,'{provenance}','\"live\"') WHERE carrier_id=$1 AND id=$2",[carrierId,trip.loadId]);assert.deepEqual((await simulatorInventory(store,actor)).runs,[]);await assert.rejects(simulatorControl(store,actor,command,input),e=>e instanceof DomainError&&e.code==='NOT_FOUND');
  process.env.K_SERVICE='hosted';assert.deepEqual(await simulatorInventory(store,actor),{configured:false,runs:[]});await assert.rejects(simulatorControl(store,actor,command,input),e=>e instanceof DomainError&&e.code==='SIMULATOR_UNAVAILABLE');delete process.env.K_SERVICE;
  process.env.SIMULATOR_CONTROL_URL='https://external.example';await assert.rejects(simulatorInventory(store,actor),e=>e instanceof DomainError&&e.code==='SIMULATOR_UNAVAILABLE');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));for(const [key,value] of Object.entries({SIMULATOR_CONTROL_URL:saved.url,K_SERVICE:saved.service,SIMULATOR_OPERATIONAL_ORIGIN:saved.origin})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
