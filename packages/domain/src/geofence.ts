/** Versioned observation policy. This is not a contract override or an exact dock clock. */
export const VISIT_SESSION_POLICY = 'confidence-disk-split-v1';
export const visitPolicyEvidence = {
 id: VISIT_SESSION_POLICY,
 boundaryRule: 'Accuracy disk touching the fence holds the prior visit state; no inferred crossing time.',
 reentryRule: 'A confidently outside observation closes the visit. A confident return starts a separate visit; no exit grace period.',
 freeTimeScope: 'each-observed-visit',
} as const;
export function fenceConfidence(distanceM:number,accuracyM:number,radiusM:number):'inside'|'outside'|'boundary'|'uncertain'{
 if(![distanceM,accuracyM,radiusM].every(Number.isFinite)||distanceM<0||accuracyM<0||radiusM<=0||accuracyM>100)return 'uncertain';
 if(distanceM+accuracyM<radiusM)return 'inside';
 if(distanceM-accuracyM>radiusM)return 'outside';
 return 'boundary';
}
