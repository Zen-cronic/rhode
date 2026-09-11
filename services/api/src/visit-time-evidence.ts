import type pg from 'pg';
import {demand} from '../../../packages/domain/src/index.ts';
const iso=(v:any)=>v?new Date(v).toISOString():null;
export async function latestVisitTime(c:pg.PoolClient,carrierId:string,visitId:string){return (await c.query('SELECT * FROM visit_time_revisions WHERE carrier_id=$1 AND visit_id=$2 ORDER BY revision DESC LIMIT 1',[carrierId,visitId])).rows[0];}
export async function validateVisitTime(c:pg.PoolClient,carrierId:string,visit:any,correction:any){
 if(!correction)return;
 const observed=correction.body.observed,doc=(await c.query('SELECT * FROM documents WHERE carrier_id=$1 AND id=$2',[carrierId,correction.document_id])).rows[0],source=correction.body.document;
 demand(!visit.superseded_by&&observed.arrivalAt===iso(visit.arrival)&&observed.departureAt===iso(visit.departure)&&observed.arrivalEvent===visit.arrival_event&&observed.departureEvent===visit.departure_event,'STALE_TIME_EVIDENCE','Original visit changed. Review the corrected times again.');
 demand(doc?.status==='stored'&&doc.load_id===visit.load_id&&doc.version===source.version&&doc.sha256===source.sha256,'STALE_TIME_EVIDENCE','Supporting document changed. Review the corrected times again.');
}
export async function visitTimeConflicts(c:pg.PoolClient,carrierId:string,visit:any,correction:any){
 const start=new Date(correction?.body.arrivalAt??visit.arrival).getTime(),end=new Date(correction?.body.departureAt??visit.departure).getTime();
 const neighbors=(await c.query(`SELECT v.id,v.stop_id,v.arrival,v.departure,r.body AS corrected FROM stop_visits v LEFT JOIN LATERAL (SELECT body FROM visit_time_revisions WHERE carrier_id=v.carrier_id AND visit_id=v.id ORDER BY revision DESC LIMIT 1) r ON true WHERE v.carrier_id=$1 AND v.assignment_id=$2 AND v.id<>$3 AND v.superseded_by IS NULL`,[carrierId,visit.assignment_id,visit.id])).rows;
 return neighbors.filter(v=>{if(!correction&&!v.corrected)return false;const from=new Date(v.corrected?.arrivalAt??v.arrival).getTime(),to=v.corrected?.departureAt??v.departure;return start<(to?new Date(to).getTime():Infinity)&&end>from;}).map(v=>({visitId:v.id,stopId:v.stop_id,arrivalAt:iso(v.corrected?.arrivalAt??v.arrival),departureAt:iso(v.corrected?.departureAt??v.departure)}));
}
