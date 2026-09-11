# Reviewed late-GPS visit reconstruction

`GET /api/visit-review?assignmentId=…` gives dispatchers a consistent before/after preview of all retained same-trip observations, current and historical visits, invoice revisions and reconciliation receipts. `POST /api/reconcile-visits` requires the preview fingerprint, expected assignment version, explicit acknowledgement, a review reason and normal command idempotency. Any changed telemetry, trip, fence, visit, invoice or shipment terms invalidates the preview.

Valid late GPS sets `visitReviewRequired`. This blocks invoice approval and manual draft regeneration until reconciliation. Forward observations and automatic draft preparation may continue, but those drafts cannot be approved while the hold is present. Late evidence from an already completed trip is accepted only at or before its latest applied observation; forward telemetry still requires an accepted trip or a pending exit. Driver work-session and provenance checks remain enforced.

The deterministic reconstruction sorts observations by occurrence time, retains the existing accuracy-disk and unique-possible-trip-stop rules, and applies them to both applied and valid out-of-order sources. Conflicting positions at the same timestamp block approval. A confidently outside sample closes an open visit; a subsequent confidently inside sample starts a separate visit. No short-exit grace-period merge is inferred. The interactive scan is bounded to 250,000 sample/stop pairs; larger inputs fail explicitly without applying a partial history.

Approval runs under the existing exclusive carrier command lock. Unchanged visits retain their identity. Changed visits are marked with the reconciliation ID and retained; replacements become current. Closed replacements receive deterministic-rule invoice drafts where configured terms warrant them. Prior invoice rows, including approved bodies and actors, are never rewritten or deleted. Current snapshots exclude superseded visits and their invoices; the dispatcher audit preserves access to them. The receipt saves actor, real recording time, reason, source fingerprint, fence geometry/radii, before/after evidence and prior review IDs. Raw telemetry, its disposition, current GPS, odometer and duty resources remain unchanged by reconciliation.

Billing approval remains separate. No invoice is sent or paid by either approval. This is a revised observed-sample assessment, not a certified physical dock timestamp or a general accounting credit-note workflow.

## Verification — September 11

- Full backend regression: 79 tests, zero skips, 22.944 seconds, PostgreSQL16/PostGIS with real routing.
- Final focused suite: six tests, zero skips, 1.732 seconds. Adds completed-trip backfill, exact replay preserving identities, a late exit splitting a continuous visit and competing-review serialization. Original ordered versus late-arrival fixture converges to 45 billable minutes / $75. An original approved $25 remains byte-for-byte intact while the revised $75 stays a draft.
- Root TypeScript and production web build pass; 14 web tests pass, two Firebase configuration skips.
- Actual built dispatcher browser: before/after review, new GPS disables an open confirmation, explicit approval, one current visit/draft, prior approved invoice unchanged, responsive390px audit and offline warning. Five screenshots inspected with no page errors or horizontal overflow. `scripts/prepare-visit-review-ui.ts` and `scripts/verify-visit-review-ui.mjs` reproduce the local synthetic proof. Evidence: `docs/evidence/visit-reconciliation-2026-09-11/`.
- Initial TypeScript candidate inference was corrected; no product checks were weakened. The final additive fence-condition receipt fields were covered by focused tests after browser capture; rendered behavior did not change.

## Remaining acceptance

S11 is still partial: reviewed visits and invoice amounts now converge for the tested orderings, but retrospective mileage still excludes late points. No general automatic out-of-order equivalence is claimed. Cross-assignment facility reconciliation, manual source-conflict resolution, native reconciliation UI and cloud rollout remain outstanding. Local migrations016/017 are applied; third visual pass retained and localhost5174 stays available. Physical Android/iOS testing remains explicitly deferred.
