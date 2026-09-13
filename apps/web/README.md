# Rhode dispatcher web

React/Vite workspace implementing the approved blue/amber design, operational tables, recovery comparison and explicit dispatcher approvals. The browser reads authenticated API state; it does not seed or fabricate operational records.

## Run and configure

From the project root, start the PostgreSQL-backed API on port 4010, then:

```bash
VITE_AUTH_MODE=local-demo npm run dev --workspace @roadstar/web
npm run typecheck --workspace @roadstar/web
npm run build --workspace @roadstar/web
npm run test:routes --workspace @roadstar/web
node --test apps/web/tests/planning-model.test.mjs apps/web/tests/tracking-model.test.mjs
```

Vite prefers port 5173 and prints an alternate port if occupied. An empty `VITE_API_URL` uses its development `/api` proxy. Production needs the API origin in `VITE_API_URL`, or an equivalent same-origin reverse proxy; the API must allow the exact web origin in CORS. The current preview is at https://roadstar-web-739889188415.us-central1.run.app. Login links open the synthetic demonstration video and presentation from `/demo/`; media never autoplays.

`VITE_AUTH_MODE=local-demo` explicitly enables synthetic identity selection. Otherwise, Firebase email/password authentication uses the `VITE_FIREBASE_*` configuration in `.env.example`. API carrier membership controls the actual role. Firebase ID-token changes refresh the application session; sign-out and identity changes clear the prior actor and query cache. State and browser command history are scoped by carrier and authenticated UID. The API independently authorizes requests.

`VITE_GOOGLE_MAPS_KEY` enables Google road/satellite maps. Without a configured key, the map shows an unavailable state. The route selector requests authenticated Valhalla truck-route evidence for a load and vehicle. Only validated returned coordinates are drawn; loading, selection changes and failures clear old geometry. Dimensions, gross/axle weight, profile provenance, dataset and fingerprint remain inspectable. No straight-line route fallback is drawn.

## Implemented workflows

- Foreground cursor polling every two seconds, immediate refresh after commands, and explicit loading, empty, error and offline states.
- Role-scoped tracking history with opaque-cursor pagination, recorded speed/odometer/accuracy, sampled and received times, provenance, and distinct uncertain/out-of-order dispositions. Breadcrumbs use only recorded applied coordinates and break at excluded samples; connecting segments do not establish the traveled path between observations.
- Load planning, explained feasibility rejections, accepted-trip delay reporting, affected downstream commitments, recovery comparisons and versioned dispatcher approval.
- OR-Tools planning with up to 20 selected open synthetic loads and eight explicit, distinct driver/truck/trailer pairings. Proposals show real truck-road-matrix stop sequences, modeled driving/duty minutes, unresolved inputs, assumptions and an evidence hash. Approval rechecks current versions, commitments and route evidence before offering manifests.
- Consolidated driver manifests with one accept/reject action for the whole group, a global ordered stop list, next-stop guidance and versioned completion. Individual grouped-load acceptance controls are suppressed. Standalone trips retain their individual manifest and response actions.
- TanStack fleet table with declared budgets, provenance and versions; versioned maintenance holds/releases and retained history.
- Import sheet counts, duplicate counts and paginated original/normalized source-row inspection.
- Authenticated original document upload/download with SHA-256 and transfer states. Dispatcher field review retains the original extraction, reviewed values and reason. Facility instructions link to the reviewed source revision and appear with the driver's stop context and authenticated source download.
- Same-stop GPS evidence, synthetic-contract detention drafts and explicit invoice approval. Approval requires an observed-sample acknowledgement and evidence note, creates a new revision, retains the prior draft and does not initiate payment.
- Browser-local command history with pending/failed/synchronized states. Retries retain the original body, idempotency key and expected version; conflicts require review.

## Verified behavior

TypeScript/build checks, route-evidence validation and focused planning tests pass. Planning tests cover duplicate resource pairing, global stop order across loads, separate completion for two loads visiting the same facility, and appointment times derived from the planning run's scenario clock.

Browser checks exercised the real local PostgreSQL API and deployed Firebase/API services using synthetic carriers:

- Login, Google road/satellite maps, dock delay, recovery approval and replacement-driver acceptance. A stale approval produced a visible conflict after another browser changed the assignment.
- Authenticated document registration, byte upload, persisted hash and original download. Reviewed synthetic source fields and facility instructions propagated to the driver's manifest; the driver downloaded the source successfully.
- A 167-minute observed visit produced 47 billable minutes and a CAD78.33 draft under the configured synthetic contract. Explicit review approved revision 2 while preserving draft revision 1 and observed-sample precision. Maintenance hold/release also passed.
- The Ontario Valhalla route returned 864 coordinates and a 98-minute pickup-to-delivery estimate, drawn on road and satellite maps. Verified phone layouts had no horizontal overflow.
- In the isolated `planning-demo` carrier, selecting LTL loads RS-1042 and RS-1044 with D-01/T-101/V-101 produced one route: pickup RS-1042, pickup RS-1044, delivery RS-1042, delivery RS-1044. The real road-matrix optimizer returned 98 modeled driving minutes, 138 duty minutes and no unresolved selected loads. Dispatcher approval created one shared manifest; a single driver response accepted both assignments. All four ordered completions returned success with `billingTimestamp: false`, and the completed manifest retained its history with no further completion action. This run used actual deployed services, not mocked API responses.

Firebase cross-tab sign-out and identity-change regression checks are opt-in, read-only against operational records:

```bash
ROADSTAR_AUTH_TEST_URL=<preview-origin> \
ROADSTAR_AUTH_TEST_USERS=<private-fixture-json> \
ROADSTAR_AUTH_TEST_CARRIER=<synthetic-carrier> \
CHROME_EXECUTABLE=/usr/bin/google-chrome \
npm run test:auth --workspace @roadstar/web
```

The fixture file stays outside the repository. Tests do not print credentials. Synthetic browser screenshots and command/result evidence are retained by the project verification process outside the application source.

## Boundaries

The current optimizer supports a 24-hour synthetic horizon, fixed supplied pickup appointments, supplied service duration split between pickup and delivery, and an assumed 26-pallet trailer capacity. Declared duty budgets are not a certified ELD, break/rest scheduling is not implemented, and bounded solver results do not establish optimality. Route evidence depends on OSM restriction coverage and supplied dimensions; it is not a legal clearance certificate or measured savings.

GPS observation times retain their uncertainty through billing approval. Stop completion does not establish a billing arrival/departure time. Commercial terms and live capacity inputs are not inferred from the synthetic fixtures.

Web actions are disabled offline. Browser commands survive reload for explicit retry, but file blobs are not persisted offline and must be reselected after page termination; keep the page open during transfer. Native offline storage, background tracking, push delivery and physical Android/iPhone verification belong to the Expo workspace and are not established by these browser checks. Customer imports remain carrier-isolated from the public synthetic demonstration.
