import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const fixture=JSON.parse(await readFile('data/complete-replay-fixture.json','utf8'));
const checkpoint=JSON.parse(await readFile(`data/simulator/${fixture.run.id}.json`,'utf8')).run;
const output='docs/evidence/3d-corridor-2026-09-12';
const api='http://127.0.0.1:4010';
const headers={authorization:'Bearer demo-dispatcher','x-carrier-id':fixture.carrier};
const get=async path=>{const response=await fetch(api+path,{headers});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
await mkdir(output,{recursive:true});
const beforeState=await get('/api/state'),beforeInventory=await get('/api/simulator');
const beforeRun=beforeInventory.runs.find(run=>run.run_id===fixture.run.id);
assert.ok(beforeRun?.paused);
const firstSource=await get(`/api/simulator/${fixture.run.id}/presentation?offset=0&limit=1000`);
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1050}});
const page=await context.newPage(),errors=[],writes=[],requests=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>{requests.push({method:request.method(),url:request.url()});if(request.url().includes('/api/')&&request.method()!=='GET')writes.push(request.url());});
async function login(target=page){
 await target.goto('http://127.0.0.1:5184');
 await target.getByLabel('Carrier ID').fill(fixture.carrier);
 await target.getByLabel('Identity').selectOption('demo-dispatcher');
 await target.getByRole('button',{name:'Open operations →'}).click();
 await target.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 await target.getByText('Simulation studio · local synthetic runs',{exact:true}).click();
 await target.getByLabel('Simulation run').selectOption(fixture.run.id);
}
try{
 await login();
 assert.equal(requests.filter(entry=>/CorridorScene-.*\.js/.test(entry.url)).length,0);
 await page.getByRole('button',{name:'Open 3D corridor replay',exact:true}).click();
 const panel=page.getByRole('region',{name:'Recorded corridor replay'});
 await panel.getByText('Assembling one frozen recording',{exact:true}).waitFor();
 await panel.screenshot({path:`${output}/loading-desktop.png`});
 await panel.getByText('10,201 / 10,201 source events',{exact:true}).waitFor({timeout:20000});
 await panel.locator('canvas').waitFor();
 await page.waitForTimeout(700);
 assert.equal(requests.filter(entry=>/CorridorScene-.*\.js/.test(entry.url)).length,1);
 assert.equal(await panel.getByText(/CAD\$|On-duty headroom|Provisional detention/).count(),0);
 await panel.screenshot({path:`${output}/origin-perspective-desktop.png`});

 await panel.getByRole('button',{name:/Movement/}).click();
 await panel.locator('.corridor-primary-readout strong').getByText('02:45:01',{exact:true}).waitFor();
 await panel.locator('.corridor-instrument').getByText('68.6',{exact:true}).waitFor();
 await panel.locator('.corridor-instrument').getByText('0.019',{exact:true}).waitFor();
 await panel.locator('details.corridor-source').evaluate(element=>element.open=true);
 await panel.getByLabel(`Observation ${checkpoint.events[9901].id}`,{exact:true}).waitFor();
 await panel.screenshot({path:`${output}/movement-perspective-desktop.png`});
 await panel.getByRole('button',{name:'Plan',exact:true}).click();
 await page.waitForTimeout(600);
 await panel.screenshot({path:`${output}/movement-plan-desktop.png`});

 const timeline=panel.getByLabel('Recorded observation timeline');
 const beforePlay=Number(await timeline.inputValue());
 await panel.getByRole('button',{name:'Play view playback',exact:true}).click();
 await page.waitForTimeout(650);
 await panel.getByRole('button',{name:'Pause view playback',exact:true}).click();
 assert.ok(Number(await timeline.inputValue())>beforePlay);
 await timeline.focus();
 await page.keyboard.press('End');assert.equal(Number(await timeline.inputValue()),10200);
 await page.keyboard.press('ArrowLeft');assert.equal(Number(await timeline.inputValue()),10199);
 await page.keyboard.press('Home');assert.equal(Number(await timeline.inputValue()),0);
 await page.keyboard.press('ArrowRight');assert.equal(Number(await timeline.inputValue()),1);
 await page.emulateMedia({reducedMotion:'reduce'});
 await panel.getByText(/Reduced motion is on/).waitFor();
 assert.equal(await panel.getByRole('button',{name:'Play view playback',exact:true}).isDisabled(),true);

 const requestsBeforeRevision=requests.filter(entry=>entry.method==='GET'&&entry.url.includes(`/api/simulator/${fixture.run.id}/presentation?`)).length;
 let revisedInventoryReads=0;
 await page.route('**/api/simulator',async route=>{
  const response=await route.fetch(),body=await response.json(),target=body.runs.find(run=>run.run_id===fixture.run.id);
  if(target){target.event_count+=1;target.conditions_hash='c'.repeat(64);revisedInventoryReads+=1;}
  await route.fulfill({response,json:body});
 });
 for(let attempt=0;attempt<24&&requests.filter(entry=>entry.method==='GET'&&entry.url.includes(`/api/simulator/${fixture.run.id}/presentation?`)).length===requestsBeforeRevision;attempt++)await page.waitForTimeout(250);
 assert.ok(revisedInventoryReads>0);
 assert.ok(requests.filter(entry=>entry.method==='GET'&&entry.url.includes(`/api/simulator/${fixture.run.id}/presentation?`)).length>requestsBeforeRevision);
 await panel.getByText('10,201 / 10,201 source events',{exact:true}).waitFor({timeout:20000});
 await page.unroute('**/api/simulator');

 await page.setViewportSize({width:390,height:960});
 await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await panel.screenshot({path:`${output}/event-narrow.png`});
 await context.setOffline(true);
 await panel.getByText(/Offline · saved recording/).waitFor();
 assert.equal(await timeline.isEnabled(),true);
 await panel.screenshot({path:`${output}/offline-narrow.png`});
 await context.setOffline(false);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await panel.getByRole('button',{name:'Use diagram',exact:true}).click();
 await panel.getByRole('img',{name:/Recorded route diagram/}).waitFor();
 await panel.screenshot({path:`${output}/diagram-narrow.png`});
 await panel.getByRole('button',{name:'Show 3D',exact:true}).click();
 await panel.locator('canvas').waitFor();
 await page.waitForTimeout(500);
 await panel.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2');if(!gl)throw Error('WebGL2 not initialized');const extension=gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context loss extension unavailable');extension.loseContext();});
 await panel.getByRole('img',{name:/Recorded route diagram/}).waitFor();
 await panel.screenshot({path:`${output}/context-loss-narrow.png`});

 await panel.getByRole('button',{name:'Close replay',exact:true}).click();
 let acceptedStalePage=false;
 await page.route('**/api/simulator/*/presentation?*',async route=>{
  const offset=new URL(route.request().url()).searchParams.get('offset');
  if(offset==='0'){
   acceptedStalePage=true;
   const response=await route.fetch();
   await route.fulfill({response});
   return;
  }
  await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'SIMULATOR_CONTROL',message:'Recording changed'}})});
 });
 await page.getByRole('button',{name:'Open 3D corridor replay',exact:true}).click();
 await panel.getByText('Recording not assembled',{exact:true}).waitFor();
 assert.equal(acceptedStalePage,true);
 assert.equal(await panel.getByText(/Partial pages were discarded/).count(),1);
 await panel.screenshot({path:`${output}/stale-recording-narrow.png`});
 await page.unroute('**/api/simulator/*/presentation?*');
 await page.route('**/api/simulator/*/presentation?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...firstSource,events:[],total:0,offset:0,next_offset:null})}));
 await panel.getByRole('button',{name:'Reload from first page',exact:true}).click();
 await panel.getByText('No acknowledged observations',{exact:true}).waitFor();
 await page.unroute('**/api/simulator/*/presentation?*');

 const epochKey='f'.repeat(64),epochSnapshot='e'.repeat(64);
 const epochRoute={...firstSource.routes[0],key:epochKey,ordinal:1,after_seconds:1,revision_id:'browser-epoch-fixture',revision:2,geometry:{type:'LineString',coordinates:[[-81.200091,42.990168],[-81.19,42.995],[-81.175978,42.986959]]},stop_indices:[0,2]};
 const epochEvents=[structuredClone(firstSource.events[0]),structuredClone(firstSource.events[1])];
 epochEvents[1]={...epochEvents[1],route_key:epochKey,elapsed_seconds:1,sample:{...epochEvents[1].sample,id:'d'.repeat(64),position:{lat:42.995,lng:-81.19}}};
 const epochPage={...firstSource,routes:[firstSource.routes[0],epochRoute],events:epochEvents,snapshot:epochSnapshot,total:2,offset:0,next_offset:null};
 await page.route('**/api/simulator/*/presentation?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(epochPage)}));
 await panel.getByRole('button',{name:'Check again',exact:true}).click();
 await panel.getByText('2 / 2 source events',{exact:true}).waitFor();
 await panel.getByText(/Epoch 01/).first().waitFor();
 await panel.getByLabel('Recorded observation timeline').focus();
 await page.keyboard.press('End');
 await panel.getByText(/Epoch 02/).first().waitFor();
 await panel.screenshot({path:`${output}/epoch-switch-narrow.png`});
 await page.unroute('**/api/simulator/*/presentation?*');

 const offlinePage=await context.newPage();
 await login(offlinePage);await context.setOffline(true);
 await offlinePage.getByRole('button',{name:'Open 3D corridor replay',exact:true}).click();
 await offlinePage.getByText('Recording unavailable offline',{exact:true}).waitFor();
 await context.setOffline(false);await offlinePage.close();

 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 const afterState=await get('/api/state'),afterInventory=await get('/api/simulator'),afterRun=afterInventory.runs.find(run=>run.run_id===fixture.run.id);
 for(const key of ['assignments','visits','invoices','proposals','resources','scenarios'])assert.deepEqual(afterState[key],beforeState[key]);
 assert.deepEqual({event_count:afterRun.event_count,state_hash:afterRun.state_hash,conditions_hash:afterRun.conditions_hash,paused:afterRun.paused},{event_count:beforeRun.event_count,state_hash:beforeRun.state_hash,conditions_hash:beforeRun.conditions_hash,paused:beforeRun.paused});
 const pages=requests.filter(entry=>entry.method==='GET'&&entry.url.includes(`/api/simulator/${fixture.run.id}/presentation?`));
 const proof={verifiedAt:new Date().toISOString(),carrier:fixture.carrier,runId:fixture.run.id,recordingSnapshot:firstSource.snapshot,samples:checkpoint.events.length,sourceEventHash:hash(checkpoint.events),routeCoordinates:firstSource.routes[0].geometry.coordinates.length,presentationRequests:pages.length,errors,writes,checks:['Built renderer lazy-loads only after explicit open','All 10201 acknowledged events assemble before playback','Movement milestone displays exact sample 9901 time, speed, odometer and ID','View-only play/pause, exact slider, Home/End/Arrow stepping and Perspective/Plan cameras','A changed inventory event count/conditions hash clears and reloads the displayed recording','Reduced motion disables automatic playback','390px layout has no document overflow','Completed recording remains available offline; offline-before-load stays explicit','Manual diagram and WebGL context-loss fallbacks','A continuation-page conflict discards an already accepted first page','A labeled two-epoch browser fixture swaps the rendered route epoch at the exact cursor boundary','Empty-recording and offline-before-load states stay explicit','No operational POST; assignments, visits, invoices, proposals, resources, scenarios and simulator state unchanged'],limits:'Local synthetic complete replay with software WebGL. Facility HOS/detention remain separate current-state evidence. Inventory revision, continuation conflict, route-epoch transition and empty UI states use labeled browser response fixtures; deterministic route binding is also covered by server/model tests. No physical GPU, hosted control, native 3D or 131-driver rendering claim.'};
 await writeFile(`${output}/verification.json`,JSON.stringify(proof,null,2)+'\n');
 console.log(JSON.stringify({samples:proof.samples,routeCoordinates:proof.routeCoordinates,presentationRequests:proof.presentationRequests,writes:writes.length,errors:errors.length}));
}finally{await browser.close();}
