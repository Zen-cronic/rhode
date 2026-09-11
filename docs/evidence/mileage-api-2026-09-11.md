# Retained mileage API — September 11, 2026

Local implementation proof; not deployed and no new report UI yet. Third design pass retained.

`GET /api/mileage?assignmentId=<uuid>` or `?sessionId=<uuid>` reads all retained in-scope telemetry within one repeatable-read snapshot, fetching 1,000 rows at a time. Explicit work sessions are tracking boundaries, not certified regulatory shifts. Memory scales with trip count plus one batch, rather than all samples.

The same domain continuity calculations serve web breadcrumbs and the API. Reports separate recorded odometer increments from GPS chords, preserve unknowns, exclude uncertain/out-of-order/implausible observations and gaps over 120 seconds, and never connect different assignments, work sessions or provenance. They disclose sample counts, observed interval seconds, excluded intervals, missing odometer intervals and provenance per assignment/truck. Unrecorded travel remains unknown; this is not proof of complete shift coverage or exact traveled road mileage.

Verification:
- PostgreSQL/backend/real Valhalla regression suite: **47 passed, 0 skipped**, 21.303 seconds. `TEST_DATABASE_URL=... NODE_ENV=test OPTIMIZER_URL=http://127.0.0.1:4040 ROAD_ROUTING_TEST_URL=http://127.0.0.1:4040 node --test tests/*.test.ts`.
- Fixture: 1,005 observations / 1,004 one-second intervals produce 10.04 km of reported odometer increments across the 1,000-row fetch boundary. Marking one observation uncertain removes both neighboring intervals (10.02 km). Coordinates are stationary synthetic test values; GPS estimate is independently zero.
- Samples outside the explicit session excluded; trip history retains them. Truck/assignment switch cannot bridge a 90,000 km odometer value. Missing odometers and an empty session return null, not invented zero mileage.
- Driver ownership, another carrier, simulator role and ambiguous scope rejected. Authorized HTTP endpoint returns private/no-store.
- Root TypeScript and production web build pass. Existing web suite: **14 passed, 2 Firebase-configuration skips**, no failures.
- Local preview service restarted. No visual surface changed; screenshots not applicable to this API packet.

Remaining: expose report selection/coverage in dispatcher web and native driver UI, verify the built interfaces, then deploy within the already approved preview. Regulatory HOS profile work, broader scenario matrix and demo alignment remain separate tasks.
