import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {access,mkdir,writeFile} from 'node:fs/promises';

const project='roadstar-2026-kzh',region='us-central1';
const carrier=`ranked-recovery-cloud-${randomUUID()}`;
const pointer='data/cloud-ranked-recovery-fixture.json';
try{await access(pointer);throw Error('Existing cloud ranked-recovery fixture pointer: inspect it before preparing another carrier.');}catch(error){if(error.code!=='ENOENT')throw error;}
const image=execFileSync('gcloud',['run','services','describe','roadstar-api','--project='+project,'--region='+region,'--format=value(spec.template.spec.containers[0].image)'],{encoding:'utf8'}).trim();
if(!image.includes('/roadstar/api@sha256:'))throw Error('Expected a pinned deployed API image.');
const code=`import {pool,migrate} from './services/api/src/db.ts';import {Store} from './services/api/src/store.ts';const db=pool();try{await migrate(db);const store=new Store(db),carrier=${JSON.stringify(carrier)};if((await db.query('SELECT 1 FROM carriers WHERE id=$1',[carrier])).rowCount)throw Error('Carrier exists; inspect before reseeding');await store.seed(carrier);for(const[old,uid]of[['demo-dispatcher','preview-dispatcher'],['demo-driver-1','preview-driver-1'],['demo-driver-2','preview-driver-2'],['demo-simulator','preview-simulator']])await db.query('UPDATE memberships SET uid=$1 WHERE carrier_id=$2 AND uid=$3',[uid,carrier,old]);console.log(JSON.stringify({carrier,source:'isolated synthetic fixtures only'}));}finally{await db.end();}`;
const dir='docs/evidence/cloud-ranked-recovery-2026-09-12';
await mkdir(dir,{recursive:true});
await mkdir('data',{recursive:true});
await writeFile(pointer,JSON.stringify({carrier,dir,image,seedRequestedAt:new Date().toISOString(),source:'isolated synthetic fixtures only'},null,2)+'\n');
execFileSync('gcloud',['run','jobs','update','roadstar-seed','--project='+project,'--region='+region,'--image='+image,'--quiet'],{stdio:'inherit'});
execFileSync('gcloud',['run','jobs','execute','roadstar-seed','--project='+project,'--region='+region,'--args=^~^--input-type=module~-e~'+code,'--wait','--quiet'],{stdio:'inherit'});
console.log(JSON.stringify({carrier,dir,image}));
