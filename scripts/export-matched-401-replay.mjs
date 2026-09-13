import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const pointer=JSON.parse(await readFile('data/3d-slowdown-comparison.json','utf8'));
const apiOrigin=process.env.ROADSTAR_API_ORIGIN??'http://127.0.0.1:4010';
const output=process.env.ROADSTAR_REPLAY_OUTPUT??'apps/web/public/demo/matched-401-replay.json';
assert.equal(pointer.status,'ready');
assert.equal(pointer.branches.length,2);
assert.deepEqual(new Set(pointer.branches.map(branch=>branch.kind)),new Set(['baseline','road_slowdown']));

async function readRun(branch){
 const pages=[];let offset=0,snapshot;
 for(;;){
  const params=new URLSearchParams({offset:String(offset),limit:'1000'});if(snapshot)params.set('snapshot',snapshot);
  const response=await fetch(`${apiOrigin}/api/simulator/${branch.runId}/presentation?${params}`,{headers:{authorization:'Bearer demo-dispatcher','x-carrier-id':pointer.carrier},signal:AbortSignal.timeout(120000)});
  const page=await response.json();assert.equal(response.status,200,JSON.stringify(page));
  assert.equal(page.schema,1);assert.equal(page.run_id,branch.runId);assert.equal(page.assignment_id,branch.assignmentId);assert.equal(page.provenance,'synthetic');
  assert.equal(page.comparison_basis_hash,pointer.comparisonBasisHash);assert.equal(page.intervention.kind,branch.kind);assert.equal(page.total,branch.eventCount);assert.equal(page.offset,offset);
  assert.ok(page.events.every(event=>event.sample.provenance==='synthetic'));
  pages.push(page);snapshot=page.snapshot;
  if(page.next_offset===null)break;offset=page.next_offset;
 }
 assert.equal(pages.reduce((total,page)=>total+page.events.length,0),branch.eventCount);
 return{role:branch.kind,run:{run_id:branch.runId,assignment_id:branch.assignmentId,event_count:branch.eventCount,conditions_hash:branch.conditionsHash},pages};
}

const runs=[];for(const branch of pointer.branches)runs.push(await readRun(branch));
const archive={schema:1,title:'Matched Highway 401 slowdown',created_at:new Date().toISOString(),provenance:'synthetic',comparison_basis_hash:pointer.comparisonBasisHash,runs,limits:'Read-only packaged evidence from two complete API-acknowledged local simulator recordings. Exact at-or-before observations; no interpolation, live traffic, certified GPS, billing, revenue or hosted simulator-control claim.'};
const bytes=Buffer.from(`${JSON.stringify(archive)}\n`);await writeFile(output,bytes);
console.log(JSON.stringify({output,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),runs:runs.map(item=>({role:item.role,pages:item.pages.length,events:item.pages.reduce((sum,page)=>sum+page.events.length,0)}))}));
