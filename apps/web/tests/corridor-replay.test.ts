import test from 'node:test'
import assert from 'node:assert/strict'
import { corridorMilestones, eventAt, mergeCorridorPage, routeAt, type CorridorPage } from '../src/corridor-replay-model.ts'

const key = (value: string) => value.repeat(64).slice(0, 64)
function page(offset = 0, count = 2, total = 4): CorridorPage {
  const routes = [{ key: key('a'), ordinal: 0, after_seconds: null, revision_id: null, revision: null, source: 'valhalla-truck', geometry: { type: 'LineString' as const, coordinates: [[-81.2, 42.99], [-81.1, 43]] as [number, number][] }, stop_indices: [0, 1] }]
  const events = Array.from({ length: count }, (_, index) => {
    const elapsed = offset + index
    return { route_key: routes[0].key, elapsed_seconds: elapsed, sample: { id: (elapsed + 1).toString(16).padStart(64, '0'), assignmentId: 'assignment', at: new Date(1000 + elapsed * 1000).toISOString(), position: { lat: 42.99 + elapsed / 1000, lng: -81.2 }, speedKph: elapsed ? 40 : 0, odometerKm: elapsed / 10, duty: elapsed ? 'driving' : 'on_duty', phase: elapsed ? 'driving' : 'dock_wait', accuracyM: 5, provenance: 'synthetic' as const } }
  })
  return { schema: 1, run_id: 'run', assignment_id: 'assignment', start_time_ms: 1000, routes, events, snapshot: key('b'), total, offset, next_offset: offset + count < total ? offset + count : null, provenance: 'synthetic', evidence: 'acknowledged', speed_semantics: 'preceding interval', clock_semantics: 'view only' }
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
