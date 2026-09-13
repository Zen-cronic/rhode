import test from 'node:test'
import assert from 'node:assert/strict'
import { comparisonCompatibility, corridorComparisonMetrics, corridorComparisonMilestones, corridorComparisonSpeedProfile, corridorMilestones, eventAt, eventAtOrBefore, mergeCorridorPage, routeAt, type CorridorIntervention, type CorridorPage } from '../src/corridor-replay-model.ts'

const key = (value: string) => value.repeat(64).slice(0, 64)
function page(offset = 0, count = 2, total = 4): CorridorPage {
  const routes = [{ key: key('a'), ordinal: 0, after_seconds: null, revision_id: null, revision: null, source: 'valhalla-truck', geometry: { type: 'LineString' as const, coordinates: [[-81.2, 42.99], [-81.1, 43]] as [number, number][] }, stop_indices: [0, 1] }]
  const events = Array.from({ length: count }, (_, index) => {
    const elapsed = offset + index
    return { route_key: routes[0].key, elapsed_seconds: elapsed, sample: { id: (elapsed + 1).toString(16).padStart(64, '0'), assignmentId: 'assignment', at: new Date(1000 + elapsed * 1000).toISOString(), position: { lat: 42.99 + elapsed / 1000, lng: -81.2 }, speedKph: elapsed ? 40 : 0, odometerKm: elapsed / 10, duty: elapsed ? 'driving' : 'on_duty', phase: elapsed ? 'driving' : 'dock_wait', accuracyM: 5, provenance: 'synthetic' as const } }
  })
  return { schema: 1, run_id: 'run', assignment_id: 'assignment', start_time_ms: 1000, routes, events, snapshot: key('b'), total, offset, next_offset: offset + count < total ? offset + count : null, provenance: 'synthetic', evidence: 'acknowledged', speed_semantics: 'preceding interval', clock_semantics: 'view only', comparison_basis_hash: key('d'), intervention: { kind: 'baseline', road_hold: null, road_slowdown: null }, modeled_completion_ms: 5000 }
}

test('recording pages merge only in one frozen ordered source', () => {
  const first = mergeCorridorPage(null, page())
  assert.equal(first.complete, false)
  const complete = mergeCorridorPage(first, page(2))
  assert.equal(complete.complete, true)
  assert.deepEqual(corridorMilestones(complete), [{ id: 'origin', label: 'Origin', index: 0 }, { id: 'movement', label: 'Movement', index: 1 }, { id: 'latest', label: 'Latest', index: 3 }])
  assert.equal(eventAt(complete, 99)?.sample.id, complete.events[3].sample.id)
  assert.equal(routeAt(complete, -4)?.key, complete.routes[0].key)
})

test('recording pages reject stale, overlapping, foreign and malformed evidence', () => {
  const first = mergeCorridorPage(null, page())
  for (const mutate of [
    (value: CorridorPage) => { value.snapshot = key('c') },
    (value: CorridorPage) => { value.offset = 1 },
    (value: CorridorPage) => { value.events[0].sample.assignmentId = 'foreign' },
    (value: CorridorPage) => { value.events[0].route_key = key('f') },
    (value: CorridorPage) => { value.events[0].sample.id = 'invalid' },
    (value: CorridorPage) => { value.next_offset = 3 },
    (value: CorridorPage) => { value.events[0].sample.duty = '' },
    (value: CorridorPage) => { value.events[0].sample.phase = 2 as unknown as string },
    (value: CorridorPage) => { value.events[0].sample.speedKph = -1 },
    (value: CorridorPage) => { value.events[0].sample.odometerKm = -1 },
    (value: CorridorPage) => { value.events[0].sample.accuracyM = -1 },
    (value: CorridorPage) => { value.intervention = { kind: 'road_slowdown', road_hold: null, road_slowdown: null } },
    (value: CorridorPage) => { value.modeled_completion_ms = value.start_time_ms - 1 },
  ]) {
    const next = structuredClone(page(2)); mutate(next)
    assert.throws(() => mergeCorridorPage(first, next))
  }
  const duplicate = page(2); duplicate.events[0].sample.id = first.events[0].sample.id
  assert.throws(() => mergeCorridorPage(first, duplicate), /overlap/)
})

test('empty recordings remain explicit and do not invent milestones', () => {
  const empty = page(0, 0, 0)
  const recording = mergeCorridorPage(null, empty)
  assert.equal(recording.complete, true)
  assert.deepEqual(corridorMilestones(recording), [])
  assert.equal(eventAt(recording, 0), null)
  assert.equal(routeAt(recording, 0), null)
})

