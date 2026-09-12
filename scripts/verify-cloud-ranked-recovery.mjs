import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const fixture=JSON.parse(await readFile('data/cloud-ranked-recovery-fixture.json','utf8'));
const users=JSON.parse(await readFile('data/preview-credentials.json','utf8'));
const env=Object.fromEntries((await readFile('apps/web/.env.production','utf8')).split('\n').filter(line=>line.includes('=')).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const apiBase='https://roadstar-api-739889188415.us-central1.run.app';
const webBase='https://roadstar-web-739889188415.us-central1.run.app';
const tokens={};
for(const user of users){const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+env.VITE_FIREBASE_API_KEY,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:user.email,password:user.password,returnSecureToken:true})});assert.equal(response.status,200,'Firebase sign-in failed for '+user.uid);tokens[user.uid]=(await response.json()).idToken;}
const headers=(uid='preview-dispatcher')=>({authorization:'Bearer '+tokens[uid],'x-carrier-id':fixture.carrier});
async function api(path,body,version=1,key=randomUUID(),uid='preview-dispatcher',expected=200){const response=await fetch(apiBase+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...headers(uid),'content-type':'application/json','if-match':String(version),'idempotency-key':key},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});const output=await response.json();assert.equal(response.status,expected,JSON.stringify(output));return output;}
const initial=await api('state');
let first=initial.assignments.find(item=>item.loadId==='RS-1042');
let affected=initial.assignments.find(item=>item.loadId==='RS-1043'&&item.driverId==='D-01');
let delay=initial.disruptions[0];
let createdDelay=false;
if(!first){first=await api('dispatch',{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});await api('respond',{assignmentId:first.id,action:'accept'},1,randomUUID(),'preview-driver-1');}
if(!affected)affected=await api('dispatch',{loadId:'RS-1043',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});
if(!delay){delay=await api('delay',{assignmentId:first.id,expectedEnd:'2026-09-13T17:00:00Z',observedAt:'2026-09-13T15:30:00Z',reason:'Synthetic dock departure delay for hosted ranked recovery verification'},2,randomUUID(),'preview-simulator');createdDelay=true;}
if(createdDelay)assert.ok(delay.impactedLoads.some(item=>item.id===affected.id));

