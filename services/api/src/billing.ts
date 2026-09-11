import {VISIT_SESSION_POLICY,visitPolicyEvidence} from '../../../packages/domain/src/geofence.ts';
import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {demand} from '../../../packages/domain/src/index.ts';
export async function prepareDetention(c:pg.PoolClient,carrierId:string,visit:any,options:{automatic:boolean;expectedVersion?:number;contractId?:string}){
 demand(visit?.departure&&!visit.superseded_by,'VISIT_OPEN','A closed same-stop visit is required.');
 const trip=(await c.query('SELECT visit_review_required FROM assignments WHERE carrier_id=$1 AND id=$2',[carrierId,visit.assignment_id])).rows[0];
 if(!options.automatic)demand(!trip?.visit_review_required,'VISIT_REVIEW_REQUIRED','Reconcile late GPS evidence before preparing detention.');
 const binding=(await c.query('SELECT c.*,l.body AS load,b.bound_by,b.bound_at FROM load_contracts b JOIN contracts c ON c.carrier_id=b.carrier_id AND c.id=b.contract_id JOIN loads l ON l.carrier_id=b.carrier_id AND l.id=b.load_id WHERE b.carrier_id=$1 AND b.load_id=$2',[carrierId,visit.load_id])).rows[0];
 if(options.automatic&&(!binding||binding.load.mode!=='FTL'))return null;
 demand(binding,'CONTRACT_REQUIRED','Bind shipment terms before preparing detention.');
 demand(binding.load.mode==='FTL','MODE_UNSUPPORTED','Automatic detention policy supports explicitly contracted FTL only.');
 demand(!options.contractId||binding.id===options.contractId,'CONTRACT_MISMATCH','Use the contract bound to this shipment.');
 const {load,bound_by,bound_at,...contract}=binding;
 demand(visit.session_policy===VISIT_SESSION_POLICY,'VISIT_POLICY_UNSUPPORTED','Review this visit session policy before billing.');
 const dwellMinutes=Math.floor((new Date(visit.departure).getTime()-new Date(visit.arrival).getTime())/60000),billableMinutes=Math.max(0,dwellMinutes-contract.free_minutes);
 const last=Number((await c.query('SELECT max(revision) AS revision FROM invoice_revisions WHERE carrier_id=$1 AND visit_id=$2',[carrierId,visit.id])).rows[0].revision??0);
 if(options.automatic&&(last>0||billableMinutes===0))return null;
 if(!options.automatic)demand(last===options.expectedVersion,'STALE_VERSION','Invoice revision changed.');
 const body={visitPolicy:visitPolicyEvidence,dwellMinutes,billableMinutes,amountCents:Math.round(billableMinutes*contract.rate_cents_per_hour/60),currency:contract.currency,evidence:[visit.arrival_event,visit.departure_event],contract,shipmentTerms:{loadId:visit.load_id,mode:load.mode,boundBy:bound_by,boundAt:bound_at},rounding:'whole-minute floor, nearest cent',precision:'observed_samples',requiresEvidenceReview:true,automatic:options.automatic};
 const id=randomUUID(),revision=last+1;await c.query("INSERT INTO invoice_revisions(carrier_id,id,visit_id,revision,contract_id,contract_version,status,body) VALUES($1,$2,$3,$4,$5,$6,'draft',$7)",[carrierId,id,visit.id,revision,contract.id,contract.version,JSON.stringify(body)]);
 return {id,revision,status:'draft',...body};
}
