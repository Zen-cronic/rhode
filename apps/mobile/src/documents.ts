import type {Queue} from './queue.ts';
export type Capture={registrationId:string;uploadId:string;uri:string;loadId:string;loadVersion:number;mediaType:string;filename:string;kind:'pod'|'manifest'|'other'};
export async function captures(queue:Queue):Promise<Capture[]>{return JSON.parse(await queue.draft('document-captures')||'[]');}
/** Reconstruct both steps from durable intent after termination at any boundary. */
export async function reconcileCaptures(queue:Queue){
 const commands=await queue.list();
 for(const capture of await captures(queue)){
   const registration=commands.find(c=>c.id===capture.registrationId);
   if(!registration){await queue.enqueue(capture.registrationId,'/api/document',{loadId:capture.loadId,mediaType:capture.mediaType,kind:capture.kind,filename:capture.filename},capture.loadVersion,`Register ${capture.filename}`);continue;}
   if(registration.status!=='synchronized'||!registration.result)continue;
   if(commands.some(c=>c.id===capture.uploadId))continue;
   const document=JSON.parse(registration.result);
   await queue.enqueue(capture.uploadId,`/api/documents/${document.id}/content`,{uri:capture.uri,mediaType:capture.mediaType},document.version,`Upload ${capture.filename}`);
 }
}