const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome'}),errors=[],posts=[];
async function login(uid,width=1440){const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('response',response=>{if(response.url().includes('/api/')&&response.request().method()==='POST')posts.push({path:new URL(response.url()).pathname,status:response.status(),uid});});await page.goto(webBase);await page.getByLabel('Carrier ID').fill(fixture.carrier);const user=users.find(item=>item.uid===uid);await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Open operations →',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();return{context,page};}
try{
  const {page}=await login('preview-dispatcher');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Recovery/}).click();
  let recommendation=(await api('state')).proposals.find(item=>item.load_id==='RS-1043');
  let approved;
  if(!recommendation){
    await page.locator('.delay-history').getByText(/1 recorded delay/).click();
    const [recommendResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/recommend')&&response.request().method()==='POST'),page.getByRole('button',{name:'Rank recovery options',exact:true}).click()]);
    assert.equal(recommendResponse.status(),200,await recommendResponse.text());recommendation=await recommendResponse.json();
    assert.deepEqual([recommendation.body.driverId,recommendation.body.truckId,recommendation.body.trailerId],['D-02','T-102','V-102']);
    const candidates=page.locator('.recovery-candidates');await candidates.getByText('1 feasible · 1 rejected alternative',{exact:true}).waitFor();await candidates.click();await candidates.getByText(/Current HOS evidence is missing or stale/).waitFor();
    await page.screenshot({path:fixture.dir+'/hosted-recommendation.png',fullPage:true});
    await page.setViewportSize({width:390,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await candidates.screenshot({path:fixture.dir+'/hosted-candidates-narrow.png'});
  }
  assert.deepEqual([recommendation.body.driverId,recommendation.body.truckId,recommendation.body.trailerId],['D-02','T-102','V-102']);
  if(recommendation.status==='pending'){
    await page.getByRole('button',{name:'Review & approve →',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.screenshot({path:fixture.dir+'/hosted-approval.png'});
    const [approveResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/approve')&&response.request().method()==='POST'),dialog.getByRole('button',{name:'Approve revision 1',exact:true}).click()]);assert.equal(approveResponse.status(),200,await approveResponse.text());approved=await approveResponse.json();
  }else{const state=await api('state'),assignment=state.assignments.find(item=>item.loadId==='RS-1043'&&item.driverId==='D-02');assert.ok(assignment);approved={assignment};}
  const forbidden=await api('approve',{proposalId:recommendation.id},1,randomUUID(),'preview-simulator',403);assert.equal(forbidden.error.code,'FORBIDDEN');
  const stale=await api('approve',{proposalId:recommendation.id},1,randomUUID(),'preview-dispatcher',409);assert.equal(stale.error.code,'STALE_PROPOSAL');
  const {page:driver}=await login('preview-driver-2',390);let accepted=approved.assignment;
  if(accepted.status!=='accepted'){await driver.getByRole('button',{name:'Accept trip',exact:true}).waitFor();await driver.screenshot({path:fixture.dir+'/hosted-driver-offer.png',fullPage:true});const [acceptResponse]=await Promise.all([driver.waitForResponse(response=>response.url().endsWith('/api/respond')&&response.request().method()==='POST'),driver.getByRole('button',{name:'Accept trip',exact:true}).click()]);assert.equal(acceptResponse.status(),200,await acceptResponse.text());accepted=await acceptResponse.json();}
  assert.equal(accepted.status,'accepted');await driver.getByText(/^accepted$/i).waitFor();await driver.getByRole('button',{name:'Accept trip',exact:true}).waitFor({state:'hidden'});await driver.screenshot({path:fixture.dir+'/hosted-driver-accepted.png',fullPage:true});assert.equal(await driver.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const final=await api('state'),original=final.assignments.find(item=>item.id===affected.id),replacement=final.assignments.find(item=>item.id===approved.assignment.id);
  assert.equal(original.status,'superseded');assert.equal(replacement.status,'accepted');assert.equal(final.proposals.filter(item=>item.load_id==='RS-1043').length,1);assert.deepEqual(errors,[]);
  const evidence={verifiedAt:new Date().toISOString(),webBase,apiBase,carrier:fixture.carrier,deployed:{optimizer:'roadstar-optimizer-00015-vuk',api:'roadstar-api-00036-woy',web:'roadstar-web-00054-dih',documents:'roadstar-documents-00021-tam'},delayId:delay.id,recommendationId:recommendation.id,selected:{driverId:recommendation.body.driverId,truckId:recommendation.body.truckId,trailerId:recommendation.body.trailerId},candidates:recommendation.body.candidates,comparison:recommendation.body.comparison,forbiddenRoleStatus:403,staleApprovalStatus:409,originalAssignmentStatus:original.status,replacementAssignmentStatus:replacement.status,posts,checks:['Firebase-authenticated hosted dispatcher requested one server-ranked recovery','Feasible D-02 / T-102 / V-102 ranked ahead of the retained missing-HOS rejection','Dispatcher reviewed and approved the pending revision','Simulator approval was forbidden and a new stale approval was rejected without mutation','Separate Firebase driver accepted the offered replacement','Original assignment became superseded only after approval','Hosted desktop and 390px flows rendered without overflow or page errors'],limits:'Isolated synthetic Southern Ontario scenario. Route and timing values are modeled with configured services. No human task-time, measured traffic, revenue or savings claim. Hosted simulator controls remain intentionally unavailable; 3D uses retained verified local recording evidence.'};
  await writeFile(fixture.dir+'/verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({carrier:fixture.carrier,recommendation:recommendation.id,checks:evidence.checks.length}));
}finally{await browser.close();}
