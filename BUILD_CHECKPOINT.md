# RoadStar build checkpoint

Updated: 2026-09-10. Status: POSTGRESQL_CORE_VERIFIED; FULL_PLATFORM_BUILD_IN_PROGRESS.
Current accepted state: Fastify/PostgreSQL 16/PostGIS backend; nine real-database integration tests and strict TypeScript pass. No web/native/cloud proof yet.
Read this first when resuming. Branch: build/roadstar-platform. No remote or deployment yet.

## Authorized objective

Build the complete all-in-one RoadStar platform end to end in this repository; then run demo-director, prepare submission-devpost against the custom RoadStar portal, and prepare the in-person finale demo. Preserve fleet/load matching/dispatch, routing/optimization, driver scheduling, driver/dispatcher apps, integrations, separated simulation, satellite mapping and auditable detention billing.

Approved stack: React dispatcher web + Expo driver/dispatcher Android/iOS, shared TypeScript domain/API, Fastify, dedicated Cloud SQL PostgreSQL/PostGIS, Python OR-Tools, Valhalla VM, Firebase, Cloud Tasks/Storage and Vertex. User implementation-plan instruction supersedes previous pause and stack question. Jammi inspected: shared KMP targets Android/iOS/desktop, no web target; recorded iOS proof remains pending in its checkpoint. No Jammi code copied.

## Task graph and required proof

1. Persistent core/API: reservations, version checks, acceptance, telemetry dedup/order, geofences/detention, HOS and capacity screening. Packet 001 in progress.
2. Workbook importer: all five sheets, string IDs, duplicated rows, null/sentinel normalization, source-row lineage, quarantine; imported historical records never relabeled live. Actual-data path must be verified locally.
3. Routing/optimization: Southern Ontario road geometry, supported truck constraints, backhauls and LTL grouping; schedule conflict propagation and feasible recovery; unknown axle/routing evidence visible.
4. Independent simulator: separate process with routes, driver duty, speeds/odometer, dock waits, deterministic pause/reset/replay and duplicate/out-of-order cases.
5. Design-direction before UI: grounded brief; dispatcher map/satellite, load/driver/schedule views, exception explanation, trace and detention evidence. Inspect built artifact in browser at desktop/mobile widths, loading/empty/error/success/recovery states.
6. Expo driver: Android/iOS native surfaces plus accessible web route, accept/reject assignment, route/stops, duty logs, offline retry with no duplicated events. Native bundle and actual runtime/device proof required; source presence does not establish iOS/Android success.
7. Integrations: import + scoped adapter endpoints for TMS/ELD/telemetry, authentication/role boundaries, observability, docs. Show fixture versus live adapter clearly.
8. Stable preview: persistent always-on backend, protected writes, shareable web and driver preview. Production release is separate from authorized preview.
9. Demo-director: verified 3–5 minute film, target 4 minutes; actual app recordings, narration, export/probe and visual/audio verification. No fabricated runtime claims.
10. In-person finale: 10–15 minute presentation, rehearsed two-screen/phone handoff, local replay, offline video/deck, setup and Q&A plan. Venue Sept 13 SPUR, Waterloo; noon setup, 2 PM presentations. Operator attendance not yet personally confirmed.
11. Submission-devpost Draft mode: all ten actual portal fields, plain text, actual URLs/evidence, counts/unknown limits; no generic Markdown Story template. Deck/video URLs and final submission remain unverified until produced. Final submit requires explicit operator action.

## Open dependencies and gates

- Official noon/2 PM deadline and missing rubric 5% remain unresolved. Build authorized by user; no claim that organizer clarified them. Prepare by noon.
- Map/satellite provider licensing and actual access need verification before adopting a service; do not substitute a schematic for requirement completion.
- Full terms/pre-existing code/data publication unknown. Write new code; keep source workbook private to local import and use labeled synthetic fixtures for public preview until publication permission is established.
- Native device/toolchain and preview host access not inspected yet. Record exact actionable fix when a concrete dependency fails.
- No paid actions or new accounts approved. No organizer messages authorized.

## Ledger

- 001: initialized repository and recorded complete task graph. Implementation/verification pending.

## September 10 accepted packet PB-RS-002

- SQLite spike preserved at c35fdef. Server now requires DATABASE_URL. Migrations use checksums and transaction/advisory locking. PostgreSQL exclusion constraints enforce driver/truck/trailer/dock reservations.
- Fastify API: carrier membership, dispatcher approvals, driver responses, command idempotency/version checks, cursor invalidations, explicit work sessions, telemetry dedup/order/accuracy handling, same-stop detention drafts against configured terms. Recovery supersedes and offers atomically; driver notifications currently queued in outbox, not delivered.
- Verification: npm run typecheck passes; TEST_DATABASE_URL=postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar NODE_ENV=test npm run test:integration passes 9/9 against postgis/postgis:16-3.5. Local database: docker compose -p roadstar -f infra/compose.yaml up -d --wait. Credentials are local fixture values only.
- Operational truth uses real server recorded_at; synthetic clock isolated in scenarios and never advanced by telemetry. Remaining limitations: straight-line screening until Valhalla; full recovery risk propagation/optimizer/simulator, import, actual document/cloud jobs, mobile offline/device proof and web all pending. Firebase code present but live token verification not tested.
- Local Docker/GCP auth verified. Cloud/model spend $0. No resources provisioned or customer data published. Need concrete cost approval plus target GCP project before provisioning. Native Android SDK is present; no physical-device or iOS proof.
- Design brief and current API contract in docs/design-direction.md and docs/api-contract.md; design execution can now proceed.
