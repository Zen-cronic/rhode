import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remainingWork} from '../services/api/src/remaining-work.ts';
import {fixtures,london,milton} from '../services/api/src/fixtures.ts';
const input={assignmentIds:['first'],stops:[{assignmentId:'first',stopId:milton.id,point:milton},{assignmentId:'first',stopId:london.id,point:london}],truck:fixtures().trucks[0],provenance:'synthetic',now:'2026-09-13T15:00:00Z',startAt:'2026-09-13T12:30:00Z',releaseAt:'2026-09-13T16:00:00Z',availableAt:'2026-09-13T15:00:00Z',drivingMinutes:105,serviceMinutes:60};
const sample={id:'gps',at:input.now,accuracy_m:5,disposition:'applied',body:{position:{lat:london.lat+0.001,lng:london.lng+0.001},provenance:'synthetic'}};
const database=(point:any,completed:any[]=[])=>({query:async(sql:string)=>({rows:sql.includes('FROM telemetry')?(point?[point]:[]):completed})}) as any;
const routeTest={skip:!process.env.ROAD_ROUTING_TEST_URL};
test('remaining driving uses actual truck route after dated pickup; future wait still consumes duty',routeTest,async()=>{
 process.env.OPTIMIZER_URL=process.env.ROAD_ROUTING_TEST_URL;
 const result=await remainingWork(database(sample,[{assignment_id:'first',stop_id:milton.id}]),'synthetic-test',input);
 assert.ok(result.drivingMinutes<20);assert.equal(result.completedStops,1);assert.equal(result.telemetryId,'gps');
 assert.equal(result.availableAt,new Date(Date.parse(input.now)+(result.drivingMinutes+60)*60000).toISOString());
 assert.equal(result.dutyMinutes,result.drivingMinutes+60); // No invented split or service completion credit.
 const held=await remainingWork(database(sample,[{assignment_id:'first',stop_id:milton.id}]),'synthetic-test',{...input,releaseAt:'2026-09-13T18:00:00Z'});
 assert.equal(held.dutyMinutes,180);assert.equal(held.drivingMinutes,result.drivingMinutes);
});
test('stale, inaccurate, excluded, missing and wrong-provenance positions earn no progress credit',async()=>{
 process.env.OPTIMIZER_URL??='http://127.0.0.1:4040';
 for(const point of [null,{...sample,at:'2026-09-13T14:57:59Z'},{...sample,accuracy_m:101},{...sample,accuracy_m:null},{...sample,disposition:'retained_uncertain'},{...sample,body:{...sample.body,provenance:'live'}}]){
  const result=await remainingWork(database(point),'synthetic-test',input);assert.equal(result.drivingMinutes,105);assert.equal(result.dutyMinutes,165);assert.equal(result.telemetryId,null);
 }
});
test('consolidated pending manifest stops remain in route and completion belongs to its assignment',routeTest,async()=>{
 process.env.OPTIMIZER_URL=process.env.ROAD_ROUTING_TEST_URL;
 const stops=[...input.stops,{assignmentId:'second',stopId:milton.id,point:milton}];
 const done=[{assignment_id:'first',stop_id:milton.id}];
 const result=await remainingWork(database(sample,done),'synthetic-test',{...input,stops,assignmentIds:['first','second'],drivingMinutes:210,serviceMinutes:100});
 assert.equal(result.completedStops,1);assert.ok(result.drivingMinutes>60);assert.ok(result.dutyMinutes>=result.drivingMinutes+100);
});
