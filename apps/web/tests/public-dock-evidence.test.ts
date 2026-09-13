import test from 'node:test'
import assert from 'node:assert/strict'
import { publicDockEvidence, publicDockHosDecision } from '../src/public-dock-evidence.ts'

test('public dock receipt retains the exact HOS calculation and binding gate', () => {
  const { hos } = publicDockEvidence
  assert.equal(hos.sourceObservations, 10201)
  assert.equal(hos.consumed.drivingMinutes, 2.8333333333333335)
  assert.deepEqual(hos.remaining, {
    drivingMinutes: 417,
    onDutyMinutes: 40,
    elapsedMinutes: 340,
    cycleMinutes: 700,
  })
  assert.deepEqual(hos.nextAssignment, {
    loadId: 'RS-1043',
    drivingMinutes: 99,
    serviceMinutes: 45,
    onDutyMinutes: 144,
  })
  assert.deepEqual(publicDockHosDecision(), {
    drivingPasses: true,
    onDutyPasses: false,
    elapsedPasses: true,
    bindingReason: 'Insufficient on-duty budget.',
  })
})

test('public receipt and film billing example remain explicitly separate', () => {
  assert.notEqual(publicDockEvidence.receipt.id, publicDockEvidence.filmBillingExample.id)
  assert.notEqual(publicDockEvidence.receipt.facility, publicDockEvidence.filmBillingExample.facility)
  assert.deepEqual(
    [publicDockEvidence.receipt.observedDwellMinutes, publicDockEvidence.receipt.billableMinutes, publicDockEvidence.receipt.draftCad],
    [165, 45, 75],
  )
  assert.deepEqual(
    [publicDockEvidence.filmBillingExample.observedDwellMinutes, publicDockEvidence.filmBillingExample.billableMinutes, publicDockEvidence.filmBillingExample.draftCad],
    [167, 47, 78.33],
  )
})
