import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateHosProfile,type HosProfile,type DutyInterval} from '../packages/domain/src/hos-profile.ts';
const H=3600000,D=24*H,day=Date.parse('2026-09-13T04:00:00Z'),iso=(n:number)=>new Date(n).toISOString();
const interval=(start:number,end:number,duty:DutyInterval['duty']):DutyInterval=>({start:iso(start),end:iso(end),duty,source:'reviewed synthetic fixture'});
function profile(history:DutyInterval[]):HosProfile{return {ruleset:'federal-south-60-solo-ordinary-v1',cycle:1,dayAnchor:iso(day),timeZone:'America/Toronto',exceptions:[],history};}
const base=(until:number)=>profile([interval(day-16*D,until,'off_duty')]);
test('profile separates daily work, shift work and reserves remaining daily rest',()=>{
 const p=profile([interval(day-16*D,day+8*H,'off_duty'),interval(day+8*H,day+16*H,'driving')]);const r=evaluateHosProfile(p,[],iso(day+16*H));
 assert.deepEqual(r.budget,{drivingMinutes:300,onDutyMinutes:360,shiftMinutes:360,cycleMinutes:3720});assert.equal(r.hosEvidence.dailyRestRemainingMinutes,120);assert.equal(r.hosEvidence.dayDrivingMinutes,480);
});
test('eight-hour rest resets the shift without erasing driving in the same operator day',()=>{
 const p=profile([interval(day-16*D,day,'off_duty'),interval(day,day+4*H,'driving'),interval(day+4*H,day+12*H,'off_duty')]);const r=evaluateHosProfile(p,[],iso(day+12*H));assert.equal(r.budget?.drivingMinutes,540);assert.equal(r.hosEvidence.dayDrivingMinutes,240);assert.equal(r.hosEvidence.shiftDrivingMinutes,0);
});
test('local midnight cannot reset a non-midnight designated day',()=>{
 const p=profile([interval(day-16*D,day+18*H,'off_duty'),interval(day+18*H,day+24*H,'driving')]);p.dayAnchor=iso(day+6*H);const r=evaluateHosProfile(p,[],iso(day+24*H));assert.equal(r.hosEvidence.dayStart,iso(day+6*H));assert.equal(r.hosEvidence.dayDrivingMinutes,360);assert.equal(r.budget?.drivingMinutes,420);
});
function sixLongDays(){const spans: DutyInterval[]=[interval(day-16*D,day-6*D+8*H,'off_duty')];for(let n=-6;n<0;n++){spans.push(interval(day+n*D+8*H,day+n*D+20*H,'driving'),interval(day+n*D+20*H,day+(n+1)*D+8*H,'off_duty'));}return profile(spans);}
test('healthy new shift cannot override Cycle1 70-hour exhaustion or Cycle2 70-hours-since-rest',()=>{
 const p=sixLongDays(),at=iso(day+8*H);const one=evaluateHosProfile(p,[],at);assert.equal(one.budget?.drivingMinutes,780);assert.equal(one.budget?.cycleMinutes,0);const two=evaluateHosProfile({...p,cycle:2},[],at);assert.equal(two.hosEvidence.cycleOnDutyMinutes,4320);assert.equal(two.budget?.cycleMinutes,0);
});
test('only declared, evidenced 36/72-hour reset can start a new cycle',()=>{
 const p=base(day+8*H);p.cycleStartedAt=iso(day+8*H);assert.equal(evaluateHosProfile(p,[],iso(day+8*H)).budget?.cycleMinutes,4200);assert.equal(evaluateHosProfile({...p,cycle:2},[],iso(day+8*H)).budget?.cycleMinutes,4200); // Cycle2 additional 70h rest condition binds first.
 const short=sixLongDays();short.cycleStartedAt=iso(day+8*H);assert.equal(evaluateHosProfile(short,[],iso(day+8*H)).budget,null);
});
test('missing history, overlaps, unsupported exceptions and daily rest deficits require review',()=>{
 const p=base(day+8*H);assert.equal(evaluateHosProfile({...p,history:[interval(day-D,day+8*H,'off_duty')]},[],iso(day+8*H)).budget,null);
 assert.equal(evaluateHosProfile({...p,history:[...p.history,interval(day,day+H,'driving')]},[],iso(day+8*H)).budget,null);
 assert.equal(evaluateHosProfile({...p,exceptions:['adverse'] as any},[],iso(day+8*H)).budget,null);
 const deficit=profile([interval(day-16*D,day-D,'off_duty'),interval(day-D,day-9*H,'on_duty'),interval(day-9*H,day+8*H,'off_duty')]);assert.equal(evaluateHosProfile(deficit,[],iso(day+8*H)).budget,null);
});
test('late contradictory duty evidence cannot be hidden by the reviewed profile',()=>{
 const p=base(day+8*H);const at=iso(day+9*H);assert.equal(evaluateHosProfile(p,[{at:iso(day+H),duty:'driving',source:'late telemetry'}],at).budget,null);
 const events=[{at:iso(day+8*H),duty:'driving' as const,source:'declared duty'}];const a=evaluateHosProfile(p,events,at),b=evaluateHosProfile(p,[...events,...events],at);assert.deepEqual(a.budget,b.budget);assert.equal(a.hosEvidence.dayDrivingMinutes,60);
});
test('short breaks do not reset elapsed shift and dock waiting remains on duty',()=>{
 const p=profile([interval(day-16*D,day+H,'off_duty'),interval(day+H,day+7*H,'on_duty'),interval(day+7*H,day+8*H,'off_duty'),interval(day+8*H,day+17*H,'on_duty')]);const r=evaluateHosProfile(p,[],iso(day+17*H));assert.equal(r.budget?.shiftMinutes,0);assert.equal(r.budget?.onDutyMinutes,0);assert.equal(r.hosEvidence.shiftOnDutyMinutes,900);
});

