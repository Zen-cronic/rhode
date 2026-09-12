export type CorridorSample = {
  id: string
  assignmentId: string
  at: string
  position: { lat: number; lng: number }
  speedKph: number | null
  odometerKm: number | null
  duty: string
  phase: string
  accuracyM: number
  provenance: 'synthetic'
}

export type CorridorRoute = {
  key: string
  ordinal: number
  after_seconds: number | null
  revision_id: string | null
  revision: number | null
  source: string
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  stop_indices: number[]
}

export type CorridorEvent = {
  sample: CorridorSample
  route_key: string
  elapsed_seconds: number
}

export type CorridorIntervention = {
  kind: 'baseline' | 'road_hold' | 'road_slowdown' | 'road_hold_and_slowdown'
  road_hold: { start_seconds: number; duration_seconds: number } | null
  road_slowdown: { start_seconds: number; duration_seconds: number; factor: number } | null
}

export type CorridorPage = {
  schema: 1
  run_id: string
  assignment_id: string
  start_time_ms: number
  routes: CorridorRoute[]
  events: CorridorEvent[]
  snapshot: string
  total: number
  offset: number
  next_offset: number | null
  provenance: 'synthetic'
  evidence: string
  speed_semantics: string
  clock_semantics: string
  comparison_basis_hash: string
  intervention: CorridorIntervention
  modeled_completion_ms: number
}

