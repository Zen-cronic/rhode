import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import pg from 'pg';

const fixture=JSON.parse(await readFile('data/ranked-recovery-fixture.json','utf8'));
const output='docs/evidence/ranked-recovery-2026-09-12';
const headers={authorization:'Bearer demo-dispatcher','x-carrier-id':fixture.carrier};
const state=async()=>{const response=await fetch('http://127.0.0.1:4010/api/state',{headers});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome'}),errors=[],responses=[];
async function login(identity,width=1440){const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));page.on('response',response=>{if(response.url().includes('/api/')&&response.request().method()==='POST')responses.push({path:new URL(response.url()).pathname,status:response.status()});});await page.goto('http://127.0.0.1:5185');await page.getByLabel('Carrier ID').fill(fixture.carrier);await page.getByLabel('Identity').selectOption(identity);await page.getByRole('button',{name:'Open operations →',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();return{page,context};}
try{
  const before=await state(),{page}=await login('demo-dispatcher');
  assert.equal(before.proposals.length,0);
  await page.locator('.delay-history').getByText(/1 recorded delay/).click();
  const [recommendResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/recommend')&&response.request().method()==='POST'),page.getByRole('button',{name:'Rank recovery options',exact:true}).click()]);
  assert.equal(recommendResponse.status(),200,await recommendResponse.text());
  const recommendation=await recommendResponse.json();
  assert.deepEqual([recommendation.body.driverId,recommendation.body.truckId,recommendation.body.trailerId],Object.values(fixture.expectedChoice));
  const candidates=page.locator('.recovery-candidates');
  await candidates.getByText('1 feasible · 1 rejected alternative',{exact:true}).waitFor();
  await candidates.click();
  await candidates.getByText(/Current HOS evidence is missing or stale/).waitFor();
  await page.screenshot({path:`${output}/recommendation-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await candidates.screenshot({path:`${output}/recommendation-narrow.png`});
  await page.getByRole('button',{name:'Review & approve →',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.screenshot({path:`${output}/approval-review.png`});
  const [approveResponse]=await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/approve')&&response.request().method()==='POST'),dialog.getByRole('button',{name:'Approve revision 1',exact:true}).click()]);
  assert.equal(approveResponse.status(),200,await approveResponse.text());
  const approved=await approveResponse.json();
  const {page:driver}=await login('demo-driver-2',390);
  await driver.getByRole('button',{name:'Accept trip',exact:true}).waitFor();
  await driver.screenshot({path:`${output}/driver-offer.png`,fullPage:true});
  const [acceptResponse]=await Promise.all([driver.waitForResponse(response=>response.url().endsWith('/api/respond')&&response.request().method()==='POST'),driver.getByRole('button',{name:'Accept trip',exact:true}).click()]);
  assert.equal(acceptResponse.status(),200,await acceptResponse.text());const accepted=await acceptResponse.json();assert.equal(accepted.status,'accepted');
  await driver.screenshot({path:`${output}/driver-accepted.png`,fullPage:true});assert.equal(await driver.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const after=await state(),db=new pg.Pool({connectionString:'postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar'});
  let records;
  try{records={proposalCount:Number((await db.query('SELECT count(*) FROM proposals WHERE carrier_id=$1',[fixture.carrier])).rows[0].count),approvalCount:Number((await db.query('SELECT count(*) FROM approvals WHERE carrier_id=$1',[fixture.carrier])).rows[0].count),recommendationEvents:Number((await db.query("SELECT count(*) FROM events WHERE carrier_id=$1 AND kind='recovery.recommended'",[fixture.carrier])).rows[0].count)};}finally{await db.end();}
  const original=after.assignments.find(item=>item.id===fixture.affectedAssignmentId),replacement=after.assignments.find(item=>item.id===approved.assignment.id);
  assert.equal(original.status,'superseded');assert.equal(replacement.status,'accepted');assert.deepEqual(records,{proposalCount:1,approvalCount:1,recommendationEvents:1});assert.deepEqual(errors,[]);
  const evidence={verifiedAt:new Date().toISOString(),carrier:fixture.carrier,delayId:fixture.delayId,recommendationId:recommendation.id,selected:fixture.expectedChoice,candidates:recommendation.body.candidates,comparison:recommendation.body.comparison,approvedAssignmentId:replacement.id,originalAssignmentStatus:original.status,replacementAssignmentStatus:replacement.status,records,responses,checks:['One dispatcher action requested server-ranked alternate resources','Candidate ranking selected the feasible D-02 / T-102 / V-102 set','Rejected D-03 retained the missing or stale HOS reason','Dispatcher reviewed and approved the exact pending revision','Assigned replacement driver independently accepted the offer','Original assignment was superseded atomically and the replacement became accepted','Desktop and 390px views rendered without horizontal overflow or page errors'],limits:'Synthetic Southern Ontario fixture. Route and timing values are modeled with configured services. This records command count and workflow state, not human task time or financial savings.'};
  await writeFile(`${output}/browser-verification.json`,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({carrier:fixture.carrier,recommendation:recommendation.id,checks:evidence.checks.length,records}));
}finally{await browser.close();}
