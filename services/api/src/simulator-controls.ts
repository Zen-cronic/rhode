import type {Actor,Command,Store} from './store.ts';
import {demand,DomainError} from '../../../packages/domain/src/index.ts';
const configured=()=>!process.env.K_SERVICE&&!!process.env.SIMULATOR_CONTROL_URL;
function origin(){demand(configured(),'SIMULATOR_UNAVAILABLE','Local simulator controls are not configured.',503);const url=new URL(process.env.SIMULATOR_CONTROL_URL!);demand(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash,'SIMULATOR_UNAVAILABLE','Simulator control URL must be a loopback HTTP origin.',503);return url.origin;}
async function call(path:string,body?:unknown){let response:Response;try{response=await fetch(origin()+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});}catch(e){if(e instanceof DomainError)throw e;throw new DomainError('SIMULATOR_UNAVAILABLE','Simulator response unavailable. Retry the same queued action to recover its receipt.',503);}let result:any;try{result=await response.json();}catch{throw new DomainError('SIMULATOR_UNAVAILABLE','Simulator returned an unreadable response.',503);}demand(response.ok,'SIMULATOR_CONTROL',typeof result.detail==='string'?result.detail:JSON.stringify(result.detail??result),response.status>=500?503:409);return result;}
function matches(a:Actor,run:any){return run?.carrier_id===a.carrierId&&run.api_origin===(process.env.SIMULATOR_OPERATIONAL_ORIGIN??`http://127.0.0.1:${process.env.PORT??4010}`);}
async function ownRun(store:Store,a:Actor,run:any){demand(matches(a,run)&&typeof run.assignment_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(run.assignment_id),'NOT_FOUND','Simulator run is unavailable in this carrier.',404);const r=await store.db.query('SELECT l.body FROM assignments a JOIN loads l ON l.carrier_id=a.carrier_id AND l.id=a.load_id WHERE a.carrier_id=$1 AND a.id=$2',[a.carrierId,run.assignment_id]);demand(r.rows[0]?.body.provenance==='synthetic','NOT_FOUND','A synthetic assignment in this carrier is required.',404);return run;}
export async function simulatorInventory(store:Store,a:Actor){store.dispatcher(a);if(!configured())return {configured:false,runs:[]};const result=await call('/control/runs?carrier_id='+encodeURIComponent(a.carrierId));const runs=[];for(const run of result.runs??[]){if(!matches(a,run))continue;try{runs.push(await ownRun(store,a,run));}catch(e){if(!(e instanceof DomainError)||e.code!=='NOT_FOUND')throw e;}}return {configured:true,runs};}
export async function simulatorControl(store:Store,a:Actor,cmd:Command,input:any){store.dispatcher(a);demand(cmd.expectedVersion===0,'INVALID_VERSION','Simulator controls use version zero and an exact state fingerprint.',400);demand(cmd.key.length>=8&&cmd.key.length<=128,'INVALID_KEY','Command key required.',400);const run=await call('/control/runs/'+encodeURIComponent(input.runId));await ownRun(store,a,run);demand(run.run_id===input.runId,'NOT_FOUND','Simulator run identity differs.',404);const result=await call('/control/runs/'+encodeURIComponent(input.runId),{key:cmd.key,expected_state:input.expectedState,action:input.action,seconds:input.seconds??1,revision_id:input.revisionId??null,expected_revision:input.expectedRevision??null,requested_by:a.uid});if(result.pending)throw new DomainError('SIMULATOR_PENDING','Batch paused with retained observations. Resume the run, then retry the original action.',503);if(result.error)throw new DomainError('SIMULATOR_CONTROL',typeof result.error.detail==='string'?result.error.detail:JSON.stringify(result.error.detail),result.error.status>=500?503:409);return result;}


/** Historical source pages only. No simulation command or scenario clock mutation. */
export async function simulatorPresentation(store:Store,a:Actor,input:{runId:string;offset?:string;limit?:string;snapshot?:string}){
 store.dispatcher(a);
 demand(typeof input.runId==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(input.runId),'INVALID_INPUT','Invalid run identity.',400);
 const offset=input.offset??'0',limit=input.limit??'500';
 demand(/^\d+$/.test(offset)&&Number.isSafeInteger(Number(offset))&&/^\d+$/.test(limit)&&Number(limit)>=1&&Number(limit)<=1000,'INVALID_INPUT','Use a non-negative offset and page limit from 1 to 1000.',400);
 demand((input.snapshot===undefined||/^[a-f0-9]{64}$/.test(input.snapshot))&&(Number(offset)===0||input.snapshot!==undefined),'INVALID_INPUT','Continuation requires the recording snapshot fingerprint.',400);
 const path='/control/runs/'+encodeURIComponent(input.runId);
 const run=await ownRun(store,a,await call(path));
 demand(run.run_id===input.runId,'NOT_FOUND','Simulator run identity differs.',404);
 const query=new URLSearchParams({offset,limit});if(input.snapshot!==undefined)query.set('snapshot',input.snapshot);
 const result=await call(path+'/presentation?'+query);
 // Recheck the returned binding as well as the preflight inventory identity.
 await ownRun(store,a,result);
 demand(result.run_id===input.runId&&result.assignment_id===run.assignment_id,'NOT_FOUND','Recording assignment changed.',404);
 demand(result.comparison_basis_hash===run.comparison_basis_hash&&JSON.stringify(result.intervention)===JSON.stringify(run.intervention)&&result.modeled_completion_ms===run.modeled_completion_ms,'SIMULATOR_CONTROL','Recording comparison evidence changed after the inventory check.',409);
 const {schema,run_id,assignment_id,start_time_ms,routes,events,snapshot,total,next_offset,provenance,evidence,speed_semantics,clock_semantics,comparison_basis_hash,intervention,modeled_completion_ms}=result;
 return {schema,run_id,assignment_id,start_time_ms,routes,events,snapshot,total,offset:result.offset,next_offset,provenance,evidence,speed_semantics,clock_semantics,comparison_basis_hash,intervention,modeled_completion_ms};
}
