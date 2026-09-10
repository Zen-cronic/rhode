import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Queue,type Database} from '../src/queue.ts';
function connect(path:string){const sqlite=new DatabaseSync(path);const db:Database={execAsync:async(sql)=>{sqlite.exec(sql);},runAsync:async(sql,...params)=>sqlite.prepare(sql).run(...params),getAllAsync:async<T>(sql:string,...params:any[])=>sqlite.prepare(sql).all(...params) as T[],getFirstAsync:async<T>(sql:string,...params:any[])=>sqlite.prepare(sql).get(...params) as T??null};return {sqlite,db};}
test('offline acceptance survives database close/reopen and retries identical command after ambiguous response',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'roadstar-mobile-'));const path=join(dir,'queue.db');
 try{let connection=connect(path);let queue=new Queue(connection.db,'carrier-a|driver-1');await queue.init();
 const body={assignmentId:'assignment-a',action:'accept'};await queue.enqueue('stable-id','/api/respond',body,7,'Accept trip');await queue.saveSnapshot({loads:[{id:'load-a'}]});await queue.saveDraft('trip-note','Sealed trailer, awaiting dock.');
 const sent:string[]=[];await queue.flush(async c=>{sent.push(JSON.stringify(c));throw new Error('Response lost after server applied command');});
 assert.equal((await queue.list())[0].status,'pending');connection.sqlite.close();
 connection=connect(path);queue=new Queue(connection.db,'carrier-a|driver-1');await queue.init();
 assert.deepEqual((await queue.snapshot())?.body,{loads:[{id:'load-a'}]});assert.equal(await queue.draft('trip-note'),'Sealed trailer, awaiting dock.');
 await queue.flush(async c=>{const first=JSON.parse(sent[0]);assert.equal(c.id,first.id);assert.equal(c.body,first.body);assert.equal(c.expectedVersion,first.expectedVersion);return {status:200,body:{status:'accepted',version:8}};});
 assert.equal((await queue.list())[0].status,'synchronized');let replayed=false;await queue.flush(async()=>{replayed=true;return {status:200,body:{}};});assert.equal(replayed,false);connection.sqlite.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('stale approvals remain failed and are never rebased or automatically replayed',async()=>{
 const {sqlite,db}=connect(':memory:');const q=new Queue(db,'carrier|dispatcher');await q.init();await q.enqueue('approval','/api/approve',{proposalId:'p'},3,'Approve');let calls=0;
 await q.flush(async()=>{calls++;return {status:409,body:{error:{message:'Proposal evidence changed'}}};});
 await q.flush(async()=>{calls++;return {status:200,body:{}};});assert.equal(calls,1);assert.equal((await q.list())[0].status,'failed');assert.equal((await q.list())[0].expectedVersion,3);assert.match((await q.list())[0].error!,/409/);sqlite.close();
});
test('identities cannot view or flush another carrier cache, draft or commands',async()=>{
 const {sqlite,db}=connect(':memory:');const a=new Queue(db,'carrier-a|driver');const b=new Queue(db,'carrier-b|driver');await a.init();await b.init();await a.saveSnapshot({secret:'manifest'});await a.saveDraft('note','private');await a.enqueue('a','/api/respond',{assignmentId:'a'},1,'Accept');assert.equal(await b.snapshot(),null);assert.equal(await b.draft('note'),'');assert.deepEqual(await b.list(),[]);let called=false;await b.flush(async()=>{called=true;return {status:200,body:{}};});assert.equal(called,false);sqlite.close();
});
test('pending duplicate taps reuse one queue entry; rate limit preserves FIFO and payload',async()=>{
 const {sqlite,db}=connect(':memory:');const q=new Queue(db,'a');await q.init();await q.enqueue('first','/api/respond',{action:'accept'},2,'Accept');assert.equal(await q.enqueue('duplicate','/api/respond',{action:'accept'},2,'Accept'),'first');await q.enqueue('second','/api/duty',{duty:'driving'},3,'Duty');let calls=0;await q.flush(async()=>{calls++;return {status:429,body:{error:{message:'Try later'}}};});assert.equal(calls,1);assert.equal((await q.list()).length,2);assert.ok((await q.list()).every(c=>c.status==='pending'));sqlite.close();
});

test('document registration and upload reconstruct from saved capture across restarts',async()=>{
 const {reconcileCaptures}=await import('../src/documents.ts');const dir=mkdtempSync(join(tmpdir(),'roadstar-doc-'));const path=join(dir,'queue.db');
 try{let connection=connect(path);let q=new Queue(connection.db,'carrier|driver');await q.init();const capture={registrationId:'registration',uploadId:'upload',uri:'file:///durable/pod.jpg',loadId:'load',loadVersion:4,mediaType:'image/jpeg',filename:'pod.jpg',kind:'pod'};
 await q.saveDraft('document-captures',JSON.stringify([capture]));connection.sqlite.close();connection=connect(path);q=new Queue(connection.db,'carrier|driver');await q.init();await reconcileCaptures(q);assert.equal((await q.list()).length,1);
 await q.flush(async c=>{assert.equal(c.id,'registration');return {status:200,body:{id:'document',version:1,status:'pending_upload'}};});connection.sqlite.close();connection=connect(path);q=new Queue(connection.db,'carrier|driver');await q.init();await reconcileCaptures(q);await reconcileCaptures(q);assert.equal((await q.list()).length,2);
 const upload=(await q.list())[1];assert.equal(upload.path,'/api/documents/document/content');assert.equal(upload.expectedVersion,1);assert.equal(JSON.parse(upload.body).uri,capture.uri);await q.flush(async()=>{throw new Error('Upload response lost');});connection.sqlite.close();connection=connect(path);q=new Queue(connection.db,'carrier|driver');await q.init();await reconcileCaptures(q);await q.flush(async c=>{assert.equal(c.id,'upload');assert.equal(c.body,upload.body);return {status:200,body:{id:'document',version:2,status:'stored'}};});assert.ok((await q.list()).every(c=>c.status==='synchronized'));connection.sqlite.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('background flush cannot execute a queued consequential command',async()=>{
 const {sqlite,db}=connect(':memory:');const q=new Queue(db,'a');await q.init();await q.enqueue('approval','/api/approve',{proposalId:'p'},3,'Approve');await q.enqueue('gps','/api/telemetry',{id:'sample'},0,'Location');const sent:string[]=[];
 await q.flush(async c=>{sent.push(c.path);return {status:200,body:{}};},c=>c.path==='/api/telemetry');assert.deepEqual(sent,['/api/telemetry']);assert.equal((await q.list()).find(c=>c.id==='approval')?.status,'pending');sqlite.close();
});
