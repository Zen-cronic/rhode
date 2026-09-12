import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryOutcome,type RecoveryComparison} from '../src/recovery-outcome.ts';

function comparison():RecoveryComparison{
  const timing=(pickupLateMinutes:number,completionAt:string)=>({evaluatedAt:'2026-09-13T12:30:01Z',availableAt:'2026-09-13T12:30:01Z',pickupArrivalAt:'2026-09-13T12:30:01Z',pickupReadyAt:'2026-09-13T12:30:01Z',pickupLateMinutes,completionAt,travelMinutes:99,serviceMinutes:45});
  return {current:{eligible:false,reasons:['Insufficient on-duty budget.'],deadheadKm:0,note:'fixture',timing:timing(123,'2026-09-13T17:41:50Z')},proposed:{eligible:true,reasons:[],deadheadKm:0,note:'fixture',timing:timing(0,'2026-09-13T15:39:00Z')}};
}

test('verified recovery comparison becomes a concise modeled outcome without money',()=>{
  assert.deepEqual(recoveryOutcome(comparison()),{pickupMinutesRecovered:123,completionMinutesEarlier:123,deadheadDeltaKm:0,currentPickupLateMinutes:123,proposedPickupLateMinutes:0});
});

test('later and farther alternatives retain signed differences',()=>{
  const value=comparison();value.proposed.timing!.pickupLateMinutes=130;value.proposed.timing!.completionAt='2026-09-13T18:11:50Z';value.proposed.deadheadKm=12.34;
  assert.deepEqual(recoveryOutcome(value),{pickupMinutesRecovered:-7,completionMinutesEarlier:-30,deadheadDeltaKm:12.3,currentPickupLateMinutes:123,proposedPickupLateMinutes:130});
});

test('missing or malformed comparison evidence does not invent an outcome',()=>{
  const value=comparison();delete value.current?.timing;assert.equal(recoveryOutcome(value),null);
  const invalid=comparison();invalid.proposed.timing!.completionAt='invalid';assert.equal(recoveryOutcome(invalid),null);
});
