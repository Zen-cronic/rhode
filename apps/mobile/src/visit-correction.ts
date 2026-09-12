import{validateCommand}from'../../../packages/domain/src/commands.ts';
import{sourceKey,type BillingReview}from'./billing-review.ts';
export type VisitCorrectionDraft={snapshot:BillingReview;documentId:string;arrival:string;departure:string;sourceNote:string;reason:string};
export function utcInput(value:string){return new Date(value).toISOString().slice(0,19).replace('T',' ');}
export function parseUtcInput(value:string){const m=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());if(!m)return null;const iso=`${m[1]}T${m[2]}:${m[3]??'00'}.000Z`,n=Date.parse(iso);return Number.isFinite(n)&&new Date(n).toISOString()===iso?iso:null;}
export function correctionBody(draft:VisitCorrectionDraft){const start=parseUtcInput(draft.arrival),end=parseUtcInput(draft.departure);if(!start||!end||Date.parse(end)<=Date.parse(start))return null;try{return validateCommand('/api/correct-visit-times',{visitId:draft.snapshot.visit.id,stopId:draft.snapshot.visit.stop_id,documentId:draft.documentId,fingerprint:draft.snapshot.fingerprint,arrivalAt:start,departureAt:end,sourceNote:draft.sourceNote.trim(),reason:draft.reason.trim(),acknowledgeConflictingEvidence:true});}catch{return null;}}
export function correctionCommand(draft:VisitCorrectionDraft,current:BillingReview|null,openedSource:string,ack:boolean){
 const old=draft.snapshot,source=old.documents.find(d=>d.id===draft.documentId),now=current?.documents.find(d=>d.id===draft.documentId),body=correctionBody(draft);
 if(!body||!ack||!current||current.visit.id!==old.visit.id||current.visit.stop_id!==old.visit.stop_id||current.fingerprint!==old.fingerprint||current.expectedVersion!==old.expectedVersion||!Number.isInteger(old.expectedVersion)||!current.visit.departure||current.visit.superseded_by||current.reviewRequired||!source||!now||sourceKey(source)!==sourceKey(now)||openedSource!==sourceKey(source))return null;
 return{body,version:old.expectedVersion!};
}