export type CorridorRecording = Omit<CorridorPage, 'events' | 'offset' | 'next_offset'> & {
  events: CorridorEvent[]
  complete: boolean
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function validIntervention(value: CorridorIntervention) {
  if (!value || !['baseline', 'road_hold', 'road_slowdown', 'road_hold_and_slowdown'].includes(value.kind)) return false
  const validWindow = (window: { start_seconds: number; duration_seconds: number } | null) =>
    window === null || (finite(window.start_seconds) && window.start_seconds >= 0 && finite(window.duration_seconds) && window.duration_seconds > 0)
  if (!validWindow(value.road_hold) || !validWindow(value.road_slowdown) ||
      (value.road_slowdown !== null && (!finite(value.road_slowdown.factor) || value.road_slowdown.factor <= 0 || value.road_slowdown.factor > 1))) return false
  return value.kind === 'baseline' ? value.road_hold === null && value.road_slowdown === null :
    value.kind === 'road_hold' ? value.road_hold !== null && value.road_slowdown === null :
    value.kind === 'road_slowdown' ? value.road_hold === null && value.road_slowdown !== null :
    value.road_hold !== null && value.road_slowdown !== null
}

function validRoute(route: CorridorRoute) {
  return digest(route.key) && Number.isInteger(route.ordinal) && route.ordinal >= 0 &&
    route.geometry?.type === 'LineString' && route.geometry.coordinates.length >= 2 &&
    route.geometry.coordinates.every(point => Array.isArray(point) && point.length === 2 &&
      finite(point[0]) && finite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90) &&
    route.stop_indices.length >= 2 && route.stop_indices.every(index => Number.isInteger(index) && index >= 0 && index < route.geometry.coordinates.length)
}

function validEvent(event: CorridorEvent, assignmentId: string, routeKeys: Set<string>) {
  const sample = event.sample
  return sample?.assignmentId === assignmentId && sample.provenance === 'synthetic' && digest(sample.id) &&
    routeKeys.has(event.route_key) && finite(event.elapsed_seconds) && event.elapsed_seconds >= 0 &&
    finite(Date.parse(sample.at)) && finite(sample.position?.lat) && finite(sample.position?.lng) &&
    Math.abs(sample.position.lat) <= 90 && Math.abs(sample.position.lng) <= 180 &&
    typeof sample.duty === 'string' && sample.duty.length > 0 &&
    typeof sample.phase === 'string' && sample.phase.length > 0 &&
    (sample.speedKph === null || (finite(sample.speedKph) && sample.speedKph >= 0)) &&
    (sample.odometerKm === null || (finite(sample.odometerKm) && sample.odometerKm >= 0)) &&
    finite(sample.accuracyM) && sample.accuracyM >= 0
}

/**
 * Merge a frozen page into one presentation recording. Any identity, ordering or
 * snapshot mismatch rejects the whole partial recording; callers reload page zero.
 */
export function mergeCorridorPage(previous: CorridorRecording | null, page: CorridorPage): CorridorRecording {
  if (page.schema !== 1 || page.provenance !== 'synthetic' || !digest(page.snapshot) ||
      !digest(page.comparison_basis_hash) || !validIntervention(page.intervention) ||
      !Number.isSafeInteger(page.start_time_ms) || page.start_time_ms < 0 ||
      !Number.isSafeInteger(page.modeled_completion_ms) || page.modeled_completion_ms < page.start_time_ms ||
      !Number.isSafeInteger(page.total) || page.total < 0 || !Number.isSafeInteger(page.offset) || page.offset < 0 ||
      page.events.length > 1000 || page.routes.length < 1 || !page.routes.every(validRoute)) {
    throw new Error('Recording page is invalid. Reload the recording from the beginning.')
  }
  const routeKeys = new Set(page.routes.map(route => route.key))
  if (routeKeys.size !== page.routes.length || !page.events.every(event => validEvent(event, page.assignment_id, routeKeys))) {
    throw new Error('Recording evidence does not match its route or assignment.')
  }
  if (page.events.some((event, index) => index > 0 && event.elapsed_seconds < page.events[index - 1].elapsed_seconds)) {
    throw new Error('Recording events are out of order.')
  }
  if (!previous && page.offset !== 0) throw new Error('Recording must begin at its first page.')
  if (previous) {
    const sameIdentity = previous.snapshot === page.snapshot && previous.run_id === page.run_id &&
      previous.assignment_id === page.assignment_id && previous.start_time_ms === page.start_time_ms &&
      previous.comparison_basis_hash === page.comparison_basis_hash && JSON.stringify(previous.intervention) === JSON.stringify(page.intervention) &&
      previous.modeled_completion_ms === page.modeled_completion_ms &&
      previous.total === page.total && JSON.stringify(previous.routes) === JSON.stringify(page.routes)
    if (!sameIdentity || previous.complete || page.offset !== previous.events.length) {
      throw new Error('Recording changed while loading. Reload it from the beginning.')
    }
  }
  const events = [...(previous?.events ?? []), ...page.events]
  const ids = new Set(events.map(event => event.sample.id))
  if (ids.size !== events.length || events.some((event, index) => index > 0 && event.elapsed_seconds < events[index - 1].elapsed_seconds)) {
    throw new Error('Recording pages overlap or are out of order.')
  }
  const expectedNext = events.length < page.total ? events.length : null
  if (page.next_offset !== expectedNext || events.length > page.total) {
    throw new Error('Recording cursor does not match the returned evidence.')
  }
  return {
    schema: page.schema,
    run_id: page.run_id,
    assignment_id: page.assignment_id,
    start_time_ms: page.start_time_ms,
    routes: page.routes,
    events,
    snapshot: page.snapshot,
    total: page.total,
    provenance: page.provenance,
    evidence: page.evidence,
    speed_semantics: page.speed_semantics,
    clock_semantics: page.clock_semantics,
    comparison_basis_hash: page.comparison_basis_hash,
    intervention: page.intervention,
    modeled_completion_ms: page.modeled_completion_ms,
    complete: page.next_offset === null,
  }
}

export type CorridorComparisonCompatibility = { ok: true } | { ok: false; reason: string }

/** Require independently recorded runs to share their deterministic start and route basis. */
export function comparisonCompatibility(left: CorridorRecording, right: CorridorRecording): CorridorComparisonCompatibility {
  if (!left.complete || !right.complete) return { ok: false, reason: 'Both frozen recordings must finish loading.' }
  if (left.run_id === right.run_id) return { ok: false, reason: 'Choose two distinct simulator runs.' }
  if (left.comparison_basis_hash !== right.comparison_basis_hash) return { ok: false, reason: 'Comparison basis hashes do not match.' }
  if (left.start_time_ms !== right.start_time_ms) return { ok: false, reason: 'Scenario start-time evidence does not match.' }
  const routeEvidence = (recording: CorridorRecording) => recording.routes.map(route => ({
    ordinal: route.ordinal, after_seconds: route.after_seconds, source: route.source,
    geometry: route.geometry, stop_indices: route.stop_indices,
  }))
  if (JSON.stringify(routeEvidence(left)) !== JSON.stringify(routeEvidence(right))) {
    return { ok: false, reason: 'Starting route evidence does not match.' }
  }
  const kinds = new Set([left.intervention.kind, right.intervention.kind])
  if (!kinds.has('baseline') || kinds.size !== 2) return { ok: false, reason: 'Compare one baseline with one modeled intervention.' }
  if (!left.events.length || !right.events.length) return { ok: false, reason: 'Both recordings need acknowledged observations.' }
  return { ok: true }
}

/** Select the last exact observation at or before a shared scenario time. Never interpolates. */
export function eventAtOrBefore(recording: CorridorRecording, elapsedSeconds: number) {
  if (!recording.events.length || !finite(elapsedSeconds) || elapsedSeconds < recording.events[0].elapsed_seconds) return null
  let low = 0, high = recording.events.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (recording.events[middle].elapsed_seconds <= elapsedSeconds) low = middle
    else high = middle - 1
  }
  return recording.events[low]
}

export type CorridorComparisonMetrics = {
  sharedTimeSeconds: number
  baseline: CorridorEvent
  disrupted: CorridorEvent
  baselineObservationAgeSeconds: number
  disruptedObservationAgeSeconds: number
  progressGapKm: number | null
  speedGapKph: number | null
  modeledCompletionDeltaSeconds: number
}

