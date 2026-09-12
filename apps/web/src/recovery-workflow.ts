export type RecoveryCandidate = {
  eligible: boolean;
  reasons: string[];
};

export type RecoveryWorkflowEvidence = {
  combinationsScreened: number;
  feasibleCombinations: number;
  rejectedCombinations: number;
  retainedConstraintReasons: number;
};

export function recoveryWorkflowEvidence(
  candidates?: RecoveryCandidate[],
): RecoveryWorkflowEvidence | null {
  if (!candidates?.length) return null;
  const feasibleCombinations = candidates.filter(
    (candidate) => candidate.eligible,
  ).length;
  const retainedConstraintReasons = candidates.reduce(
    (count, candidate) => count + new Set(candidate.reasons).size,
    0,
  );
  return {
    combinationsScreened: candidates.length,
    feasibleCombinations,
    rejectedCombinations: candidates.length - feasibleCombinations,
    retainedConstraintReasons,
  };
}
