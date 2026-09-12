import fs from 'node:fs/promises';
import path from 'node:path';
import {Presentation,PresentationFile} from '@oai/artifact-tool';

// Editable RoadStar precision-transport deck. Brand art is illustrative.
// Environment overrides make this source reusable with final UI captures.
const ROOT=process.env.ROADSTAR_ROOT||'/home/zin-kg/code/hackathons/roadstar-2026/placeholder-1';
const WORK=process.env.DECK_WORK||'/tmp/roadstar-redesign/deck';
const REV=process.env.DECK_REV||'v1';
const SKILL='/home/zin-kg/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const RUNTIME=process.env.RUNTIME_ROOT||'/home/zin-kg/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES ||= RUNTIME+'/node/node_modules';
const FONT=process.env.DECK_FONT||'Manrope';
const C={graphite:'#191B1D',ivory:'#F5F3ED',ink:'#242729',muted:'#666962',orange:'#E65C32',rust:'#AC3716',rule:'#DCDDD5',light:'#BFC2BA'};
const p=Presentation.create({slideSize:{width:1280,height:720}});
const art=ROOT+'/apps/web/public/brand/road-sculpture.png';
const captureFile=name=>new URL('./assets/'+name+'.png',import.meta.url).pathname;
const captures={recovery:process.env.DECK_RECOVERY||captureFile('recovery'),approval:process.env.DECK_APPROVAL||captureFile('approval'),billing:process.env.DECK_BILLING||captureFile('billing'),planning:process.env.DECK_PLANNING||captureFile('planning'),mobile:process.env.DECK_MOBILE||captureFile('mobile')};
const noteStrings=JSON.parse(await fs.readFile(new URL('./speaker-notes.json',import.meta.url),'utf8'));
const durations=[35,45,80,65,65,60,55,50,50,55,40,120,180];
function txt(s,value,x,y,w,h,size=30,bold=false,color=C.ink){const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=value;t.text.style={typeface:FONT,fontSize:size,bold,color,autoFit:'none'};return t;}
function link(s,a,b,color=C.rule,width=3,from='bottom',to='top'){return s.shapes.connect(a,b,{kind:'straight',fromSide:from,toSide:to,line:{fill:color,width,style:'solid'}});}
function slide(dark=false){const s=p.slides.add();s.background.fill=dark?C.graphite:C.ivory;const i=p.slides.items.length;const source=(noteStrings[i-1]||'').replace(/^\d+ seconds\. /,'');s.speakerNotes.textFrame.setText(`${durations[i-1]} seconds. ${source}\n\nVisual source: actual RoadStar application captures where shown. Generated road sculpture is illustrative brand artwork, not geographic or route evidence. Design system: docs/design/precision-transport.md. Current accepted check counts: 106 backend, 50 native mobile. Core slides 1–11 total 10 minutes. Appendix slides 12–13 total 5 minutes.`);txt(s,String(i).padStart(2,'0'),1183,661,46,28,17,false,dark?C.light:C.muted);return s;}
async function img(s,file,x,y,w,h,fit='contain'){s.images.add({blob:new Uint8Array(await fs.readFile(file)),contentType:'image/png',alt:path.basename(file),fit,position:{left:x,top:y,width:w,height:h}});}
function title(s,text,w=1120,dark=false){return txt(s,text,64,48,w,112,48,true,dark?C.ivory:C.ink)}
function body(s,text,x,y,w,h=75,size=25,color=C.muted){return txt(s,text,x,y,w,h,size,false,color)}

// 01. Minimal brand opening, editorial scale.
let s=slide(true);await img(s,art,0,0,1280,720,'cover');s.images.add({blob:new Uint8Array(await fs.readFile(ROOT+'/apps/web/public/brand/roadstar-mark.svg')),contentType:'image/svg+xml',alt:'RoadStar brand mark',fit:'contain',position:{left:67,top:98,width:57,height:64}});txt(s,'RoadStar',135,75,600,123,91,true,C.ivory);txt(s,'Dispatch recovery',68,208,500,100,42,false,C.ivory);body(s,'Carrier decisions. Driver execution.',70,328,475,90,26,C.light);body(s,'RoadStar Hackathon 2026',70,620,540,40,20,C.ivory);

// 02. Editable dependency diagram, no invented times or losses.
s=slide();txt(s,'A dock delay\nreaches the\nnext pickup',60,92,630,340,69,true);body(s,'A dispatcher must reconnect the next assignment with available resources.',66,498,580,110,29);
const dock=txt(s,'Dock delay',808,158,350,70,37,true,C.rust);const next=txt(s,'Next pickup',808,321,350,70,37,true);link(s,dock,next,C.orange,5,'left','left');body(s,'Current truck is still committed',813,242,340,54,21);body(s,'Driver\nTruck\nTrailer',813,410,310,152,29);body(s,'Illustrative dispatch scenario',813,622,370,35,18);

