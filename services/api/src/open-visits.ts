import type pg from 'pg';
import {VISIT_SESSION_POLICY} from '../../../packages/domain/src/geofence.ts';
/** A dated observation estimate, never an invoice or an invented exit timestamp. */
export async function openVisitExposure(c:pg.PoolClient,carrierId:string,visitIds:string[]){
 if(!visitIds.length)return [];
 const rows=(await c.query(`SELECT v.*,a.driver_id,a.visit_review_required,l.body AS load,
 c.id AS contract_id,c.version AS contract_version,c.free_minutes,c.rate_cents_per_hour,c.currency,
 t.id AS evidence_id,t.at AS evidence_at,t.disposition,t.geofence_evidence,t.accuracy_m,
 CASE WHEN l.body->>'provenance'='synthetic' THEN (SELECT clock FROM scenarios WHERE carrier_id=$1 AND id='recovery') ELSE now() END AS observed_clock
 FROM stop_visits v JOIN assignments a ON a.carrier_id=v.carrier_id AND a.id=v.assignment_id
 JOIN loads l ON l.carrier_id=v.carrier_id AND l.id=v.load_id
 LEFT JOIN load_contracts b ON b.carrier_id=v.carrier_id AND b.load_id=v.load_id
 LEFT JOIN contracts c ON c.carrier_id=b.carrier_id AND c.id=b.contract_id
 LEFT JOIN LATERAL (SELECT id,at,disposition,geofence_evidence,accuracy_m FROM telemetry WHERE carrier_id=v.carrier_id AND assignment_id=v.assignment_id ORDER BY at DESC,id DESC LIMIT 1) t ON true
 WHERE v.carrier_id=$1 AND v.id=ANY($2::uuid[]) AND v.departure IS NULL AND v.superseded_by IS NULL ORDER BY v.arrival,v.id`,[carrierId,visitIds])).rows;
 return rows.map(r=>{
  const evidenceAt=r.evidence_at?new Date(r.evidence_at).toISOString():null,asOf=r.observed_clock?new Date(r.observed_clock).toISOString():null;
  const evidenceAgeSeconds=evidenceAt&&asOf?(Date.parse(asOf)-Date.parse(evidenceAt))/1000:null;
  const base={visitId:r.id,assignmentId:r.assignment_id,driverId:r.driver_id,asOf,evidenceAt,evidenceAgeSeconds,arrivalEvent:r.arrival_event,evidenceId:r.evidence_id??null,precision:'observed_open_visit' as const};
  let reason:string|null=null;
  if(r.visit_review_required)reason='Late or conflicting GPS requires visit reconciliation.';
  else if(r.session_policy!==VISIT_SESSION_POLICY)reason='Visit-session policy requires review.';
  else if(!r.contract_id||r.load.mode!=='FTL')reason='Supported FTL shipment terms are unavailable.';
  else if(evidenceAgeSeconds===null||evidenceAgeSeconds<0||evidenceAgeSeconds>120)reason='GPS evidence is missing, ahead of the scenario clock or over two minutes old.';
  else if(r.disposition!=='applied'||r.accuracy_m>100||r.geofence_evidence?.status!=='evaluated'||!r.geofence_evidence.stopStates?.some((s:any)=>s.stopId===r.stop_id&&s.confidence==='inside'))reason='Latest GPS does not confirm this stop; no additional detention is inferred.';
  else if(Date.parse(evidenceAt!)<new Date(r.arrival).getTime())reason='Observation precedes the retained arrival.';
  if(reason)return {...base,status:'held' as const,reason};
  const dwellMinutes=Math.floor((Date.parse(evidenceAt!)-new Date(r.arrival).getTime())/60000),billableMinutes=Math.max(0,dwellMinutes-r.free_minutes);
  return {...base,status:'estimate' as const,reason:'Provisional through the last confirmed inside sample. Departure and billing review are still required.',dwellMinutes,billableMinutes,amountCents:Math.round(billableMinutes*r.rate_cents_per_hour/60),currency:r.currency,contract:{id:r.contract_id,version:r.contract_version,freeMinutes:r.free_minutes,rateCentsPerHour:r.rate_cents_per_hour}};
 });
}
