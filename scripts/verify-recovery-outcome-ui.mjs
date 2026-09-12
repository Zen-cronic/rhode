import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const fixture=JSON.parse(await readFile('docs/evidence/complete-replay-2026-09-12/verification.json','utf8'));
const output='docs/evidence/recovery-outcome-2026-09-12';
const headers={authorization:'Bearer demo-dispatcher','x-carrier-id':fixture.carrier};
const state=async()=>{const response=await fetch('http://127.0.0.1:4010/api/state',{headers});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
const operational=value=>{const {serverTime,...stable}=value;return stable;};
await mkdir(output,{recursive:true});
const before=await state(),browser=await chromium.launch({executablePath:'/usr/bin/google-chrome'}),context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[],writes=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>{if(request.url().includes('/api/')&&request.method()!=='GET')writes.push({method:request.method(),url:request.url()});});
try{
  await page.goto('http://127.0.0.1:5185');
  await page.getByLabel('Carrier ID').fill(fixture.carrier);
  await page.getByLabel('Identity').selectOption('demo-dispatcher');
  await page.getByRole('button',{name:'Open operations →',exact:true}).click();
  const receipt=page.getByRole('region',{name:'Modeled recovery payoff'});
  await receipt.getByText('Pickup window recovered',{exact:true}).waitFor();
  for(const value of ['123 min recovered','123 min earlier','0.0 km','123 min late → on time'])await receipt.getByText(value,{exact:true}).waitFor();
  await receipt.getByText(/financial impact is not calculated/).waitFor();
  await receipt.screenshot({path:`${output}/receipt-desktop.png`});
  await page.setViewportSize({width:390,height:960});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await receipt.screenshot({path:`${output}/receipt-narrow.png`});
  await context.setOffline(true);
  await page.getByText('You are offline. Displayed records may be stale. Review pending actions after reconnecting.',{exact:true}).waitFor();
  await receipt.getByText('123 min recovered',{exact:true}).waitFor();
  await receipt.screenshot({path:`${output}/receipt-offline.png`});
  await context.setOffline(false);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);assert.deepEqual(operational(await state()),operational(before));
  const evidence={verifiedAt:new Date().toISOString(),carrier:fixture.carrier,proposal:before.proposals.find(proposal=>proposal.body?.comparison)?.id,sourceComparison:fixture.comparison,displayed:{pickupMinutesRecovered:123,completionMinutesEarlier:123,addedDeadheadKm:0,financialImpact:'not calculated'},checks:['Built artifact derives the displayed outcome from the retained current and proposed screening timestamps','Pickup lateness changes from123minutes to on time','Modeled completion moves123rounded minutes earlier','Replacement adds zero modeled deadhead in this scenario','Financial impact remains explicitly uncalculated because shipment revenue is absent','Desktop,390px and saved-offline receipt states render without horizontal overflow','Read-only verification sends no operational commands and leaves the carrier state byte-equivalent'],errors,writes,limits:'Synthetic same-window comparison with Valhalla modeled travel and service times. Rounded minute display is presentation only; exact timestamps remain in source evidence. No human task-time, revenue, margin, live ETA or collected-savings claim.'};
  await writeFile(`${output}/browser-verification.json`,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({carrier:fixture.carrier,proposal:evidence.proposal,checks:evidence.checks.length}));
}finally{await browser.close();}
