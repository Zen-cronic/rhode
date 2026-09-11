# Dispatcher-reviewed HOS history — September 11, 2026

Web Fleet now shows dated HOS evidence and a dispatcher CSV review flow. Third design remains accepted. Ordinary federal solo south-of-60 constraints and limitations are documented in `../hos-profile-2026-09-11.md`; this is a planning aid, not certified ELD evidence.

## Authorized review and lineage

`POST /api/hos-preview` performs a read-only, repeatable-read preview. `POST /api/review-hos` rechecks the driver version, current clock and operational duty evidence, appends a profile revision, preserves the submitted CSV text/hash/reason/reviewer, and increments the driver version in the same idempotent transaction. Existing proposals consequently become stale. The review path never changes carrier provenance. Incomplete history requires an explicit acknowledgment before replacing usable budgets with unavailable ones.

CSV format is exactly `start,end,duty`; each interval requires ISO timestamps with a timezone and an explicit duty state. Up to 5,000 intervals / 700 KB text. Quoted fields and CRLF are supported; malformed quoting, ambiguous dates, extra columns and invalid duty states are rejected. The last declared duty continues until a subsequent recorded change, disclosed in the form. SHA-256 identifies the submitted UTF-8 source text, not a claim about the original file's encoding or authenticity.

`GET /api/hos-history?driverId=...` permits the dispatcher or the same driver to retrieve the latest reviewed source and provenance. Prior revisions remain retained in PostgreSQL. Review commands require dispatcher membership; driver and simulator roles cannot preview or approve a replacement profile.

## Verification

- Backend/PostgreSQL/real-Valhalla suite: **63 passed, 0 skipped**, 20.579 seconds. Root and native TypeScript pass; production web build passes. Web tests: **14 passed, 2 Firebase-configuration skips**. Native regression suite: **29 passed, 0 skipped**; no native UI change is claimed by this packet.
- Preview leaves event cursor/profile count unchanged. Review increments the driver once; same command retry creates no extra revision. Changed body with the same key, stale driver versions and old proposal approval are rejected. Incomplete history cannot be saved without its acknowledgment. Authorized source download returns the exact submitted text; another driver's read is denied and another carrier receives no source.
- Built web, fresh synthetic fixture: upload → preview → confirm → synchronized profile → exact CSV download. A 390px incomplete-history dialog disables confirmation until acknowledged. Driver switching clears the selected file and disables preview. No page overflow or browser errors. Screenshots directly inspected; oversized default checkboxes were corrected before final deployment.
- Cloud carrier `hos-review-cloud-20260911`, existing seed execution `roadstar-film-seed-7bxsm`: 13 sourced intervals model six 12-hour workdays. Dispatcher review yields fresh driving allowance **780 min**, but **0 cycle minutes**. The real cloud proposal command rejects with `INELIGIBLE: Insufficient cycle budget.` Firebase driver snapshot synchronizes the same profile; driver preview attempt is denied. Source text is retained exactly and review retry is structurally identical.
- Initial cloud verifier compared JSON serialization order and falsely flagged the PostgreSQL JSONB retry response. Structural equality passes. A second deliberate UI review is revision 2; retrying that command does not create revision 3. No application idempotency behavior was changed to satisfy the verifier.
- Final deployed web verifies driver-file reset and renders existing revision 2 without another review command. Native physical/iOS testing remains deferred; native HOS evidence display is a next packet.

## Deployment and remaining work

Existing approved preview: API `roadstar-api-00018-bl9`, final web `roadstar-web-00031-w6x`, documents `roadstar-documents-00008-tpz`, optimizer unchanged `roadstar-optimizer-00006-2rw`. Additive migrations 012/013 applied through API startup. Immutable images and exact created-revision traffic routing. The seed execution's informational `WaitingForOperation` retry was observed to completion; it was not restarted. No new infrastructure, model usage or Git push.

Next: native HOS evidence and dispatcher approval parity, remaining simulator acceptance matrix, measured operational comparisons, and current demo/submission alignment. Unsupported regulatory exceptions, conservative rest allocation and future-day planning limits remain explicit.
