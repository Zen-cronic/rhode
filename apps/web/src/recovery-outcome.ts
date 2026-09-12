import type {Screening} from '@roadstar/domain';

export type RecoveryComparison={current?:Screening;currentUnavailable?:string;proposed:Screening;evaluatedAt?:string};
export type RecoveryOutcome={pickupMinutesRecovered:number;completionMinutesEarlier:number;deadheadDeltaKm:number;currentPickupLateMinutes:number;proposedPickupLateMinutes:number};

const rounded=(value:number,places=0)=>Number(value.toFixed(places));

export function recoveryOutcome(comparison:RecoveryComparison):RecoveryOutcome|null{
  const current=comparison.current,proposed=comparison.proposed;
  if(!current?.timing||!proposed.timing)return null;
  const currentCompletion=Date.parse(current.timing.completionAt),proposedCompletion=Date.parse(proposed.timing.completionAt);
  if(!Number.isFinite(currentCompletion)||!Number.isFinite(proposedCompletion))return null;
  const values=[current.timing.pickupLateMinutes,proposed.timing.pickupLateMinutes,current.deadheadKm,proposed.deadheadKm];
  if(values.some(value=>!Number.isFinite(value)||value<0))return null;
  return {pickupMinutesRecovered:rounded(current.timing.pickupLateMinutes-proposed.timing.pickupLateMinutes),completionMinutesEarlier:rounded((currentCompletion-proposedCompletion)/60_000),deadheadDeltaKm:rounded(proposed.deadheadKm-current.deadheadKm,1),currentPickupLateMinutes:current.timing.pickupLateMinutes,proposedPickupLateMinutes:proposed.timing.pickupLateMinutes};
}
