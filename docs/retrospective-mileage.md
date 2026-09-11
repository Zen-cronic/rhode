# Retrospective mileage after late GPS

The `occurrence-ordered-v2` report considers valid applied and retained-out-of-order observations in occurrence-time order. It never changes source disposition, current truck position, odometer observations or duty state. Operational breadcrumbs keep their existing applied-only behavior. The report discloses retained late-sample count and excluded equal-time samples on web and Android, with a dated cache offline.

All observations at a shared assignment timestamp are excluded from distance intervals, including their immediate neighbors; the database window count spans cursor fetch boundaries. Uncertain GPS, source/session/trip changes, gaps over120seconds and implausible motion remain excluded. Unusable odometer increments remain unknown even when a separate GPS chord estimate is possible. GPS chords are not road mileage or certified shift distance.

Verification September11:

- 84 backend tests pass, zero skips,23.844seconds, real PostgreSQL/PostGIS/routing. Three new tests verify ordered/delayed1.5km equivalence, source/current-position preservation, visit reconciliation compatibility, duplicates, uncertain/corrupt evidence and equal-time conflicts across a1000-row cursor boundary.
- Root/native TypeScript, production web build,37native tests and14web tests pass; two Firebase web configuration skips. Standalone Android release build37seconds and install pass.
- Actual Firebase Cloud Run web shows1.5km/two late samples. Dispatcher reconciles observed departure from3minutes to1minute while the source points/resources and mileage stay unchanged. Desktop/mobile screenshots inspected with no page errors/overflow.
- Android API35 release shows the same1.5km/two late samples. Airplane mode plus Wi-Fi/data disabled, force-stop/relaunch/reselect retains the dated report and offline warning. Both captures inspected. No device GPS session enabled. Networking restored and originalnative-currentD02RS1043Accepted visually reverified after interruption.
- Evidence `docs/evidence/retrospective-mileage-2026-09-11/` includes exact APK hash, immutable image digests, revisions and assertions. `scripts/verify-retrospective-cloud.mjs` reproduces hosted proof without recording credentials. The long native helper terminated after login; short observed-state actions completed verification. No app reset or lost-state workaround was used.

Existing approved preview: API00020-mxh, web00033-84x, documents00010-d4d at100%; optimizer00007-lhb unchanged. Migrations016/017 now deployed. Existingseed execution9b8c5completed; one-run arguments preserved default job arguments. Emulator tracking allowlist remains off. No new resources/model usage/push; third visual pass retained. Physical Android/iOS explicitly deferred.

S11 now has tested ordered-versus-late visit, mileage and billing evidence, with dispatcher review required for changed visits. This is not automatic equivalence for arbitrary ambiguous or missing inputs. Same-time contradictions remain blocked. Remaining work includes explicit jitter/short-exit session-policy proof, manual source-conflict resolution, dispatcher simulator controls and complete-run comparison/demo alignment.
