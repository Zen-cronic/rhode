# Local dispatcher simulator controls

Accepted September 11, 2026. The Recovery screen now contains a collapsed Simulation studio using the third design pass. It lists the signed-in carrier's existing synthetic runs bound to the local operational API. It shows acknowledged scenario time, generated time, samples, speed, odometer, phase, route transitions and a conditions fingerprint.

Pause, resume, advance ten seconds, reset the same replay and adopt the latest approved/received route enter through the authenticated operational API. Resume enables manual steps; it does not start an unattended loop. Reset requires a warning dialog: original observation IDs and transition history remain, and the operational database is never rewound. A new assignment is required for an independent baseline comparison.

## Integrity

- Python persists each control intent before execution and stores the exact body fingerprint and result under its key. A retry returns the original receipt; a new stale request or changed payload conflicts. A completed advance whose control acknowledgment was lost cannot advance twice after restart.
- Interrupted telemetry retains its exact pending control. Pause/resume preserve it; another advance, reset or adoption cannot discard it. The original dispatcher can recover the same key from the server even after losing the browser queue. Activity retains uncertain requests for retry. Partial progress returns a retryable error rather than a synchronized success.
- The adapter enforces dispatcher role, carrier ownership, synthetic assignment provenance and exact operational API origin. Actor identity comes from authentication. Only loopback HTTP simulator origins are allowed. Cloud Run controls are deliberately disabled; this is a local simulator integration.
- The adapter does not hold the operational command transaction while awaiting the simulator. The simulator's telemetry/delay callbacks must acquire their own database locks.
- Local checkpoints remain single-writer files, not cloud backup. Raw Python endpoints remain an operator interface bound to 127.0.0.1. Run creation and disruption setup still use the simulator script/API; no dashboard scenario authoring is claimed. Existing route feasibility/adoption checks remain authoritative.

## Verification

`tests/simulator-controls.test.ts`: actual PostgreSQL assignment ownership, wrong role/carrier/origin/identity, live provenance and hosted controls rejected; exact retry key and authenticated actor forwarded; partial batch remains retryable.

`services/optimizer/tests/test_simulator_service.py`: exact once-only advance, stale/changed commands, pause/reset, lost acknowledgment with restart and unchanged pending retry, interrupted completed advance, carrier inventory and terminal closure failure.

Checks: 85 backend tests pass (0 skipped, 23.53 seconds), 42 Python tests pass (9.58 seconds), 14 web tests pass (two Firebase-configuration skips), root and web TypeScript and production build pass. Strict TypeScript caught test error predicates needing `DomainError` narrowing; corrected and focused test/typechecks passed. Native app was unchanged.

Actual built-browser proof at 1440px and 390px uses a fresh Ontario Valhalla route, synthetic road waypoint and dispatcher-approved route with driver receipt. The panel adopted at +40 seconds, advanced to +50, retried the same advance without movement, paused, reset and replayed five ten-second steps. All 51 events/IDs match, PostgreSQL contains 51 unique observations, and reservations are unchanged. Offline actions are disabled. Four captures were inspected: readable desktop metrics, explicit reset warning, stacked narrow controls, visible offline state; no overflow or page errors. Initial exact-label selector and asynchronous pause assertion were corrected in the verifier without weakening product checks.

Evidence: `docs/evidence/simulator-controls-2026-09-11/verification.json` and adjacent captures. Prepare a fresh fixture with `node scripts/prepare-simulator-controls.ts`; run `node scripts/verify-simulator-controls-ui.mjs` against the local-demo built preview on 5179. The preparation helper writes its synthetic fixture to `/tmp/roadstar-simulator-controls-fixture.json` and leaves the run paused before adoption.

Current local preview: http://localhost:5174. Tested carrier `sim-adoption-9d781044-464d-4d74-9dd3-fa295814e3bd`, Dispatcher identity; run `62d05ef7-7f4f-4828-9d7a-362f17bab5d6` remains paused at +50 seconds. No cloud deployment, new resources, model usage or push. The existing approved GCP preview and Android state remain unchanged.