// 03. Actual product evidence gets nearly the whole canvas.
s=slide();title(s,'Recovery rehearsal');body(s,'A delayed departure makes the next assignment visible',67,131,1110,45,25);await img(s,captures.recovery,65,210,1150,176);txt(s,'12:00',61,428,361,100,68,true);body(s,'Planned departure',67,529,346,52,26);txt(s,'13:30',477,428,361,100,68,true,C.rust);body(s,'Expected departure',483,529,354,52,26);txt(s,'12:15',892,428,331,100,68,true);body(s,'Next pickup',898,529,310,52,26);body(s,'Synthetic scenario. Times in ET. Actual Ontario truck routing supports the recovery.',67,651,1090,35,18);

// 04. Decision mechanics and current-evidence UI.
s=slide(true);txt(s,'Approval\nagainst current\nevidence',60,70,560,235,55,true,C.ivory);body(s,'The server rechecks the proposal at the moment of approval.',66,365,440,112,28,C.light);txt(s,'Versions',67,522,370,40,25,true,C.ivory);txt(s,'Availability',67,568,370,40,25,true,C.ivory);txt(s,'Atomic reservations',67,614,470,40,25,true,C.ivory);await img(s,captures.approval,563,108,670,536);

// 05. Real native screenshot, evidence-led text and phone ratio intact.
s=slide();txt(s,'The driver\nkeeps the work',61,72,700,165,63,true);body(s,'Acceptance stays visible through an offline interruption.',67,266,560,110,30);txt(s,'01',67,406,60,42,25,true,C.rust);txt(s,'Pending while offline',141,406,485,50,29,true);txt(s,'02',67,482,60,42,25,true,C.rust);txt(s,'Trip and draft survive termination',141,482,545,55,25);txt(s,'03',67,558,60,42,25,true,C.rust);txt(s,'Server confirms the command',141,558,530,58,25);await img(s,captures.mobile,829,28,304,652);body(s,'Android emulator verified. Physical phone and native iOS remain unverified.',67,659,1070,30,17);

// 06. Evidence provenance beside actual detention review.
s=slide();title(s,'Documents and detention');body(s,'A reviewed revision keeps the original draft in view',67,134,1100,62,27);await img(s,captures.billing,65,219,1150,426);body(s,'Observed samples require review. Billing approval does not initiate payment.',66,653,1090,33,18);

// 07. Oversized count and ordered-manifest evidence.
s=slide(true);txt(s,'2 loads',60,58,590,139,88,true,C.ivory);txt(s,'4 ordered stops',64,193,600,77,42,true,C.ivory);body(s,'One vehicle pairing\nOne approval',68,364,470,108,30,C.light);await img(s,captures.planning,630,88,595,541);body(s,'Reservations stay active until every load completes.',68,553,470,92,24,C.light);body(s,'Synthetic pallet capacity disclosed',68,657,1020,30,18,C.light);

// 08. Complete native editable table with source-lineage evidence.
s=slide();title(s,'All five sheets retain lineage');txt(s,'15,197',55,200,570,155,107,true);body(s,'source rows',67,359,480,65,33);txt(s,'82',67,464,63,46,25,true,C.rust);body(s,'exact Dispatch duplicates',116,464,498,46,25,C.ink);body(s,'Historical provenance preserved\nPrivate source data stays local',67,513,545,90,25);
const values=[['Sheet','Rows'],['Tlorder','4,031'],['Dispatch','10,479'],['Driver','131'],['Trucks','131'],['Trailers','425']];
const table=s.tables.add({rows:6,columns:2,left:679,top:180,width:528,height:408,columnWidths:[330,198],values});table.borders.outside={fill:'none',width:0};table.borders.insideVertical={fill:'none',width:0};table.borders.insideHorizontal={fill:C.rule,width:1,style:'solid'};for(let r=0;r<6;r++)for(let c=0;c<2;c++){const cell=table.getCell(r,c);cell.fill=C.ivory;cell.text.style={typeface:FONT,fontSize:r===0?22:28,bold:r===0,color:r===0?C.muted:C.ink};cell.text.alignment=c===1?'right':'left';for(const side of ['left','right','top','bottom']){cell.lines[side].fill=(side==='top'&&r>0)||(side==='bottom'&&r<5)?C.rule:C.ivory;cell.lines[side].width=1;}}body(s,'Public preview uses labeled synthetic operational scenarios.',67,651,1090,33,18);

