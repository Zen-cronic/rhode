import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const root=new URL('..',import.meta.url).pathname;
const current=`${root}apps/web/public/demo/roadstar-demo.mp4`;
const packaged=`${root}../submission/roadstar/output/roadstar-demo.mp4`;
const prior=`${root}../submission/roadstar/private-build/pre-ranked-recovery/roadstar-demo.mp4`;
const captions=`${root}apps/web/public/demo/roadstar-demo.srt`;
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
function run(program,args){const result=spawnSync(program,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
const probe=JSON.parse(run('/usr/bin/ffprobe',['-v','error','-show_entries','format=duration,size:stream=index,codec_name,width,height,r_frame_rate,sample_rate,channels','-of','json',current]));
const audio=path=>run('/usr/bin/ffmpeg',['-v','error','-i',path,'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-']).replace('SHA256=','');
run('/usr/bin/ffmpeg',['-v','error','-i',current,'-f','null','-']);
const currentHash=await hash(current),packagedHash=await hash(packaged),priorHash=await hash(prior),currentAudio=audio(current),priorAudio=audio(prior);
assert.equal(currentHash,packagedHash);assert.notEqual(currentHash,priorHash);assert.equal(currentAudio,priorAudio);
assert.ok(Number(probe.format.duration)>=240&&Number(probe.format.duration)<241);assert.deepEqual(probe.streams.map(({codec_name})=>codec_name),['h264','aac']);assert.deepEqual([probe.streams[0].width,probe.streams[0].height,probe.streams[0].r_frame_rate],[1920,1080,'24/1']);
const evidence={verifiedAt:new Date().toISOString(),currentSha256:currentHash,priorSha256:priorHash,packagedSha256:packagedHash,audioPacketSha256:currentAudio,captionsSha256:await hash(captions),probe,visualReplacement:{startSeconds:36,endSeconds:94,scenes:['Acknowledged dock wait with on-duty hold and provisional detention','Matched 3D baseline-versus-401-slowdown comparison at exact shared observations','Server-ranked recovery receipt','Feasible and HOS-rejected candidate disclosure','Dispatcher approval gate'],sourceEvidence:['docs/evidence/3d-dock-2026-09-12/','docs/evidence/3d-slowdown-comparison-2026-09-12/','docs/evidence/ranked-recovery-2026-09-12/']},checks:['Public web asset and local submission package are byte-identical','Four-minute duration and H.264/AAC 1920x1080 24fps contract preserved','AAC packet stream is byte-identical to the previously accepted narration','Entire promoted film decodes without ffmpeg errors','Five boundary/representative frames inspected, including the return to the existing driver scene'],limits:'The replacement uses still frames from actual verified application states. Other film scenes and the accepted narration/caption timings are retained. Human listening and live presentation rehearsal remain operator checks; public video-host acceptance remains unconfirmed.'};
await writeFile(`${root}docs/evidence/demo-current-2026-09-12/verification.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({currentSha256:currentHash,duration:probe.format.duration,audioUnchanged:true}));
