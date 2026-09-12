import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const carrier='dock-evidence-cloud-20260911';
const base='https://roadstar-api-739889188415.us-central1.run.app';
const web='https://roadstar-web-739889188415.us-central1.run.app';
const dir='docs/evidence/cloud-dock-evidence-2026-09-11';
const sourcePath='docs/evidence/visit-time-review-2026-09-11/synthetic-dock-ticket.pdf';
await mkdir(dir,{recursive:true});
const users=JSON.parse(await readFile('data/preview-credentials.json','utf8'));
const config=Object.fromEntries((await readFile('apps/web/.env.production','utf8')).split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const tokens={};
for(const uid of ['preview-dispatcher','preview-driver-1','preview-driver-2','preview-simulator']){
 const u=users.find(u=>u.uid===uid);
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+config.VITE_FIREBASE_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password,returnSecureToken:true})});
 assert.equal(r.status,200,'Firebase sign-in failed');const result=await r.json();assert.ok(result.idToken);tokens[uid]=result.idToken;
}
function headers(uid='preview-dispatcher',carrierId=carrier){return {authorization:'Bearer '+tokens[uid],'x-carrier-id':carrierId};}
async function api(path,body,version=1,key=randomUUID(),uid='preview-dispatcher'){
 const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...headers(uid),'Content-Type':'application/json','if-match':String(version),'idempotency-key':key},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
}
let f;
try{f=JSON.parse(await readFile('/tmp/roadstar-cloud-dock-fixture.json','utf8'));assert.equal(f.carrier,carrier);}catch(e){
 if(e.code!=='ENOENT')throw e;
 const initial=await api('state');assert.equal(initial.assignments.length,0,'Use a fresh synthetic carrier; do not replay setup over existing operations');
 const trip=await api('dispatch',{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});
 await api('respond',{assignmentId:trip.id,action:'accept'},1,randomUUID(),'preview-driver-1');
 const milton=initial.loads.find(l=>l.id==='RS-1042').pickup;
 assert.ok(milton?.lat,'Source load requires a fixture location');
 for(const [id,at,position] of [['arrival','2026-09-13T12:30:00Z',milton],['departure','2026-09-13T15:15:00Z',{...milton,lat:milton.lat+.01}]])await api('telemetry',{id,assignmentId:trip.id,at,position,accuracyM:5,odometerKm:1000,speedKph:0,duty:'on_duty',provenance:'synthetic'},1,randomUUID(),'preview-simulator');
 const before=await api('state'),visit=before.visits[0],draft=before.invoices[0];assert.equal(draft.body.amountCents,7500);
 assert.equal(visit.session_policy,'confidence-disk-split-v1');
 const approved=await api('approve-invoice',{invoiceId:draft.id,acknowledgeObservedSamples:true,evidenceNote:'Synthetic baseline review of the original GPS samples and configured same-stop contract terms.'},draft.revision);
 const doc=await api('document',{loadId:'RS-1042',mediaType:'application/pdf',kind:'other',filename:'synthetic-milton-dock-ticket.pdf'},before.loads.find(l=>l.id==='RS-1042').version);
 const bytes=await readFile(sourcePath),upload=await fetch(base+'/api/documents/'+doc.id+'/content',{method:'PUT',headers:{...headers(),'Content-Type':'application/pdf','if-match':'1','idempotency-key':randomUUID()},body:bytes});
 assert.equal(upload.status,200);const stored=await upload.json();assert.equal(stored.sha256,createHash('sha256').update(bytes).digest('hex'));
 f={carrier,assignmentId:trip.id,visitId:visit.id,documentId:doc.id,baselineApprovedId:approved.id,baselineAmountCents:approved.amountCents,visits:before.visits,resources:before.resources,tracking:(await api('tracking?assignmentId='+trip.id)).points};
 await writeFile('/tmp/roadstar-cloud-dock-fixture.json',JSON.stringify(f,null,2));
}
// Let the existing Scheduler/Tasks worker finish before binding the reviewed document version.
let extracted;
for(let n=0;n<90;n++){
 const state=await api('state');extracted=state.documents.find(d=>d.id===f.documentId);
 if(extracted?.extraction?.model)break;
 if(n%6===0)console.log('Waiting for the existing document extraction job');
 await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.equal(extracted?.extraction?.model,'gemini-2.5-flash','Cloud extraction must complete before source-version review');
const driverDenied=await fetch(base+'/api/visit-time-review?visitId='+f.visitId,{headers:headers('preview-driver-1')});assert.equal(driverDenied.status,403);
const wrongDriver=await fetch(base+'/api/documents/'+f.documentId+'/content',{headers:headers('preview-driver-2')});assert.equal(wrongDriver.status,403);
const otherCarrier=await fetch(base+'/api/documents/'+f.documentId+'/content',{headers:headers('preview-dispatcher','retrospective-cloud-20260911')});assert.equal(otherCarrier.status,404);
assert.equal((await api('visit-time-review?visitId='+f.visitId)).history.length,0,'This carrier already has a reviewed correction. Inspect retained proof or provision a fresh synthetic fixture; do not rewrite its source review.');
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome'}),errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(String(e)));await page.goto(web);await page.getByLabel('Carrier ID').fill(f.carrier);const user=users.find(u=>u.uid==='preview-dispatcher');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Open operations →'}).click();await page.getByRole('button',{name:'Evidence & billing',exact:true}).click();await page.getByText('Document & GPS time conflicts',{exact:true}).click();await page.getByLabel('Correction visit').selectOption(f.visitId);await page.getByRole('button',{name:'Review documented dock times',exact:true}).click();
 await page.getByLabel('Supporting shipment document').selectOption(f.documentId);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download source for review',exact:true}).click();const download=await downloaded;const bytes=await readFile(await download.path());assert.deepEqual(bytes,await readFile(sourcePath));
 // A real document review changes its version while the correction dialog is open.
 await api('review-document',{documentId:f.documentId,fields:{billNumber:'RS-1042',signedBy:'Synthetic facility desk',observedDate:'2026-09-13',notes:'Page 1: check-in 12:40 UTC; dock release 15:10 UTC.'},reason:'Reviewed the synthetic dock ticket source before selecting billing times.'},(await api('visit-time-review?visitId='+f.visitId)).documents.find(d=>d.id===f.documentId).version);
 await page.getByRole('dialog').getByText('Evidence changed. Close and review the latest source and invoice history.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Record correction & prepare draft',exact:true}).isEnabled(),false);await page.getByRole('dialog').screenshot({path:dir+'/stale-review.png'});await page.getByLabel('Close dialog',{exact:true}).click();await page.getByRole('button',{name:'Review documented dock times',exact:true}).click();await page.getByLabel('Supporting shipment document').selectOption(f.documentId);await page.getByLabel('Reviewed arrival (UTC)',{exact:true}).fill('2026-09-13T12:40');await page.getByLabel('Reviewed departure (UTC)',{exact:true}).fill('2026-09-13T15:10');await page.getByLabel('Document evidence note',{exact:true}).fill('Page 1: the synthetic facility desk ticket identifies RS-1042 at Milton yard, check-in 12:40 UTC and release 15:10 UTC.');await page.getByLabel('Why these times supersede GPS',{exact:true}).fill('The facility GPS observations include yard time before dock check-in and after release; the reviewed ticket supplies dock service times.');await page.getByRole('checkbox').check();await page.getByRole('dialog').screenshot({path:dir+'/correction-review.png'});await page.getByRole('button',{name:'Record correction & prepare draft',exact:true}).click();await page.getByText('Document times recorded. Review the new detention draft separately; original GPS and prior invoices remain unchanged.',{exact:true}).waitFor();
 const commands=await page.evaluate(scope=>JSON.parse(localStorage.getItem('roadstar:commands:'+scope)),f.carrier+':preview-dispatcher'),command=commands.find(c=>c.path==='correct-visit-times');assert.ok(command);const retry=await api(command.path,command.body,command.version,command.id);assert.equal(retry.revision,1);let review=await api('visit-time-review?visitId='+f.visitId);assert.equal(review.history.length,1);assert.equal(review.invoices.at(-1).revision,3);assert.equal(review.invoices.at(-1).body.amountCents,5000);assert.equal(review.invoices.find(i=>i.id===f.baselineApprovedId).body.amountCents,7500);
 await page.getByRole('button',{name:'Review invoice approval',exact:true}).click();await page.getByRole('dialog').getByText('Document times supersede GPS times for this billing draft.',{exact:true}).waitFor();await page.getByRole('dialog').screenshot({path:dir+'/invoice-review.png'});await page.getByRole('checkbox').check();await page.getByLabel('Evidence review note',{exact:true}).fill('Reviewed original GPS, the stored synthetic dock ticket, corrected times, same-stop identity and the configured free-time allowance.');await page.getByRole('button',{name:'Approve billing revision 3',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});review=await api('visit-time-review?visitId='+f.visitId);assert.equal(review.invoices.at(-1).revision,4);assert.equal(review.invoices.at(-1).status,'approved');assert.equal(review.invoices.at(-1).body.precision,'reviewed_document_times');assert.equal(review.invoices.at(-1).body.amountCents,5000);
 await page.getByText('Correction and invoice history · 1 time revision',{exact:true}).click();const panel=page.locator('details.panel').filter({has:page.getByText('Document & GPS time conflicts',{exact:true})});await panel.getByText('approved invoice revision 4',{exact:false}).waitFor();await panel.screenshot({path:dir+'/history-desktop.png'});await page.setViewportSize({width:390,height:1000});await panel.screenshot({path:dir+'/history-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.context().setOffline(true);await panel.getByText('Offline. Reconnect before reviewing current source evidence.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Review documented dock times',exact:true}).isEnabled(),false);await panel.screenshot({path:dir+'/offline-mobile.png'});await page.context().setOffline(false);
 const state=await api('state');assert.deepEqual(state.visits,f.visits);assert.deepEqual(state.resources,f.resources);assert.deepEqual((await api('tracking?assignmentId='+f.assignmentId)).points,f.tracking);assert.deepEqual(errors,[]);await writeFile(dir+'/verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),carrier:f.carrier,assignmentId:f.assignmentId,visitId:f.visitId,sourceDocumentId:f.documentId,extraction:extracted.extraction,sourceSha256:createHash('sha256').update(bytes).digest('hex'),correction:review.history[0],invoiceRevisions:review.invoices.map(i=>({id:i.id,revision:i.revision,status:i.status,amountCents:i.body.amountCents,precision:i.body.precision})),errors,checks:['Firebase-authenticated upload to Cloud Storage and source PDF download byte-for-byte','Vertex extraction completed before source version review','driver correction read and unrelated driver/source carrier access denied','document version change disables open correction review','dispatcher records document/GPS conflict with source note and reason','exact correction retry creates no extra revision','separate invoice approval preserves corrected precision','API tracking observations, visits, resources and prior $75 approval unchanged','new $50 approval retained with all four invoice revisions','desktop/narrow/offline history verified without overflow'],limits:'Deployed Firebase API, Cloud SQL migrations018/019, Cloud Storage, document worker and built web verified. Native billing UI remains pending; database raw rows were not directly compared in this hosted check. Document times are dispatcher-reviewed source claims, not certified physical timestamps. No payment or source rewriting.'},null,2)+'\n');console.log('Document-time correction and separate billing approval verified');
}finally{await browser.close();}
