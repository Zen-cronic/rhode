import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Queue,type Database} from '../src/queue.ts';
import {readRoute,saveRoute,verifiedRoute,routeCacheKey,routeFailureAllowsCache,type RouteRequest,type TruckRoute} from '../src/routes.ts';
const request:RouteRequest={loadId:'load-a',truckId:'truck-a',truckVersion:3,pickup:{lat:43.65,lng:-79.38},delivery:{lat:43.68,lng:-79.42}};
// A transport fixture verifies client validation, not live road feasibility.
const response:TruckRoute={fingerprint:'fixture-fingerprint',loadId:'load-a',truckId:'truck-a',coordinates:[[-79.38,43.65],[-79.4,43.66],[-79.42,43.68]],drivingMinutes:12,profile:{height:4,width:2.5,length:20,weight:32,axle_load:8,hazmat:false,evidence:'synthetic-scenario'},dataset:'unit-test fixture',routing_evidence:'valhalla-truck',warning:'Fixture, not live road evidence'};
function connect(path:string){const sqlite=new DatabaseSync(path);const db:Database={execAsync:async(sql)=>{sqlite.exec(sql);},runAsync:async(sql,...params)=>sqlite.prepare(sql).run(...params),getAllAsync:async<T>(sql:string,...params:any[])=>sqlite.prepare(sql).all(...params) as T[],getFirstAsync:async<T>(sql:string,...params:any[])=>sqlite.prepare(sql).get(...params) as T??null};return {sqlite,db};}
test('route validation rejects missing evidence, wrong assignment, malformed geometry and unknown dimensions',()=>{
 assert.deepEqual(verifiedRoute(response,request).coordinates,response.coordinates);
 for(const invalid of [{...response,routing_evidence:'straight-line'},{...response,truckId:'other'},{...response,loadId:'other'},{...response,coordinates:[]},{...response,coordinates:[[999,43],[-79,43]]},{...response,coordinates:[[-79,NaN],[-79,43]]},{...response,profile:{...response.profile,height:0}}])assert.throws(()=>verifiedRoute(invalid,request));
});
test('cache key changes with stops and truck revision so an old vehicle profile is not reused',()=>{
 assert.notEqual(routeCacheKey(request),routeCacheKey({...request,truckVersion:4}));
 assert.notEqual(routeCacheKey(request),routeCacheKey({...request,delivery:{lat:44,lng:-79}}));
 assert.notEqual(routeCacheKey(request),routeCacheKey({...request,truckId:'other'}));
});
test('only transient responses permit a downloaded route; denied authorization invalidates it',()=>{
 for(const status of [400,401,403,404,409])assert.equal(routeFailureAllowsCache(status),false);
 for(const status of [408,425,429,500,503])assert.equal(routeFailureAllowsCache(status),true);
});
test('verified route and evidence survive SQLite restart and remain scoped by carrier/user',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'roadstar-routes-'));try{let connection=connect(join(dir,'routes.db'));let q=new Queue(connection.db,'api|carrier-a|driver');await q.init();const saved=await saveRoute(q,request,response);connection.sqlite.close();connection=connect(join(dir,'routes.db'));q=new Queue(connection.db,'api|carrier-a|driver');await q.init();assert.deepEqual(await readRoute(q,request),saved);const other=new Queue(connection.db,'api|carrier-b|driver');await other.init();assert.equal(await readRoute(other,request),null);assert.equal(await readRoute(q,{...request,truckVersion:4}),null);await q.saveDraft(routeCacheKey(request),'');assert.equal(await readRoute(q,request),null);connection.sqlite.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
