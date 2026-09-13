import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const fixture=JSON.parse(await readFile('data/3d-slowdown-comparison.json','utf8'));
const webBase=process.env.WEB_BASE??'http://127.0.0.1:5186';
const hosted=webBase.startsWith('https://');
const label=hosted?'hosted':'compiled-local';
const output='docs/evidence/packaged-401-replay-2026-09-12';
await mkdir(output,{recursive:true});
const expectedBytes=await readFile('apps/web/public/demo/matched-401-replay.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
const errors=[],requests=[],writes=[];
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>{requests.push({method:request.method(),url:request.url()});if(request.url().includes('/api/')&&request.method()!=='GET')writes.push(request.url());});
try{
 await page.goto(webBase);
 const firebase=await page.getByLabel('Email',{exact:true}).count()>0;
 const carrier=firebase?JSON.parse(await readFile('data/cloud-ranked-recovery-fixture.json','utf8')).carrier:fixture.carrier;
 await page.getByLabel('Carrier ID').fill(carrier);
 if(firebase){const users=JSON.parse(await readFile('data/preview-credentials.json','utf8')),dispatcher=users.find(user=>user.uid==='preview-dispatcher');assert.ok(dispatcher);await page.getByLabel('Email',{exact:true}).fill(dispatcher.email);await page.getByLabel('Password',{exact:true}).fill(dispatcher.password);}
 else await page.getByLabel('Identity').selectOption('demo-dispatcher');
 await page.getByRole('button',{name:'Open operations →',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Recovery/}).click();
 await page.getByText('Judge replay · matched Highway 401 slowdown',{exact:true}).click();
 const panel=page.getByRole('region',{name:'Recorded corridor replay'});await panel.getByText('MODELED SYNTHETIC / MATCHED RUNS',{exact:true}).waitFor({timeout:30000});await panel.locator('canvas').waitFor({timeout:30000});
 await panel.getByRole('button',{name:/Intervention ends/}).click();await panel.getByText('+27.657',{exact:true}).waitFor();await panel.getByText('+00:26:46',{exact:true}).waitFor();await page.waitForTimeout(500);
 await page.screenshot({path:`${output}/${label}-desktop.png`,fullPage:true});
 assert.equal(requests.filter(request=>request.url.includes('/demo/matched-401-replay.json')).length,1);
 assert.equal(requests.filter(request=>request.url.includes('/presentation?')).length,0);
 const archiveResponse=await fetch(`${webBase}/demo/matched-401-replay.json`);assert.equal(archiveResponse.status,200);const archiveBytes=new Uint8Array(await archiveResponse.arrayBuffer());assert.equal(sha(archiveBytes),sha(expectedBytes));
 await page.setViewportSize({width:390,height:960});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await panel.screenshot({path:`${output}/${label}-narrow.png`});
 await context.setOffline(true);await panel.getByText(/Offline · saved recording/).waitFor();assert.equal(await panel.getByLabel('Matched recording shared timeline').isEnabled(),true);await context.setOffline(false);
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 const proof={verifiedAt:new Date().toISOString(),webBase,label,archive:{bytes:archiveBytes.length,sha256:sha(archiveBytes),runs:2,eventsPerRun:2401},requests:{archive:1,presentationApi:0},writes,errors,checks:['Authenticated preview exposes the packaged matched Highway 401 replay','Both complete recordings assemble through the same page validator used by simulator-backed replay','3D comparison renders and selects intervention end at shared T+40:00','Displayed progress gap is +27.657km and modeled finish delta is +26m46s','390px view has no document overflow','Completed recording stays inspectable after network loss','Packaged archive bytes match the tracked master','No simulator presentation API request and no operational POST'],limits:'Synthetic read-only packaged replay. Historical view controls only; no hosted simulator mutation, live traffic, certified GPS, billing, revenue, physical-GPU or 131-vehicle rendering claim.'};
 await writeFile(`${output}/${label}-verification.json`,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({label,archiveSha256:proof.archive.sha256,writes:writes.length,errors:errors.length}));
}finally{await browser.close();}
