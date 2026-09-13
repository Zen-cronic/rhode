import assert from 'node:assert/strict';
import test from 'node:test';
import {createApi,issueJudgeDemoToken,verifyJudgeDemoToken} from '../services/api/src/server.ts';

const config={
  carrier:'judge-synthetic-carrier',
  uid:'judge-demo-dispatcher',
  secret:'test-only-secret-that-is-longer-than-thirty-two-characters',
  ttlSeconds:60,
};

test('judge demo tokens are scoped, signed and expiring',()=>{
  const now=Date.parse('2026-09-13T12:00:00Z');
  const issued=issueJudgeDemoToken(config,now);
  assert.equal(issued.expiresAt,'2026-09-13T12:01:00.000Z');
  assert.deepEqual(verifyJudgeDemoToken(issued.token,config,config.carrier,now),{
    carrier:config.carrier,
    uid:config.uid,
    exp:Math.floor(now/1000)+60,
    purpose:'judge-demo',
  });
  assert.throws(()=>verifyJudgeDemoToken(`${issued.token}x`,config,config.carrier,now),{code:'UNAUTHENTICATED'});
  assert.throws(()=>verifyJudgeDemoToken(issued.token,config,'another-carrier',now),{code:'UNAUTHENTICATED'});
  assert.throws(()=>verifyJudgeDemoToken(issued.token,{...config,secret:'another-test-secret-that-is-long-enough-for-use'},config.carrier,now),{code:'UNAUTHENTICATED'});
  assert.throws(()=>verifyJudgeDemoToken(issued.token,config,config.carrier,now+61_000),{code:'UNAUTHENTICATED'});
});

test('judge entry issues a session for one existing synthetic membership',async()=>{
  const calls:{uid:string;carrier:string}[]=[];
  const mockStore={
    membership:async(uid:string,carrier:string)=>{
      calls.push({uid,carrier});
      if(uid!==config.uid||carrier!==config.carrier)throw Object.assign(new Error('forbidden'),{code:'FORBIDDEN',status:403});
      return{uid,carrierId:carrier,role:'dispatcher'};
    },
    snapshot:async(actor:{carrierId:string})=>({actor:{carrierId:actor.carrierId,role:'dispatcher'},loads:[]}),
  };
  const app=createApi(mockStore as never,{judgeDemo:config});
  try{
    const entry=await app.inject({method:'POST',url:'/api/judge-session'});
    assert.equal(entry.statusCode,200,entry.body);
    assert.equal(entry.headers['cache-control'],'private, no-store');
    const session=entry.json();
    assert.equal(session.carrier,config.carrier);
    assert.equal(session.uid,config.uid);
    assert.match(session.token,/^judge\./);
    const state=await app.inject({url:'/api/state',headers:{authorization:`Bearer ${session.token}`,'x-carrier-id':config.carrier}});
    assert.equal(state.statusCode,200,state.body);
    const wrongCarrier=await app.inject({url:'/api/state',headers:{authorization:`Bearer ${session.token}`,'x-carrier-id':'another-carrier'}});
    assert.equal(wrongCarrier.statusCode,401,wrongCarrier.body);
    assert.deepEqual(calls,[
      {uid:config.uid,carrier:config.carrier},
      {uid:config.uid,carrier:config.carrier},
    ]);
  }finally{
    await app.close();
  }
});

test('judge entry stays unavailable without the temporary feature flag',async()=>{
  const app=createApi({} as never);
  try{
    const response=await app.inject({method:'POST',url:'/api/judge-session'});
    assert.equal(response.statusCode,404,response.body);
  }finally{
    await app.close();
  }
});
