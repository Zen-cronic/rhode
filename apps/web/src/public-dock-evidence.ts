export const publicDockEvidence = {
  receipt: {
    id: 'london-complete-replay',
    facility: 'london-local-yard',
    observedDwellMinutes: 165,
    billableMinutes: 45,
    draftCad: 75,
  },
  filmBillingExample: {
    id: 'milton-billing-review',
    facility: 'milton-yard',
    observedDwellMinutes: 167,
    billableMinutes: 47,
    draftCad: 78.33,
  },
  hos: {
    driverId: 'D-01',
    profile: 'declared-budget-history',
    basisAt: '2026-09-13T12:00:00.000Z',
    asOf: '2026-09-13T15:20:00.000Z',
    shiftDeadline: '2026-09-13T21:00:00.000Z',
    sourceObservations: 10201,
    certifiedEld: false,
    consumed: {
      drivingMinutes: 2.8333333333333335,
      onDutyMinutes: 200,
      elapsedMinutes: 200,
    },
    remaining: {
      drivingMinutes: 417,
      onDutyMinutes: 40,
      elapsedMinutes: 340,
      cycleMinutes: 700,
    },
    nextAssignment: {
      loadId: 'RS-1043',
      drivingMinutes: 99,
      serviceMinutes: 45,
      onDutyMinutes: 144,
    },
  },
} as const

export function publicDockHosDecision() {
  const { remaining, nextAssignment } = publicDockEvidence.hos
  return {
    drivingPasses: remaining.drivingMinutes >= nextAssignment.drivingMinutes,
    onDutyPasses: remaining.onDutyMinutes >= nextAssignment.onDutyMinutes,
    elapsedPasses: remaining.elapsedMinutes >= nextAssignment.onDutyMinutes,
    bindingReason: 'Insufficient on-duty budget.',
  } as const
}
