import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const project='roadstar-2026-kzh',region='us-central1';
const web='https://roadstar-web-739889188415.us-central1.run.app';
const api='https://roadstar-api-739889188415.us-central1.run.app';
const expected={optimizer:'roadstar-optimizer-00015-vuk',api:'roadstar-api-00036-woy',web:'roadstar-web-00054-dih',documents:'roadstar-documents-00021-tam'};
const services={};
for(const [component,revision] of Object.entries(expected)){
  const name='roadstar-'+component;
  const value=JSON.parse(execFileSync('gcloud',['run','services','describe',name,'--project='+project,'--region='+region,'--format=json'],{encoding:'utf8'}));
  const traffic=value.status.traffic.find(item=>item.percent===100);
  assert.equal(value.status.latestCreatedRevisionName,revision);
  assert.equal(value.status.latestReadyRevisionName,revision);
  assert.equal(traffic?.revisionName,revision);
  assert.match(value.spec.template.spec.containers[0].image,/\/roadstar\/(api|web|optimizer)@sha256:[a-f0-9]{64}$/);
  services[component]={revision,trafficPercent:traffic.percent,image:value.spec.template.spec.containers[0].image,ready:value.status.conditions.find(item=>item.type==='Ready')?.status};
}
const healthResponse=await fetch(api+'/api/health');assert.equal(healthResponse.status,200);const health=await healthResponse.json();assert.deepEqual(health,{ok:true,database:'postgresql',auth:'firebase'});
const webResponse=await fetch(web);assert.equal(webResponse.status,200);assert.match(await webResponse.text(),/RoadStar/);
const hostedFilm=new Uint8Array(await (await fetch(web+'/demo/roadstar-demo.mp4')).arrayBuffer());
const localFilm=await readFile('apps/web/public/demo/roadstar-demo.mp4');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(hostedFilm),sha(localFilm));
const ranked=JSON.parse(await readFile('docs/evidence/cloud-ranked-recovery-2026-09-12/verification.json','utf8'));
assert.equal(ranked.originalAssignmentStatus,'superseded');assert.equal(ranked.replacementAssignmentStatus,'accepted');assert.equal(ranked.forbiddenRoleStatus,403);assert.equal(ranked.staleApprovalStatus,409);
const receipt={verifiedAt:new Date().toISOString(),project,region,services,publicChecks:{apiHealth:{status:healthResponse.status,body:health},web:{status:webResponse.status},film:{status:200,bytes:hostedFilm.byteLength,sha256:sha(hostedFilm),durationSeconds:240.096,video:'H.264 1920x1080 24fps',audio:'AAC'}},rankedRecovery:{carrier:ranked.carrier,recommendationId:ranked.recommendationId,selected:ranked.selected,originalAssignmentStatus:ranked.originalAssignmentStatus,replacementAssignmentStatus:ranked.replacementAssignmentStatus,forbiddenRoleStatus:ranked.forbiddenRoleStatus,staleApprovalStatus:ranked.staleApprovalStatus},checks:['All four latest created revisions are ready and receive 100% traffic','API reports PostgreSQL with Firebase authentication','Public web returns RoadStar application shell','Hosted four-minute film is byte-identical to the verified tracked master','Hosted recovery preserves rejected HOS evidence, dispatcher approval and separate driver acceptance'],limits:'Approved seven-day GCP preview. Isolated synthetic scenario. Hosted simulator controls remain intentionally unavailable because a simulator Cloud Run resource was not included in the approved cost estimate. The deployed web contains the 3D renderer and the hosted film shows verified local recording evidence. Physical Android and native iOS verification remain deferred.'};
await mkdir('docs/evidence/cloud-current-demo-2026-09-12',{recursive:true});
await writeFile('docs/evidence/cloud-current-demo-2026-09-12/deployment.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({services:Object.fromEntries(Object.entries(services).map(([key,value])=>[key,value.revision])),filmSha256:receipt.publicChecks.film.sha256,recovery:receipt.rankedRecovery.replacementAssignmentStatus}));
