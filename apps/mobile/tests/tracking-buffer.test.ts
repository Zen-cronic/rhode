import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Queue,type Database} from '../src/queue.ts';
import {retainTrackingSamples,type VerifiedTracking} from '../src/tracking-buffer.ts';
import type {TrackingGrant} from '../src/tracking-policy.ts';
const now=Date.parse('2026-09-11T16:00:00Z');
const grant:TrackingGrant={id:'grant',scope:'api|carrier|driver',origin:'https://api.example',userId:'user',carrierId:'carrier',driverId:'driver',sessionId:'session',assignmentId:'trip',startedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),enabled:true};
const saved:VerifiedTracking={grantId:grant.id,verifiedAt:new Date(now-60000).toISOString(),state:{actor:{role:'driver',driverId:'driver',carrierId:'carrier'},workSessions:[{id:'session',ended_at:null}],assignments:[{id:'trip',driverId:'driver',loadId:'load',status:'accepted'}],loads:[{id:'load',provenance:'live'}],resources:[{id:'driver',duty:'on_duty'}]}};
const locations=[0,15000].map(offset=>({timestamp:now+offset,coords:{latitude:43.5,longitude:-79.9-offset/10000000,accuracy:5,speed:null}}));
function connect(path:string){const sqlite=new DatabaseSync(path);const db:Database={execAsync:async sql=>{sqlite.exec(sql)},runAsync:async(sql,...args)=>sqlite.prepare(sql).run(...args),getAllAsync:async<T>(sql:string,...args:any[])=>sqlite.prepare(sql).all(...args) as T[],getFirstAsync:async<T>(sql:string,...args:any[])=>sqlite.prepare(sql).get(...args) as T??null};return {sqlite,queue:new Queue(db,grant.scope)};}
const options={now:now+15000,permission:true,current:async()=>grant,hash:async(body:string)=>createHash('sha256').update(body).digest('hex')};
test('offline GPS and authorization cache survive SQLite reopen, retry identical samples and do not duplicate synced callbacks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'roadstar-gps-'));const path=join(dir,'queue.sqlite');let c=connect(path);
 try{await c.queue.init();await c.queue.saveDraft('verified-session',JSON.stringify(saved));await retainTrackingSamples(c.queue,grant,saved,locations,options);const original=await c.queue.list();assert.equal(original.length,2);assert.ok(original.every(x=>x.status==='pending'));assert.equal(JSON.parse(original[0].body).odometerKm,null);
 const accepted=new Set<string>();await c.queue.flush(async command=>{accepted.add(command.id);throw new Error('Acknowledgement lost');});c.sqlite.close();c=connect(path);await c.queue.init();const restored=JSON.parse(await c.queue.draft('verified-session'));
 await retainTrackingSamples(c.queue,grant,restored,locations,options);assert.equal((await c.queue.list()).length,2);
 await c.queue.flush(async command=>{assert.equal(command.body,original.find(x=>x.id===command.id)!.body);accepted.add(command.id);return {status:200,body:{disposition:'applied'}};});assert.equal(accepted.size,2);
 await retainTrackingSamples(c.queue,grant,restored,locations,options);assert.equal((await c.queue.list()).length,2);assert.ok((await c.queue.list()).every(x=>x.status==='synchronized'));
 }finally{c.sqlite.close();rmSync(dir,{recursive:true,force:true});}
});
test('expired, disabled, switched, synthetic and ended-session grants cannot retain GPS',async()=>{
 const c=connect(':memory:');try{await c.queue.init();
 for(const [g,cache,opt] of [[{...grant,enabled:false},saved,options],[{...grant,expiresAt:new Date(now).toISOString()},saved,options],[grant,{...saved,grantId:'other'},options],[grant,{...saved,verifiedAt:new Date(now-3600001).toISOString()},options],[grant,saved,{...options,permission:false}],[grant,saved,{...options,current:async()=>({...grant,id:'other'})}],[grant,{...saved,state:{...saved.state,workSessions:[]}},options],[grant,{...saved,state:{...saved.state,loads:[{id:'load',provenance:'synthetic'}]}},options]] as [TrackingGrant,VerifiedTracking,typeof options][]){await assert.rejects(retainTrackingSamples(c.queue,g,cache,locations,opt));}
 assert.equal((await c.queue.list()).length,0);
 }finally{c.sqlite.close();}
});
test('offline declared duty changes are captured by occurrence time and later server denial is visible',async()=>{
 const c=connect(':memory:');try{await c.queue.init();await c.queue.enqueue('duty','/api/duty',{at:new Date(now+10000).toISOString(),duty:'driving'},1,'Duty');await retainTrackingSamples(c.queue,grant,saved,locations,options);
 const samples=(await c.queue.list()).filter(x=>x.path==='/api/telemetry');assert.deepEqual(samples.map(x=>JSON.parse(x.body).duty),['on_duty','driving']);
 await c.queue.flush(async()=>({status:429,body:{error:{message:'Try later'}}}),x=>x.path==='/api/telemetry');assert.ok((await c.queue.list()).filter(x=>x.path==='/api/telemetry').every(x=>x.status==='pending'));
 await c.queue.flush(async()=>({status:403,body:{error:{message:'Work session ended'}}}),x=>x.path==='/api/telemetry');assert.ok((await c.queue.list()).filter(x=>x.path==='/api/telemetry').every(x=>x.status==='failed'&&x.error?.includes('Work session ended')));
 }finally{c.sqlite.close();}
});