// 09. Editable aligned owners with anchored command path and a secondary computation band.
s=slide();title(s,'One operational database');
const ownerX=[65,482,919];
for(const [i,label] of ['CLIENTS','COMMANDS','STORAGE'].entries())txt(s,label,ownerX[i],201,300,34,18,true,C.muted);
const clients=txt(s,'Web + mobile',65,258,290,68,33,true);
const api=txt(s,'Fastify API',482,258,281,68,33,true);
const db=txt(s,'PostgreSQL',919,258,295,68,33,true,C.rust);
s.shapes.connect(clients,api,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.muted,width:2,style:'solid'},tail:{type:'triangle',width:'sm',length:'sm'}});
s.shapes.connect(api,db,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:C.orange,width:3,style:'solid'},tail:{type:'triangle',width:'sm',length:'sm'}});
body(s,'React dispatcher UI\nExpo driver execution',69,356,320,124,25);
body(s,'Firebase identity\nCarrier membership\nValidated commands',486,356,340,124,25);
body(s,'Versions\nReservations\nEvidence',923,356,285,124,25);
s.shapes.add({geometry:'rect',position:{left:73,top:531,width:1134,height:1},fill:C.rule,line:{fill:'none',width:0}});
txt(s,'Supporting capabilities used by the API',65,547,1120,42,23,true,C.muted);
body(s,'Proposals: OR-Tools + Valhalla',65,595,618,43,25,C.ink);body(s,'Documents: Gemini extraction',696,595,510,43,25,C.ink);
body(s,'Independent replay clock · Approval remains an explicit command.',65,651,1100,38,19);

// 10. Measurement and practical limits get equal visual authority.
s=slide(true);title(s,'Measured proof',1120,true);txt(s,'5.4 s',53,167,657,178,127,true,C.ivory);body(s,'p95 acknowledgement-to-snapshot lag\nin the 131-driver cloud burst',67,358,645,103,29,C.light);txt(s,'524',808,196,360,100,66,true,C.orange);body(s,'telemetry + synchronization pairs\nZero failed commands',814,298,370,117,25,C.light);body(s,'Manual 8 / ranked 2 activations\nManual 2 / ranked 1 recovery requests\nFive matched synthetic browser pairs',67,500,662,128,25,C.light);body(s,'After login. Scripted counts, not human task time.',67,638,662,30,17,C.light);body(s,'Physical background location and native iOS still need testing.\nDeclared duty budgets are not a certified ELD.',815,493,369,154,23,C.light);

// 11. Closing reuses the original art as a background by design.
s=slide(true);await img(s,art,0,0,1280,720,'cover');txt(s,'Next carrier\nevaluation',59,70,720,195,66,true,C.ivory);body(s,'Physical device validation\nCarrier inputs and facility review\nMeasured dispatcher and driver use',67,335,615,165,27,C.ivory);body(s,'roadstar-web-739889188415.us-central1.run.app',66,635,1050,40,18,C.ivory);

// 12. Appendix: transaction path with editable nodes/relationships.
s=slide();title(s,'Concurrent approval');body(s,'A stable command key and expected version protect the same intent',67,140,1100,56,26);
const nodes=[txt(s,'Command',68,278,260,52,32,true),txt(s,'Recheck',487,278,267,52,32,true),txt(s,'Commit',920,278,300,52,32,true,C.rust)];link(s,nodes[0],nodes[1],C.rule,4,'right','left');link(s,nodes[1],nodes[2],C.orange,4,'right','left');body(s,'Identity and version\nStable idempotency key',72,379,320,116,25);body(s,'Current availability\nResource exclusion constraints',491,379,349,116,25);body(s,'Atomic reservations\nCommit-ordered events',924,379,303,116,25);body(s,'A stale proposal conflicts before mutation. A repeated key returns its original result.',67,595,1110,66,25);

// 13. Appendix: telemetry rules as clear comparison rows.
s=slide(true);title(s,'Replay and telemetry evidence',1120,true);txt(s,'Replay conditions',65,204,526,60,33,true,C.ivory);txt(s,'Telemetry interpretation',701,204,529,60,33,true,C.ivory);body(s,'Recorded starting conditions\nDisclosed dock wait and road assumptions\nAn independent scenario clock',69,307,513,190,28,C.light);body(s,'Duplicate samples do not double-count\nOut-of-order samples retain history\nUncertain boundaries stay uncertain',704,307,517,190,28,C.light);body(s,'Operational outcomes remain separate from modeled savings.',68,586,1100,60,27,C.ivory);

await fs.mkdir(WORK+'/build/render',{recursive:true});await fs.mkdir(WORK+'/output',{recursive:true});
const candidate=WORK+`/build/candidate-${REV}.pptx`;
await (await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){const preview=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(WORK+`/build/render/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await preview.arrayBuffer()));console.log('Rendered',i+1)}
await fs.writeFile(WORK+`/build/captures-${REV}.json`,JSON.stringify(captures,null,2));
const {finalizePresentation}=await import(SKILL+'/container_tools/artifact_tool_utils.mjs');
await finalizePresentation({workspaceDir:WORK,candidatePath:candidate,finalPath:WORK+`/output/roadstar-precision-${REV}.pptx`,pythonExecutable:RUNTIME+'/python/bin/python',integrityValidatorPath:SKILL+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:SKILL+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','8'],explicitTotalSlideCount:13,requiredNativeTableOwnerSlides:[8],fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,receiptPath:WORK+`/build/validation-${REV}.json`});
console.log('Finalized13 slides',REV);
