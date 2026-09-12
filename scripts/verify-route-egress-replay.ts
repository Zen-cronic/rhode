import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pool} from '../services/api/src/db.ts';

const pointer='data/route-egress-fixture.json';
const evidence='docs/evidence/route-egress-2026-09-12/verification.json';
const fixture=JSON.parse(await readFile(pointer,'utf8'));
const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar');

async function simulator(path:string,body?:unknown){
  const response=await fetch(`http://127.0.0.1:4020${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
  const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value as any;
}
async function durable(){
  const result:Record<string,unknown>={};
  const tables:[string,string][]=[['telemetry','id'],['stop_visits','id'],['invoice_revisions','id'],['assignments','id'],['reservations','id'],['disruptions','id'],['approvals','id'],['resources','id'],['loads','id'],['scenarios','id'],['duty_events','id'],['stop_completions','id'],['events','cursor']];
  for(const [table,order] of tables)result[table]=(await db.query(`SELECT * FROM ${table} WHERE carrier_id=$1 ORDER BY ${order}`,[fixture.carrier])).rows;
  return JSON.parse(JSON.stringify(result));
}

try{
  const before=await durable();
  const beforeHash=createHash('sha256').update(JSON.stringify(before)).digest('hex');
  await simulator(`/runs/${fixture.runId}/reset`,{});
  await simulator(`/runs/${fixture.runId}/resume`,{});
  let current=await simulator(`/runs/${fixture.runId}`);
  while(current.elapsed_seconds<fixture.elapsedSeconds){
    const seconds=Math.min(600,fixture.elapsedSeconds-current.elapsed_seconds);
    await simulator(`/runs/${fixture.runId}/advance`,{seconds});
    current=await simulator(`/runs/${fixture.runId}`);
    console.log(JSON.stringify({elapsed:current.elapsed_seconds,phase:current.phase,events:current.events.length}));
  }
  await simulator(`/runs/${fixture.runId}/pause`,{});
  assert.equal(current.phase,'route_complete');
  const eventHash=createHash('sha256').update(JSON.stringify(current.events)).digest('hex');
  assert.equal(eventHash,fixture.eventHash);
  const after=await durable();
  assert.deepEqual(after,before);
  const afterHash=createHash('sha256').update(JSON.stringify(after)).digest('hex');
  assert.equal(afterHash,beforeHash);
  const proof=JSON.parse(await readFile(evidence,'utf8'));
  proof.replay={verifiedAt:new Date().toISOString(),eventHash,events:current.events.length,elapsedSeconds:current.elapsed_seconds,operationalHash:afterHash,tables:Object.keys(after)};
  proof.checks=[...new Set([...proof.checks,'Same-run reset reproduces every source event while all compared operational records and the detention draft remain byte-equivalent'])];
  const replayLimit='Same-run replay proves idempotent consumption, not an independent counterfactual.';
  if(!proof.limits.includes(replayLimit))proof.limits+=` ${replayLimit}`;
  await writeFile(evidence,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({run:fixture.runId,events:current.events.length,eventHash,operationalHash:afterHash}));
}finally{await db.end();}
