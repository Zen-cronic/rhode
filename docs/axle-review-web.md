# Dispatcher axle review — S15 web evidence

Fleet now provides **Axle loading review** for dispatchers. Select a load, truck and trailer, download the stored shipment source, enter reviewed geometry and configured limits, inspect the static result, then confirm a new immutable assessment. Failed results retain their blocking evidence. No assessment independently assigns a load.

The form starts blank. Copying earlier inputs is explicit and still requires the current document, evidence note, reason and acknowledgment. Stored load weight supplies the payload. Gross weight and each axle group display separately; configured limits are never labeled legal clearance. Confirmation explains that enabling assessments for a truck requires reviews for its subsequent loads and that a configuration change invalidates earlier assessments.

The editor captures load, truck, trailer, source and latest assessment versions. Changed evidence, failed refresh or known offline state prevents recording. A network failure during submission stays visible in Activity with the original command identity; the server still rechecks its original versions. History retains calculations, geometry, actor, timestamp and source version/hash. A historical revision cannot download a different current source as though it were the reviewed one. Driver accounts do not see this dispatcher editor; native axle review remains pending.

## Verified journey

`docs/evidence/axle-review-web-2026-09-11/verification.json` records actual browser actions against the compiled web application and real local API/PostgreSQL:

1. Upload the readable one-page `synthetic-loading-sheet.pdf` through Evidence & billing. Download it from the axle editor and compare exact bytes and SHA-256.
2. Review 32,000lb cargo at8m from the kingpin. Gross is approximately28,515kg, below the configured40,000kg maximum; the trailer group is approximately15,612kg, above14,000kg. Record failed revision1.
3. In an independent390px browser, copy the inputs and model the same cargo at5m. The same gross now yields approximately11,257.5kg on the trailer group. Offline confirmation is disabled. A document-field review through the API advances the source version while confirmation is open; the open assessment cannot record a new revision.
4. Start a fresh source review and record passing revision2. Exact HTTP retry returns the same result. The first browser synchronizes screening and both revisions. Loads/assignments remain unchanged; the target truck advances two resource versions.
5. A separate driver session cannot see the dispatcher editor.

`final-states.json` verifies the final build after copy/error-message polish: blank/missing-source states, unsupported cargo position, desktop/narrow confirmation, simulated503 refresh failure with explanation inside the dialog, retry recovery and explicitly cached offline screening. Both retained assessments remain unchanged. Both runs report zero page errors and no horizontal overflow at390px.

The PDF was generated with the installed Chromium renderer because the RoadStar Python environment lacks ReportLab. Poppler confirms one page; its rendered page was inspected and is legible, with explicit synthetic/non-scale/non-legal labels. It supplies tare masses, geometry, group/gross limits, axle counts and both placements. It does not prove physical repositioning or real vehicle ratings.

Representative screenshots inspected directly: held desktop screening, failed-group results, desktop/narrow editor tops, narrow form fields, passing narrow screening, retained desktop history, stale/offline confirmation, final in-dialog refresh error and cached narrow screening. Long forms scroll inside the existing modal; captures show their visible scroll positions. Additional automated captures cover missing-source/error/confirmation states. The accepted third design pass is retained.

## Reproduce locally

Existing services: PostgreSQL55432, API4010, regular preview5174. The compiled verification server uses5181 and Vite's same-origin API proxy; keep5174 running.

```bash
VITE_AUTH_MODE=local-demo VITE_API_URL='' npm run build --workspace apps/web -- --outDir /tmp/roadstar-axle-built
# From apps/web:
../../node_modules/.bin/vite preview --host 127.0.0.1 --port 5181 --strictPort --outDir /tmp/roadstar-axle-built
# From repository root, after setting TEST_DATABASE_URL to local PostgreSQL:
node scripts/prepare-axle-review.ts
node scripts/verify-axle-review-ui.mjs
node scripts/verify-axle-review-states.mjs
```

Preparation creates a new synthetic carrier and records its ID in `/tmp/roadstar-axle-ui-fixture.json`. The main journey refuses a carrier that already contains documents; it never resets an existing operational workspace. The final-state verifier is read-only and runs after the two-revision journey.

Retained fixture: `axle-ui-daffab47-26ee-42c5-8750-659f67242f5c`, identity `demo-dispatcher`. At http://localhost:5174, use that Carrier ID, open Fleet, expand Axle loading review and select RS-1042 / T-101 / V-101. No customer workbook data was used.

## Packet receipt

PB-RS-S15-WEB-20260911; approved main; product-build/commit-split; INLINE_DEGRADED single-agent implementation and verification.30-minute ceiling, two repairs per blocker, no new resources/model calls. Keep criterion: source-backed browser recording, version/offline safeguards, readable source and inspected built desktop/narrow states.

- Interface81d8dce is pushed to main. Prior backend/evidence4636231/a2002c9 also pushed.
- Web TypeScript/production build and root TypeScript pass; existing web suite14passed/twoFirebaseconfiguration skips343ms. Final built-state verifier passes after the last UI edit.
- Backend/optimizer unchanged in this packet; prior102backend/46Python acceptance is referenced rather than claimed as a fresh rerun.
- Setup corrections: wrong local-auth environment variable corrected to VITE_AUTH_MODE; direct API origin corrected to the existing proxy; an overly exact label selector replaced using the observed document selector. These runs stopped before upload; no fixture reset.
- Disk exhaustion interrupted documentation writes after the accepted application commit. Restored BUILD_CHECKPOINT.md from committed HEAD, removed only this packet's regenerable temporary source maps, then wrote the notes/checkpoint again. No application or evidence files were lost. Available disk subsequently measured2.7GB; the larger external space change is unattributed.
- Local5174HTTP200 verified. Migration020/current API/optimizer/interface remain local; cloud API00021-qwk/web00034-nv7/documents00011-rhf/optimizer00007-lhb unchanged. Native APK and third-pass media unchanged; no new resources/model calls/publication/final submission.
- Next: native axle review/source parity, approved-preview rollout, combined simulator/recovery/billing/financial/demo/submission proof. Native correction/reconciliation controls remain outstanding; physical/iOS testing is deferred. Full goal active.

Hosted follow-up, September12: migration020, actual cloud source review, assigned-driver native PDF/history and fresh-manifest acceptance now pass. See [cloud-axle-review.md](cloud-axle-review.md); earlier local-only boundaries describe the original packet.