test('Cycle2 120-hour rolling total binds even after a recent 24-hour rest',()=>{
 const periods: DutyInterval[]=[interval(day-16*D,day-13*D+8*H,'off_duty')];let cursor=day-13*D+8*H;
 for(const n of [-13,-12,-11,-10,-9,-8,-6,-5,-4,-3,-2,-1]){const workStart=day+n*D+8*H;if(workStart>cursor)periods.push(interval(cursor,workStart,'off_duty'));periods.push(interval(workStart,workStart+10*H,'on_duty'));cursor=workStart+10*H;}
 periods.push(interval(cursor,day+8*H,'off_duty'));const p={...profile(periods),cycle:2 as const};const r=evaluateHosProfile(p,[],iso(day+8*H));assert.equal(r.hosEvidence.cycleOnDutyMinutes,7200);assert.equal(r.hosEvidence.onDutySince24HourRestMinutes,3600);assert.equal(r.budget?.cycleMinutes,0);
});
test('regular daily rest cannot substitute for 24 consecutive hours in fourteen days',()=>{
 const periods=[interval(day-16*D,day-14*D+8*H,'off_duty')];for(let n=-14;n<0;n++)periods.push(interval(day+n*D+8*H,day+n*D+20*H,'on_duty'),interval(day+n*D+20*H,day+(n+1)*D+8*H,'off_duty'));
 const r=evaluateHosProfile(profile(periods),[],iso(day+8*H));assert.equal(r.budget,null);assert.match(r.hosEvidence.reason??'',/24-consecutive-hour/);
});
test('qualifying rest does not silently select a cycle reset',()=>{
 const p=sixLongDays();p.history[p.history.length-1].end=iso(day+44*H);const at=iso(day+44*H);const noReset=evaluateHosProfile(p,[],at);assert.equal(noReset.hosEvidence.cycleOnDutyMinutes,3600);assert.equal(noReset.budget?.cycleMinutes,600);const reset=evaluateHosProfile({...p,cycleStartedAt:at},[],at);assert.equal(reset.budget?.cycleMinutes,4200);
});

test('additional off-duty blocks under thirty minutes do not satisfy the two-hour requirement',()=>{
 const p=profile([interval(day-16*D,day,'off_duty'),interval(day,day+4*H,'on_duty'),interval(day+4*H,day+12*H+20*60000,'off_duty')]);const r=evaluateHosProfile(p,[],p.history.at(-1)!.end);assert.equal(r.hosEvidence.dailyRestRemainingMinutes,120);
 p.history.at(-1)!.end=iso(day+12*H+30*60000);assert.equal(evaluateHosProfile(p,[],p.history.at(-1)!.end).hosEvidence.dailyRestRemainingMinutes,90);
});