/** Read-only differences from exact source observations aligned at-or-before one shared clock. */
export function corridorComparisonMetrics(left: CorridorRecording, right: CorridorRecording, elapsedSeconds: number): CorridorComparisonMetrics | null {
  if (!comparisonCompatibility(left, right).ok) return null
  const baselineRecording = left.intervention.kind === 'baseline' ? left : right
  const disruptedRecording = left.intervention.kind === 'baseline' ? right : left
  const sharedEnd = Math.min(
    baselineRecording.events.at(-1)?.elapsed_seconds ?? 0,
    disruptedRecording.events.at(-1)?.elapsed_seconds ?? 0,
  )
  const sharedTimeSeconds = Math.max(0, Math.min(elapsedSeconds, sharedEnd))
  const baseline = eventAtOrBefore(baselineRecording, sharedTimeSeconds)
  const disrupted = eventAtOrBefore(disruptedRecording, sharedTimeSeconds)
  if (!baseline || !disrupted) return null
  const baselineOrigin = baselineRecording.events[0].sample.odometerKm
  const disruptedOrigin = disruptedRecording.events[0].sample.odometerKm
  const baselineDistance = baseline.sample.odometerKm === null || baselineOrigin === null ? null : baseline.sample.odometerKm - baselineOrigin
  const disruptedDistance = disrupted.sample.odometerKm === null || disruptedOrigin === null ? null : disrupted.sample.odometerKm - disruptedOrigin
  return {
    sharedTimeSeconds,
    baseline,
    disrupted,
    baselineObservationAgeSeconds: sharedTimeSeconds - baseline.elapsed_seconds,
    disruptedObservationAgeSeconds: sharedTimeSeconds - disrupted.elapsed_seconds,
    progressGapKm: baselineDistance === null || disruptedDistance === null ? null : baselineDistance - disruptedDistance,
    speedGapKph: baseline.sample.speedKph === null || disrupted.sample.speedKph === null ? null : baseline.sample.speedKph - disrupted.sample.speedKph,
    modeledCompletionDeltaSeconds: (disruptedRecording.modeled_completion_ms - baselineRecording.modeled_completion_ms) / 1000,
  }
}

export function corridorComparisonMilestones(left: CorridorRecording, right: CorridorRecording) {
  if (!comparisonCompatibility(left, right).ok) return []
  const disrupted = left.intervention.kind === 'baseline' ? right : left
  const sharedEnd = Math.min(left.events.at(-1)?.elapsed_seconds ?? 0, right.events.at(-1)?.elapsed_seconds ?? 0)
  const intervention = disrupted.intervention.road_slowdown ?? disrupted.intervention.road_hold
  const candidates = [
    { id: 'shared-origin', label: 'Shared start', elapsedSeconds: 0 },
    ...(intervention && intervention.start_seconds <= sharedEnd ? [{ id: 'intervention', label: disrupted.intervention.road_slowdown ? 'Slowdown starts' : 'Road hold starts', elapsedSeconds: intervention.start_seconds }] : []),
    ...(intervention && intervention.start_seconds + intervention.duration_seconds <= sharedEnd ? [{ id: 'release', label: 'Intervention ends', elapsedSeconds: intervention.start_seconds + intervention.duration_seconds }] : []),
    ...(sharedEnd > 0 ? [{ id: 'shared-latest', label: 'Shared latest', elapsedSeconds: sharedEnd }] : []),
  ]
  return candidates.filter((item, index) => candidates.findIndex(other => other.elapsedSeconds === item.elapsedSeconds) === index)
}

export function corridorMilestones(recording: CorridorRecording) {
  if (!recording.events.length) return []
  const first = recording.events[0]
  const firstOdometer = first.sample.odometerKm ?? 0
  const movement = recording.events.findIndex(event =>
    (event.sample.odometerKm ?? firstOdometer) > firstOdometer || (event.sample.speedKph ?? 0) > 0)
  const latest = recording.events.length - 1
  const values = [
    { id: 'origin', label: 'Origin', index: 0 },
    ...(movement > 0 ? [{ id: 'movement', label: 'Movement', index: movement }] : []),
    ...(latest > 0 ? [{ id: 'latest', label: 'Latest', index: latest }] : []),
  ]
  return values.filter((item, index) => values.findIndex(other => other.index === item.index) === index)
}

export function eventAt(recording: CorridorRecording, index: number) {
  if (!recording.events.length) return null
  return recording.events[Math.max(0, Math.min(recording.events.length - 1, Math.round(index)))]
}

export function routeAt(recording: CorridorRecording, index: number) {
  const event = eventAt(recording, index)
  return event ? recording.routes.find(route => route.key === event.route_key) ?? null : null
}
