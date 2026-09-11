import {evaluateHosProfile} from '../../../packages/domain/src/hos-profile.ts';
import type pg from 'pg';
import type {Driver} from '../../../packages/domain/src/index.ts';
import {consumeDutyHistory} from '../../../packages/domain/src/hos.ts';
export async function withDutyHistory(db:Pick<pg.Pool,'query'>|pg.PoolClient,carrierId:string,drivers:Driver[]){
 if(!drivers.length)return drivers;
 const records=(await db.query(`SELECT r.id,b.at,b.duty,b.budget,b.provenance,p.revision AS profile_revision,p.source_ref AS profile_source,p.reviewed_by AS profile_reviewer,p.body AS profile,p.provenance AS profile_provenance,
 CASE WHEN r.body->>'provenance'='synthetic' THEN (SELECT clock FROM scenarios WHERE carrier_id=$1 AND id='recovery') ELSE now() END AS clock,
 (SELECT coalesce(jsonb_agg(e),'[]') FROM (
   SELECT d.at,d.duty,'duty:'||d.id AS source FROM duty_events d WHERE d.carrier_id=$1 AND d.driver_id=r.id
   UNION ALL
   SELECT t.at,t.body->>'duty','telemetry:'||t.id FROM telemetry t JOIN assignments a ON a.carrier_id=t.carrier_id AND a.id=t.assignment_id
    WHERE t.carrier_id=$1 AND a.driver_id=r.id AND t.accuracy_m<=100 AND t.disposition IN ('applied','retained_out_of_order') AND t.body->>'provenance'=r.body->>'provenance' AND t.body->>'dutyEvidence' IS DISTINCT FROM 'cached-declaration'
 ) e WHERE (p.body IS NOT NULL OR e.at>=b.at)) AS observations
 FROM resources r LEFT JOIN hos_bases b ON b.carrier_id=r.carrier_id AND b.driver_id=r.id
 LEFT JOIN LATERAL (SELECT revision,body,provenance,source_ref,reviewed_by FROM hos_profiles WHERE carrier_id=r.carrier_id AND driver_id=r.id ORDER BY revision DESC LIMIT 1) p ON true
 WHERE r.carrier_id=$1 AND r.id=ANY($2::text[])`,[carrierId,drivers.map(d=>d.id)])).rows;
 return drivers.map(driver=>{const row=records.find(r=>r.id===driver.id);const basis=row?.at&&row.provenance===driver.provenance?{at:new Date(row.at).toISOString(),duty:row.duty,budget:row.budget}:null;const at=row?.clock?new Date(row.clock).toISOString():new Date().toISOString();const derived=row?.profile_revision?evaluateHosProfile(row.profile_provenance===driver.provenance?row.profile:null,row?.observations??[],at):consumeDutyHistory(basis,row?.observations??[],at);return {...driver,...derived,hosEvidence:{...derived.hosEvidence,...(row?.profile_revision?{revision:row.profile_revision,sourceRef:row.profile_source,reviewedBy:row.profile_reviewer}:{})}};});
}
