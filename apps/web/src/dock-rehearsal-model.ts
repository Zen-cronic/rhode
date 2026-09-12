import type {State} from './api.ts';
import {driverHeadroom} from '../../../packages/domain/src/open-visit.ts';
export type DockRun={run_id:string;assignment_id:string;elapsed_seconds:number;event_count:number;pending_samples:number;phase:string;paused:boolean;conditions_hash:string;last_sample?:{id:string;assignmentId:string;at:string;phase?:string;duty:string;speedKph:number|null;odometerKm:number|null;provenance:string;accuracyM:number;position:{lat:number;lng:number}}|null};
export function dockPresentation(state:State,run:DockRun,carrier:string){
 if(state.actor.role!=='dispatcher'||state.actor.carrierId!==carrier)return null;
 const trip=state.assignments.find(t=>t.id===run.assignment_id),load=state.loads.find(l=>l.id===trip?.loadId),sample=run.last_sample;
 if(!trip||load?.provenance!=='synthetic'||(sample&&(sample.assignmentId!==trip.id||sample.provenance!=='synthetic')))return null;
 const visit=state.visits.find(v=>v.assignment_id===trip.id&&!v.departure),estimate=state.openVisitEstimates?.find(e=>e.visitId===visit?.id&&e.assignmentId===trip.id&&e.driverId===trip.driverId),driver=state.resources.find(r=>r.id===trip.driverId);
 const aligned=!!sample&&!!estimate&&sample.id===estimate.evidenceId&&Number.isFinite(Date.parse(sample.at))&&Date.parse(sample.at)===Date.parse(estimate.evidenceAt??'');
 const amount=aligned&&estimate.status==='estimate'&&Number.isFinite(estimate.amountCents)&&estimate.currency&&estimate.contract?estimate.amountCents!:null;
 const facility=[load.pickup,load.delivery].find(s=>s.id===visit?.stop_id);
 const budget=driver?.budget,validBudget=budget&&[budget.drivingMinutes,budget.onDutyMinutes,budget.shiftMinutes,budget.cycleMinutes].every(Number.isFinite)?budget:null;
 return{trip,load,visit,estimate,driver,sample,facility,aligned,atDock:!!visit&&aligned&&sample?.phase==='dock_wait',held:amount===null,amountCents:amount,budget:validBudget,headroom:driverHeadroom(validBudget),phase:sample?.phase?.replaceAll('_',' ')??'Awaiting acknowledged phase',reason:!sample?'No acknowledged observation yet.':!estimate?'No current open-visit estimate for this trip.':!aligned?'Operational evidence differs from this run. Refresh before interpreting the scene.':estimate.reason};
}
