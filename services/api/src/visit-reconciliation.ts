import {fenceConfidence,visitPolicyEvidence} from '../../../packages/domain/src/geofence.ts';
import type pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {demand} from '../../../packages/domain/src/index.ts';
import {prepareDetention} from './billing.ts';
import type {Actor,Command} from './store.ts';
type Row=Record<string,any>;
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const iso=(x:any)=>x?new Date(x).toISOString():null;
const key=(v:Row)=>canonical([v.stop_id,iso(v.arrival),iso(v.departure),v.arrival_event,v.departure_event??null]);
// Read on the caller's consistent snapshot / exclusive carrier command lock.
export async function visitReview(c:pg.PoolClient,carrierId:string,assignmentId:string){
 const trip=(await c.query('SELECT * FROM assignments WHERE carrier_id=$1 AND id=$2',[carrierId,assignmentId])).rows[0];demand(trip,'NOT_FOUND','Assignment not found.',404);
 const sources=(await c.query(`SELECT t.id,t.at,t.body,t.disposition,t.geofence_evidence,s.id AS stop_id,s.sequence,s.radius_m,ST_AsText(s.location::geometry) AS stop_location,
 ST_Distance(t.location,s.location) AS distance FROM telemetry t JOIN stops s ON s.carrier_id=t.carrier_id AND s.load_id=$3
 WHERE t.carrier_id=$1 AND t.assignment_id=$2 ORDER BY t.at,t.id,s.sequence,s.id LIMIT 250001`,[carrierId,assignmentId,trip.load_id])).rows;
 demand(sources.length<=250000,'REVIEW_TOO_LARGE','This history exceeds the interactive review limit. No partial visit reconstruction was used.');
 const visits=(await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY arrival,id',[carrierId,assignmentId])).rows;
 const invoices=(await c.query('SELECT i.* FROM invoice_revisions i JOIN stop_visits v ON v.carrier_id=i.carrier_id AND v.id=i.visit_id WHERE v.carrier_id=$1 AND v.assignment_id=$2 ORDER BY i.visit_id,i.revision',[carrierId,assignmentId])).rows;
 const terms=(await c.query('SELECT b.*,c.version,c.free_minutes,c.rate_cents_per_hour,c.currency FROM load_contracts b JOIN contracts c ON c.carrier_id=b.carrier_id AND c.id=b.contract_id WHERE b.carrier_id=$1 AND b.load_id=$2',[carrierId,trip.load_id])).rows;
 const load=(await c.query('SELECT body,version FROM loads WHERE carrier_id=$1 AND id=$2',[carrierId,trip.load_id])).rows[0];
 const stopConditions=[...new Map(sources.map(s=>[s.stop_id,{id:s.stop_id,sequence:s.sequence,location:s.stop_location,radiusM:s.radius_m}])).values()];
 const samples=new Map<string,Row[]>();for(const row of sources){const rows=samples.get(row.id)??[];rows.push(row);samples.set(row.id,rows);}
 const timePositions=new Map<string,Set<string>>();for(const rows of samples.values()){const e=rows[0];if(e.body.accuracyM>100)continue;const at=iso(e.at)!;const set=timePositions.get(at)??new Set<string>();set.add(canonical([e.body.position,e.body.accuracyM,e.body.provenance]));timePositions.set(at,set);}
 const issues:string[]=[];for(const [at,positions] of timePositions)if(positions.size>1)issues.push(`Conflicting GPS observations at ${at}; source order cannot establish a visit.`);
 const proposed:Row[]=[],open=new Map<string,Row>();
 for(const rows of samples.values()){
  const source=rows[0];if(source.body.accuracyM>100||!['applied','retained_out_of_order'].includes(source.disposition))continue;
  const possible=rows.filter(s=>Number(s.distance)-source.body.accuracyM<=s.radius_m),ambiguous=possible.length>1;
  for(const stop of rows){
   const prior=open.get(stop.stop_id),confidence=fenceConfidence(Number(stop.distance),source.body.accuracyM,Number(stop.radius_m)),inside=!ambiguous&&confidence==='inside',outside=confidence==='outside';
   if(outside&&prior){prior.departure=iso(source.at);prior.departure_event=source.id;open.delete(stop.stop_id);}
   if(inside&&!prior){const v={stop_id:stop.stop_id,arrival:iso(source.at),arrival_event:source.id,departure:null,departure_event:null};proposed.push(v);open.set(stop.stop_id,v);}
  }
 }
 const active=visits.filter(v=>!v.superseded_by),expected=new Set(proposed.map(key)),retired=active.filter(v=>!expected.has(key(v))),retained=new Map(active.filter(v=>expected.has(key(v))).map(v=>[key(v),v]));
 const candidates:Row[]=proposed.map(v=>({...v,retainedVisitId:retained.get(key(v))?.id??null}));
 const fingerprint=createHash('sha256').update(canonical({trip,sources,visits,invoices,terms,load,visitPolicyEvidence})).digest('hex');
 const history=(await c.query('SELECT * FROM visit_reconciliations WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY recorded_at,id',[carrierId,assignmentId])).rows;
 return {assignmentId,loadId:trip.load_id,expectedVersion:trip.version,reviewRequired:trip.visit_review_required,fingerprint,policy:'ordered-unique-trip-stop-v1',visitPolicy:visitPolicyEvidence,stopConditions,sampleCount:samples.size,issues,current:active,proposed:candidates,retiredVisitIds:retired.map(v=>v.id),historicalVisits:visits.filter(v=>v.superseded_by),invoices,history,terms,changed:retired.length>0||candidates.some(v=>!v.retainedVisitId)};
}
export async function applyVisitReview(c:pg.PoolClient,a:Actor,cmd:Command,input:Row){
 demand(input.acknowledgeRevisedEvidence===true&&typeof input.reason==='string'&&input.reason.trim().length>=20,'REVIEW_REQUIRED','Review revised visits, source observations and retained invoice history.');
 const review=await visitReview(c,a.carrierId,input.assignmentId);
 demand(review.expectedVersion===cmd.expectedVersion&&review.fingerprint===input.fingerprint,'STALE_EVIDENCE','Trip, telemetry, visits or billing changed. Review the current reconstruction.');
 demand(!review.issues.length,'AMBIGUOUS_TIME',review.issues.join(' '));
 demand(review.reviewRequired||review.changed,'NO_CHANGES','Visit evidence is already reconciled.');
 const {history,...currentReview}=review;
 const id=randomUUID(),body={...currentReview,priorReviewIds:history.map(r=>r.id),reason:input.reason.trim(),reviewedBy:a.uid};
 await c.query('INSERT INTO visit_reconciliations(carrier_id,id,assignment_id,fingerprint,reviewed_by,reason,body) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.carrierId,id,input.assignmentId,review.fingerprint,a.uid,input.reason.trim(),JSON.stringify(body)]);
 await c.query('UPDATE stop_visits SET superseded_by=$3 WHERE carrier_id=$1 AND id=ANY($2::uuid[])',[a.carrierId,review.retiredVisitIds,id]);
 await c.query('UPDATE assignments SET visit_review_required=false WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.assignmentId]);
 const current=[];
 for(const proposed of review.proposed){
  let visit:Row;
  if(proposed.retainedVisitId)visit=review.current.find(v=>v.id===proposed.retainedVisitId)!;
  else visit=(await c.query('INSERT INTO stop_visits(carrier_id,id,assignment_id,load_id,stop_id,arrival,arrival_event,departure,departure_event) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[a.carrierId,randomUUID(),input.assignmentId,review.loadId,proposed.stop_id,proposed.arrival,proposed.arrival_event,proposed.departure,proposed.departure_event])).rows[0];
  if(visit.departure)await prepareDetention(c,a.carrierId,visit,{automatic:true});current.push(visit.id);
 }
 return {id,assignmentId:input.assignmentId,status:'reconciled',reviewedBy:a.uid,retiredVisitIds:review.retiredVisitIds,currentVisitIds:current,note:'Original observations and prior invoices retained. Revised drafts require separate billing approval; no payment action occurred.'};
}
