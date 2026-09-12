import {createHash,randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {Store,Actor,Command} from './store.ts';
import {demand,type Load,type Truck,type Trailer} from '../../../packages/domain/src/index.ts';
import {axleReviewSchema,calculateAxles,KG_PER_LB,type AxleReviewInput} from '../../../packages/domain/src/axle.ts';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex');
const loadHash=(l:Load)=>hash({id:l.id,weightLb:l.weightLb,pallets:l.pallets,equipment:l.equipment,mode:l.mode,sourceRef:l.sourceRef??null});
const vehicleHash=(truck:Truck,trailer:Trailer)=>hash({truckId:truck.id,trailerId:trailer.id,profile:truck.routingProfile??null,capacity:trailer.capacityLb,equipment:trailer.equipment});
export function reviewAxles(s:Store,a:Actor,cmd:Command,raw:AxleReviewInput){s.dispatcher(a);const input=axleReviewSchema.parse(raw);return s.command(a,cmd,'axles.reviewed',input,async c=>{
 const load=await s.load(c,a,input.loadId),truck=await s.resource<Truck>(c,a,input.truckId,'truck'),trailer=await s.resource<Trailer>(c,a,input.trailerId,'trailer');
 const versions=(await c.query('SELECT id,version FROM resources WHERE carrier_id=$1 AND id=ANY($2::text[])',[a.carrierId,[truck.id,trailer.id]])).rows;
 demand(versions.find(v=>v.id===truck.id)?.version===cmd.expectedVersion&&versions.find(v=>v.id===trailer.id)?.version===input.expectedTrailerVersion&&load.version===input.expectedLoadVersion,'STALE_EVIDENCE','Load or vehicle changed before axle review.');
 demand(load.weightLb!==null,'WEIGHT_REQUIRED','Verified payload weight is required.');
 const document=(await c.query("SELECT id,version,sha256 FROM documents WHERE carrier_id=$1 AND id=$2 AND load_id=$3 AND status='stored' AND sha256 IS NOT NULL",[a.carrierId,input.documentId,load.id])).rows[0];
 demand(document&&document.version===input.expectedDocumentVersion,'STALE_SOURCE','Current stored same-shipment source required.');
 const result=calculateAxles(input.configuration,load.weightLb,input.cargoCgFromKingpinM),configurationHash=hash({trailerId:trailer.id,configuration:input.configuration});
 const revision=Number((await c.query('SELECT coalesce(max(revision),0)+1 AS revision FROM axle_assessments WHERE carrier_id=$1 AND load_id=$2 AND truck_id=$3 AND trailer_id=$4',[a.carrierId,load.id,truck.id,trailer.id])).rows[0].revision),id=randomUUID();
 const body={input,result,document,loadFingerprint:loadHash(load),vehicleFingerprint:vehicleHash(truck,trailer),configurationHash,provenance:load.provenance};
 await c.query('INSERT INTO axle_assessments(carrier_id,id,load_id,truck_id,trailer_id,revision,document_id,reviewed_by,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.carrierId,id,load.id,truck.id,trailer.id,revision,document.id,a.uid,JSON.stringify(body)]);
 await c.query("UPDATE resources SET version=version+1,body=body||$3::jsonb WHERE carrier_id=$1 AND id=$2",[a.carrierId,truck.id,JSON.stringify({axleAssessmentRequired:true,axleConfigurationHash:configurationHash})]);
 return {id,revision,loadId:load.id,truckId:truck.id,trailerId:trailer.id,truckVersion:cmd.expectedVersion+1,body,note:'Assessment recorded; dispatch remains a separate command. Failed assessments block the vehicle/load combination.'};
});}
export async function axleProof(c:pg.PoolClient,carrierId:string,load:Load,truck:Truck,trailer:Trailer){
 const required=load.provenance!=='synthetic'||truck.axleAssessmentRequired===true;
 if(!required)return {required:false,eligible:truck.axleClearance==='verified',reasons:truck.axleClearance==='verified'?[]:['Truck and axle clearance is unverified.'],note:'Synthetic declared axle clearance only; no physical loading assessment.'};
 const row=(await c.query('SELECT * FROM axle_assessments WHERE carrier_id=$1 AND load_id=$2 AND truck_id=$3 AND trailer_id=$4 ORDER BY revision DESC LIMIT 1',[carrierId,load.id,truck.id,trailer.id])).rows[0];
 if(!row)return {required,eligible:false,reasons:['Reviewed axle loading for this load, truck and trailer is missing.']};
 const b=row.body,document=(await c.query('SELECT version,sha256,status FROM documents WHERE carrier_id=$1 AND id=$2',[carrierId,row.document_id])).rows[0];
 const current=b.loadFingerprint===loadHash(load)&&b.vehicleFingerprint===vehicleHash(truck,trailer)&&b.configurationHash===truck.axleConfigurationHash&&document?.version===b.document.version&&document?.sha256===b.document.sha256&&document?.status==='stored';
 if(!current)return {required,eligible:false,reasons:['Axle loading source, payload or vehicle configuration changed; review again.'],assessmentId:row.id};
 const result=calculateAxles(b.input.configuration,load.weightLb!,b.input.cargoCgFromKingpinM),reasons=[...result.reasons];
 if(truck.axleClearance!=='verified')reasons.push('Truck and axle clearance is unverified.');
 if(!truck.routingProfile||truck.routingProfile.weight*1000<result.grossKg||truck.routingProfile.axle_load*1000<result.maximumModeledAxleKg)reasons.push('Declared routing gross or axle weight understates the modeled loading.');
 return {required,eligible:!reasons.length,reasons,assessmentId:row.id,revision:row.revision,result,configurationHash:b.configurationHash,demandsG:result.groups.map(g=>Math.ceil(g.cargoKg*1000)),capacitiesG:result.groups.map((g,i)=>Math.max(0,Math.floor((Math.min(g.limitKg,(truck.routingProfile?.axle_load??0)*1000*[1,b.input.configuration.driveAxles,b.input.configuration.trailerAxles][i])-g.emptyKg)*1000))),grossPayloadLb:Math.floor((Math.min(b.input.configuration.grossLimitKg,(truck.routingProfile?.weight??0)*1000)-result.emptyGrossKg)/KG_PER_LB)};
}

/** Recheck every onboard state even when approving a stored pre-policy plan. */
export async function requireRouteAxles(s:Store,c:pg.PoolClient,a:Actor,route:any,vehicle:any){
 const truck=await s.resource<Truck>(c,a,vehicle.truckId,'truck'),trailer=await s.resource<Trailer>(c,a,vehicle.trailerId,'trailer');
 const ids=[...new Set<string>(route.stops.map((stop:any)=>stop.load_id))],proofs=new Map();
 for(const id of ids){const proof=await axleProof(c,a.carrierId,await s.load(c,a,id),truck,trailer);demand(proof.eligible,'AXLE_INELIGIBLE',proof.reasons.join(' '));proofs.set(id,{...proof,weightLb:(await s.load(c,a,id)).weightLb});}
 const onboard=new Set<string>(),picked=new Set<string>(),grams=[0,0,0];let payloadLb=0;
 for(const stop of route.stops){demand(['pickup','delivery'].includes(stop.stop),'INVALID_PLAN','Unknown manifest stop action.');const proof=proofs.get(stop.load_id),pick=stop.stop==='pickup';demand(pick?!picked.has(stop.load_id):onboard.has(stop.load_id),'INVALID_PLAN','Invalid load sequence for axle assessment.');if(pick){onboard.add(stop.load_id);picked.add(stop.load_id);}else onboard.delete(stop.load_id);payloadLb+=(pick?1:-1)*proof.weightLb;demand(payloadLb>=0&&payloadLb<=Math.min(trailer.capacityLb,proof.required?proof.grossPayloadLb:Infinity),'AXLE_INELIGIBLE','Combined onboard loads exceed configured gross or trailer payload capacity.');if(proof.required){for(let g=0;g<3;g++){grams[g]+=(pick?1:-1)*proof.demandsG[g];demand(grams[g]>=0&&grams[g]<=proof.capacitiesG[g],'AXLE_INELIGIBLE','Combined onboard loads exceed configured axle-group capacity.');}}}
 demand(!onboard.size,'INVALID_PLAN','Axle assessment requires a complete pickup/delivery sequence.');
 return ids.map(loadId=>({loadId,...proofs.get(loadId)}));
}
