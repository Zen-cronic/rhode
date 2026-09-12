# Hosted axle review and driver acceptance

Verified September 12, 2026 on the existing approved GCP preview. Third visual pass retained. [Deployment and migration receipt](evidence/cloud-axle-2026-09-12/deployment.json) records immutable image references, exact revisions and the Cloud SQL migration020 checksum.

## Actual workflow

1. Seeded isolated synthetic carrier `axle-cloud-20260912` through the existing Cloud Run seed job and Store methods. No customer workbook, credentials or real driver locations were published.
2. Uploaded the readable loading sheet through Firebase-authenticated API → private Cloud Storage. The existing bounded Tasks/Vertex pipeline extracted the PDF with Gemini2.5Flash; extraction did not approve the assessment. Downloaded source bytes match SHA256 `4b5717c3c3625532ac198493fec2747ae84f21215389e37abd33aa9532a6d503`.
3. Recorded failed placement A: configured gross passes, trailer-group limit fails. Hosted direct dispatch returns `INELIGIBLE`; actual-road batch planning exposes the axle rejection and returns no route. No assignment was created by these failed attempts.
4. In the hosted dispatcher browser, opened the source, explicitly copied prior configuration and moved modeled cargo centre from8m to5m without changing payload/limits. A source change while confirmation was open disabled recording and retained one assessment. A fresh review recorded revision2; exact retry returned that revision. Desktop/narrow captures have no horizontal overflow or page errors.
5. Real Valhalla/OR-Tools planning returned98driving minutes and188on-duty minutes:60service plus30planned waiting minutes were included. Separate dispatcher approval issued an offered manifest. A later document review caused driver acceptance to return `AXLE_INELIGIBLE` without changing the offer.
6. A fresh assessment revision3 references sourcev5. The Android Firebase driver inspected its current values/history and opened the actual authenticated PDF. Acceptance still returned `STALE_PLAN`: recording the fresh assessment changed the truck version, invalidating the original dispatcher approval as well. That native failed command remains visible in Activity.
7. The driver explicitly rejected the stale manifest. A new computation and separate dispatcher approval issued a fresh manifest against current evidence. Native **Accept all loads** synchronized successfully. An independent foreground hosted browser, initially showing offered, changed to accepted without reload. The observation interval includes operator/tool time and is not an isolated synchronization-latency benchmark.
8. Final API checks show the new assignment accepted atversion2, the old assignment retained as rejected, three immutable axle assessments, assigned-driver source access, and403 for the unrelated driver. No stops were completed or GPS tracking enabled.

The extra stale-approval rejection is intentional protection, not bypassed to make the demonstration pass. Current UX still uses explicit driver rejection followed by dispatcher re-planning; a more direct reviewed replacement flow is a future usability improvement. The Activity header retains the historical failed command even after successful replacement.

## Deployment behavior

The script now builds all artifacts before changing traffic, stages each revision under a temporary `rollout-check` URL, probes its actual health using the operator's Google identity, then switches100% traffic and removes the temporary tag. Optimizer changes precede the API's matching constraint policy. Existing environment, service-account and network settings remain in place.

A first guard compared service-level `latestReadyRevisionName` with the new zero-traffic revision; Cloud Run kept that field on the old serving revision. It correctly stopped without switching traffic. The repaired check probes the exact tagged revision instead. All four probes returned200 and the final service reads confirm100% traffic on:

- API `roadstar-api-00030-xek`
- Optimizer `roadstar-optimizer-00011-vog`
- Web `roadstar-web-00048-fop`
- Documents `roadstar-documents-00015-kov`

The existing seed job was updated to the same API image and executed once as `roadstar-seed-q8g2c`. Its logged migration checksum exactly matches `020_axle_assessments.sql`. Existing expiry remains September17 20:00UTC. No new persistent cloud resource was provisioned. One synthetic document used the existing approved extraction allowance; this packet does not claim a separately measured billing total.

## Reproduction and remaining proof

`scripts/seed-cloud-axles.mjs` uses the existing scoped seed job, refuses an existing local fixture pointer, and refuses an existing cloud carrier. `ROADSTAR_AXLE_CARRIER` may select a new `axle-cloud-*` synthetic carrier. The ignored durable pointer is `data/cloud-axle-fixture.json`; archive the accepted pointer before preparing another workspace.

Run `node scripts/verify-cloud-axles.mjs prepare`, then `review`. After reviewing the source on native, verify the stale original offer remains blocked, explicitly reject it, then run `replan`. Start `node scripts/verify-cloud-axle-sync.mjs` and wait for its offered-state message before confirming native acceptance; run `finish` afterward. Do not run the completed acceptance sequence over the retained carrier. The verifier persists command IDs and intermediate evidence; inspect authoritative state before resuming a failed phase.

The native APK and44-test result are the accepted prior packet; no native implementation changed here. Current root TypeScript, deployment-script syntax and verification-script syntax pass. Actual cloud integration checks establish the deployed behaviors above. This does not replace the broader131-driver capacity test, prove physical/iOS behavior, certify axle legality/HOS, or complete the combined simulator→recovery→billing demonstration. [Native implementation evidence](native-axle-review.md) and the current `BUILD_CHECKPOINT.md` preserve those boundaries.
