import{test}from'node:test';import assert from'node:assert/strict';
import{refreshSnapshot}from'../src/synchronization.ts';import type{Api,State}from'../src/api.ts';
test('time-dependent More snapshots replace a formerly priced estimate even with no new event cursor',async()=>{
 let stateCalls=0,updatesCalls=0;const held={cursor:'42',openVisitEstimates:[{status:'held',reason:'GPS too old'}]} as unknown as State;
 const api={request:async()=>{updatesCalls++;return{status:200,body:{changes:[]}};},state:async()=>{stateCalls++;return held;}} as Pick<Api,'request'|'state'>;
 assert.equal(await refreshSnapshot(api,'42','Today'),null);assert.equal(stateCalls,0);
 assert.equal(await refreshSnapshot(api,'42','More'),held);assert.equal(stateCalls,1);assert.equal(updatesCalls,1);
 assert.equal(await refreshSnapshot(api,'42','Duty'),held);assert.equal(stateCalls,2);
});
test('forced and first synchronization obtain snapshots; update failures remain observable',async()=>{
 const state={cursor:'42'} as State;const api={request:async()=>({status:403,body:{error:{message:'Membership changed'}}}),state:async()=>state} as Pick<Api,'request'|'state'>;
 assert.equal(await refreshSnapshot(api,'42','Today',true),state);assert.equal(await refreshSnapshot(api,null,'Today'),state);
 await assert.rejects(refreshSnapshot(api,'42','Today'),/Membership changed/);
 await assert.rejects(refreshSnapshot({...api,state:async()=>{throw Error('Offline');}},'42','More'),/Offline/);
});
