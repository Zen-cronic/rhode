import {demand} from '../../../packages/domain/src/index.ts';
import {trackingDistance} from '../../../packages/domain/src/tracking.ts';
import type {TrackingPoint} from '../../../packages/domain/src/tracking.ts';
import type {Actor,Store} from './store.ts';

// A work session is an explicit tracking boundary, not a regulatory HOS shift.
export async function mileageReport(store:Store,actor:Actor,scope:{assignmentId?:string;sessionId?:string}) {
  demand(actor.role==='dispatcher'||actor.role==='driver','FORBIDDEN','Mileage requires an operational identity.',403);
  const isSession=!!scope.sessionId,id=scope.sessionId??scope.assignmentId;
  demand(!!scope.sessionId!==!!scope.assignmentId&&typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),'INVALID_SCOPE','Supply exactly one assignment or work-session ID.',400);
  const c=await store.db.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const source=(await c.query(isSession?'SELECT * FROM work_sessions WHERE carrier_id=$1 AND id=$2':'SELECT * FROM assignments WHERE carrier_id=$1 AND id=$2',[actor.carrierId,id])).rows[0];
    demand(source,'NOT_FOUND','Mileage scope unavailable.',404);
    demand(actor.role==='dispatcher'||source.driver_id===actor.driverId,'FORBIDDEN','Mileage belongs to another driver.',403);
    const asOf=(await c.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString();
    // Fetch every retained observation in a stable database snapshot. A cursor
    // bounds memory; page boundaries never become artificial distance gaps.
    await c.query(`DECLARE mileage_samples NO SCROLL CURSOR FOR
      SELECT t.id,t.at,t.recorded_at,t.body,t.disposition,t.session_id,t.assignment_id,a.truck_id,a.load_id
      FROM telemetry t JOIN assignments a ON a.carrier_id=t.carrier_id AND a.id=t.assignment_id
      WHERE t.carrier_id=$1 AND ${isSession?'t.session_id=$2 AND a.driver_id=$3 AND t.at >= $4 AND t.at <= $5':'t.assignment_id=$2'}
      ORDER BY t.at,t.id`,isSession?[actor.carrierId,id,source.driver_id,source.started_at,source.ended_at??asOf]:[actor.carrierId,id]);
    type Leg={assignmentId:string;truckId:string;loadId:string;samples:number;firstAt:string|null;lastAt:string|null;odometerKm:number|null;gpsChordKm:number|null;linkedIntervals:number;odometerIntervals:number;missingOdometerIntervals:number;unlinkedIntervals:number;observedSeconds:number;provenance:string[]};
    const legs=new Map<string,Leg>();let previous:TrackingPoint|undefined,previousTrip:string|undefined;
    while(true){
      const rows=(await c.query('FETCH FORWARD 1000 FROM mileage_samples')).rows;if(!rows.length)break;
      for(const row of rows){
        const point:TrackingPoint={...row.body,id:row.id,sessionId:row.session_id,at:row.at.toISOString(),recordedAt:row.recorded_at.toISOString(),disposition:row.disposition};
        let leg=legs.get(row.assignment_id);
        if(!leg){leg={assignmentId:row.assignment_id,truckId:row.truck_id,loadId:row.load_id,samples:0,firstAt:null,lastAt:null,odometerKm:null,gpsChordKm:null,linkedIntervals:0,odometerIntervals:0,missingOdometerIntervals:0,unlinkedIntervals:0,observedSeconds:0,provenance:[]};legs.set(row.assignment_id,leg);}
        leg.samples++;leg.firstAt??=point.at;leg.lastAt=point.at;
        if(!leg.provenance.includes(point.provenance))leg.provenance.push(point.provenance);
        if(previous&&previousTrip===row.assignment_id){
          const pair=trackingDistance([previous,point]);
          leg.linkedIntervals+=pair.linkedIntervals;leg.unlinkedIntervals+=1-pair.linkedIntervals;
          leg.odometerIntervals+=pair.odometerIntervals;leg.missingOdometerIntervals+=pair.missingOdometerIntervals;
          if(pair.odometerKm!==null)leg.odometerKm=(leg.odometerKm??0)+pair.odometerKm;
          if(pair.gpsChordKm!==null)leg.gpsChordKm=(leg.gpsChordKm??0)+pair.gpsChordKm;
          if(pair.linkedIntervals)leg.observedSeconds+=(Date.parse(point.at)-Date.parse(previous.at))/1000;
        }
        previous=point;previousTrip=row.assignment_id;
      }
    }
    const results=[...legs.values()];
    const total=(key:'odometerKm'|'gpsChordKm')=>{const values=results.map(l=>l[key]).filter((v):v is number=>v!==null);return values.length?values.reduce((a,b)=>a+b,0):null;};
    const report={scope:isSession?'work-session':'assignment',id,driverId:source.driver_id,asOf,startedAt:isSession?source.started_at.toISOString():null,endedAt:isSession?source.ended_at?.toISOString()??null:null,allRetainedSamples:true,samples:results.reduce((n,l)=>n+l.samples,0),odometerKm:total('odometerKm'),gpsChordKm:total('gpsChordKm'),legs:results,assumptions:['Work sessions are explicit tracking sessions, not certified HOS shifts.','All retained in-scope samples at report time; missing and unrecorded travel is unknown.','Trip boundaries are never joined. Intervals over 120 seconds, source changes, excluded or uncertain GPS and implausible motion are excluded.','Odometer totals cover usable recorded increments only; GPS chords are separate estimates, not road mileage.']};
    await c.query('COMMIT');return report;
  } catch(error){await c.query('ROLLBACK');throw error;} finally{c.release();}
}
