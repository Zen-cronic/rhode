import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {demand, timestamp, screen, distanceKm, detention} from '../../../packages/domain/src/index.ts';
import type {Load, Driver, Truck, Trailer, Assignment, Telemetry} from '../../../packages/domain/src/index.ts';
import {fixtures, DEMO_NOW} from './fixtures.ts';

type Entity = Load | Driver | Truck | Trailer | Assignment;
type Row = Record<string, unknown>;
export class Store {
  db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS telemetry(id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL,disposition TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS telemetry_trip ON telemetry(assignment_id,at);
      CREATE TABLE IF NOT EXISTS stop_visits(id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL,stop_id TEXT NOT NULL,arrival TEXT NOT NULL,departure TEXT,arrival_event TEXT NOT NULL,departure_event TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_visit ON stop_visits(assignment_id,stop_id) WHERE departure IS NULL;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    if (!this.db.prepare('SELECT 1 FROM settings WHERE key=?').get('clock')) this.seed();
  }
  close() { this.db.close(); }
  atomic<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result=work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  put(kind: string, entity: Entity) {
    this.db.prepare('INSERT INTO entities VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind,entity.id,JSON.stringify(entity));
  }
  get<T extends Entity>(kind: string,id: string): T {
    const row=this.db.prepare('SELECT body FROM entities WHERE kind=? AND id=?').get(kind,id);
    demand(row,'NOT_FOUND',`${kind} ${id} not found.`,404);
    return JSON.parse(row.body as string) as T;
  }
  all<T extends Entity>(kind: string): T[] {
    return this.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY id').all(kind).map(r=>JSON.parse(r.body as string));
  }
  now() { return this.db.prepare('SELECT value FROM settings WHERE key=?').get('clock')!.value as string; }
  setClock(at: string) {
    timestamp(at);
    this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('clock',at);
  }
  event(kind: string, body: unknown, at=this.now()) {
    this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(randomUUID(),kind,at,JSON.stringify(body));
  }
  seed() {
    this.atomic(()=>{
      const data=fixtures();
      for (const [kind,rows] of Object.entries(data)) for (const row of rows) this.put(kind,row);
      this.setClock(DEMO_NOW);
      this.event('demo.initialized',{provenance:'synthetic',message:'Generated demo records; not current RoadStar operations.'});
    });
  }
  snapshot() {
    return {now:this.now(),mode:'deterministic-demo',loads:this.all<Load>('loads'),drivers:this.all<Driver>('drivers'),
      trucks:this.all<Truck>('trucks'),trailers:this.all<Trailer>('trailers'),assignments:this.all<Assignment>('assignments'),
      visits:this.db.prepare('SELECT * FROM stop_visits ORDER BY arrival').all(),
      telemetry:this.db.prepare('SELECT body,disposition FROM telemetry ORDER BY at DESC LIMIT 500').all().map(r=>({...JSON.parse(r.body as string),disposition:r.disposition})),
      events:this.db.prepare('SELECT * FROM events ORDER BY rowid DESC LIMIT 100').all().map(r=>({...r,body:JSON.parse(r.body as string)}))};
  }
  matches(loadId: string) {
    const load=this.get<Load>('loads',loadId), assignments=this.all<Assignment>('assignments');
    return this.all<Driver>('drivers').flatMap(driver=>this.all<Truck>('trucks').flatMap(truck=>this.all<Trailer>('trailers').map(trailer=>({
      driverId:driver.id,truckId:truck.id,trailerId:trailer.id,...screen(load,driver,truck,trailer,assignments,this.now())
    })))).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.deadheadKm-b.deadheadKm);
  }
  dispatch(input: {loadId: string; driverId: string; truckId: string; trailerId: string; expectedVersion: number}) {
    return this.atomic(()=>{
      const load=this.get<Load>('loads',input.loadId);
      demand(load.version===input.expectedVersion,'STALE_VERSION','Load changed. Refresh the assignment proposal.');
      const driver=this.get<Driver>('drivers',input.driverId), truck=this.get<Truck>('trucks',input.truckId), trailer=this.get<Trailer>('trailers',input.trailerId);
      const result=screen(load,driver,truck,trailer,this.all<Assignment>('assignments'),this.now());
      demand(result.eligible,'INELIGIBLE',result.reasons.join(' '));
      const assignment: Assignment={id:randomUUID(),loadId:load.id,driverId:driver.id,truckId:truck.id,trailerId:trailer.id,startAt:load.startAt,endAt:load.endAt,status:'offered',version:1};
      this.put('assignments',assignment); this.put('loads',{...load,status:'offered',version:load.version+1});
      this.event('dispatch.offered',{assignment,result});
      return assignment;
    });
  }
  respond(assignmentId: string,driverId: string,expectedVersion: number,action: 'accept'|'reject') {
    return this.atomic(()=>{
      const assignment=this.get<Assignment>('assignments',assignmentId);
      demand(assignment.driverId===driverId,'WRONG_DRIVER','This assignment belongs to another driver.',403);
      demand(assignment.version===expectedVersion,'STALE_VERSION','Assignment changed. Refresh before responding.');
      demand(assignment.status==='offered','INVALID_TRANSITION','Only an offered assignment can be accepted or rejected.');
      const load=this.get<Load>('loads',assignment.loadId);
      if(action==='accept') {
        const result=screen({...load,status:'open'},this.get<Driver>('drivers',driverId),this.get<Truck>('trucks',assignment.truckId),this.get<Trailer>('trailers',assignment.trailerId),this.all<Assignment>('assignments').filter(a=>a.id!==assignmentId),this.now());
        demand(result.eligible,'INELIGIBLE',result.reasons.join(' '));
      }
      const next: Assignment={...assignment,status:action==='accept'?'accepted':'rejected',version:assignment.version+1};
      this.put('assignments',next); this.put('loads',{...load,status:action==='accept'?'accepted':'open',version:load.version+1});
      this.event(`dispatch.${next.status}`,{assignmentId,driverId}); return next;
    });
  }
  ingest(event: Telemetry) {
    demand(event && typeof event==='object','INVALID_EVENT','Telemetry object required.',400);
    demand(typeof event.id==='string'&&event.id.length>0&&typeof event.assignmentId==='string','INVALID_EVENT','Event and assignment IDs required.',400);
    timestamp(event.at);
    demand(event.position&&Number.isFinite(event.position.lat)&&Math.abs(event.position.lat)<=90&&Number.isFinite(event.position.lng)&&Math.abs(event.position.lng)<=180,'INVALID_POSITION','Invalid coordinates.',400);
    demand(Number.isFinite(event.speedKph)&&event.speedKph>=0&&event.speedKph<=160&&Number.isFinite(event.odometerKm)&&event.odometerKm>=0,'INVALID_TELEMETRY','Invalid speed or odometer.',400);
    demand(['off_duty','on_duty','driving','sleeper'].includes(event.duty),'INVALID_DUTY','Unknown duty state.',400);
    demand(['synthetic','imported-historical','live'].includes(event.provenance),'INVALID_PROVENANCE','Data provenance required.',400);
    return this.atomic(()=>{
      const duplicate=this.db.prepare('SELECT body,disposition FROM telemetry WHERE id=?').get(event.id);
      if (duplicate) {
        const original=JSON.parse(duplicate.body as string) as Telemetry;
        const same=original.assignmentId===event.assignmentId&&timestamp(original.at)===timestamp(event.at)&&original.position.lat===event.position.lat&&original.position.lng===event.position.lng&&original.speedKph===event.speedKph&&original.odometerKm===event.odometerKm&&original.duty===event.duty&&original.provenance===event.provenance;
        demand(same,'EVENT_ID_COLLISION','Event ID already exists with different content.');
        return {duplicate:true,disposition:duplicate.disposition};
      }
      const assignment=this.get<Assignment>('assignments',event.assignmentId);
      demand(assignment.status==='accepted','NOT_ACCEPTED','Only driver-accepted assignments receive operational telemetry.');
      const latest=this.db.prepare("SELECT body FROM telemetry WHERE assignment_id=? AND disposition='applied' ORDER BY at DESC LIMIT 1").get(assignment.id);
      const previous=latest?JSON.parse(latest.body as string) as Telemetry:null;
      const stale=previous!==null && timestamp(event.at)<=timestamp(previous.at);
      if (previous&&!stale) demand(event.odometerKm>=previous.odometerKm,'ODOMETER_REWIND','Odometer cannot move backwards.');
      const disposition=stale?'retained_out_of_order':'applied';
      const normalized={...event,at:new Date(timestamp(event.at)).toISOString()};
      this.db.prepare('INSERT INTO telemetry VALUES(?,?,?,?,?)').run(event.id,assignment.id,normalized.at,JSON.stringify(normalized),disposition);
      if(stale) return {duplicate:false,disposition};
      const load=this.get<Load>('loads',assignment.loadId);
      const driver=this.get<Driver>('drivers',assignment.driverId);
      this.put('drivers',{...driver,position:event.position,duty:event.duty});
      if(event.duty==='driving'&&load.status==='accepted') this.put('loads',{...load,status:'in_transit',version:load.version+1});
      for(const stop of [load.pickup,load.delivery]) {
        const inside=distanceKm(event.position,stop)*1000<=stop.radiusM;
        const visit=this.db.prepare('SELECT * FROM stop_visits WHERE assignment_id=? AND stop_id=? AND departure IS NULL').get(assignment.id,stop.id);
        if(inside&&!visit) {
          this.db.prepare('INSERT INTO stop_visits VALUES(?,?,?,?,NULL,?,NULL)').run(randomUUID(),assignment.id,stop.id,normalized.at,event.id);
          this.event('geofence.arrival',{assignmentId:assignment.id,stopId:stop.id,evidenceId:event.id,precision:'observed telemetry sample'},normalized.at);
        } else if(!inside&&visit) {
          this.db.prepare('UPDATE stop_visits SET departure=?,departure_event=? WHERE id=?').run(normalized.at,event.id,visit.id as string);
          this.event('geofence.departure',{assignmentId:assignment.id,stopId:stop.id,evidenceId:event.id,precision:'observed telemetry sample'},normalized.at);
        }
      }
      if(timestamp(event.at)>timestamp(this.now())) this.setClock(normalized.at);
      return {duplicate:false,disposition};
    });
  }
  detentionDraft(visitId: string,rateCentsPerHour: number|null=null) {
    const visit=this.db.prepare('SELECT * FROM stop_visits WHERE id=?').get(visitId) as Row|undefined;
    demand(visit,'NOT_FOUND','Stop visit not found.',404);
    demand(visit.departure,'VISIT_OPEN','A closed stop visit is required for a billing draft.');
    const assignment=this.get<Assignment>('assignments',visit.assignment_id as string);
    const load=this.get<Load>('loads',assignment.loadId);
    return {...detention(visit.arrival as string,visit.departure as string,load.mode,rateCentsPerHour),visitId,loadId:load.id,
      evidence:[visit.arrival_event,visit.departure_event],rateCentsPerHour,
      disclaimer:'Draft based on observed geofence samples. Rate is an explicit scenario input; no contract approval or payment is implied.'};
  }
}