function completeRecording(runId: string, intervention: CorridorIntervention) {
  const value = page(0, 4, 4)
  value.run_id = runId
  value.assignment_id = `assignment-${runId}`
  value.events.forEach(event => { event.sample.assignmentId = value.assignment_id })
  value.intervention = intervention
  return mergeCorridorPage(null, value)
}

test('exact shared-time alignment selects at-or-before observations without interpolation', () => {
  const baseline = completeRecording('baseline', { kind: 'baseline', road_hold: null, road_slowdown: null })
  const disruptedPage = page(0, 4, 4)
  disruptedPage.run_id = 'slowdown'
  disruptedPage.assignment_id = 'assignment-slowdown'
  disruptedPage.events.forEach(event => { event.sample.assignmentId = disruptedPage.assignment_id })
  disruptedPage.intervention = { kind: 'road_slowdown', road_hold: null, road_slowdown: { start_seconds: 1.5, duration_seconds: 1, factor: 0.5 } }
  disruptedPage.modeled_completion_ms = 7000
  disruptedPage.routes[0].key = key('e')
  disruptedPage.events.forEach(event => { event.route_key = disruptedPage.routes[0].key })
  disruptedPage.events.forEach((event, index) => {
    event.elapsed_seconds = [0, 1.4, 2.4, 3.4][index]
    event.sample.odometerKm = [0, 0.08, 0.13, 0.2][index]
  })
  const disrupted = mergeCorridorPage(null, disruptedPage)

  assert.equal(eventAtOrBefore(disrupted, 2)?.elapsed_seconds, 1.4)
  assert.equal(eventAtOrBefore(disrupted, -1), null)
  const metrics = corridorComparisonMetrics(baseline, disrupted, 2)
  assert.ok(metrics)
  assert.equal(metrics.sharedTimeSeconds, 2)
  assert.equal(metrics.baseline.elapsed_seconds, 2)
  assert.equal(metrics.disrupted.elapsed_seconds, 1.4)
  assert.equal(metrics.disruptedObservationAgeSeconds, 0.6000000000000001)
  assert.ok(Math.abs((metrics.progressGapKm ?? 0) - 0.12) < 1e-9)
  assert.equal(metrics.modeledCompletionDeltaSeconds, 2)
  assert.deepEqual(corridorComparisonMilestones(baseline, disrupted), [
    { id: 'shared-origin', label: 'Shared start', elapsedSeconds: 0 },
    { id: 'intervention', label: 'Slowdown starts', elapsedSeconds: 1.5 },
    { id: 'release', label: 'Intervention ends', elapsedSeconds: 2.5 },
    { id: 'shared-latest', label: 'Shared latest', elapsedSeconds: 3 },
  ])
})

test('comparison rejects unmatched basis, start, route and intervention evidence', () => {
  const baseline = completeRecording('baseline', { kind: 'baseline', road_hold: null, road_slowdown: null })
  const slowdown = completeRecording('slowdown', { kind: 'road_slowdown', road_hold: null, road_slowdown: { start_seconds: 1, duration_seconds: 2, factor: 0.5 } })
  slowdown.routes[0].key = key('e')
  slowdown.events.forEach(event => { event.route_key = slowdown.routes[0].key })
  assert.deepEqual(comparisonCompatibility(baseline, slowdown), { ok: true })

  const cases = [
    ['basis', (value: typeof slowdown) => { value.comparison_basis_hash = key('f') }, /basis hashes/],
    ['start', (value: typeof slowdown) => { value.start_time_ms += 1 }, /start-time/],
    ['route', (value: typeof slowdown) => { value.routes[0].geometry.coordinates[0][0] += 0.01 }, /route evidence/],
    ['pair', (value: typeof slowdown) => { value.intervention = { kind: 'baseline', road_hold: null, road_slowdown: null } }, /one baseline/],
  ] as const
  for (const [, mutate, expected] of cases) {
    const candidate = structuredClone(slowdown)
    const left = structuredClone(baseline)
    mutate(candidate)
    const result = comparisonCompatibility(left, candidate)
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.reason, expected)
  }
})

