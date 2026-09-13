import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assemblePackagedRecording} from '../src/packaged-corridor-replay.ts';
import {comparisonCompatibility,corridorComparisonMetrics} from '../src/corridor-replay-model.ts';

const archive=JSON.parse(await readFile(new URL('../public/demo/matched-401-replay.json',import.meta.url),'utf8'));
const baselineRun=archive.runs.find((item:any)=>item.role==='baseline').run;
const slowdownRun=archive.runs.find((item:any)=>item.role==='road_slowdown').run;

test('packaged matched replay assembles both complete acknowledged recordings',()=>{
 const progress:number[]=[];
 const baseline=assemblePackagedRecording(archive,baselineRun,value=>progress.push(value.loaded));
 const slowdown=assemblePackagedRecording(archive,slowdownRun,value=>progress.push(value.loaded));
 assert.deepEqual(progress,[1000,2000,2401,1000,2000,2401]);
 assert.equal(baseline.complete,true);assert.equal(slowdown.complete,true);
 assert.equal(baseline.events.length,2401);assert.equal(slowdown.events.length,2401);
 assert.deepEqual(comparisonCompatibility(baseline,slowdown),{ok:true});
 const metrics=corridorComparisonMetrics(baseline,slowdown,2400);assert.ok(metrics);
 assert.ok(Math.abs((metrics.progressGapKm??0)-27.657)<0.001);
 assert.equal(metrics.modeledCompletionDeltaSeconds,1606);
});

test('packaged matched replay rejects identity and page-order changes',()=>{
 assert.throws(()=>assemblePackagedRecording(archive,{...baselineRun,event_count:2400},()=>{}),/identity/);
 const changed=structuredClone(archive);changed.runs[0].pages[1].offset=999;
 assert.throws(()=>assemblePackagedRecording(changed,baselineRun,()=>{}),/changed|overlap|order/);
});
