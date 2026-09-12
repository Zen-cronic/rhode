import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const pointer='data/native-correction-fixture.json',f=JSON.parse(await readFile(pointer,'utf8')),carrier=f.carrier,dir=f.dir,phase=process.argv[2];
const base='https://roadstar-api-739889188415.us-central1.run.app';
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
async function save(){await writeFile(pointer,JSON.stringify(f,null,2)+'\n');}
async function once(name,path,body,version=1,uid='preview-dispatcher'){f.commands??={};f.commands[name]??={path,body,version,uid,key:randomUUID()};await save();const c=f.commands[name];if(!c.result){c.result=await api(c.path,c.body,c.version,c.key,c.uid);await save();}return c.result;}
if(phase==='prepare'){
 if(!f.ready){
 const initial=await api('state');f.trip=await once('dispatch','dispatch',{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await once('accept','respond',{assignmentId:f.trip.id,action:'accept'},1,'preview-driver-1');const milton=initial.loads.find(l=>l.id==='RS-1042').pickup;
 for(const [id,at,position] of [['arrival','2026-09-13T12:30:00Z',milton],['departure','2026-09-13T15:15:00Z',{...milton,lat:milton.lat+.01}]])await once(id,'telemetry',{id,assignmentId:f.trip.id,at,position,accuracyM:5,odometerKm:1000,speedKph:0,duty:'on_duty',provenance:'synthetic'},1,'preview-simulator');
 const before=await api('state'),visit=before.visits[0],draft=before.invoices.find(i=>i.revision===1);assert.equal(draft.body.amountCents,7500);f.baseline=await once('baseline','approve-invoice',{invoiceId:draft.id,acknowledgeObservedSamples:true,evidenceNote:'Synthetic test setup: baseline GPS and same-stop configured terms reviewed before native correction.'},draft.revision);
 const doc=await once('document','document',{loadId:'RS-1042',mediaType:'application/pdf',kind:'other',filename:'synthetic-milton-dock-ticket.pdf'},before.loads.find(l=>l.id==='RS-1042').version);const bytes=await readFile(sourcePath);f.uploadKey??=randomUUID();await save();if(!f.stored){const r=await fetch(base+'/api/documents/'+doc.id+'/content',{method:'PUT',headers:{...headers(),'Content-Type':'application/pdf','if-match':'1','idempotency-key':f.uploadKey},body:bytes});assert.equal(r.status,200);f.stored=await r.json();await save();}assert.equal(f.stored.sha256,createHash('sha256').update(bytes).digest('hex'));f.visitId=visit.id;f.documentId=doc.id;f.visits=before.visits;f.ready=true;await save();
 }
 let extracted;for(let n=0;n<90;n++){extracted=(await api('state')).documents.find(d=>d.id===f.documentId);if(extracted?.extraction?.model)break;if(n%6===0)console.log('Waiting for existing document worker');await new Promise(r=>setTimeout(r,2000));}assert.equal(extracted?.extraction?.model,'gemini-2.5-flash');f.extraction=extracted.extraction;f.before=await api('visit-time-review?visitId='+f.visitId);await save();console.log('Synthetic source, original GPS and baseline approval ready for native correction');
}else if(phase==='change-source'){
 const review=await api('visit-time-review?visitId='+f.visitId);assert.equal(review.history.length,0);f.changed=await once('source-review','review-document',{documentId:f.documentId,fields:{billNumber:'RS-1042',signedBy:'Synthetic facility desk',observedDate:'2026-09-13',notes:'Page 1 records 12:40 UTC check-in and 15:10 UTC release.'},reason:'Source version changed during native confirmation to verify stale protection.'},review.documents.find(d=>d.id===f.documentId).version);await save();console.log('Source version changed; native confirmation must refuse old evidence');
}else if(phase==='check-stale'){
 const r=await api('visit-time-review?visitId='+f.visitId);assert.equal(r.history.length,0);assert.equal(r.invoices.length,2);f.staleCheckedAt=new Date().toISOString();await save();console.log('No correction or extra invoice after stale native confirmation');
}else if(phase==='finish'){
 const r=await api('visit-time-review?visitId='+f.visitId);assert.equal(r.history.length,1);assert.equal(r.history[0].revision,1);assert.equal(r.invoices.find(i=>i.revision===2).body.amountCents,7500);assert.equal(r.invoices.find(i=>i.revision===3).body.amountCents,5000);assert.deepEqual((await api('state')).visits,f.visits);f.final=r;await save();await writeFile(dir+'/verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),carrier,visitId:f.visitId,sourceSha256:f.stored.sha256,extraction:f.extraction,staleCheckedAt:f.staleCheckedAt,review:r,limits:'Setup, source mutation and API readback use a test harness; correction must be recorded through native UI. See screenshots for actual native scope.'},null,2)+'\n');console.log('One corrected time revision and retained original GPS / CAD75 approval confirmed; new CAD50 draft');
}else throw Error('Use prepare, change-source, check-stale or finish');
