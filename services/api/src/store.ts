import {fenceConfidence,VISIT_SESSION_POLICY} from '../../../packages/domain/src/geofence.ts';
import {visitReview,applyVisitReview} from './visit-reconciliation.ts';
import {closureAreas,requireReviewedClosure,routeRevisionProof} from './closures.ts';
import {hosReviewSchema,importedHosProfile,type HosReviewInput} from '../../../packages/domain/src/hos-import.ts';
import {mileageReport} from './mileage.ts';
import {emulatorVerification} from './verification.ts';
import {remainingWork} from './remaining-work.ts';
import {withDutyHistory} from './hos.ts';
import {prepareDetention} from './billing.ts';
import {approvePlan,commitmentHash,groupFor,respondGroup,checkGroupStop,releaseCompletedGroup} from './trip-groups.ts';
import {roadRoute,computation} from './planning.ts';
import {Files,sha256} from './files.ts';
import type pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {demand,DomainError,screen,timestamp,distanceKm} from '../../../packages/domain/src/index.ts';
import type {Load,Driver,Truck,Trailer,Assignment,Telemetry} from '../../../packages/domain/src/index.ts';
import {fixtures,DEMO_NOW} from './fixtures.ts';
export type Actor={uid:string;carrierId:string;role:'dispatcher'|'driver'|'simulator'|'worker';driverId?:string};
export type Command={key:string;expectedVersion:number};
type Row=Record<string,any>;
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const iso=(v:Date|string)=>new Date(v).toISOString();
const assignment=(r:Row):Assignment=>({id:r.id,loadId:r.load_id,driverId:r.driver_id,truckId:r.truck_id,trailerId:r.trailer_id,startAt:iso(r.start_at),endAt:iso(r.end_at),status:r.status,version:r.version,visitReviewRequired:r.visit_review_required??false});
export class Store {
  readonly db:pg.Pool;
  constructor(db:pg.Pool){this.db=db;}
  async membership(uid:string,carrierId:string):Promise<Actor> {
    const {rows}=await this.db.query('SELECT * FROM memberships WHERE carrier_id=$1 AND uid=$2',[carrierId,uid]);
    demand(rows[0],'FORBIDDEN','Carrier membership required.',403);
    demand(rows[0].role!=='driver'||rows[0].driver_id,'FORBIDDEN','Driver membership requires a linked driver.',403);
    return {uid,carrierId,role:rows[0].role,driverId:rows[0].driver_id??undefined};
  }
  async command(a:Actor,cmd:Command,kind:string,input:unknown,work:(c:pg.PoolClient)=>Promise<unknown>) {
    demand(typeof cmd.key==='string'&&cmd.key.length>=8&&cmd.key.length<=128,'INVALID_KEY','An idempotency key of 8–128 characters is required.',400);
    demand(Number.isSafeInteger(cmd.expectedVersion)&&cmd.expectedVersion>=0,'INVALID_VERSION','Expected version is required.',400);
    const fingerprint=createHash('sha256').update(canonical({kind,input,expectedVersion:cmd.expectedVersion})).digest('hex');
    const c=await this.db.connect();
    try {
      await c.query('BEGIN');
      // Independent telemetry trips may proceed together. Consequential commands take
      // the exclusive carrier lock, so approval cannot race a changing driver position.
      if(kind==='telemetry.received'){
        await c.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))',[a.carrierId]);
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`trip:${a.carrierId}:${(input as Telemetry).assignmentId}`]);
      }else await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[a.carrierId]);
      const old=await c.query('SELECT * FROM commands WHERE carrier_id=$1 AND uid=$2 AND key=$3',[a.carrierId,a.uid,cmd.key]);
      if(old.rows[0]) {demand(old.rows[0].fingerprint===fingerprint,'KEY_REUSED','Idempotency key was used for different content.');await c.query('COMMIT');return old.rows[0].result;}
      await c.query('INSERT INTO commands(carrier_id,uid,key,fingerprint) VALUES($1,$2,$3,$4)',[a.carrierId,a.uid,cmd.key,fingerprint]);
      const result=await work(c);
      // Allocate the event cursor only at commit, in commit order, even across trips.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`events:${a.carrierId}`]);
      await c.query('INSERT INTO events(carrier_id,kind,actor,body) VALUES($1,$2,$3,$4)',[a.carrierId,kind,a.uid,JSON.stringify(result)]);
      await c.query('UPDATE commands SET result=$4 WHERE carrier_id=$1 AND uid=$2 AND key=$3',[a.carrierId,a.uid,cmd.key,JSON.stringify(result)]);
      await c.query('COMMIT');return result;
    }catch(e:any){await c.query('ROLLBACK');if(e.code==='23P01'||e.code==='23505')throw new DomainError('RESERVATION_CONFLICT','A resource or record was reserved by another command. Refresh and retry.');throw e;}finally{c.release();}
  }
  dispatcher(a:Actor){demand(a.role==='dispatcher','FORBIDDEN','Dispatcher approval required.',403);}
  async load(c:pg.PoolClient,a:Actor,id:string):Promise<Load> {
    const r=await c.query('SELECT * FROM loads WHERE carrier_id=$1 AND id=$2',[a.carrierId,id]);demand(r.rows[0],'NOT_FOUND','Load not found.',404);return {...r.rows[0].body,version:r.rows[0].version,status:r.rows[0].status};
  }
  async resource<T>(c:pg.PoolClient,a:Actor,id:string,kind:string):Promise<T>{
    const r=await c.query('SELECT body FROM resources WHERE carrier_id=$1 AND id=$2 AND kind=$3',[a.carrierId,id,kind]);demand(r.rows[0],'NOT_FOUND',`${kind} not found.`,404);return (kind==='driver'?(await withDutyHistory(c,a.carrierId,[r.rows[0].body]))[0]:r.rows[0].body) as T;
  }
  async getAssignment(c:pg.PoolClient,a:Actor,id:string){
    const r=await c.query('SELECT * FROM assignments WHERE carrier_id=$1 AND id=$2',[a.carrierId,id]);demand(r.rows[0],'NOT_FOUND','Assignment not found.',404);return assignment(r.rows[0]);
  }
  reportClosure(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'closure.reported',input,async c=>{
    demand(a.role==='dispatcher'||a.role==='simulator','FORBIDDEN','Dispatcher or simulator identity required.',403);
    const trip=await this.getAssignment(c,a,input.assignmentId),load=await this.load(c,a,trip.loadId);
    demand(a.role!=='simulator'||load.provenance==='synthetic','FORBIDDEN','Simulator can report closures only for synthetic trips.',403);
    demand(trip.status==='accepted'&&trip.version===cmd.expectedVersion,'STALE_VERSION','Accepted trip changed. Refresh before recording a closure.');
    const now=await this.now(c,a,load.provenance);demand(timestamp(input.observedAt)<=timestamp(now),'FUTURE_EVENT','Closure observation cannot be in the future.');
    demand(timestamp(input.observedAt)>=timestamp(trip.startAt),'BEFORE_TRIP','Closure observation precedes this trip.');
    const id=randomUUID();await c.query('INSERT INTO road_closures(carrier_id,id,assignment_id,area,observed_at,source_ref,reason,provenance,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.carrierId,id,trip.id,JSON.stringify(input.area),input.observedAt,input.sourceRef,input.reason,load.provenance,a.uid]);
    await c.query('UPDATE assignments SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,trip.id]);
    return {id,assignmentId:trip.id,assignmentVersion:trip.version+1,status:'unresolved',note:'Closure retained. Prepare and approve a remaining-route revision before relying on the prior plan.'};
  });}
  rehearseRoute(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'route.rehearsed',input,async c=>{
    const trip=await this.getAssignment(c,a,input.assignmentId);demand(trip.version===cmd.expectedVersion,'STALE_VERSION','Trip changed. Refresh.');
    const proof=await routeRevisionProof(this,c,a,trip.id),id=randomUUID(),status=proof.eligible?'pending':'unresolved';
    await c.query('INSERT INTO route_revisions(carrier_id,id,assignment_id,status,body,created_by) VALUES($1,$2,$3,$4,$5,$6)',[a.carrierId,id,trip.id,status,JSON.stringify(proof),a.uid]);return {id,revision:1,status,body:proof};
  });}
  approveRoute(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'route.approved',input,async c=>{
    demand(input.acknowledgeModeledRoute===true,'REVIEW_REQUIRED','Acknowledge the modeled route before approval.',400);
    const row=(await c.query('SELECT * FROM route_revisions WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.routeRevisionId])).rows[0];
    demand(row,'NOT_FOUND','Route review not found.',404);demand(row.status==='pending'&&row.revision===cmd.expectedVersion,'STALE_PROPOSAL','Route review changed. Rehearse again.');
    const fresh=await routeRevisionProof(this,c,a,row.assignment_id),prior=row.body;
    demand(fresh.assignmentVersion===prior.assignmentVersion&&fresh.loadVersion===prior.loadVersion&&canonical(fresh.closures)===canonical(prior.closures)&&canonical('resources' in fresh?fresh.resources:null)===canonical(prior.resources)&&('telemetryId' in fresh?fresh.telemetryId:null)===prior.telemetryId,'STALE_PROPOSAL','Trip, closure, GPS or resource evidence changed. Rehearse again.');
    demand(fresh.eligible,'INELIGIBLE',fresh.reasons.join(' '));demand('routeFingerprint' in fresh&&fresh.routeFingerprint===prior.routeFingerprint,'STALE_PROPOSAL','Truck route changed since rehearsal.');
    const trip=await this.getAssignment(c,a,row.assignment_id);
    await c.query("UPDATE route_revisions SET status='approved',revision=revision+1,approved_by=$3,approved_at=now(),body=$4 WHERE carrier_id=$1 AND id=$2",[a.carrierId,row.id,a.uid,JSON.stringify({...prior,approvalEvidence:fresh})]);
    await c.query('UPDATE assignments SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,trip.id]);
    await c.query('INSERT INTO outbox(carrier_id,id,kind,payload) VALUES($1,$2,$3,$4)',[a.carrierId,randomUUID(),'driver.assignment',JSON.stringify({assignmentId:trip.id,driverId:trip.driverId,routeRevisionId:row.id,notifyDriverIds:[trip.driverId]})]);
    return {id:row.id,revision:row.revision+1,status:'approved',assignmentVersion:trip.version+1,body:fresh,note:'Reviewed route revision is available. Driver receipt/adoption is separate; original observations and reservations are unchanged.'};
  });}
  acknowledgeRoute(a:Actor,cmd:Command,input:Row){
    demand(a.role==='driver'&&a.driverId,'FORBIDDEN','Assigned driver acknowledgement required.',403);
    return this.command(a,cmd,'route.acknowledged',input,async c=>{
      demand(input.acknowledgeReceipt===true,'REVIEW_REQUIRED','Confirm receipt of this route revision.',400);
      const row=(await c.query('SELECT * FROM route_revisions WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.routeRevisionId])).rows[0];
      demand(row,'NOT_FOUND','Route revision not found.',404);
      const trip=await this.getAssignment(c,a,row.assignment_id);
      demand(trip.driverId===a.driverId,'FORBIDDEN','Route revision belongs to another driver.',403);
      demand(trip.status==='accepted','INVALID_TRANSITION','Accepted trip required for route receipt.');
      demand(row.status==='approved'&&row.revision===cmd.expectedVersion,'STALE_VERSION','Approved revision changed. Refresh before acknowledging.');
      const latest=(await c.query("SELECT id FROM route_revisions WHERE carrier_id=$1 AND assignment_id=$2 AND status='approved' ORDER BY approved_at DESC,id DESC LIMIT 1",[a.carrierId,trip.id])).rows[0];
      demand(latest?.id===row.id,'STALE_ROUTE','A newer route revision was approved. Review that revision.');
      const closures=await closureAreas(c,a.carrierId,[trip.id]);
      demand(canonical(closures)===canonical(row.body.closures),'STALE_ROUTE','Closure evidence changed after approval. Dispatcher review required.');
      const receipt=(await c.query('INSERT INTO route_receipts(carrier_id,route_revision_id,approved_revision,driver_id,acknowledged_by,route_fingerprint) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[a.carrierId,row.id,row.revision,a.driverId,a.uid,row.body.routeFingerprint])).rows[0];
      await c.query('UPDATE route_revisions SET revision=revision+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,row.id]);
      return {routeRevisionId:row.id,revision:row.revision+1,assignmentId:trip.id,receipt:{...receipt,acknowledged_at:iso(receipt.acknowledged_at)},note:'Driver receipt recorded. This does not prove route adoption or execution.'};
    });
  }
  async simulationRoute(a:Actor,revisionId:string){
    demand(a.role==='simulator','FORBIDDEN','Simulator identity required.',403);
    const c=await this.db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const row=(await c.query('SELECT * FROM route_revisions WHERE carrier_id=$1 AND id=$2',[a.carrierId,revisionId])).rows[0];demand(row,'NOT_FOUND','Route revision not found.',404);
      const trip=await this.getAssignment(c,a,row.assignment_id),load=await this.load(c,a,trip.loadId);demand(load.provenance==='synthetic','FORBIDDEN','Simulation route requires synthetic data.',403);
      const latest=(await c.query("SELECT id FROM route_revisions WHERE carrier_id=$1 AND assignment_id=$2 AND status='approved' ORDER BY approved_at DESC,id DESC LIMIT 1",[a.carrierId,trip.id])).rows[0];
      const receipt=(await c.query('SELECT * FROM route_receipts WHERE carrier_id=$1 AND route_revision_id=$2',[a.carrierId,row.id])).rows[0];
      demand(row.status==='approved'&&latest?.id===row.id&&receipt&&receipt.route_fingerprint===row.body.routeFingerprint,'ROUTE_NOT_RECEIVED','Latest approved route requires the assigned driver receipt.');
      const fresh=await routeRevisionProof(this,c,a,trip.id),prior=row.body;
      demand(fresh.eligible,'INELIGIBLE',fresh.reasons.join(' '));
      demand(fresh.assignmentVersion===prior.assignmentVersion+1&&fresh.loadVersion===prior.loadVersion&&canonical(fresh.closures)===canonical(prior.closures)&&canonical('resources' in fresh?fresh.resources:null)===canonical(prior.resources)&&('telemetryId' in fresh?fresh.telemetryId:null)===prior.telemetryId&&('routeFingerprint' in fresh?fresh.routeFingerprint:null)===prior.routeFingerprint,'STALE_ROUTE','Route, trip, GPS or resource evidence changed after approval. Rehearse again.');
      await c.query('COMMIT');return {assignmentId:trip.id,revisionId:row.id,revision:row.revision,receipt,proof:fresh};
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async routeReviews(a:Actor,assignmentId:string){
    const c=await this.db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const trip=await this.getAssignment(c,a,assignmentId),load=await this.load(c,a,trip.loadId);
      demand(a.role==='dispatcher'||(a.role==='driver'&&a.driverId===trip.driverId)||(a.role==='simulator'&&load.provenance==='synthetic'),'FORBIDDEN','Route evidence belongs to another driver or operation.',403);
      const result={assignmentId,assignmentVersion:trip.version,assignmentStatus:trip.status,receipts:(await c.query('SELECT r.* FROM route_receipts r JOIN route_revisions v ON v.carrier_id=r.carrier_id AND v.id=r.route_revision_id WHERE v.carrier_id=$1 AND v.assignment_id=$2 ORDER BY r.acknowledged_at',[a.carrierId,assignmentId])).rows,closures:(await c.query('SELECT * FROM road_closures WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY recorded_at',[a.carrierId,assignmentId])).rows,revisions:(await c.query('SELECT * FROM route_revisions WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY created_at DESC',[a.carrierId,assignmentId])).rows};
      await c.query('COMMIT');return result;
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async simulationAssignment(a:Actor,id:string){
    demand(a.role==='simulator'||a.role==='dispatcher','FORBIDDEN','Simulation control identity required.',403);
    const row=(await this.db.query("SELECT a.id,a.version,a.end_at,a.status,l.body FROM assignments a JOIN loads l ON l.carrier_id=a.carrier_id AND l.id=a.load_id WHERE a.carrier_id=$1 AND a.id=$2",[a.carrierId,id])).rows[0];
    demand(row,'NOT_FOUND','Assignment not found.',404);
    demand(row.body.provenance==='synthetic','FORBIDDEN','Simulation context is restricted to synthetic trips.',403);
    demand(row.status==='accepted','INVALID_TRANSITION','Simulation delay reporting requires an accepted trip.');
    return {id:row.id,version:row.version,endAt:iso(row.end_at),provenance:'synthetic'};
  }
  async simulationClock(a:Actor){
    demand(a.role==='simulator'||a.role==='dispatcher','FORBIDDEN','Simulation control identity required.',403);
    const row=(await this.db.query("SELECT clock,version FROM scenarios WHERE carrier_id=$1 AND id='recovery'",[a.carrierId])).rows[0];demand(row,'NO_SCENARIO','Scenario unavailable.',404);return {clock:iso(row.clock),version:row.version};
  }
  advanceSimulationClock(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'simulation.clock_advanced',input,async c=>{
    demand(a.role==='simulator'||a.role==='dispatcher','FORBIDDEN','Simulation control identity required.',403);timestamp(input.at);
    const row=(await c.query("SELECT clock,version FROM scenarios WHERE carrier_id=$1 AND id='recovery'",[a.carrierId])).rows[0];demand(row,'NO_SCENARIO','Scenario unavailable.',404);
    demand(row.version===cmd.expectedVersion,'STALE_VERSION','Scenario clock changed. Refresh before advancing.');
    demand(timestamp(input.at)>=new Date(row.clock).getTime(),'CLOCK_REWIND','Use a fresh scenario for an independent replay.');
    if(timestamp(input.at)>new Date(row.clock).getTime())await c.query("UPDATE scenarios SET clock=$2,version=version+1 WHERE carrier_id=$1 AND id='recovery'",[a.carrierId,input.at]);
    return {clock:iso(input.at),version:row.version+(timestamp(input.at)>new Date(row.clock).getTime()?1:0),provenance:'synthetic'};
  });}
  async now(c:pg.PoolClient,a:Actor,provenance:string){
    if(provenance!=='synthetic')return new Date().toISOString();
    const r=await c.query("SELECT clock FROM scenarios WHERE carrier_id=$1 AND id='recovery'",[a.carrierId]);demand(r.rows[0],'NO_SCENARIO','Scenario clock is unavailable.');return iso(r.rows[0].clock);
  }
  async check(c:pg.PoolClient,a:Actor,load:Load,input:Row,ignoreId?:string){
    let driver=await this.resource<Driver>(c,a,input.driverId,'driver'),truck=await this.resource<Truck>(c,a,input.truckId,'truck'),trailer=await this.resource<Trailer>(c,a,input.trailerId,'trailer');
    const rows=await c.query("SELECT a.*,greatest(a.end_at,coalesce((SELECT max(d.expected_end) FROM disruptions d WHERE d.carrier_id=a.carrier_id AND d.assignment_id=a.id),a.end_at)) AS end_at FROM assignments a WHERE carrier_id=$1 AND status IN ('offered','accepted')",[a.carrierId]);
    const now=await this.now(c,a,load.provenance);
    for(const trip of rows.rows.filter(r=>r.id!==ignoreId&&r.driver_id===driver.id)){
      const closures=await closureAreas(c,a.carrierId,[trip.id]);if(closures.length){await requireReviewedClosure(c,a.carrierId,trip.id);demand(new Date(trip.end_at).getTime()>timestamp(now),'CLOSURE_PROGRESS_UNAVAILABLE','Closure-affected trip has passed its planned end; review completion before committing more work.');}
    }
    const previous=rows.rows.filter(r=>r.id!==ignoreId&&r.driver_id===driver.id&&new Date(r.start_at).getTime()<timestamp(load.startAt)&&new Date(r.end_at).getTime()>timestamp(now)).sort((x,y)=>new Date(x.end_at).getTime()-new Date(y.end_at).getTime());
    let availableAt=now;const projectedGroups=new Set<string>();const projections=[];
    for(const prior of previous){
      await requireReviewedClosure(c,a.carrierId,prior.id);
      const group=await groupFor(c,a.carrierId,prior.id);
      if(group&&projectedGroups.has(group.id))continue;
      if(group)projectedGroups.add(group.id);
      const priorLoad=await this.load(c,a,prior.load_id);
      const stops=group?group.body.stops:[{assignmentId:prior.id,stopId:priorLoad.pickup.id,point:priorLoad.pickup},{assignmentId:prior.id,stopId:priorLoad.delivery.id,point:priorLoad.delivery}];
      const members=group?rows.rows.filter(r=>stops.some((stop:any)=>stop.assignmentId===r.id)):[prior];
      const releaseAt=iso(new Date(Math.max(...members.map(r=>new Date(r.end_at).getTime()))));
      const work=await remainingWork(c,a.carrierId,{assignmentIds:[...new Set<string>(stops.map((stop:any)=>stop.assignmentId))],stops,truck:await this.resource<Truck>(c,a,prior.truck_id,'truck'),provenance:priorLoad.provenance,now,startAt:iso(prior.start_at),releaseAt,availableAt,drivingMinutes:group?group.body.drivingMinutes:priorLoad.drivingMinutes,serviceMinutes:group?Math.max(0,group.body.dutyMinutes-group.body.drivingMinutes):priorLoad.serviceMinutes});
      projections.push({loadId:priorLoad.id,...work});
      driver={...driver,position:stops.at(-1).point,budget:driver.budget?{...driver.budget,drivingMinutes:driver.budget.drivingMinutes-work.drivingMinutes,onDutyMinutes:driver.budget.onDutyMinutes-work.dutyMinutes,cycleMinutes:driver.budget.cycleMinutes-work.dutyMinutes}:null};
      availableAt=work.availableAt;
    }
    demand(load.provenance==='synthetic'||process.env.OPTIMIZER_URL,'ROUTING_UNAVAILABLE','Live dispatch requires verified truck routing.',503);
    const road=process.env.OPTIMIZER_URL?await roadRoute(c,a.carrierId,load,truck,driver.position):undefined;
    const result=screen({...load,status:'open'},driver,truck,trailer,rows.rows.map(assignment).filter(x=>x.id!==ignoreId),now,road);
    if(road&&road.drivingMinutes+load.serviceMinutes>(timestamp(load.endAt)-timestamp(load.startAt))/60000)result.reasons.push('Truck travel and service exceed the reserved appointment window.');
    if(timestamp(availableAt)+(road?.deadheadMinutes??Math.ceil(distanceKm(driver.position,load.pickup)/50*60))*60000>timestamp(load.startAt))result.reasons.push('Driver cannot reach pickup after prior committed work under the current planning estimate.');
    const arrival=timestamp(availableAt)+(road?.deadheadMinutes??Math.ceil(distanceKm(driver.position,load.pickup)/50*60))*60000;
    const ready=Math.max(timestamp(load.startAt),arrival),travelMinutes=road?.drivingMinutes??load.drivingMinutes;
    result.timing={evaluatedAt:now,availableAt,pickupArrivalAt:iso(new Date(arrival)),pickupReadyAt:iso(new Date(ready)),pickupLateMinutes:Math.max(0,Math.ceil((arrival-timestamp(load.startAt))/60000)),completionAt:iso(new Date(ready+(travelMinutes+load.serviceMinutes)*60000)),travelMinutes,serviceMinutes:load.serviceMinutes};
    if(road){result.routeFingerprint=road.fingerprint;result.routingEvidence=road.routing_evidence;}
    if(previous.length)result.note+=' Prior work: '+projections.map(p=>`${p.loadId}: ${p.drivingMinutes} min driving, ${p.dutyMinutes} min on duty (${p.telemetryId?'remaining truck route from current GPS and completed stops':'full plan; current progress unavailable'}).`).join(' ')+' Full service allowance retained; future waiting assumed on duty.';
    const holds=await c.query('SELECT reason FROM maintenance_holds WHERE carrier_id=$1 AND resource_id=ANY($2::text[]) AND resolved_at IS NULL AND period && tstzrange($3,$4,\'[)\')',[a.carrierId,[input.driverId,input.truckId,input.trailerId],load.startAt,load.endAt]);
    result.reasons.push(...holds.rows.map(r=>`Maintenance hold: ${r.reason}`)); result.eligible=result.reasons.length===0;return result;
  }
  async offer(c:pg.PoolClient,a:Actor,load:Load,input:Row,old?:Assignment){
    if(old){await c.query("UPDATE assignments SET status='superseded',version=version+1 WHERE carrier_id=$1 AND id=$2",[a.carrierId,old.id]);await c.query('UPDATE reservations SET active=false WHERE carrier_id=$1 AND assignment_id=$2',[a.carrierId,old.id]);}
    const id=randomUUID();
    await c.query("INSERT INTO assignments VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'offered')",[a.carrierId,id,load.id,input.driverId,input.truckId,input.trailerId,load.startAt,load.endAt]);
    for(const resource of [input.driverId,input.truckId,input.trailerId])await c.query("INSERT INTO reservations VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),true)",[a.carrierId,randomUUID(),id,resource,load.startAt,load.endAt]);
    await c.query("UPDATE loads SET version=version+1,status='offered' WHERE carrier_id=$1 AND id=$2",[a.carrierId,load.id]);
    await c.query('INSERT INTO outbox(carrier_id,id,kind,payload) VALUES($1,$2,$3,$4)',[a.carrierId,randomUUID(),'driver.assignment',JSON.stringify({assignmentId:id,driverId:input.driverId,replaces:old?.id,notifyDriverIds:[...new Set([input.driverId,old?.driverId].filter(Boolean))]})]);
    await c.query('INSERT INTO manifests VALUES($1,$2,$3,now())',[a.carrierId,id,JSON.stringify({assignmentId:id,load,driverId:input.driverId,truckId:input.truckId,trailerId:input.trailerId,stops:[load.pickup,load.delivery],provenance:load.provenance})]);
    return this.getAssignment(c,a,id);
  }
  dispatch(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'dispatch.offered',input,async c=>{
    const load=await this.load(c,a,input.loadId);demand(load.version===cmd.expectedVersion,'STALE_VERSION','Load changed. Refresh.');demand(load.status==='open','INVALID_TRANSITION','Load is already assigned.');
    const proof=await this.check(c,a,load,input);demand(proof.eligible,'INELIGIBLE',proof.reasons.join(' '));return this.offer(c,a,load,input);
  });}
  propose(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'recovery.proposed',input,async c=>{
    const load=await this.load(c,a,input.loadId);demand(load.version===cmd.expectedVersion,'STALE_VERSION','Load changed.');
    const current=await c.query("SELECT * FROM assignments WHERE carrier_id=$1 AND load_id=$2 AND status IN ('offered','accepted')",[a.carrierId,load.id]);
    const old=current.rows[0]?assignment(current.rows[0]):undefined;
    demand(!old||!(await closureAreas(c,a.carrierId,[old.id])).length,'CLOSURE_ROUTE_REVIEW_REQUIRED','Closure-affected trips require a remaining-route review; reassignment cannot discard closure evidence.');
    demand(!old||old.status!=='accepted'||load.status!=='in_transit','IN_PROGRESS','An in-transit load needs a reviewed physical handoff; automatic reassignment is unavailable.');
    demand(!old||!await groupFor(c,a.carrierId,old.id),'GROUP_RECOVERY_REQUIRED','Consolidated trips require review of the complete manifest.');
    const proof=await this.check(c,a,load,input,old?.id);demand(proof.eligible,'INELIGIBLE',proof.reasons.join(' '));
    let currentProof:import('../../../packages/domain/src/index.ts').Screening|undefined,currentUnavailable:string|undefined;
    if(old){try{currentProof=await this.check(c,a,load,old,old.id);}catch(error){if(error instanceof DomainError)currentUnavailable=error.message;else throw error;}}
    const resources=await c.query('SELECT id,version FROM resources WHERE carrier_id=$1 AND id=ANY($2::text[])',[a.carrierId,[...new Set([input.driverId,input.truckId,input.trailerId,...(old?[old.driverId,old.truckId,old.trailerId]:[])])]]);
    const id=randomUUID(),body={...input,comparison:{current:currentProof,currentUnavailable,proposed:proof,evaluatedAt:proof.timing?.evaluatedAt},currentAssignmentId:old?.id,currentAssignmentVersion:old?.version,resources:resources.rows,proof,assumptions:['Declared HOS budgets',proof.routingEvidence?'Valhalla truck route with supplied dimensions; OSM restriction coverage applies':'Synthetic straight-line deadhead estimate'],reason:String(input.reason??'Dispatcher recovery rehearsal')};
    await c.query("INSERT INTO proposals(carrier_id,id,load_id,expected_version,status,body) VALUES($1,$2,$3,$4,'pending',$5)",[a.carrierId,id,load.id,load.version,JSON.stringify(body)]);
    return {id,revision:1,status:'pending',loadId:load.id,body};
  });}
  approve(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'recovery.approved',input,async c=>{
    const r=await c.query('SELECT * FROM proposals WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.proposalId]);const p=r.rows[0];demand(p,'NOT_FOUND','Proposal not found.',404);demand(p.status==='pending'&&p.revision===cmd.expectedVersion,'STALE_PROPOSAL','Proposal changed. Rehearse again.');
    const load=await this.load(c,a,p.load_id);demand(load.version===p.expected_version,'STALE_PROPOSAL','The load changed after this rehearsal.');
    for(const resource of p.body.resources){const r=await c.query('SELECT version FROM resources WHERE carrier_id=$1 AND id=$2',[a.carrierId,resource.id]);demand(r.rows[0]?.version===resource.version,'STALE_PROPOSAL','Resource evidence changed after rehearsal.');}
    const old=p.body.currentAssignmentId?await this.getAssignment(c,a,p.body.currentAssignmentId):undefined;
    demand(!old||old.version===p.body.currentAssignmentVersion,'STALE_PROPOSAL','Driver response changed after rehearsal.');
    const proof=await this.check(c,a,load,p.body,old?.id);demand(proof.eligible,'INELIGIBLE',proof.reasons.join(' '));
    const next=await this.offer(c,a,load,p.body,old);
    await c.query("UPDATE proposals SET status='approved',revision=revision+1 WHERE carrier_id=$1 AND id=$2",[a.carrierId,p.id]);
    await c.query('INSERT INTO approvals(carrier_id,id,proposal_id,uid,evidence) VALUES($1,$2,$3,$4,$5)',[a.carrierId,randomUUID(),p.id,a.uid,JSON.stringify({proof,previousAssignment:old,newAssignment:next})]);
    return {proposalId:p.id,assignment:next,status:'approved'};
  });}
  respond(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'driver.response',input,async c=>{
    demand(a.role==='driver','FORBIDDEN','Driver identity required.',403);const v=await this.getAssignment(c,a,input.assignmentId);
    demand(v.driverId===a.driverId,'FORBIDDEN','Assignment belongs to another driver.',403);demand(v.version===cmd.expectedVersion,'STALE_VERSION','Assignment changed.');demand(v.status==='offered','INVALID_TRANSITION','Only offered assignments can be answered.');
    demand(['accept','reject'].includes(input.action),'INVALID_ACTION','Choose accept or reject.',400);
    const grouped=await respondGroup(this,c,a,v,input.action);if(grouped)return grouped;
    const load=await this.load(c,a,v.loadId);
    if(input.action==='accept'){const proof=await this.check(c,a,load,v,v.id);demand(proof.eligible,'INELIGIBLE',proof.reasons.join(' '));}
    await c.query('UPDATE assignments SET status=$3,version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.id,input.action==='accept'?'accepted':'rejected']);
    await c.query('UPDATE loads SET status=$3,version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.loadId,input.action==='accept'?'accepted':'open']);
    if(input.action==='reject')await c.query('UPDATE reservations SET active=false WHERE carrier_id=$1 AND assignment_id=$2',[a.carrierId,v.id]);return this.getAssignment(c,a,v.id);
  });}
  workSession(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'driver.work-session',input,async c=>{
    demand(a.role==='driver'&&a.driverId,'FORBIDDEN','Driver identity required.',403);
    if(input.action==='start'){
      demand(cmd.expectedVersion===0,'STALE_VERSION','New session requires version zero.');const id=randomUUID();
      await c.query('INSERT INTO work_sessions(carrier_id,id,driver_id,started_at) VALUES($1,$2,$3,now())',[a.carrierId,id,a.driverId]);return {id,version:1,status:'active'};
    }
    demand(input.action==='end','INVALID_ACTION','Choose start or end.',400);
    const r=await c.query('UPDATE work_sessions SET ended_at=now(),version=version+1 WHERE carrier_id=$1 AND id=$2 AND driver_id=$3 AND version=$4 AND ended_at IS NULL RETURNING *',[a.carrierId,input.sessionId,a.driverId,cmd.expectedVersion]);demand(r.rows[0],'STALE_VERSION','Work session changed.');return {id:input.sessionId,version:r.rows[0].version,status:'ended'};
  });}
  ingest(a:Actor,cmd:Command,event:Telemetry&{accuracyM:number;sessionId?:string}){return this.command(a,cmd,'telemetry.received',event,async c=>{
    demand(a.role==='driver'||a.role==='simulator','FORBIDDEN','Tracking identity required.',403);
    demand(event&&typeof event.id==='string'&&event.id.length>0,'INVALID_EVENT','Event ID required.',400);timestamp(event.at);
    demand(event.position&&Number.isFinite(event.position.lat)&&Math.abs(event.position.lat)<=90&&Number.isFinite(event.position.lng)&&Math.abs(event.position.lng)<=180,'INVALID_POSITION','Invalid coordinates.',400);
    demand(Number.isFinite(event.accuracyM)&&event.accuracyM>=0&&(event.speedKph===null||(Number.isFinite(event.speedKph)&&event.speedKph>=0&&event.speedKph<=160))&&(event.odometerKm===null||(Number.isFinite(event.odometerKm)&&event.odometerKm>=0)),'INVALID_TELEMETRY','Valid accuracy, speed and odometer required.',400);
    demand(['off_duty','on_duty','driving','sleeper'].includes(event.duty),'INVALID_DUTY','Unknown duty state.',400);
    const v=await this.getAssignment(c,a,event.assignmentId);demand(a.role==='simulator'||v.driverId===a.driverId,'FORBIDDEN','Wrong driver.',403);
    const load=await this.load(c,a,v.loadId);demand((a.role==='simulator'&&event.provenance==='synthetic'&&load.provenance==='synthetic')||(a.role==='driver'&&event.provenance==='live'&&load.provenance==='live'&&!event.deviceSimulation)||(emulatorVerification(a)&&event.deviceSimulation===true&&event.dutyEvidence==='cached-declaration'&&event.provenance==='synthetic'&&load.provenance==='synthetic'),'PROVENANCE_MISMATCH','Tracking provenance does not match trip and identity.',403);
    if(a.role==='driver'){
      const r=await c.query('SELECT * FROM work_sessions WHERE carrier_id=$1 AND id=$2 AND driver_id=$3 AND ended_at IS NULL',[a.carrierId,event.sessionId,a.driverId]);demand(r.rows[0]&&timestamp(event.at)>=new Date(r.rows[0].started_at).getTime(),'NO_WORK_SESSION','Start an explicit work session before tracking.');
      demand(timestamp(event.at)<=Date.now()+60000,'FUTURE_TELEMETRY','Telemetry timestamp is in the future.',400);
    }
    const duplicate=await c.query('SELECT body,disposition FROM telemetry WHERE carrier_id=$1 AND id=$2',[a.carrierId,event.id]);
    if(duplicate.rows[0]){demand(canonical(duplicate.rows[0].body)===canonical(event),'EVENT_ID_COLLISION','Event ID already has different content.');return {duplicate:true,disposition:duplicate.rows[0].disposition};}
    const pendingExit=v.status==='completed'&&(await c.query('SELECT 1 FROM stop_visits WHERE carrier_id=$1 AND assignment_id=$2 AND departure IS NULL AND superseded_by IS NULL LIMIT 1',[a.carrierId,v.id])).rows.length>0;
    const last=await c.query("SELECT body FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2 AND disposition='applied' ORDER BY at DESC LIMIT 1",[a.carrierId,v.id]);
    const previous=last.rows[0]?.body,stale=previous&&timestamp(event.at)<=timestamp(previous.at);
    demand(v.status==='accepted'||pendingExit||(v.status==='completed'&&stale),'NOT_ACCEPTED','Accepted trip, pending departure or late completed-trip evidence required.');
    if(previous&&!stale&&event.odometerKm!==null&&previous.odometerKm!==null)demand(event.odometerKm>=previous.odometerKm,'ODOMETER_REWIND','Odometer cannot decrease.');
    const disposition=stale?'retained_out_of_order':event.accuracyM>100?'uncertain':'applied';
    await c.query('INSERT INTO telemetry(carrier_id,id,assignment_id,session_id,at,location,accuracy_m,body,disposition) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,$10)',[a.carrierId,event.id,v.id,event.sessionId??null,event.at,event.position.lng,event.position.lat,event.accuracyM,JSON.stringify(event),disposition]);
    if(disposition!=='applied'){
      // Late valid duty history can change feasibility without moving the current GPS marker.
      if(disposition==='retained_out_of_order'&&event.accuracyM<=100){await c.query('UPDATE resources SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.driverId]);await c.query('UPDATE assignments SET visit_review_required=true WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.id]);}
      return {duplicate:false,disposition};
    }
    // Keep ingestion proportional to one observation; snapshots/planning derive duty budgets.
    const driver=(await c.query("SELECT body FROM resources WHERE carrier_id=$1 AND id=$2 AND kind='driver' FOR UPDATE",[a.carrierId,v.driverId])).rows[0].body;
    const newer=(await c.query("SELECT 1 FROM telemetry t JOIN assignments a ON a.carrier_id=t.carrier_id AND a.id=t.assignment_id WHERE t.carrier_id=$1 AND a.driver_id=$2 AND t.disposition='applied' AND t.at>$3 LIMIT 1",[a.carrierId,v.driverId,event.at])).rows.length>0;
    await c.query('UPDATE resources SET body=$3,version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.driverId,JSON.stringify(newer?driver:{...driver,position:event.position,duty:event.dutyEvidence==='cached-declaration'?driver.duty:event.duty})]);
    const stops=await c.query('SELECT *,ST_Distance(location,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) AS distance FROM stops WHERE carrier_id=$1 AND load_id=$2',[a.carrierId,load.id,event.position.lng,event.position.lat]);
    // A fix that can belong to multiple scheduled stops cannot establish an arrival.
    // Keep location/duty usable and retain the ambiguity separately from raw telemetry.
    const possibleStops=stops.rows.filter(stop=>Number(stop.distance)-event.accuracyM<=stop.radius_m);
    const ambiguous=possibleStops.length>1;
    const stopStates=stops.rows.map(stop=>({stopId:stop.id,confidence:fenceConfidence(Number(stop.distance),event.accuracyM,Number(stop.radius_m)),distanceM:Number(stop.distance),radiusM:Number(stop.radius_m)}));
    await c.query('UPDATE telemetry SET geofence_evidence=$3 WHERE carrier_id=$1 AND id=$2',[a.carrierId,event.id,JSON.stringify({status:ambiguous?'ambiguous':'evaluated',policy:'unique-possible-trip-stop-v1',sessionPolicy:VISIT_SESSION_POLICY,stopIds:possibleStops.map(stop=>stop.id).sort(),stopStates,reason:ambiguous?'GPS accuracy overlaps multiple trip stops. No new arrival established; review facility identity.':'Boundary uncertainty holds prior visit state. Confident exit and return form separate visits; no grace period.'})]);
    for(const stop of stops.rows){
      const confidence=fenceConfidence(Number(stop.distance),event.accuracyM,Number(stop.radius_m)),inside=!ambiguous&&confidence==='inside',outside=confidence==='outside';
      const r=await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND assignment_id=$2 AND stop_id=$3 AND departure IS NULL AND superseded_by IS NULL',[a.carrierId,v.id,stop.id]);const visit=r.rows[0];
      if(v.status==='accepted'&&inside&&!visit)await c.query('INSERT INTO stop_visits(carrier_id,id,assignment_id,load_id,stop_id,arrival,arrival_event) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.carrierId,randomUUID(),v.id,load.id,stop.id,event.at,event.id]);
      if(outside&&visit){
        const closed=(await c.query('UPDATE stop_visits SET departure=$3,departure_event=$4 WHERE carrier_id=$1 AND id=$2 RETURNING *',[a.carrierId,visit.id,event.at,event.id])).rows[0];
        await prepareDetention(c,a.carrierId,closed,{automatic:true});
      }
    }
    return {duplicate:false,disposition};
  });}
  async visitReview(a:Actor,assignmentId:string){this.dispatcher(a);const c=await this.db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await visitReview(c,a.carrierId,assignmentId);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
  reconcileVisits(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'visits.reconciled',input,c=>applyVisitReview(c,a,cmd,input));}
  detentionDraft(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'invoice.drafted',input,async c=>{
    const r=await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.visitId]);const visit=r.rows[0];demand(visit?.departure&&!visit.superseded_by,'VISIT_OPEN','A closed same-stop visit is required.');
    return prepareDetention(c,a.carrierId,visit,{automatic:false,expectedVersion:cmd.expectedVersion,contractId:input.contractId});
  });}
  bindContract(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'shipment.terms_bound',input,async c=>{
    const load=await this.load(c,a,input.loadId);demand(load.version===cmd.expectedVersion,'STALE_VERSION','Shipment changed.');
    demand(load.mode==='FTL','MODE_UNSUPPORTED','Configured detention policy supports FTL shipments.');
    demand(!(await c.query('SELECT 1 FROM stop_visits WHERE carrier_id=$1 AND load_id=$2 LIMIT 1',[a.carrierId,load.id])).rows.length,'TERMS_LOCKED','Terms must be bound before the first observed visit.');
    demand((await c.query('SELECT 1 FROM contracts WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.contractId])).rows.length,'CONTRACT_REQUIRED','Carrier contract required.');
    await c.query('INSERT INTO load_contracts(carrier_id,load_id,contract_id,bound_by) VALUES($1,$2,$3,$4) ON CONFLICT(carrier_id,load_id) DO UPDATE SET contract_id=excluded.contract_id,bound_by=excluded.bound_by,bound_at=now()',[a.carrierId,load.id,input.contractId,a.uid]);
    await c.query('UPDATE loads SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,load.id]);return {loadId:load.id,contractId:input.contractId,version:load.version+1};
  });}
  delay(a:Actor,cmd:Command,input:Row){demand(a.role==='dispatcher'||a.role==='simulator','FORBIDDEN','Dispatcher or simulator identity required.',403);return this.command(a,cmd,'disruption.recorded',input,async c=>{
    const v=await this.getAssignment(c,a,input.assignmentId);demand(v.version===cmd.expectedVersion,'STALE_VERSION','Assignment changed.');demand(v.status==='accepted','INVALID_TRANSITION','Only accepted trips can report a delay.');const load=await this.load(c,a,v.loadId);
    demand(a.role!=='simulator'||load.provenance==='synthetic','FORBIDDEN','Simulator can only change synthetic trips.',403);timestamp(input.expectedEnd);timestamp(input.observedAt);demand(timestamp(input.expectedEnd)>timestamp(v.endAt),'INVALID_DELAY','Expected end must extend the planned end.',400);
    const id=randomUUID();await c.query('INSERT INTO disruptions VALUES($1,$2,$3,$4,$5,$6,$7)',[a.carrierId,id,v.id,input.expectedEnd,input.reason,input.observedAt,load.provenance]);
    await c.query('UPDATE assignments SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.id]);
    await c.query('UPDATE resources SET version=version+1 WHERE carrier_id=$1 AND id=ANY($2::text[])',[a.carrierId,[v.driverId,v.truckId,v.trailerId]]);
    const impacted=await c.query("SELECT id,load_id,start_at,end_at FROM assignments WHERE carrier_id=$1 AND id<>$2 AND status IN ('offered','accepted') AND (driver_id=$3 OR truck_id=$4 OR trailer_id=$5) AND start_at<$6 AND end_at>$7",[a.carrierId,v.id,v.driverId,v.truckId,v.trailerId,input.expectedEnd,v.endAt]);
    return {id,assignmentId:v.id,expectedEnd:input.expectedEnd,impactedLoads:impacted.rows,provenance:load.provenance,status:'awaiting_recovery',note:'Observed delay retained; planned reservations remain visible until a feasible recovery is approved.'};
  });}
  duty(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'driver.duty',input,async c=>{
    demand(a.role==='driver'&&a.driverId,'FORBIDDEN','Driver identity required.',403);const r=await c.query("SELECT version,body FROM resources WHERE carrier_id=$1 AND id=$2 AND kind='driver'",[a.carrierId,a.driverId]);const driver=r.rows[0];demand(driver?.version===cmd.expectedVersion,'STALE_VERSION','Driver record changed.');
    demand(['off_duty','on_duty','driving','sleeper'].includes(input.duty),'INVALID_DUTY','Unknown duty state.',400);timestamp(input.at);
    const id=randomUUID();await c.query('INSERT INTO duty_events VALUES($1,$2,$3,$4,$5,$6)',[a.carrierId,id,a.driverId,input.at,input.duty,input.note??'']);
    const latest=await c.query('SELECT max(at) AS at FROM duty_events WHERE carrier_id=$1 AND driver_id=$2',[a.carrierId,a.driverId]);
    // Consume dated intervals from the retained basis; never grant a rest reset.
    if(driver.body.provenance!=='synthetic')demand(timestamp(input.at)<=Date.now()+60000,'FUTURE_DUTY','Duty timestamp is in the future.',400);
    const [derived]=await withDutyHistory(c,a.carrierId,[driver.body]);
    const body={...derived,duty:new Date(latest.rows[0].at).getTime()===timestamp(input.at)?input.duty:derived.duty};
    await c.query('UPDATE resources SET version=version+1,body=$3 WHERE carrier_id=$1 AND id=$2',[a.carrierId,a.driverId,JSON.stringify(body)]);return {id,driverId:a.driverId,version:driver.version+1,duty:body.duty,certifiedELD:false};
  });}
  completeStop(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'stop.completed',input,async c=>{
    demand(a.role==='driver','FORBIDDEN','Driver identity required.',403);const v=await this.getAssignment(c,a,input.assignmentId);demand(v.driverId===a.driverId,'FORBIDDEN','Wrong driver.',403);demand(v.version===cmd.expectedVersion,'STALE_VERSION','Assignment changed.');demand(v.status==='accepted','INVALID_TRANSITION','Accepted trip required.');
    const load=await this.load(c,a,v.loadId);demand([load.pickup.id,load.delivery.id].includes(input.stopId),'NOT_FOUND','Stop not part of this trip.',404);
    await checkGroupStop(c,a,v,input.stopId);
    if(input.stopId===load.delivery.id){const pickup=await c.query('SELECT 1 FROM stop_completions WHERE carrier_id=$1 AND assignment_id=$2 AND stop_id=$3',[a.carrierId,v.id,load.pickup.id]);demand(pickup.rows.length,'STOP_ORDER','Complete pickup before delivery.');}
    const occurredAt=input.occurredAt??null;
    if(occurredAt){timestamp(occurredAt);if(load.provenance!=='synthetic')demand(timestamp(occurredAt)<=Date.now()+60000,'FUTURE_COMPLETION','Completion timestamp is in the future.',400);}
    const id=randomUUID();await c.query('INSERT INTO stop_completions(carrier_id,id,assignment_id,load_id,stop_id,uid,note,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.carrierId,id,v.id,load.id,input.stopId,a.uid,input.note??'',occurredAt]);
    const completed=input.stopId===load.delivery.id;
    await c.query('UPDATE assignments SET version=version+1,status=$3 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.id,completed?'completed':'accepted']);
    await c.query('UPDATE loads SET version=version+1,status=$3 WHERE carrier_id=$1 AND id=$2',[a.carrierId,load.id,completed?'completed':'in_transit']);
    if(completed)await releaseCompletedGroup(c,a,v);
    return {id,stopId:input.stopId,occurredAt,assignment:await this.getAssignment(c,a,v.id),billingTimestamp:false};
  });}
  async imports(a:Actor){this.dispatcher(a);return (await this.db.query('SELECT i.id,i.filename,i.sha256,i.created_at,r.sheet,count(*)::integer AS rows,count(*) FILTER(WHERE duplicate_of IS NOT NULL)::integer AS duplicates FROM source_imports i JOIN source_rows r ON r.carrier_id=i.carrier_id AND r.import_id=i.id WHERE i.carrier_id=$1 GROUP BY i.id,i.filename,i.sha256,i.created_at,r.sheet ORDER BY i.created_at DESC,r.sheet',[a.carrierId])).rows;}
  async sourceRows(a:Actor,importId:string,sheet:string,offset=0){this.dispatcher(a);demand(Number.isSafeInteger(offset)&&offset>=0,'INVALID_OFFSET','Invalid source row offset.',400);return (await this.db.query('SELECT * FROM source_rows WHERE carrier_id=$1 AND import_id=$2 AND sheet=$3 ORDER BY row_number LIMIT 100 OFFSET $4',[a.carrierId,importId,sheet,offset])).rows;}

  async authorizeLoad(c:pg.PoolClient,a:Actor,loadId:string){
    demand(a.role==='dispatcher'||a.role==='driver','FORBIDDEN','Operational identity required.',403);
    if(a.role==='driver'){const r=await c.query("SELECT 1 FROM assignments WHERE carrier_id=$1 AND load_id=$2 AND driver_id=$3 AND status IN ('offered','accepted','completed')",[a.carrierId,loadId,a.driverId]);demand(r.rows.length,'FORBIDDEN','Load is not assigned to this driver.',403);}
  }
  document(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'document.registered',input,async c=>{
    await this.authorizeLoad(c,a,input.loadId);const load=await this.load(c,a,input.loadId);demand(load.version===cmd.expectedVersion,'STALE_VERSION','Load changed.');
    demand(['image/jpeg','image/png','application/pdf'].includes(input.mediaType),'INVALID_MEDIA','Use JPEG, PNG or PDF.',400);
    const id=randomUUID();await c.query("INSERT INTO documents(carrier_id,id,load_id,object_name,media_type,status,extraction) VALUES($1,$2::uuid,$3,$2::text,$4,'pending_upload',$5)",[a.carrierId,id,load.id,input.mediaType,JSON.stringify({kind:input.kind,filename:input.filename,provenance:load.provenance})]);return {id,version:1,status:'pending_upload'};
  });}
  uploadDocument(a:Actor,cmd:Command,id:string,bytes:Buffer,mediaType:string,files:Files){return this.command(a,cmd,'document.stored',{id,sha256:sha256(bytes),mediaType},async c=>{
    const r=await c.query('SELECT * FROM documents WHERE carrier_id=$1 AND id=$2',[a.carrierId,id]);const doc=r.rows[0];demand(doc,'NOT_FOUND','Document not found.',404);await this.authorizeLoad(c,a,doc.load_id);
    demand(doc.version===cmd.expectedVersion&&doc.status==='pending_upload','STALE_VERSION','Document already changed.');demand(doc.media_type===mediaType,'INVALID_MEDIA','Content type must match registered document.',400);demand(bytes.length>0&&bytes.length<=12*1024*1024,'INVALID_SIZE','Document must be 1 byte to 12 MB.',400);
    const signature=mediaType==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8:mediaType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.subarray(0,5).toString()==='%PDF-';demand(signature,'INVALID_MEDIA','File signature does not match declared type.',400);
    await files.put(doc.object_name,bytes,mediaType);const hash=sha256(bytes);
    await c.query("UPDATE documents SET status='stored',sha256=$3,version=version+1 WHERE carrier_id=$1 AND id=$2",[a.carrierId,id,hash]);
    const jobId=randomUUID();await c.query("INSERT INTO jobs(carrier_id,id,kind,status,payload) VALUES($1,$2,'document.extract','pending',$3)",[a.carrierId,jobId,JSON.stringify({documentId:id,sha256:hash})]);await c.query("INSERT INTO outbox(carrier_id,id,kind,payload) VALUES($1,$2,'job.enqueue',$3)",[a.carrierId,randomUUID(),JSON.stringify({jobId})]);
    return {id,version:doc.version+1,status:'stored',sha256:hash,extractionStatus:'pending'};
  });}
  async getDocument(a:Actor,id:string,files:Files){const c=await this.db.connect();try{const r=await c.query('SELECT * FROM documents WHERE carrier_id=$1 AND id=$2',[a.carrierId,id]);const doc=r.rows[0];demand(doc?.sha256,'NOT_FOUND','Stored document not found.',404);await this.authorizeLoad(c,a,doc.load_id);return {bytes:await files.get(doc.object_name),mediaType:doc.media_type};}finally{c.release();}}

  pushToken(a:Actor,cmd:Command,input:Row){return this.command(a,cmd,'notification.registration',{platform:input.platform,tokenHash:sha256(Buffer.from(input.token)),enabled:input.enabled!==false},async c=>{
    demand(a.role==='driver'||a.role==='dispatcher','FORBIDDEN','User identity required.',403);demand(cmd.expectedVersion===0,'INVALID_VERSION','Push registration uses version zero.',400);
    const hash=sha256(Buffer.from(input.token));if(input.enabled===false)await c.query('DELETE FROM push_tokens WHERE carrier_id=$1 AND uid=$2 AND token_hash=$3',[a.carrierId,a.uid,hash]);
    else await c.query('INSERT INTO push_tokens(carrier_id,uid,token_hash,token,platform) VALUES($1,$2,$3,$4,$5) ON CONFLICT(carrier_id,uid,token_hash) DO UPDATE SET registered_at=now()',[a.carrierId,a.uid,hash,input.token,input.platform]);
    return {status:input.enabled===false?'disabled':'registered',platform:input.platform};
  });}

  async route(a:Actor,loadId:string,truckId:string){const c=await this.db.connect();try{await this.authorizeLoad(c,a,loadId);if(a.role==='driver')demand((await c.query("SELECT 1 FROM assignments WHERE carrier_id=$1 AND load_id=$2 AND driver_id=$3 AND truck_id=$4 AND status IN ('offered','accepted','completed')",[a.carrierId,loadId,a.driverId,truckId])).rows.length,'FORBIDDEN','Assigned vehicle required.',403);return await roadRoute(c,a.carrierId,await this.load(c,a,loadId),await this.resource<Truck>(c,a,truckId,'truck'));}finally{c.release();}}
  reviewDocument(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'document.reviewed',input,async c=>{
    const doc=(await c.query('SELECT * FROM documents WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.documentId])).rows[0];demand(doc?.status==='stored','NOT_FOUND','Stored document required.',404);demand(doc.version===cmd.expectedVersion,'STALE_VERSION','Document changed. Review current extraction.');
    const revision=doc.version+1,body={sourceSha256:doc.sha256,modelFields:doc.extraction?.fields??null,reviewedFields:input.fields,reason:input.reason,reviewedBy:a.uid};
    await c.query('INSERT INTO document_revisions(carrier_id,id,document_id,revision,corrected_by,body) VALUES($1,$2,$3,$4,$5,$6)',[a.carrierId,randomUUID(),doc.id,revision,a.uid,JSON.stringify(body)]);
    await c.query('UPDATE documents SET version=$3,extraction=extraction || $4::jsonb WHERE carrier_id=$1 AND id=$2',[a.carrierId,doc.id,revision,JSON.stringify({reviewStatus:'reviewed',reviewedFields:input.fields,reviewedBy:a.uid,reviewReason:input.reason})]);return {documentId:doc.id,version:revision,reviewStatus:'reviewed',...body};
  });}
  approveInvoice(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'invoice.approved',input,async c=>{
    const invoice=(await c.query('SELECT * FROM invoice_revisions WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.invoiceId])).rows[0];demand(invoice,'NOT_FOUND','Invoice draft not found.',404);
    const latest=Number((await c.query('SELECT max(revision) AS revision FROM invoice_revisions WHERE carrier_id=$1 AND visit_id=$2',[a.carrierId,invoice.visit_id])).rows[0].revision);
    demand(invoice.status==='draft'&&invoice.revision===latest&&latest===cmd.expectedVersion,'STALE_VERSION','Review the latest invoice draft.');
    const contract=(await c.query('SELECT * FROM contracts WHERE carrier_id=$1 AND id=$2',[a.carrierId,invoice.contract_id])).rows[0];demand(contract.version===invoice.contract_version,'STALE_CONTRACT','Contract changed. Generate a new draft.');
    const visit=(await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND id=$2',[a.carrierId,invoice.visit_id])).rows[0];demand(visit.departure&&!visit.superseded_by&&JSON.stringify([visit.arrival_event,visit.departure_event])===JSON.stringify(invoice.body.evidence),'STALE_EVIDENCE','Visit evidence changed.');
    demand(!(await c.query('SELECT visit_review_required FROM assignments WHERE carrier_id=$1 AND id=$2',[a.carrierId,visit.assignment_id])).rows[0].visit_review_required,'VISIT_REVIEW_REQUIRED','Late GPS evidence requires visit reconciliation before billing approval.');
    demand(input.acknowledgeObservedSamples===true&&String(input.evidenceNote).length>=20,'REVIEW_REQUIRED','Explicit review of observed GPS samples and configured terms is required.');
    const id=randomUUID(),revision=latest+1,body={...invoice.body,requiresEvidenceReview:false,review:{reviewedBy:a.uid,recordedAt:new Date().toISOString(),note:input.evidenceNote,acknowledgeObservedSamples:true,previousRevisionId:invoice.id},precision:'observed_samples'};
    await c.query("INSERT INTO invoice_revisions(carrier_id,id,visit_id,revision,contract_id,contract_version,status,body,approved_by) VALUES($1,$2,$3,$4,$5,$6,'approved',$7,$8)",[a.carrierId,id,invoice.visit_id,revision,contract.id,contract.version,JSON.stringify(body),a.uid]);return {id,revision,status:'approved',...body};
  });}
  facilityNote(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'facility.instructions_reviewed',input,async c=>{
    const doc=(await c.query('SELECT * FROM documents WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.documentId])).rows[0];demand(doc?.status==='stored','NOT_FOUND','Source document required.',404);demand(doc.version===cmd.expectedVersion&&doc.extraction?.reviewStatus==='reviewed','REVIEW_REQUIRED','Review the current source document first.');
    demand((await c.query('SELECT 1 FROM stops WHERE carrier_id=$1 AND load_id=$2 AND id=$3',[a.carrierId,doc.load_id,input.stopId])).rows.length,'STOP_MISMATCH','Instructions must reference a stop on the source shipment.');const id=randomUUID();await c.query('INSERT INTO facility_notes(carrier_id,id,load_id,stop_id,document_id,document_version,instructions,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.carrierId,id,doc.load_id,input.stopId,doc.id,doc.version,input.instructions,a.uid]);return {id,stopId:input.stopId,instructions:input.instructions,sourceDocumentId:doc.id,reviewedBy:a.uid};
  });}
  maintenance(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'resource.maintenance',input,async c=>{
    const resource=(await c.query('SELECT * FROM resources WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.resourceId])).rows[0];demand(resource,'NOT_FOUND','Resource not found.',404);demand(resource.version===cmd.expectedVersion,'STALE_VERSION','Resource changed.');let id=input.holdId;
    if(input.action==='hold'){demand(timestamp(input.endAt)>timestamp(input.startAt),'INVALID_TIME','Hold end must follow start.',400);id=randomUUID();await c.query("INSERT INTO maintenance_holds(carrier_id,id,resource_id,period,reason,recorded_by) VALUES($1,$2,$3,tstzrange($4,$5,'[)'),$6,$7)",[a.carrierId,id,resource.id,input.startAt,input.endAt,input.reason,a.uid]);}
    else {const result=await c.query('UPDATE maintenance_holds SET resolved_at=now() WHERE carrier_id=$1 AND id=$2 AND resource_id=$3 AND resolved_at IS NULL',[a.carrierId,id,resource.id]);demand(result.rowCount,'NOT_FOUND','Active hold not found.',404);}
    await c.query('UPDATE resources SET version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,resource.id]);return {id,resourceId:resource.id,version:resource.version+1,status:input.action==='hold'?'held':'released'};
  });}
  approvePlan(a:Actor,cmd:Command,input:Row){return approvePlan(this,a,cmd,input);}
  optimize(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'planning.computed',input,async c=>{
    demand(cmd.expectedVersion===0,'INVALID_VERSION','New planning run requires version zero.');
    demand(new Set(input.loadIds).size===input.loadIds.length,'DUPLICATE_LOAD','Choose each load once.');for(const field of ['driverId','truckId','trailerId'])demand(new Set(input.vehicles.map((v:Row)=>v[field])).size===input.vehicles.length,'DUPLICATE_RESOURCE','Each planning vehicle must use distinct resources.');
    const loads:Load[]=await Promise.all(input.loadIds.map((id:string)=>this.load(c,a,id)));demand(new Set(loads.map(l=>l.provenance)).size===1,'MIXED_CLOCKS','Plan synthetic and live work separately.');
    demand(loads.every(l=>l.provenance==='synthetic'),'CAPACITY_UNVERIFIED','Live optimization needs verified pallet capacities.');
    const now=await this.now(c,a,loads[0].provenance),minute=(at:string)=>Math.ceil((timestamp(at)-timestamp(now))/60000),rejected:Row[]=[],shipments:Row[]=[],locations:Row[]=[],profiles:Row[]=[],vehicles:Row[]=[],versions:Row[]=[];
    for(const load of loads){const start=minute(load.startAt),end=minute(load.endAt);if(load.status!=='open'||!load.weightLb||start<0||end>1440){rejected.push({load_id:load.id,reason:load.status!=='open'?'Already assigned; use the reviewed recovery workflow':!load.weightLb?'Missing verified weight':'Outside supported 24-hour planning horizon'});continue;}shipments.push({id:load.id,equipment:load.equipment,weight_lb:load.weightLb,pallets:load.pallets,mode:load.mode,pickup_window:[start,start],delivery_window:[start,end-Math.floor(load.serviceMinutes/2)],pickup_service:Math.ceil(load.serviceMinutes/2),delivery_service:Math.floor(load.serviceMinutes/2)});versions.push({kind:'load',id:load.id,version:load.version});}
    for(const candidate of input.vehicles){let driver=await this.resource<Driver>(c,a,candidate.driverId,'driver');const truck=await this.resource<Truck>(c,a,candidate.truckId,'truck'),trailer=await this.resource<Trailer>(c,a,candidate.trailerId,'trailer');
      if(!driver.budget||!driver.budgetAsOf||!truck.routingProfile){rejected.push({vehicle_id:truck.id,reason:'Missing HOS or truck dimensions'});continue;}
      demand(loads[0].provenance==='synthetic'||truck.routingProfile.evidence==='operator-verified','ROUTING_INPUT_UNVERIFIED','Live vehicle dimensions require review.');
      const assigned=(await c.query("SELECT a.*,greatest(a.end_at,coalesce((SELECT max(expected_end) FROM disruptions d WHERE d.carrier_id=a.carrier_id AND d.assignment_id=a.id),a.end_at)) AS effective_end FROM assignments a WHERE carrier_id=$1 AND status IN ('offered','accepted') AND (driver_id=$2 OR truck_id=$3 OR trailer_id=$4) ORDER BY end_at",[a.carrierId,driver.id,truck.id,trailer.id])).rows;
      if((await closureAreas(c,a.carrierId,assigned.map(r=>r.id))).length){rejected.push({vehicle_id:truck.id,reason:'Active closure-affected commitment requires completion or dedicated route review; batch planning cannot assume its old travel time.'});continue;}
      let availableAt=0;const projectedGroups=new Set<string>();
      for(const prior of assigned){
        if(minute(iso(prior.effective_end))<=0)continue;
        availableAt=Math.max(availableAt,minute(iso(prior.effective_end)));
        if(prior.driver_id!==driver.id)continue;
        const group=await groupFor(c,a.carrierId,prior.id);
        if(group&&projectedGroups.has(group.id))continue;
        if(group)projectedGroups.add(group.id);
        const l=group?null:await this.load(c,a,prior.load_id);
        const drivingMinutes=group?group.body.drivingMinutes:l!.drivingMinutes;
        const dutyMinutes=group?group.body.dutyMinutes:l!.drivingMinutes+l!.serviceMinutes;
        driver={...driver,position:group?group.body.stops.at(-1).point:l!.delivery,budget:{...driver.budget!,drivingMinutes:Math.max(0,driver.budget!.drivingMinutes-drivingMinutes),onDutyMinutes:Math.max(0,driver.budget!.onDutyMinutes-dutyMinutes),cycleMinutes:Math.max(0,driver.budget!.cycleMinutes-dutyMinutes)}};
      }
      if(availableAt>1440){rejected.push({vehicle_id:truck.id,reason:'Committed beyond planning horizon'});continue;}
      const held=(await c.query("SELECT 1 FROM maintenance_holds WHERE carrier_id=$1 AND resource_id=ANY($2::text[]) AND resolved_at IS NULL AND period && tstzrange($3,$4,'[)')",[a.carrierId,[driver.id,truck.id,trailer.id],now,new Date(timestamp(now)+86400000).toISOString()])).rows.length>0;
      const id=truck.id;vehicles.push({id,driverId:driver.id,truckId:truck.id,trailerId:trailer.id,equipment:trailer.equipment,capacity_lb:trailer.capacityLb,pallet_capacity:26,driving_minutes:driver.budget!.drivingMinutes,duty_minutes:driver.budget!.onDutyMinutes,shift_minutes:driver.budget!.shiftMinutes,cycle_minutes:driver.budget!.cycleMinutes,available_at:availableAt,evidence_at:driver.budgetAsOf,maintenance_hold:held});locations.push({lat:driver.position.lat,lon:driver.position.lng});profiles.push(truck.routingProfile);
      versions.push(...(await c.query('SELECT id,version,kind FROM resources WHERE carrier_id=$1 AND id=ANY($2::text[])',[a.carrierId,[driver.id,truck.id,trailer.id]])).rows);
    }
    for(const shipment of shipments){const l=loads.find(l=>l.id===shipment.id)!;locations.push({lat:l.pickup.lat,lon:l.pickup.lng},{lat:l.delivery.lat,lon:l.delivery.lng});}
    const id=randomUUID(),request={now,vehicles,loads:shipments,locations,profiles,evidence_ref:id,time_limit_seconds:3};
    const result=vehicles.length&&shipments.length?await computation('/optimize-roads',request):{status:'no_eligible_inputs',routes:[],infeasible_loads:[]};result.infeasible_loads.push(...rejected);result.assumptions=[...(result.assumptions??[]),'Pickup appointment fixed at supplied start; delivery must finish by supplied end','26-pallet synthetic trailer allowance; verify before live use','Optimization is a proposal; route execution still requires dispatcher approval'];
    await c.query('INSERT INTO planning_runs(carrier_id,id,input,result,created_by) VALUES($1,$2,$3,$4,$5)',[a.carrierId,id,JSON.stringify({...request,versions,commitmentHash:await commitmentHash(c,a.carrierId)}),JSON.stringify(result),a.uid]);return {id,version:1,status:'proposal',result};
  });}
  async hosHistory(a:Actor,driverId:string){
    demand(a.role==='dispatcher'||a.role==='driver'&&a.driverId===driverId,'FORBIDDEN','Duty history belongs to another driver.',403);
    const row=(await this.db.query('SELECT revision,body,provenance,source_ref,source_text,source_sha256,review_reason,reviewed_by,reviewed_at FROM hos_profiles WHERE carrier_id=$1 AND driver_id=$2 ORDER BY revision DESC LIMIT 1',[a.carrierId,driverId])).rows[0];return {driverId,record:row??null};
  }
  async previewHos(a:Actor,raw:HosReviewInput){
    this.dispatcher(a);const input=hosReviewSchema.parse(raw),c=await this.db.connect();
    try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const row=(await c.query("SELECT body,version FROM resources WHERE carrier_id=$1 AND id=$2 AND kind='driver'",[a.carrierId,input.driverId])).rows[0];demand(row,'NOT_FOUND','Driver unavailable.',404);const profile=importedHosProfile(input);const [driver]=await withDutyHistory(c,a.carrierId,[row.body],{driverId:input.driverId,body:profile});await c.query('COMMIT');return {driverId:input.driverId,expectedVersion:row.version,profile,sourceSha256:createHash('sha256').update(input.sourceCsv).digest('hex'),budget:driver.budget,budgetAsOf:driver.budgetAsOf,hosEvidence:driver.hosEvidence};}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  reviewHos(a:Actor,cmd:Command,raw:HosReviewInput){const input=hosReviewSchema.parse(raw);return this.command(a,cmd,'hos.reviewed',input,async c=>{
    this.dispatcher(a);const row=(await c.query("SELECT body,version FROM resources WHERE carrier_id=$1 AND id=$2 AND kind='driver'",[a.carrierId,input.driverId])).rows[0];demand(row,'NOT_FOUND','Driver unavailable.',404);demand(row.version===cmd.expectedVersion,'STALE_VERSION','Driver evidence changed. Preview the history again.');const profile=importedHosProfile(input);const [driver]=await withDutyHistory(c,a.carrierId,[row.body],{driverId:input.driverId,body:profile});demand(driver.hosEvidence.status!=='incomplete'||input.acceptIncomplete,'INCOMPLETE_HISTORY','History is incomplete. Explicitly acknowledge unavailable driving budgets before saving it.');
    const revision=(await c.query('SELECT coalesce(max(revision),0)+1 AS n FROM hos_profiles WHERE carrier_id=$1 AND driver_id=$2',[a.carrierId,input.driverId])).rows[0].n;const hash=createHash('sha256').update(input.sourceCsv).digest('hex');
    await c.query('INSERT INTO hos_profiles(carrier_id,driver_id,revision,body,provenance,source_ref,reviewed_by,source_text,source_sha256,review_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[a.carrierId,input.driverId,revision,JSON.stringify(profile),row.body.provenance,input.sourceName,a.uid,input.sourceCsv,hash,input.reason]);
    await c.query('UPDATE resources SET version=version+1,body=$3 WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.driverId,JSON.stringify(driver)]);return {driverId:input.driverId,version:row.version+1,revision,sourceSha256:hash,budget:driver.budget,hosEvidence:{...driver.hosEvidence,revision,sourceRef:input.sourceName,reviewedBy:a.uid}};
  });}
  async mileage(a:Actor,scope:{assignmentId?:string;sessionId?:string}) {return mileageReport(this,a,scope);}
  async tracking(a:Actor,assignmentId:string,before?:string){
    demand(a.role==='driver'||a.role==='dispatcher','FORBIDDEN','Tracking history requires an operational identity.',403);
    demand(typeof assignmentId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignmentId),'INVALID_ASSIGNMENT','Assignment ID required.',400);
    let cursor:[string,string]|undefined;
    if(before){try{if(before.length>1024)throw new Error();const value=JSON.parse(Buffer.from(before,'base64url').toString());if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||!Number.isFinite(Date.parse(value[0]))||typeof value[1]!=='string'||value[1].length>128)throw new Error();cursor=value as [string,string];}catch{throw new DomainError('INVALID_CURSOR','Tracking cursor is invalid.',400);}}
    const c=await this.db.connect();try{
      const trip=await this.getAssignment(c,a,assignmentId);demand(a.role==='dispatcher'||trip.driverId===a.driverId,'FORBIDDEN','Tracking belongs to another driver.',403);
      const rows=(await c.query('SELECT id,at,recorded_at,body,disposition,geofence_evidence FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2 AND ($3::timestamptz IS NULL OR (at,id)<($3::timestamptz,$4::text)) ORDER BY at DESC,id DESC LIMIT 501',[a.carrierId,assignmentId,cursor?.[0]??null,cursor?.[1]??null])).rows;
      const latest=(await c.query('SELECT max(recorded_at) AS received FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2',[a.carrierId,assignmentId])).rows[0].received;
      const selected=rows.slice(0,500),last=selected.at(-1);return {assignmentId,serverTime:new Date().toISOString(),latestReceivedAt:latest?iso(latest):null,points:selected.reverse().map(r=>({...r.body,recordedAt:iso(r.recorded_at),disposition:r.disposition,geofenceEvidence:r.geofence_evidence})),nextBefore:rows.length>500?Buffer.from(JSON.stringify([iso(last.at),last.id])).toString('base64url'):null};
    }finally{c.release();}
  }
  async snapshot(a:Actor){
    const own=a.role==='driver';demand(own||a.role==='dispatcher','FORBIDDEN','Operational view unavailable for this role.',403);
    // The aggregate and derived duty history share one read-only MVCC snapshot.
    const c=await this.db.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const r=(await c.query(`WITH own_assignments AS (
      SELECT * FROM assignments WHERE carrier_id=$1 AND ($2::text IS NULL OR driver_id=$2)
    ), load_ids AS (SELECT DISTINCT load_id FROM own_assignments), resource_ids AS (
      SELECT driver_id AS id FROM own_assignments UNION SELECT truck_id FROM own_assignments UNION SELECT trailer_id FROM own_assignments UNION SELECT $2::text
    ) SELECT
      (SELECT coalesce(max(cursor),0)::text FROM events WHERE carrier_id=$1) AS cursor,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM own_assignments t) AS assignments,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM loads t WHERE carrier_id=$1 AND ($2::text IS NULL OR id IN (SELECT load_id FROM load_ids))) AS loads,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM resources t WHERE carrier_id=$1 AND ($2::text IS NULL OR id IN (SELECT id FROM resource_ids))) AS resources,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM scenarios t WHERE carrier_id=$1 AND $2::text IS NULL) AS scenarios,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM proposals t WHERE carrier_id=$1 AND $2::text IS NULL) AS proposals,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM stop_visits t WHERE carrier_id=$1 AND superseded_by IS NULL AND ($2::text IS NULL OR assignment_id IN (SELECT id FROM own_assignments))) AS visits,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM invoice_revisions t WHERE carrier_id=$1 AND $2::text IS NULL AND EXISTS(SELECT 1 FROM stop_visits v WHERE v.carrier_id=t.carrier_id AND v.id=t.visit_id AND v.superseded_by IS NULL)) AS invoices,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM maintenance_holds t WHERE carrier_id=$1 AND $2::text IS NULL) AS "maintenanceHolds",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM planning_runs t WHERE carrier_id=$1 AND $2::text IS NULL) AS "planningRuns",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM disruptions t WHERE carrier_id=$1 AND $2::text IS NULL) AS disruptions,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM documents t WHERE carrier_id=$1 AND ($2::text IS NULL OR load_id IN (SELECT load_id FROM load_ids))) AS documents,
      (SELECT coalesce(jsonb_agg(t),'[]') FROM facility_notes t WHERE carrier_id=$1 AND ($2::text IS NULL OR load_id IN (SELECT load_id FROM load_ids))) AS "facilityNotes",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM work_sessions t WHERE carrier_id=$1 AND ($2::text IS NULL OR driver_id=$2)) AS "workSessions",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM duty_events t WHERE carrier_id=$1 AND ($2::text IS NULL OR driver_id=$2)) AS "dutyEvents",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM stop_completions t WHERE carrier_id=$1 AND ($2::text IS NULL OR assignment_id IN (SELECT id FROM own_assignments))) AS "stopCompletions",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM trip_groups t WHERE carrier_id=$1 AND ($2::text IS NULL OR driver_id=$2)) AS "tripGroups",
      (SELECT coalesce(jsonb_agg(t),'[]') FROM manifests t WHERE carrier_id=$1 AND ($2::text IS NULL OR assignment_id IN (SELECT id FROM own_assignments))) AS manifests`,[a.carrierId,own?a.driverId:null])).rows[0] as {cursor:string;assignments:Row[];loads:Row[];resources:Row[];scenarios:Row[];proposals:Row[];visits:Row[];invoices:Row[];maintenanceHolds:Row[];planningRuns:Row[];disruptions:Row[];documents:Row[];facilityNotes:Row[];workSessions:Row[];dutyEvents:Row[];stopCompletions:Row[];tripGroups:Row[];manifests:Row[]};
    const resources=r.resources.map((v:Row)=>({...v.body,kind:v.kind,version:v.version}));
    const drivers=await withDutyHistory(c,a.carrierId,resources.filter(v=>v.kind==='driver'));
    const result={...r,capabilities:{cachedDutyTelemetry:true,emulatorTracking:emulatorVerification(a)},actor:{role:a.role,driverId:a.driverId,carrierId:a.carrierId},serverTime:new Date().toISOString(),loads:r.loads.map((l:Row)=>({...l.body,version:l.version,status:l.status})),assignments:r.assignments.map(assignment),resources:resources.map(v=>v.kind==='driver'?drivers.find(d=>d.id===v.id)!:v)};
    await c.query('COMMIT');return result;
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async updates(a:Actor,cursor:string){
    demand(/^\d+$/.test(cursor),'INVALID_CURSOR','Cursor must be a nonnegative integer.',400);
    // Drivers receive invalidation cursors, never other drivers' event payloads.
    const {rows}=await this.db.query('SELECT cursor::text,kind,recorded_at FROM events WHERE carrier_id=$1 AND cursor>$2 ORDER BY cursor LIMIT 200',[a.carrierId,cursor]);return {cursor:rows.at(-1)?.cursor??cursor,changes:rows.map(r=>({cursor:r.cursor,kind:a.role==='driver'?'state.changed':r.kind,recordedAt:r.recorded_at}))};
  }
  async seed(carrierId='demo-carrier'){
    const c=await this.db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[carrierId]);
      if((await c.query('SELECT 1 FROM carriers WHERE id=$1',[carrierId])).rows.length){await c.query('COMMIT');return;}
      await c.query('INSERT INTO carriers VALUES($1,$2)',[carrierId,'RoadStar · synthetic demonstration']);const data=fixtures();
      for(const [kind,items] of [['driver',data.drivers],['truck',data.trucks],['trailer',data.trailers]] as const)for(const item of items)await c.query('INSERT INTO resources(carrier_id,id,kind,body) VALUES($1,$2,$3,$4)',[carrierId,item.id,kind,JSON.stringify(item)]);
      for(const load of data.loads){await c.query('INSERT INTO loads VALUES($1,$2,$3,$4,$5)',[carrierId,load.id,load.version,load.status,JSON.stringify(load)]);for(const [i,s] of [load.pickup,load.delivery].entries())await c.query('INSERT INTO stops VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8)',[carrierId,load.id,s.id,i,s.lng,s.lat,s.radiusM,JSON.stringify(s)]);}
      await c.query("INSERT INTO scenarios(carrier_id,id,clock,initial_state,seed) VALUES($1,'recovery',$2,$3,42)",[carrierId,DEMO_NOW,JSON.stringify(data)]);
      for(const [uid,role,driver] of [['demo-dispatcher','dispatcher',null],['demo-driver-1','driver','D-01'],['demo-driver-2','driver','D-02'],['demo-simulator','simulator',null]])await c.query('INSERT INTO memberships VALUES($1,$2,$3,$4)',[carrierId,uid,role,driver]);
      for(const driver of data.drivers)if(driver.budget&&driver.budgetAsOf)await c.query('INSERT INTO hos_bases VALUES($1,$2,$3,$4,$5,$6)',[carrierId,driver.id,driver.budgetAsOf,driver.duty,JSON.stringify(driver.budget),driver.provenance]);
      await c.query("INSERT INTO contracts VALUES($1,'demo-ftl',1,120,10000,'CAD','synthetic scenario terms')",[carrierId]);for(const load of data.loads)await c.query("INSERT INTO load_contracts(carrier_id,load_id,contract_id,bound_by) VALUES($1,$2,'demo-ftl','synthetic-fixture')",[carrierId,load.id]);await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
