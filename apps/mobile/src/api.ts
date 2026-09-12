import type {PlanningRun,TripGroup,Manifest} from './planning';
import type {FacilityNote} from './facilities';
import {validateCommand} from '../../../packages/domain/src/commands';
import {authHeaders,ApiError} from '@roadstar/client';
import {File} from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
import type {Assignment, Load} from '../../../packages/domain/src/index';
import type {Command} from './queue';
export type State={scenarios?:{id:string;clock:string}[];capabilities?:{cachedDutyTelemetry?:boolean;emulatorTracking?:boolean};actor?:{role:string;driverId?:string;carrierId:string};serverTime:string;cursor:string;loads:Load[];assignments:Assignment[];resources:{id:string;kind:string;body?:any;version:number;provenance?:string;budget?:import('../../../packages/domain/src/index').Driver['budget'];budgetAsOf?:string|null;hosEvidence?:(import('../../../packages/domain/src/hos-profile').HosProfileResult['hosEvidence'] & {revision?:number;sourceRef?:string;reviewedBy?:string});duty?:'off_duty'|'on_duty'|'driving'|'sleeper'}[];proposals:{id:string;load_id:string;revision:number;expected_version?:number;status:string;body:any}[];visits:any[];openVisitEstimates?:import('../../../packages/domain/src/open-visit').OpenVisitEstimate[];invoices:any[];workSessions?:(import("../../../packages/domain/src/tracking").MileageSession & {version:number;status?:string})[];stopCompletions?:{assignment_id:string;stop_id:string}[];dutyEvents?:any[];documents?:any[];facilityNotes?:FacilityNote[];planningRuns?:PlanningRun[];tripGroups?:TripGroup[];manifests?:Manifest[]};
export type Identity={id:string;role:'driver'|'dispatcher';carrier:string;token:()=>Promise<string>;backgroundCredential?:()=>Promise<{token:string;expiresAt:string}>};
export class Api {
  constructor(readonly origin:string,readonly identity:Identity){}
  async request(path:string,command?:Command){
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),path.startsWith('/api/route?')?60000:command?.path.endsWith('/content')?30000:12000);
    try{
      const headers=authHeaders({token:await this.identity.token(),carrierId:this.identity.carrier},command?{key:command.id,expectedVersion:command.expectedVersion}:undefined);
      let method=command?'POST':'GET';let body:string|File|undefined=command?.body;
      if(command&&!path.endsWith('/content'))body=JSON.stringify(validateCommand(path,JSON.parse(command.body)));
      if(command){headers['Idempotency-Key']=command.id;headers['If-Match']=String(command.expectedVersion);headers['Content-Type']='application/json';}
      const upload=command&&path.endsWith('/content');
      if(upload){const metadata=JSON.parse(command.body);const file=new File(metadata.uri);if(!file.exists)return {status:410,body:{error:{message:'Saved document is missing from this device. Capture it again.'}}};method='PUT';body=file;headers['Content-Type']=metadata.mediaType;}
      const url=this.origin.replace(/\/$/,'')+path;
      const response=upload?await expoFetch(url,{method,headers,body,signal:controller.signal}):await fetch(url,{method,headers,body:body as string|undefined,signal:controller.signal});
      const decoded=await response.json().catch(()=>({error:{message:`Server returned HTTP ${response.status} without JSON.`}}));
      return {status:response.status,body:decoded};
    }finally{clearTimeout(timeout);}
  }
  async state():Promise<State>{const result=await this.request('/api/state');if(result.status!==200)throw new ApiError(result.status,result.body.error?.code??'STATE_UNAVAILABLE',result.body.error?.message??'Unable to download trips');return result.body;}
}