test('speed profile is deterministic, bounded and retains exact boundary provenance', () => {
  const baselinePage = page(0, 100, 100)
  baselinePage.run_id = 'profile-baseline'
  baselinePage.assignment_id = 'assignment-profile-baseline'
  baselinePage.events.forEach(event => { event.sample.assignmentId = baselinePage.assignment_id })
  const disruptedPage = structuredClone(baselinePage)
  disruptedPage.run_id = 'profile-slowdown'
  disruptedPage.assignment_id = 'assignment-profile-slowdown'
  disruptedPage.events.forEach((event, index) => {
    event.sample.assignmentId = disruptedPage.assignment_id
    event.sample.id = (1000 + index).toString(16).padStart(64, '0')
    event.sample.position = { lat: 43.1 + index / 1000, lng: -80.9 - index / 1000 }
    event.sample.speedKph = 30 + index / 10
  })
  disruptedPage.routes[0].key = key('e')
  disruptedPage.events.forEach(event => { event.route_key = disruptedPage.routes[0].key })
  disruptedPage.intervention = {
    kind: 'road_slowdown', road_hold: null,
    road_slowdown: { start_seconds: 20.5, duration_seconds: 30, factor: 0.5 },
  }
  const baseline = mergeCorridorPage(null, baselinePage)
  const disrupted = mergeCorridorPage(null, disruptedPage)

  const profile = corridorComparisonSpeedProfile(baseline, disrupted)
  assert.equal(profile.length, 64)
  assert.deepEqual(profile, corridorComparisonSpeedProfile(disrupted, baseline))
  assert.deepEqual(profile.map(entry => entry.sharedTimeSeconds).filter(time => [20.5, 50.5, 99].includes(time)), [20.5, 50.5, 99])
  const start = profile.find(entry => entry.sharedTimeSeconds === 20.5)
  assert.ok(start)
  assert.equal(start.baseline.eventId, baseline.events[20].sample.id)
  assert.equal(start.disrupted.eventId, disrupted.events[20].sample.id)
  assert.equal(start.baseline.sourceAgeSeconds, 0.5)
  assert.equal(start.disrupted.sourceAgeSeconds, 0.5)
  assert.deepEqual(start.baseline.position, baseline.events[20].sample.position)
  assert.deepEqual(start.disrupted.position, disrupted.events[20].sample.position)
  assert.equal(start.baseline.speedKph, baseline.events[20].sample.speedKph)
  assert.equal(start.disrupted.speedKph, disrupted.events[20].sample.speedKph)
})

test('speed profile preserves missing-speed gaps and partitions compatible route epochs', () => {
  const baselinePage = page(0, 5, 5)
  baselinePage.run_id = 'epoch-baseline'
  baselinePage.assignment_id = 'assignment-epoch-baseline'
  baselinePage.events.forEach(event => { event.sample.assignmentId = baselinePage.assignment_id })
  baselinePage.events[1].sample.speedKph = null
  baselinePage.routes.push({ ...structuredClone(baselinePage.routes[0]), key: key('c'), ordinal: 1, after_seconds: 2 })
  baselinePage.events.slice(2).forEach(event => { event.route_key = key('c') })

  const disruptedPage = structuredClone(baselinePage)
  disruptedPage.run_id = 'epoch-slowdown'
  disruptedPage.assignment_id = 'assignment-epoch-slowdown'
  disruptedPage.events.forEach((event, index) => {
    event.sample.assignmentId = disruptedPage.assignment_id
    event.sample.id = (2000 + index).toString(16).padStart(64, '0')
  })
  disruptedPage.events[1].sample.speedKph = 17
  disruptedPage.routes[0].key = key('e')
  disruptedPage.routes[1].key = key('f')
  disruptedPage.events.forEach(event => { event.route_key = key('e') })
  disruptedPage.events.slice(3).forEach(event => { event.route_key = key('f') })
  disruptedPage.intervention = {
    kind: 'road_hold', road_hold: { start_seconds: 1, duration_seconds: 1 }, road_slowdown: null,
  }
  const baseline = mergeCorridorPage(null, baselinePage)
  const disrupted = mergeCorridorPage(null, disruptedPage)

  const profile = corridorComparisonSpeedProfile(baseline, disrupted)
  assert.deepEqual(profile.map(entry => entry.sharedTimeSeconds), [0, 1, 3, 4])
  assert.equal(profile[1].baseline.speedKph, null)
  assert.equal(profile[1].disrupted.speedKph, 17)
  assert.equal(profile[0].startsRouteEpoch, true)
  assert.equal(profile[1].startsRouteEpoch, false)
  assert.equal(profile[2].routeOrdinal, 1)
  assert.equal(profile[2].routeEpochIndex, 1)
  assert.equal(profile[2].startsRouteEpoch, true)
  assert.equal(profile[3].startsRouteEpoch, false)
})
