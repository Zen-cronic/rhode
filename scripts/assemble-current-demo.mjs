import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const root=new URL('..',import.meta.url).pathname;
const output=process.env.ROADSTAR_DEMO_WORK??'/tmp/roadstar-demo-current';
const font=`${root}docs/design/demo-source/fonts/IBMPlexMono-Regular.ttf`;
const base=`${root}apps/web/public/demo/roadstar-demo.mp4`;
const sources=[
  `${root}docs/evidence/3d-dock-2026-09-12/overview-desktop.png`,
  `${root}docs/evidence/3d-corridor-2026-09-12/movement-perspective-desktop.png`,
  `${root}docs/evidence/ranked-recovery-2026-09-12/recommendation-desktop.png`,
  `${root}docs/evidence/ranked-recovery-2026-09-12/recommendation-desktop.png`,
  `${root}docs/evidence/ranked-recovery-2026-09-12/approval-review.png`,
];
await mkdir(output,{recursive:true});
function run(args){const result=spawnSync('/usr/bin/ffmpeg',['-y','-v','error',...args],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||`ffmpeg exited ${result.status}`);}
const title=(value)=>`drawbox=x=0:y=0:w=1920:h=92:color=0x191b1d@0.94:t=fill,drawtext=fontfile=${font}:text='${value}':fontsize=24:fontcolor=0xf5f3ed:x=96:y=34`;
const fit=(duration,label)=>`scale=1660:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x191b1d,setsar=1,fps=24,${title(label)},trim=duration=${duration},setpts=PTS-STARTPTS`;
const filters=[
  `[0:v]${fit(10,'01 / ACKNOWLEDGED DOCK WAIT')}[v0]`,
  `[1:v]${fit(10,'02 / RECORDED CORRIDOR')}[v1]`,
  `[2:v]crop=1440:900:0:650,${fit(10,'03 / SERVER-RANKED RECOVERY')}[v2]`,
  `[3:v]crop=1440:900:0:1280,${fit(12,'04 / FEASIBLE AND REJECTED OPTIONS')}[v3]`,
  `[4:v]${fit(16,'05 / REVIEW BEFORE COMMIT')}[v4]`,
  '[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[replacement]',
].join(';');
const replacement=`${output}/recovery-visuals.mp4`;
run(sources.flatMap((source,index)=>['-loop','1','-t',String([10,10,10,12,16][index]),'-i',source]).concat(['-filter_complex',filters,'-map','[replacement]','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',replacement]));
const candidate=`${output}/roadstar-demo-current.mp4`;
run(['-i',base,'-i',replacement,'-filter_complex','[1:v]setpts=PTS+36/TB[replacement];[0:v][replacement]overlay=0:0:eof_action=pass[out]','-map','[out]','-map','0:a','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',candidate]);
const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const receipt={createdAt:new Date().toISOString(),base,baseSha256:await hash(base),candidate,candidateSha256:await hash(candidate),replacement:{startSeconds:36,endSeconds:94,durationSeconds:58,sources:sources.map((source,index)=>({source,durationSeconds:[10,10,10,12,16][index]}))},audio:'Copied byte-stream from the accepted four-minute film; narration and caption timings are unchanged.',scope:'Actual verified application captures replace the stale delay/recovery visuals. No UI values are altered and no new model or narration call is made.'};
await writeFile(`${output}/receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({candidate,sha256:receipt.candidateSha256}));
