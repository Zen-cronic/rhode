import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pool} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {london} from '../services/api/src/fixtures.ts';

const pointer='data/route-egress-fixture.json';
const evidenceDir='docs/evidence/route-egress-2026-09-12';
const db=pool('postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar');
const carrier='route-egress-'+randomUUID();
const pickup={id:'london-local-yard',name:'London local yard · synthetic location',lat:42.99,lng:-81.20,radiusM:100};
const egress={name:'Post-service road egress · synthetic location',lat:42.9905,lng:-81.168};

async function api(path:string,body?:unknown,version=1,role='demo-dispatcher'){
  const response=await fetch(`http://127.0.0.1:4010/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',authorization:`Bearer ${role}`,'x-carrier-id':carrier,'idempotency-key':randomUUID(),'if-match':String(version)},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
  const value=await response.json();assert.equal(response.status,200,JSON.stringify({path,value}));return value as any;
}
async function simulator(path:string,body?:unknown){
  const response=await fetch(`http://127.0.0.1:4020${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(600000)});
  const value=await response.json();assert.ok(response.ok,JSON.stringify(value));return value as any;
}

try{
  try{await readFile(pointer);throw Error('Existing route-egress fixture is retained; archive it before another run.');}catch(error:any){if(error.code!=='ENOENT')throw error;}
  await mkdir(evidenceDir,{recursive:true});
  await new Store(db).seed(carrier);
  const row=(await db.query("SELECT body FROM loads WHERE carrier_id=$1 AND id='RS-1042'",[carrier])).rows[0];
  const load={...row.body,pickup,delivery:london,drivingMinutes:12,serviceMinutes:121,startAt:'2026-09-13T12:30:00Z',endAt:'2026-09-13T16:00:00Z'};
  await db.query("UPDATE loads SET body=$2 WHERE carrier_id=$1 AND id='RS-1042'",[carrier,JSON.stringify(load)]);
  await db.query("DELETE FROM stops WHERE carrier_id=$1 AND load_id='RS-1042'",[carrier]);
  for(const [sequence,stop] of [pickup,london].entries())await db.query('INSERT INTO stops VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8)',[carrier,'RS-1042',stop.id,sequence,stop.lng,stop.lat,stop.radiusM,JSON.stringify(stop)]);
  const driver=(await db.query("SELECT body FROM resources WHERE carrier_id=$1 AND id='D-01'",[carrier])).rows[0].body;
  await db.query("UPDATE resources SET body=$2 WHERE carrier_id=$1 AND id='D-01'",[carrier,JSON.stringify({...driver,position:pickup})]);

  const assignment=await api('dispatch',{loadId:'RS-1042',driverId:'D-01',truckId:'T-101',trailerId:'V-101'});
  await api('respond',{assignmentId:assignment.id,action:'accept'},assignment.version,'demo-driver-1');
  const request={assignment_id:assignment.id,carrier_id:carrier,start_time:assignment.startAt,service_location_ordinals:[0,1],stop_wait_seconds:[0,7260],route:{locations:[pickup,london,egress].map(point=>({lat:point.lat,lon:point.lng})),truck:{height:4.1,width:2.6,length:23,weight:40,axle_load:9,hazmat:false,evidence:'synthetic-scenario'}}};
  const run=await simulator('/runs',request);
  assert.equal(run.route_egress,true);assert.ok(run.stop_indices.at(-1)<run.route_location_indices.at(-1));
  await simulator(`/runs/${run.id}/resume`,{});
  let current=await simulator(`/runs/${run.id}`);
  while(current.phase!=='route_complete'){
    await simulator(`/runs/${run.id}/advance`,{seconds:600});
    current=await simulator(`/runs/${run.id}`);
    console.log(JSON.stringify({elapsed:current.elapsed_seconds,phase:current.phase,events:current.events.length}));
    assert.ok(current.elapsed_seconds<18000,'Egress scenario exceeded its bounded horizon');
  }
  await simulator(`/runs/${run.id}/pause`,{});

  const visits=(await db.query('SELECT * FROM stop_visits WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY arrival,id',[carrier,assignment.id])).rows;
  const invoices=(await db.query('SELECT * FROM invoice_revisions WHERE carrier_id=$1 ORDER BY revision,id',[carrier])).rows;
  const telemetry=(await db.query('SELECT id,at,body,disposition,geofence_evidence FROM telemetry WHERE carrier_id=$1 AND assignment_id=$2 ORDER BY at,id',[carrier,assignment.id])).rows;
  const destination=visits.find(visit=>visit.stop_id===london.id);
  assert.ok(destination?.arrival&&destination.departure&&destination.arrival_event&&destination.departure_event);
  assert.ok(new Date(destination.departure).getTime()>new Date(destination.arrival).getTime());
  const destinationDrafts=invoices.filter(invoice=>invoice.visit_id===destination.id&&invoice.status==='draft');
  assert.equal(destinationDrafts.length,1);
  const invoice=destinationDrafts[0];
  assert.ok(invoice.body.dwellMinutes>=121&&invoice.body.billableMinutes>=1&&invoice.body.amountCents>0);
  assert.deepEqual(invoice.body.evidence,[destination.arrival_event,destination.departure_event]);
  assert.equal(invoice.contract_id,'demo-ftl');assert.equal(invoice.body.shipmentTerms.mode,'FTL');
  assert.equal(telemetry.length,current.events.length);assert.equal(new Set(telemetry.map(event=>event.id)).size,telemetry.length);
  const departureSample=telemetry.find(event=>event.id===destination.departure_event);
  assert.ok(departureSample&&departureSample.geofence_evidence.stopStates.some((stop:any)=>stop.stopId===london.id&&stop.confidence==='outside'));
  const simulatorDeparture=current.events.find((event:any)=>event.id===destination.departure_event);
  assert.equal(simulatorDeparture?.phase,'driving');
  const eventHash=createHash('sha256').update(JSON.stringify(current.events)).digest('hex');
  const state=await api('state');
  const proof={verifiedAt:new Date().toISOString(),carrier,assignmentId:assignment.id,runId:run.id,conditionsHash:run.conditions_hash,eventHash,eventCount:current.events.length,elapsedSeconds:current.elapsed_seconds,route:{locationIndices:run.route_location_indices,serviceStopIndices:run.stop_indices,egress:run.route_egress,coordinates:current.initial_conditions.coordinates.length},visit:{id:destination.id,stopId:destination.stop_id,arrival:new Date(destination.arrival).toISOString(),departure:new Date(destination.departure).toISOString(),arrivalEvent:destination.arrival_event,departureEvent:destination.departure_event,sessionPolicy:destination.session_policy},invoice:{id:invoice.id,revision:invoice.revision,status:invoice.status,contractId:invoice.contract_id,contractVersion:invoice.contract_version,body:invoice.body},assignment:state.assignments.find((item:any)=>item.id===assignment.id),checks:['Driver accepted the assignment before simulator movement','Valhalla route retains a road egress after the final service location','Final service dwell remains on-duty and road movement resumes only after dwell','A confident outside telemetry observation closes the same destination visit','The automatic draft is linked to exact arrival/departure event IDs and bound FTL terms','No stop-completion action is used as a geofence or billing timestamp','Every acknowledged simulator event exists once in operational telemetry'],limits:'Synthetic London route and seeded road speeds. Geofence timestamps are received source observations, not certified physical dock times. Draft is not approved or collected revenue. Responsive driver rendering is verified separately; this script exercises the real driver API identity.'};
  await writeFile(pointer,JSON.stringify({...proof,request,run},null,2)+'\n');
  await writeFile(`${evidenceDir}/verification.json`,JSON.stringify(proof,null,2)+'\n');
  console.log(JSON.stringify({carrier,run:run.id,events:current.events.length,dwellMinutes:invoice.body.dwellMinutes,amountCents:invoice.body.amountCents}));
}finally{await db.end();}
