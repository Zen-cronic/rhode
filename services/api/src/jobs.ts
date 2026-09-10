import {CloudTasksClient} from '@google-cloud/tasks';
import type pg from 'pg';
import {demand} from '../../../packages/domain/src/index.ts';
// A claimed lease survives process death. Cloud Scheduler calls the drain endpoint,
// which retries pending/expired jobs; stable task names handle ambiguous enqueue results.
export async function drainOutbox(db:pg.Pool){
 const project=process.env.GOOGLE_CLOUD_PROJECT,location=process.env.TASKS_LOCATION,queue=process.env.TASKS_QUEUE,url=process.env.WORKER_CALLBACK_URL,account=process.env.TASKS_SERVICE_ACCOUNT;
 demand(project&&location&&queue&&url&&account,'TASKS_UNCONFIGURED','Cloud Tasks configuration is incomplete.',503);
 const client=new CloudTasksClient(),parent=client.queuePath(project,location,queue);
 const {rows}=await db.query("SELECT o.* FROM outbox o JOIN jobs j ON j.carrier_id=o.carrier_id AND j.id=(o.payload->>'jobId')::uuid WHERE o.kind='job.enqueue' AND j.attempts<3 AND (j.status IN ('pending','failed') OR (j.status='running' AND j.lease_until<now())) ORDER BY o.created_at LIMIT 50");
 let count=0;
 for(const row of rows){const name=client.taskPath(project,location,queue,`${row.id}-${Math.floor(Date.now()/300000)}`);try{await client.createTask({parent,task:{name,httpRequest:{httpMethod:'POST',url,headers:{'Content-Type':'application/json'},body:Buffer.from(JSON.stringify({carrierId:row.carrier_id,jobId:row.payload.jobId})).toString('base64'),oidcToken:{serviceAccountEmail:account,audience:new URL(url).origin}}}});}catch(e:any){if(e.code!==6)throw e;}
 await db.query('UPDATE outbox SET delivered_at=now(),attempts=attempts+1 WHERE carrier_id=$1 AND id=$2',[row.carrier_id,row.id]);count++;}return {enqueued:count};
}
export async function claimDocumentJob(db:pg.Pool,carrierId:string,jobId:string){
 const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[carrierId]);
 // Serialized across carriers so simultaneous requests cannot exceed the approved preview allowance.
 await c.query("SELECT pg_advisory_xact_lock(hashtext('roadstar-model-preview-budget'))");
 const ceiling=Number(process.env.DOCUMENT_ATTEMPT_LIMIT??300);
 demand(Number.isSafeInteger(ceiling)&&ceiling>0&&ceiling<=300,'INVALID_BUDGET','Document attempt limit must be 1–300.',503);
 const spent=Number((await c.query("SELECT coalesce(sum(attempts),0) AS attempts FROM jobs WHERE kind='document.extract'")).rows[0].attempts);
 if(spent>=ceiling){await c.query('COMMIT');return {status:'budget_exhausted'};}
 const claim=await c.query("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '3 minutes' WHERE carrier_id=$1 AND id=$2 AND kind='document.extract' AND (status IN ('pending','failed') OR (status='running' AND lease_until<now())) AND attempts<3 RETURNING *",[carrierId,jobId]);
 if(!claim.rows[0]){await c.query('COMMIT');return {status:'not_claimable'};}
 const job=claim.rows[0],doc=(await c.query("SELECT * FROM documents WHERE carrier_id=$1 AND id=$2 AND status='stored'",[carrierId,job.payload.documentId])).rows[0];demand(doc?.sha256===job.payload.sha256,'DOCUMENT_CHANGED','Source document changed.');
 await c.query('COMMIT');return {status:'claimed',attempt:job.attempts,document:{id:doc.id,objectName:doc.object_name,mediaType:doc.media_type,sha256:doc.sha256}};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function finishDocumentJob(db:pg.Pool,input:{carrierId:string;jobId:string;attempt:number;model:string;fields:Record<string,string|null>;usage?:unknown;error?:string}){
 const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[input.carrierId]);
 const job=(await c.query('SELECT * FROM jobs WHERE carrier_id=$1 AND id=$2 FOR UPDATE',[input.carrierId,input.jobId])).rows[0];demand(job,'NOT_FOUND','Job not found.',404);
 if(job.status==='succeeded'&&job.attempts===input.attempt){await c.query('COMMIT');return {status:'succeeded',duplicate:true};}
 demand(job.status==='running'&&job.attempts===input.attempt,'STALE_JOB','Worker lease has been superseded.');
 if(input.error){await c.query("UPDATE jobs SET status='failed',lease_until=NULL,result=$3 WHERE carrier_id=$1 AND id=$2",[input.carrierId,input.jobId,JSON.stringify({error:input.error})]);await c.query('COMMIT');return {status:'failed'};}
 const extraction={model:input.model,reviewStatus:'unreviewed',fields:input.fields,sourceSha256:job.payload.sha256};
 const changed=await c.query("UPDATE documents SET extraction=extraction || CASE WHEN extraction->>'reviewStatus'='reviewed' THEN $3::jsonb - 'reviewStatus' ELSE $3::jsonb END,version=version+1 WHERE carrier_id=$1 AND id=$2 AND sha256=$4 RETURNING id",[input.carrierId,job.payload.documentId,JSON.stringify(extraction),job.payload.sha256]);demand(changed.rows.length,'DOCUMENT_CHANGED','Source document changed.');
 await c.query("UPDATE jobs SET status='succeeded',result=$3,lease_until=NULL WHERE carrier_id=$1 AND id=$2",[input.carrierId,input.jobId,JSON.stringify({documentId:job.payload.documentId,model:input.model,usage:input.usage})]);
 await c.query('INSERT INTO events(carrier_id,kind,actor,body) VALUES($1,$2,$3,$4)',[input.carrierId,'document.extracted','document-worker',JSON.stringify({documentId:job.payload.documentId,reviewStatus:'unreviewed'})]);
 await c.query('COMMIT');return {status:'succeeded',duplicate:false};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function drainNotifications(db:pg.Pool){
 demand(process.env.PUSH_ENABLED==='true','PUSH_DISABLED','Native push has not been enabled.',503);
 const {rows}=await db.query("SELECT * FROM outbox WHERE delivered_at IS NULL AND kind='driver.assignment' ORDER BY created_at LIMIT 50");let sent=0;
 for(const row of rows){const tokens=await db.query('SELECT p.token FROM push_tokens p JOIN memberships m ON m.carrier_id=p.carrier_id AND m.uid=p.uid WHERE p.carrier_id=$1 AND m.driver_id=ANY($2::text[])',[row.carrier_id,row.payload.notifyDriverIds??[row.payload.driverId]]);
  if(!tokens.rows.length)continue;
  const messages=tokens.rows.map(r=>({to:r.token,title:'RoadStar trip update',body:'Your trip plan has an update. Open RoadStar to review.',data:{eventId:row.id},sound:'default'}));
  const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},body:JSON.stringify(messages)});
  demand(response.ok,'PUSH_FAILED','Push provider rejected request.',503);const result=await response.json() as any;
  demand(Array.isArray(result.data)&&result.data.length===messages.length&&result.data.every((x:any)=>x.status==='ok'),'PUSH_FAILED','Push provider has not accepted all messages.',503);
  await db.query('UPDATE outbox SET delivered_at=now(),attempts=attempts+1,payload=payload||$3::jsonb WHERE carrier_id=$1 AND id=$2',[row.carrier_id,row.id,JSON.stringify({providerTickets:result.data,deliveryStatus:'provider_accepted_not_device_acknowledged'})]);sent++;
 }return {providerAccepted:sent};
}
