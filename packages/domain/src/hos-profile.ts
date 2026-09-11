import type {Driver} from './index.ts';
import type {DutyObservation} from './hos.ts';
const MINUTE=60_000,HOUR=60*MINUTE,DAY=24*HOUR;
export type DutyInterval={start:string;end:string;duty:Driver['duty'];source:string};
export type HosProfile={ruleset:'federal-south-60-solo-ordinary-v1';cycle:1|2;dayAnchor:string;timeZone:'America/Toronto';cycleStartedAt?:string;exceptions:[];history:DutyInterval[]};
export type HosProfileResult={duty?:Driver['duty'];budget:Driver['budget'];budgetAsOf:string|null;hosEvidence:{status:'incomplete'|'modeled';profile:string;certifiedELD:boolean;reason?:string;cycle?:1|2;historyFrom?:string;historyThrough?:string;dayStart?:string;dayEnd?:string;shiftStart?:string;shiftDeadline?:string;dayDrivingMinutes?:number;dayOnDutyMinutes?:number;shiftDrivingMinutes?:number;shiftOnDutyMinutes?:number;cycleOnDutyMinutes?:number;onDutySince24HourRestMinutes?:number;dailyRestRemainingMinutes?:number;note?:string}};
type Span={start:number;end:number;duty:Driver['duty']};
const off=(duty:string)=>duty==='off_duty'||duty==='sleeper';
const overlap=(a:number,b:number,start:number,end:number)=>Math.max(0,Math.min(b,end)-Math.max(a,start));
const iso=(at:number)=>new Date(at).toISOString();
const remainder=(limit:number,used:number)=>Math.max(0,Math.floor((limit-used)/MINUTE));
/** Planning aid for one explicitly declared profile. Never infer jurisdiction from GPS. */
export function evaluateHosProfile(profile:HosProfile,observations:DutyObservation[],at:string):HosProfileResult{
 const incomplete=(reason:string):HosProfileResult=>({budget:null,budgetAsOf:null,hosEvidence:{status:'incomplete',profile:profile?.ruleset??'unknown',reason,certifiedELD:false}});
 if(profile?.ruleset!=='federal-south-60-solo-ordinary-v1'||![1,2].includes(profile.cycle)||profile.timeZone!=='America/Toronto'||!Array.isArray(profile.exceptions)||profile.exceptions.length)return incomplete('Unsupported jurisdiction, operation, cycle or exception profile.');
 const now=Date.parse(at),anchor=Date.parse(profile.dayAnchor);if(!Number.isFinite(now)||!Number.isFinite(anchor))return incomplete('A dated operator-designated day anchor is required.');
 if(!Array.isArray(profile.history)||!profile.history.length)return incomplete('Dated duty history is missing.');
 const unique=new Map<string,Span>();
 for(const entry of profile.history){const start=Date.parse(entry.start),end=Date.parse(entry.end);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now||!['off_duty','sleeper','on_duty','driving'].includes(entry.duty)||!entry.source)return incomplete('Invalid, undated or future duty interval.');unique.set(`${start}:${end}:${entry.duty}`,{start,end,duty:entry.duty});}
 const spans=[...unique.values()].sort((a,b)=>a.start-b.start);for(let i=1;i<spans.length;i++)if(spans[i].start!==spans[i-1].end)return incomplete('Duty history has a gap or overlapping/conflicting intervals.');
 const start=spans[0].start,through=spans.at(-1)!.end,dayStart=anchor+Math.floor((now-anchor)/DAY)*DAY,dayEnd=dayStart+DAY;
 if(start>dayStart-14*DAY)return incomplete(`Duty history must cover at least ${iso(dayStart-14*DAY)} through the current operator day.`);
 const offset=(t:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:profile.timeZone,timeZoneName:'shortOffset'}).formatToParts(t).find(p=>p.type==='timeZoneName')?.value;
 if(offset(start)!==offset(now))return incomplete('Daylight-saving transition requires a reviewed operator-day boundary profile.');
 if(observations.some(e=>!Number.isFinite(Date.parse(e.at))))return incomplete('Undated duty observation.');
 const events=observations.filter(e=>Date.parse(e.at)>=start&&Date.parse(e.at)<=now).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 let cursor=through,duty=spans.at(-1)!.duty;
 for(let i=0;i<events.length;i++){
  const event=events[i],time=Date.parse(event.at);
  if(!['off_duty','sleeper','on_duty','driving'].includes(event.duty))return incomplete('Invalid duty observation.');
  if(i&&time===Date.parse(events[i-1].at)&&event.duty!==events[i-1].duty)return incomplete('Conflicting duty observations at the same timestamp.');
  if(time<through){const declared=spans.find(s=>s.start<=time&&s.end>time);if(!declared||declared.duty!==event.duty)return incomplete('Operational duty evidence conflicts with reviewed history.');continue;}
  if(time>cursor)spans.push({start:cursor,end:time,duty});cursor=time;duty=event.duty;
 }
 if(cursor<now)spans.push({start:cursor,end:now,duty});
 const rests:{start:number;end:number}[]=[];for(const span of spans){if(!off(span.duty))continue;const last=rests.at(-1);if(last?.end===span.start)last.end=span.end;else rests.push({start:span.start,end:span.end});}
 const core=rests.filter(r=>r.end-r.start>=8*HOUR).map(r=>({start:r.end-8*HOUR,end:r.end}));
 const lastCore=core.at(-1);if(!lastCore)return incomplete('No evidenced eight-consecutive-hour rest establishes the shift.');
 const shiftStart=lastCore.end;
 const rest24=rests.filter(r=>r.end-r.start>=24*HOUR&&r.end-24*HOUR>=now-14*DAY).at(-1);
 if(!rest24)return incomplete('No evidenced 24-consecutive-hour rest in the preceding 14 days.');
 let cycleStart=dayStart-(profile.cycle===1?6:13)*DAY;
 if(profile.cycleStartedAt){const reset=Date.parse(profile.cycleStartedAt),required=(profile.cycle===1?36:72)*HOUR;if(!Number.isFinite(reset)||reset>now||!rests.some(r=>r.start<=reset-required&&r.end>=reset))return incomplete('Declared cycle reset lacks the required consecutive rest.');cycleStart=Math.max(cycleStart,reset);}
 const sum=(from:number,to:number,predicate:(s:Span)=>boolean)=>spans.reduce((total,s)=>total+(predicate(s)?overlap(s.start,s.end,from,to):0),0);
 const restForDay=(from:number,to:number)=>{
  const total=sum(from,to,s=>off(s.duty));
  // Fixed conservative allocation: the last eight hours of each qualifying rest
  // are mandatory. Ambiguous historical allocation is held for review, not passed.
  let additional=0;for(const r of rests){const additionalEnd=r.end-r.start>=8*HOUR?r.end-8*HOUR:r.end;if(additionalEnd-r.start>=30*MINUTE)additional+=overlap(r.start,additionalEnd,from,to);}
  return {total,additional};
 };
 for(let day=dayStart-14*DAY;day<dayStart;day+=DAY){const rest=restForDay(day,day+DAY);if(rest.total<10*HOUR||rest.additional<2*HOUR)return incomplete(`Daily rest evidence needs review for operator day ${iso(day)} (10 hours total and 2 additional hours).`);}
 const currentRest=restForDay(dayStart,now),restDue=Math.max(0,10*HOUR-currentRest.total,2*HOUR-currentRest.additional);
 const dayDrive=sum(dayStart,now,s=>s.duty==='driving'),dayWork=sum(dayStart,now,s=>!off(s.duty));
 const shiftDrive=sum(shiftStart,now,s=>s.duty==='driving'),shiftWork=sum(shiftStart,now,s=>!off(s.duty));
 const cycleWork=sum(cycleStart,now,s=>!off(s.duty)),since24=sum(rest24.end,now,s=>!off(s.duty));
 const continuousUntil=Math.min(shiftStart+16*HOUR,dayEnd-restDue,rest24.end-24*HOUR+14*DAY);
 const budget={drivingMinutes:Math.min(remainder(13*HOUR,dayDrive),remainder(13*HOUR,shiftDrive)),onDutyMinutes:Math.min(remainder(14*HOUR,dayWork),remainder(14*HOUR,shiftWork),remainder(dayEnd-now,restDue)),shiftMinutes:remainder(continuousUntil,now),cycleMinutes:Math.min(remainder((profile.cycle===1?70:120)*HOUR,cycleWork),profile.cycle===2?remainder(70*HOUR,since24):Infinity)};
 return {duty,budget,budgetAsOf:at,hosEvidence:{status:'modeled',profile:profile.ruleset,cycle:profile.cycle,historyFrom:iso(start),historyThrough:iso(through),dayStart:iso(dayStart),dayEnd:iso(dayEnd),shiftStart:iso(shiftStart),shiftDeadline:iso(continuousUntil),dayDrivingMinutes:dayDrive/MINUTE,dayOnDutyMinutes:dayWork/MINUTE,shiftDrivingMinutes:shiftDrive/MINUTE,shiftOnDutyMinutes:shiftWork/MINUTE,cycleOnDutyMinutes:cycleWork/MINUTE,onDutySince24HourRestMinutes:since24/MINUTE,dailyRestRemainingMinutes:restDue/MINUTE,certifiedELD:false,note:'Ordinary federal solo south-of-60 planning profile. Fixed 24-hour operator days; no exceptions, sleeper split or automatic cycle reset. Tail-eight-hour core-rest allocation is conservative. Future plans stop at the current day/rest horizon; not certified ELD or a retrospective compliance certificate.'}};
}
