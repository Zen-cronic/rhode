import type pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {demand,timestamp} from '../../../packages/domain/src/index.ts';
import type {Actor,Command} from './store.ts';
import {prepareDetention} from './billing.ts';
const iso=(v:any)=>v?new Date(v).toISOString():null;
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export async function visitTimeReview(c:pg.PoolClient,carrierId:string,visitId:string){
 const visit=(await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND id=$2',[carrierId,visitId])).rows[0];demand(visit,'NOT_FOUND','Visit not found.',404);
 const trip=(await c.query('SELECT version,visit_review_required FROM assignments WHERE carrier_id=$1 AND id=$2',[carrierId,visit.assignment_id])).rows[0];
 const documents=(await c.query("SELECT id,version,sha256,media_type,extraction->>'filename' AS filename FROM documents WHERE carrier_id=$1 AND load_id=$2 AND status='stored' AND sha256 IS NOT NULL ORDER BY id",[carrierId,visit.load_id])).rows;
 const history=(await c.query('SELECT * FROM visit_time_revisions WHERE carrier_id=$1 AND visit_id=$2 ORDER BY revision',[carrierId,visitId])).rows;
 const invoices=(await c.query('SELECT * FROM invoice_revisions WHERE carrier_id=$1 AND visit_id=$2 ORDER BY revision',[carrierId,visitId])).rows;
 const neighbors=(await c.query(`SELECT v.*,r.body AS corrected FROM stop_visits v LEFT JOIN LATERAL (SELECT body FROM visit_time_revisions WHERE carrier_id=v.carrier_id AND visit_id=v.id ORDER BY revision DESC LIMIT 1) r ON true WHERE v.carrier_id=$1 AND v.assignment_id=$2 AND v.id<>$3 AND v.superseded_by IS NULL ORDER BY v.arrival,v.id`,[carrierId,visit.assignment_id,visitId])).rows;
 const sourceVersion=(await c.query('SELECT count(*) AS count,max(recorded_at) AS last_received FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2',[carrierId,visit.assignment_id])).rows[0];
 const terms=(await c.query('SELECT c.* FROM load_contracts b JOIN contracts c ON c.carrier_id=b.carrier_id AND c.id=b.contract_id WHERE b.carrier_id=$1 AND b.load_id=$2',[carrierId,visit.load_id])).rows;
 const fingerprint=createHash('sha256').update(canonical({visit,trip,documents,history,invoices,neighbors,sourceVersion,terms})).digest('hex');
 return {visit,reviewRequired:trip.visit_review_required,documents,history,invoices,fingerprint,expectedVersion:history.at(-1)?.revision??0,neighbors,terms,effective:history.at(-1)?.body??{arrivalAt:iso(visit.arrival),departureAt:iso(visit.departure)}};
}
export async function correctVisitTimes(c:pg.PoolClient,a:Actor,cmd:Command,input:any){
 const review=await visitTimeReview(c,a.carrierId,input.visitId),visit=review.visit;
 demand(visit.departure&&!visit.superseded_by,'VISIT_OPEN','Review a closed current visit.');
 demand(!review.reviewRequired,'VISIT_REVIEW_REQUIRED','Reconcile late GPS evidence before correcting dock times.');
 demand(review.expectedVersion===cmd.expectedVersion&&review.fingerprint===input.fingerprint,'STALE_EVIDENCE','Visit, source document or invoice history changed. Refresh the review.');
 demand(input.acknowledgeConflictingEvidence===true&&input.stopId===visit.stop_id&&String(input.reason??'').trim().length>=20&&String(input.sourceNote??'').trim().length>=20,'REVIEW_REQUIRED','Confirm the same stop and explain the source evidence and conflict.');
 const document=review.documents.find(d=>d.id===input.documentId);demand(document,'DOCUMENT_REQUIRED','Select a stored source document from this shipment.');
 const start=timestamp(input.arrivalAt),end=timestamp(input.departureAt);demand(end>start,'INVALID_TIME','Departure must follow arrival.',400);
 for(const neighbor of review.neighbors){const from=timestamp(neighbor.corrected?.arrivalAt??iso(neighbor.arrival)),to=neighbor.corrected?.departureAt??iso(neighbor.departure);demand(!(start<(to?timestamp(to):Infinity)&&end>from),'VISIT_OVERLAP','Corrected times overlap another visit on this trip. Review visit identity before billing.');}
 const id=randomUUID(),revision=review.expectedVersion+1,body={arrivalAt:iso(input.arrivalAt),departureAt:iso(input.departureAt),observed:{arrivalAt:iso(visit.arrival),departureAt:iso(visit.departure),arrivalEvent:visit.arrival_event,departureEvent:visit.departure_event},document,sourceNote:input.sourceNote.trim(),reason:input.reason.trim(),reviewedBy:a.uid,recordedAt:new Date().toISOString(),provenance:'document-reviewed',previousRevisionId:review.history.at(-1)?.id??null};
 await c.query('INSERT INTO visit_time_revisions(carrier_id,id,visit_id,revision,document_id,reviewed_by,fingerprint,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.carrierId,id,visit.id,revision,document.id,a.uid,review.fingerprint,JSON.stringify(body)]);
 const invoice=await prepareDetention(c,a.carrierId,visit,{automatic:false,expectedVersion:review.invoices.at(-1)?.revision??0});
 return {id,revision,visitId:visit.id,body,invoice,note:'Reviewed document times recorded separately from GPS. Prior invoices retained; the new draft needs separate billing approval.'};
}
