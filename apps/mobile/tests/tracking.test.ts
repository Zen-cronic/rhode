import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackingBlock,validSample,type TrackingGrant,type TrackingState} from '../src/tracking-policy.ts';
const now=Date.parse('2026-09-10T16:00:00Z');
const grant:TrackingGrant={id:'g',scope:'origin|carrier|user',origin:'https://api.example',userId:'user',carrierId:'carrier',driverId:'driver',sessionId:'session',assignmentId:'trip',startedAt:'2026-09-10T15:00:00Z',expiresAt:'2026-09-10T17:00:00Z',enabled:true};
const state:TrackingState={actor:{role:'driver',driverId:'driver',carrierId:'carrier'},workSessions:[{id:'session',ended_at:null}],assignments:[{id:'trip',driverId:'driver',loadId:'load',status:'accepted'}],loads:[{id:'load',provenance:'live'}]};
test('background requires explicit current consent, native permission and unexpired authentication',()=>{
 assert.equal(trackingBlock(grant,state,now,true),null);
 assert.match(trackingBlock({...grant,enabled:false},state,now,true)!,/revoked/);
 assert.match(trackingBlock(grant,state,now,false)!,/permission/);
 assert.match(trackingBlock(grant,state,Date.parse(grant.expiresAt),true)!,/expired/);
});
test('server session end, changed carrier/driver and synthetic or reassigned trip block GPS',()=>{
 assert.match(trackingBlock(grant,{...state,workSessions:[{id:'session',ended_at:'2026-09-10T15:59:00Z'}]},now,true)!,/ended/);
 assert.match(trackingBlock(grant,{...state,actor:{role:'driver',driverId:'driver',carrierId:'other'}},now,true)!,/identity/);
 assert.match(trackingBlock(grant,{...state,assignments:[{...state.assignments[0],driverId:'other'}]},now,true)!,/accepted/);
 assert.match(trackingBlock(grant,{...state,loads:[{id:'load',provenance:'synthetic'}]},now,true)!,/live/);
});
test('samples before consent, after expiry, unknown accuracy and future samples are withheld',()=>{
 assert.equal(validSample(grant,now,20,now),true);
 assert.equal(validSample(grant,Date.parse(grant.startedAt)-1,20,now),false);
 assert.equal(validSample(grant,Date.parse(grant.expiresAt),20,now),false);
 assert.equal(validSample(grant,now,null,now),false);
 assert.equal(validSample(grant,now,-1,now),false);
 assert.equal(validSample(grant,now+60001,20,now),false);
});

test('completed trip can close only an existing visit while consent and work session remain active',()=>{
 const completed:TrackingState={...state,assignments:[{...state.assignments[0],status:'completed'}],visits:[{assignment_id:'trip',departure:null}]};
 assert.equal(trackingBlock(grant,completed,now,true),null);
 assert.match(trackingBlock(grant,{...completed,visits:[]},now,true)!,/awaiting/);
 assert.match(trackingBlock(grant,{...completed,visits:[{assignment_id:'trip',departure:'2026-09-10T16:00:00Z'}]},now,true)!,/awaiting/);
 assert.match(trackingBlock(grant,{...completed,visits:[{assignment_id:'other',departure:null}]},now,true)!,/awaiting/);
 assert.match(trackingBlock(grant,{...completed,assignments:[{...state.assignments[0],status:'superseded'}]},now,true)!,/awaiting/);
 assert.match(trackingBlock(grant,{...completed,workSessions:[]},now,true)!,/ended/);
 assert.match(trackingBlock({...grant,enabled:false},completed,now,true)!,/revoked/);
});
