# Driver route receipts

An assigned driver explicitly confirms receipt of the latest approved closure route. The API records the driver, actor, real server timestamp, exact approved revision and route fingerprint. It increments the route record revision while preserving approval evidence. Same-key retries return the original receipt; stale revisions, inactive trips, different drivers/carriers and changed closure sets cannot create a receipt. Receipt and actual route adoption/execution are separate facts.

`POST /api/acknowledge-route` takes `{routeRevisionId, acknowledgeReceipt:true}` with an idempotency key and If-Match of the approved record revision. `GET /api/route-reviews?assignmentId=…` includes authorized trip receipts. Migration015 is local only in this packet.

## Verification

71 PostgreSQL/API tests passed with no skips, including exact HTTP retry, one persisted receipt/event, role and carrier denial, missing confirmation, newer approval and new-closure rejection. Telemetry and reservations remain unchanged. Web build and TypeScript passed;14 web regression tests passed with two Firebase configuration skips.

For the two-browser verification, prepare a fresh carrier with `node scripts/prepare-closure-ui.ts`, serve the built local-demo app at5178 as described in closure-review-ui.md, then run `node scripts/verify-route-receipt-ui.mjs`. This script uses real UI actions for dispatcher report/rehearse/approve and driver confirmation. The already-open dispatcher receives the receipt by polling; the verifier reads the actual API receipt. Output and inspected screenshots are in `docs/evidence/route-receipt-ui-2026-09-11/`. Initial exact accessible-label lookup was corrected before operational mutations.

The native app and independent simulator do not yet consume these receipts. No background push delivery, route adoption or cloud deployment is claimed by this packet.
