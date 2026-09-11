import {test} from 'node:test';import assert from 'node:assert/strict';
import {recoveryState} from '../src/recovery.ts';
const old={id:'before',loadId:'load',driverId:'D1',truckId:'T1',trailerId:'V1',status:'superseded'},next={id:'after',loadId:'load',driverId:'D2',status:'offered'};
const proposal={id:'p',load_id:'load',expected_version:2,revision:1,status:'pending',body:{driverId:'D2',currentAssignmentId:'before',proof:{eligible:true},resources:[{id:'D2',version:3}]}};
const state={loads:[{id:'load',version:2}],assignments:[old,next],resources:[{id:'D2',version:3}]};
test('recovery retains the actual previous assignment after approval and distinguishes offer from acceptance',()=>{
 const p={...proposal,status:'approved'};const r=recoveryState(p as any,state as any);assert.equal(r.previous?.driverId,'D1');assert.equal(r.resulting?.status,'offered');assert.equal(r.canApprove,false);
 assert.equal(recoveryState(p as any,{...state,assignments:[old,{...next,status:'accepted'}]} as any).resulting?.status,'accepted');
 assert.equal(recoveryState(p as any,{...state,assignments:[old,{...next,status:'superseded'}]} as any).resulting,undefined);
});
test('stale load or driver evidence prevents native approval while server remains authoritative',()=>{
 assert.equal(recoveryState(proposal as any,state as any).canApprove,true);
 for(const changed of [{...state,loads:[{id:'load',version:3}]},{...state,resources:[{id:'D2',version:4}]},{...state,resources:[]},{...state,loads:[]}]){const r=recoveryState(proposal as any,changed as any);assert.equal(r.stale,true);assert.equal(r.canApprove,false);}
 assert.equal(recoveryState({...proposal,body:{...proposal.body,proof:undefined}} as any,state as any).canApprove,false);
});
