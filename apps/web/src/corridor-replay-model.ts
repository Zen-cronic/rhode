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
}

export type CorridorRecording = Omit<CorridorPage, 'events' | 'offset' | 'next_offset'> & {
  events: CorridorEvent[]
  complete: boolean
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

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
    complete: page.next_offset === null,
  }
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
