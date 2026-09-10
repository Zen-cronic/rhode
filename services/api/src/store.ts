import type pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {demand,DomainError,screen,timestamp} from '../../../packages/domain/src/index.ts';
import type {Load,Driver,Truck,Trailer,Assignment,Telemetry} from '../../../packages/domain/src/index.ts';
import {fixtures,DEMO_NOW} from './fixtures.ts';
export type Actor={uid:string;carrierId:string;role:'dispatcher'|'driver'|'simulator'|'worker';driverId?:string};
export type Command={key:string;expectedVersion:number};
type Row=Record<string,any>;
const canonical=(x:any):string=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const iso=(v:Date|string)=>new Date(v).toISOString();
const assignment=(r:Row):Assignment=>({id:r.id,loadId:r.load_id,driverId:r.driver_id,truckId:r.truck_id,trailerId:r.trailer_id,startAt:iso(r.start_at),endAt:iso(r.end_at),status:r.status,version:r.version});
export class Store {
  readonly db:pg.Pool;
  constructor(db:pg.Pool){this.db=db;}
  async membership(uid:string,carrierId:string):Promise<Actor> {
    const {rows}=await this.db.query('SELECT * FROM memberships WHERE carrier_id=$1 AND uid=$2',[carrierId,uid]);
    demand(rows[0],'FORBIDDEN','Carrier membership required.',403);
    return {uid,carrierId,role:rows[0].role,driverId:rows[0].driver_id??undefined};
  }
  async command(a:Actor,cmd:Command,kind:string,input:unknown,work:(c:pg.PoolClient)=>Promise<unknown>) {
    demand(typeof cmd.key==='string'&&cmd.key.length>=8&&cmd.key.length<=128,'INVALID_KEY','An idempotency key of 8–128 characters is required.',400);
    demand(Number.isSafeInteger(cmd.expectedVersion)&&cmd.expectedVersion>=0,'INVALID_VERSION','Expected version is required.',400);
    const fingerprint=createHash('sha256').update(canonical({kind,input,expectedVersion:cmd.expectedVersion})).digest('hex');
    const c=await this.db.connect();
    try {
      await c.query('BEGIN');
      // All operational mutations serialize per carrier, including event cursor allocation.
      // Database exclusion constraints remain the final guard for other writers.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[a.carrierId]);
      const old=await c.query('SELECT * FROM commands WHERE carrier_id=$1 AND uid=$2 AND key=$3',[a.carrierId,a.uid,cmd.key]);
      if(old.rows[0]) {demand(old.rows[0].fingerprint===fingerprint,'KEY_REUSED','Idempotency key was used for different content.');await c.query('COMMIT');return old.rows[0].result;}
      await c.query('INSERT INTO commands(carrier_id,uid,key,fingerprint) VALUES($1,$2,$3,$4)',[a.carrierId,a.uid,cmd.key,fingerprint]);
      const result=await work(c);
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
    const r=await c.query('SELECT body FROM resources WHERE carrier_id=$1 AND id=$2 AND kind=$3',[a.carrierId,id,kind]);demand(r.rows[0],'NOT_FOUND',`${kind} not found.`,404);return r.rows[0].body;
  }
  async getAssignment(c:pg.PoolClient,a:Actor,id:string){
    const r=await c.query('SELECT * FROM assignments WHERE carrier_id=$1 AND id=$2',[a.carrierId,id]);demand(r.rows[0],'NOT_FOUND','Assignment not found.',404);return assignment(r.rows[0]);
  }
  async now(c:pg.PoolClient,a:Actor,provenance:string){
    if(provenance!=='synthetic')return new Date().toISOString();
    const r=await c.query("SELECT clock FROM scenarios WHERE carrier_id=$1 AND id='recovery'",[a.carrierId]);demand(r.rows[0],'NO_SCENARIO','Scenario clock is unavailable.');return iso(r.rows[0].clock);
  }
  async check(c:pg.PoolClient,a:Actor,load:Load,input:Row,ignoreId?:string){
    const driver=await this.resource<Driver>(c,a,input.driverId,'driver'),truck=await this.resource<Truck>(c,a,input.truckId,'truck'),trailer=await this.resource<Trailer>(c,a,input.trailerId,'trailer');
    const rows=await c.query("SELECT * FROM assignments WHERE carrier_id=$1 AND status IN ('offered','accepted')",[a.carrierId]);
    const result=screen({...load,status:'open'},driver,truck,trailer,rows.rows.map(assignment).filter(x=>x.id!==ignoreId),await this.now(c,a,load.provenance));
    const holds=await c.query('SELECT reason FROM maintenance_holds WHERE carrier_id=$1 AND resource_id=ANY($2::text[]) AND period && tstzrange($3,$4,\'[)\')',[a.carrierId,[input.driverId,input.truckId,input.trailerId],load.startAt,load.endAt]);
    result.reasons.push(...holds.rows.map(r=>`Maintenance hold: ${r.reason}`)); result.eligible=result.reasons.length===0;return result;
  }
  async offer(c:pg.PoolClient,a:Actor,load:Load,input:Row,old?:Assignment){
    if(old){await c.query("UPDATE assignments SET status='superseded',version=version+1 WHERE carrier_id=$1 AND id=$2",[a.carrierId,old.id]);await c.query('UPDATE reservations SET active=false WHERE carrier_id=$1 AND assignment_id=$2',[a.carrierId,old.id]);}
    const id=randomUUID();
    await c.query("INSERT INTO assignments VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'offered')",[a.carrierId,id,load.id,input.driverId,input.truckId,input.trailerId,load.startAt,load.endAt]);
    for(const resource of [input.driverId,input.truckId,input.trailerId])await c.query("INSERT INTO reservations VALUES($1,$2,$3,$4,tstzrange($5,$6,'[)'),true)",[a.carrierId,randomUUID(),id,resource,load.startAt,load.endAt]);
    await c.query("UPDATE loads SET version=version+1,status='offered' WHERE carrier_id=$1 AND id=$2",[a.carrierId,load.id]);
    await c.query('INSERT INTO outbox(carrier_id,id,kind,payload) VALUES($1,$2,$3,$4)',[a.carrierId,randomUUID(),'driver.assignment',JSON.stringify({assignmentId:id,driverId:input.driverId,replaces:old?.id,notifyDriverIds:[...new Set([input.driverId,old?.driverId].filter(Boolean))]})]);
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
    demand(!old||old.status!=='accepted'||load.status!=='in_transit','IN_PROGRESS','An in-transit load needs a reviewed physical handoff; automatic reassignment is unavailable.');
    const proof=await this.check(c,a,load,input,old?.id);demand(proof.eligible,'INELIGIBLE',proof.reasons.join(' '));
    const resources=await c.query('SELECT id,version FROM resources WHERE carrier_id=$1 AND id=ANY($2::text[])',[a.carrierId,[input.driverId,input.truckId,input.trailerId]]);
    const id=randomUUID(),body={...input,currentAssignmentId:old?.id,currentAssignmentVersion:old?.version,resources:resources.rows,proof,assumptions:['Declared HOS budgets','Straight-line deadhead estimate until Valhalla integration'],reason:String(input.reason??'Dispatcher recovery rehearsal')};
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
    demand(Number.isFinite(event.accuracyM)&&event.accuracyM>=0&&Number.isFinite(event.speedKph)&&event.speedKph>=0&&event.speedKph<=160&&Number.isFinite(event.odometerKm)&&event.odometerKm>=0,'INVALID_TELEMETRY','Valid accuracy, speed and odometer required.',400);
    demand(['off_duty','on_duty','driving','sleeper'].includes(event.duty),'INVALID_DUTY','Unknown duty state.',400);
    const v=await this.getAssignment(c,a,event.assignmentId);demand(a.role==='simulator'||v.driverId===a.driverId,'FORBIDDEN','Wrong driver.',403);
    const load=await this.load(c,a,v.loadId);demand((a.role==='simulator'&&event.provenance==='synthetic'&&load.provenance==='synthetic')||(a.role==='driver'&&event.provenance==='live'&&load.provenance==='live'),'PROVENANCE_MISMATCH','Tracking provenance does not match trip and identity.',403);
    if(a.role==='driver'){
      const r=await c.query('SELECT * FROM work_sessions WHERE carrier_id=$1 AND id=$2 AND driver_id=$3 AND ended_at IS NULL',[a.carrierId,event.sessionId,a.driverId]);demand(r.rows[0]&&timestamp(event.at)>=new Date(r.rows[0].started_at).getTime(),'NO_WORK_SESSION','Start an explicit work session before tracking.');
      demand(timestamp(event.at)<=Date.now()+60000,'FUTURE_TELEMETRY','Telemetry timestamp is in the future.',400);
    }
    const duplicate=await c.query('SELECT body,disposition FROM telemetry WHERE carrier_id=$1 AND id=$2',[a.carrierId,event.id]);
    if(duplicate.rows[0]){demand(canonical(duplicate.rows[0].body)===canonical(event),'EVENT_ID_COLLISION','Event ID already has different content.');return {duplicate:true,disposition:duplicate.rows[0].disposition};}
    demand(v.status==='accepted','NOT_ACCEPTED','Driver acceptance required.');
    const last=await c.query("SELECT body FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2 AND disposition='applied' ORDER BY at DESC LIMIT 1",[a.carrierId,v.id]);
    const previous=last.rows[0]?.body,stale=previous&&timestamp(event.at)<=timestamp(previous.at);
    if(previous&&!stale)demand(event.odometerKm>=previous.odometerKm,'ODOMETER_REWIND','Odometer cannot decrease.');
    const disposition=stale?'retained_out_of_order':event.accuracyM>100?'uncertain':'applied';
    await c.query('INSERT INTO telemetry(carrier_id,id,assignment_id,session_id,at,location,accuracy_m,body,disposition) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,$10)',[a.carrierId,event.id,v.id,event.sessionId??null,event.at,event.position.lng,event.position.lat,event.accuracyM,JSON.stringify(event),disposition]);
    if(disposition!=='applied')return {duplicate:false,disposition};
    const driver=await this.resource<Driver>(c,a,v.driverId,'driver');
    await c.query('UPDATE resources SET body=$3,version=version+1 WHERE carrier_id=$1 AND id=$2',[a.carrierId,v.driverId,JSON.stringify({...driver,position:event.position,duty:event.duty})]);
    const stops=await c.query('SELECT *,ST_Distance(location,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) AS distance FROM stops WHERE carrier_id=$1 AND load_id=$2',[a.carrierId,load.id,event.position.lng,event.position.lat]);
    for(const stop of stops.rows){
      const inside=Number(stop.distance)+event.accuracyM<stop.radius_m,outside=Number(stop.distance)-event.accuracyM>stop.radius_m;
      const r=await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND assignment_id=$2 AND stop_id=$3 AND departure IS NULL',[a.carrierId,v.id,stop.id]);const visit=r.rows[0];
      if(inside&&!visit)await c.query('INSERT INTO stop_visits(carrier_id,id,assignment_id,load_id,stop_id,arrival,arrival_event) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.carrierId,randomUUID(),v.id,load.id,stop.id,event.at,event.id]);
      if(outside&&visit)await c.query('UPDATE stop_visits SET departure=$3,departure_event=$4 WHERE carrier_id=$1 AND id=$2',[a.carrierId,visit.id,event.at,event.id]);
    }
    return {duplicate:false,disposition};
  });}
  detentionDraft(a:Actor,cmd:Command,input:Row){this.dispatcher(a);return this.command(a,cmd,'invoice.drafted',input,async c=>{
    const r=await c.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.visitId]);const visit=r.rows[0];demand(visit?.departure,'VISIT_OPEN','A closed same-stop visit is required.');
    const contract=(await c.query('SELECT * FROM contracts WHERE carrier_id=$1 AND id=$2',[a.carrierId,input.contractId])).rows[0];demand(contract,'CONTRACT_REQUIRED','Configured contract terms required.');
    const last=await c.query('SELECT max(revision) AS revision FROM invoice_revisions WHERE carrier_id=$1 AND visit_id=$2',[a.carrierId,visit.id]);const version=last.rows[0].revision??0;demand(version===cmd.expectedVersion,'STALE_VERSION','Invoice revision changed.');
    const dwellMinutes=Math.floor((new Date(visit.departure).getTime()-new Date(visit.arrival).getTime())/60000),billableMinutes=Math.max(0,dwellMinutes-contract.free_minutes);
    const body={dwellMinutes,billableMinutes,amountCents:Math.round(billableMinutes*contract.rate_cents_per_hour/60),currency:contract.currency,evidence:[visit.arrival_event,visit.departure_event],contract,precision:'observed_samples',requiresEvidenceReview:true};
    const id=randomUUID();await c.query("INSERT INTO invoice_revisions(carrier_id,id,visit_id,revision,contract_id,contract_version,status,body) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)",[a.carrierId,id,visit.id,version+1,contract.id,contract.version,JSON.stringify(body)]);return {id,revision:version+1,status:'draft',...body};
  });}
  async snapshot(a:Actor){
    const c=await this.db.connect();try{
      await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const own=a.role==='driver';demand(own||a.role==='dispatcher','FORBIDDEN','Operational view unavailable for this role.',403);
      const rows=await c.query('SELECT * FROM assignments WHERE carrier_id=$1 AND ($2::text IS NULL OR driver_id=$2)',[a.carrierId,own?a.driverId:null]);
      const loads=await c.query('SELECT * FROM loads WHERE carrier_id=$1 AND ($2::text[] IS NULL OR id=ANY($2))',[a.carrierId,own?rows.rows.map(r=>r.load_id):null]);
      const resources=await c.query('SELECT * FROM resources WHERE carrier_id=$1 AND ($2::text[] IS NULL OR id=ANY($2))',[a.carrierId,own?[a.driverId,...rows.rows.flatMap(r=>[r.truck_id,r.trailer_id])]:null]);
      const scoped=async(table:string)=>own?[]:(await c.query(`SELECT * FROM ${table} WHERE carrier_id=$1`,[a.carrierId])).rows;
      const scenarios=await scoped('scenarios'),proposals=await scoped('proposals'),visits=await scoped('stop_visits'),invoices=await scoped('invoice_revisions');
      const cursor=(await c.query('SELECT coalesce(max(cursor),0)::text AS cursor FROM events WHERE carrier_id=$1',[a.carrierId])).rows[0].cursor;
      await c.query('COMMIT');return {serverTime:new Date().toISOString(),cursor,scenarios,loads:loads.rows.map(r=>({...r.body,version:r.version,status:r.status})),assignments:rows.rows.map(assignment),resources:resources.rows.map(r=>({...r.body,kind:r.kind,version:r.version})),proposals,visits,invoices};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
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
      await c.query("INSERT INTO contracts VALUES($1,'demo-ftl',1,120,10000,'CAD','synthetic scenario terms')",[carrierId]);await c.query('COMMIT');
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
