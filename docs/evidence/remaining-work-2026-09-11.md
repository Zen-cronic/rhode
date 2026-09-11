# Remaining-work projection verification

Local verification on September 11, 2026; synthetic fixtures and actual Valhalla truck routing. No cloud deployment claim.

- `TEST_DATABASE_URL=<local fixture DB> NODE_ENV=test OPTIMIZER_URL=http://127.0.0.1:4040 ROAD_ROUTING_TEST_URL=http://127.0.0.1:4040 node --test tests/*.test.ts`: 44 passed, zero failures/skips, 18.549 seconds. Includes PostgreSQL reservations/approvals, real OR-Tools consolidation, simulator context and remaining-work tests.
- `npm run typecheck`: passed. After explanation-only copy refinement, the persisted in-progress dispatch regression was rerun and passed.
- Regression `in-progress dispatch projects remaining route without consuming completed driving twice`: basis275 driving minutes,150 consumed by dated history,125 left. Missing trip progress rejects follow-on assignment. Fresh near-London GPS plus completed Milton pickup permits the follow-on assignment. Historical budget remains125 after screening. A completion dated after the current scenario clock does not earn progress credit.
- Actual-route helper checks: future dock hold consumes180 on-duty minutes; stale/inaccurate/null/excluded/wrong-provenance positions retain105 driving +60 service; pending consolidated stop with the same facility ID on another assignment remains in route.

Service remains conservatively allocated in full. Missing progress retains full declared work. A120-second GPS age/100m accuracy threshold is a planning assumption, not legal or physical verification. Full daily/cycle regulatory history, automatic rest resets and measured dispatcher savings are not established by these tests.
