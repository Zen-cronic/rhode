# Reviewed document/GPS dock-time conflicts

Accepted locally September 11, 2026. A dispatcher can select a closed current stop visit and review a stored document from the same shipment when its dock times differ from GPS observations. The source note identifies the page, stop and written times; the reason explains the discrepancy. UTC entry fields are explicit, with Eastern-time context displayed separately.

The operation retains the original GPS body, observed visit timestamps, resource positions/duty and prior invoice revisions. Migration019 adds immutable `visit_time_revisions` linked to the visit and supporting document. Each revision retains source ID/version/SHA256, original observed values and event IDs, reviewed times, actor, timestamp, source note, reason and previous revision ID. These are reviewed document claims, not certified physical crossing times.

A correction creates a new detention draft atomically, even when the corrected amount is zero. It does not approve an invoice or initiate payment. The separate billing approval explicitly acknowledges corrected times and preserves `reviewed_document_times` precision. Prior approved amounts remain historical revisions, not additive charges.

## Integrity and recovery

- Carrier and dispatcher authorization, exact command key, correction revision and a fingerprint of visit/telemetry/document/invoice/neighbor/contract evidence protect each review. Exact retries preserve the original receipt; concurrent competing reviews commit once.
- Only stored, hashed same-shipment documents qualify. The dispatcher confirms the same stop; no model approves a correction or calculates the billing amount.
- Open or superseded visits, unresolved late-GPS holds, missing/wrong sources, nonpositive durations and overlaps with other trip visits are rejected. This is not a facility-identity, visit merge or missing-entry/exit reconstruction workflow.
- Source document changes invalidate corrected billing approval. A new review can supersede the correction. Late-GPS reconciliation can retain an unchanged visit without getting trapped by a stale document; if it replaces the visit, manual times are not copied to the replacement. Original correction and invoice history remain queryable on the prior visit.
- A later observed visit can conflict with an earlier correction. Its telemetry and draft are retained with conflict evidence; billing approval rechecks current intervals and blocks conflicting charges. Resolving the correction permits a fresh approval; the original flagged draft remains in history. Existing approvals remain dated historical decisions, not retroactively rewritten.
- A supporting-document download returns the immutable stored bytes. A changed document version requires renewed review even if its source bytes have not changed. AI extraction is not required for this manual evidence workflow.

## Verification

Five PostgreSQL cases in `tests/visit-time-review.test.ts` cover immutable approved history, exact retry, explicit corrected approval, zero-value revision, stale document and correction evidence, late reconciliation, role/carrier/document/stop denial, invalid chronology, overlap, concurrent review, replacement visit isolation, and a later visit conflicting with previously reviewed times.

Full backend suite:94pass,0skip,28.33seconds. Web:14pass,two Firebase configuration skips. Root/web/mobile TypeScript and production web build pass. Fixture UUID/text casts and JSON transport-normalized retry equality were corrected before acceptance. The browser datetime fill was normalized to minute precision without changing its meaning.

`scripts/prepare-visit-time-review.ts` creates a separate synthetic carrier, accepted trip, original165-minute GPS visit, approved$75baseline and an actual stored PDF ticket. `pdftotext` verified the ticket text. `scripts/verify-visit-time-review-ui.mjs` runs against the local-demo built artifact at5179/API4010: download bytes match exactly, a real document review invalidates an open correction, dispatcher records150reviewed minutes, exact correction retry creates no extra revision, and separate billing approval records$50with corrected precision. All four invoice revisions remain; raw telemetry, visits and resources are unchanged.

Six captures in `docs/evidence/visit-time-review-2026-09-11/` were inspected: stale review, document correction, separate invoice review, desktop/narrow history and offline history. Final history captures include approved revision4; they were refreshed after adding immediate cursor-driven history refresh. The approval dialog scrolls to its action. No horizontal overflow or page errors. Receipt includes source SHA, actors, revision IDs and amounts. Synthetic PDF is retained beside the captures; no customer data or model spend was used.

Current fixture carrier: `dock-document-c50e2b62-4ded-4a34-a2ea-34e4c5eb0a94`. Local preview http://localhost:5174 is current. Migrations018/019 remain local; hosted API00020-mxh/web00033-84x/documents00010-d4d/optimizer00007-lhb are unchanged. Native correction UI and corrected-time approval parity remain next; older clients cannot approve corrected invoices without explicit corrected-time acknowledgement. Physical Android/iOS remain deferred.

The user authorized incremental commits and pushes to product main on September11. Prior accepted history and backend/interface corrections were pushed to private `Zen-cronic/roadstar` main. No cloud rollout, new resources, payment or final submission occurred in this packet.
