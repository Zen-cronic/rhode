import type {Driver} from './index.ts';
export type DutyObservation={at:string;duty:Driver['duty'];source:string};
export type DutyBasis={at:string;duty:Driver['duty'];budget:NonNullable<Driver['budget']>};
export function consumeDutyHistory(basis:DutyBasis|null,observations:DutyObservation[],at:string){
 const incomplete=(reason:string)=>({budget:null,budgetAsOf:null,hosEvidence:{status:'incomplete',reason,profile:'declared-budget-history',certifiedELD:false}});
 if(!basis)return incomplete('No reviewed or synthetic initial work-budget basis.');
 const start=Date.parse(basis.at),end=Date.parse(at);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return incomplete('Budget basis is ahead of the operational clock.');
 if((['drivingMinutes','onDutyMinutes','shiftMinutes','cycleMinutes'] as const).some(key=>!Number.isFinite(basis.budget[key])||basis.budget[key]<0))return incomplete('Invalid initial work budget.');
 const day=(t:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 if(day(start)!==day(end))return incomplete('Operator-day boundary requires reviewed daily/rest and cycle history.');
 const events=observations.filter(e=>Date.parse(e.at)>=start&&Date.parse(e.at)<=end).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let cursor=start,duty=basis.duty,drive=0,work=0,rest=0;
 for(let i=0;i<=events.length;i++){
  const next=i<events.length?Date.parse(events[i].at):end;
  const minutes=(next-cursor)/60000;
  if(duty==='driving')drive+=minutes;
  if(duty==='driving'||duty==='on_duty'){work+=minutes;rest=0;}else rest+=minutes;
  if(rest>=480)return incomplete('Potential rest reset requires reviewed rest/day/cycle history; no automatic budget reset.');
  if(i<events.length){if(i>0&&next===Date.parse(events[i-1].at)&&events[i].duty!==events[i-1].duty)return incomplete('Conflicting duty observations at the same timestamp.');duty=events[i].duty;}
  cursor=next;
 }
 const elapsed=(end-start)/60000,b=basis.budget;
 return {duty,budget:{drivingMinutes:Math.max(0,Math.floor(b.drivingMinutes-drive)),onDutyMinutes:Math.max(0,Math.floor(b.onDutyMinutes-work)),cycleMinutes:Math.max(0,Math.floor(b.cycleMinutes-work)),shiftMinutes:Math.max(0,Math.floor(b.shiftMinutes-elapsed))},budgetAsOf:at,hosEvidence:{status:'modeled',profile:'declared-budget-history',basisAt:basis.at,shiftDeadline:new Date(start+b.shiftMinutes*60000).toISOString(),observations:events.length,drivingMinutes:drive,onDutyMinutes:work,elapsedMinutes:elapsed,certifiedELD:false,note:'Dated duty intervals consume declared initial budgets. No automatic rest/day/cycle reset or certified ELD claim.'}};
}
