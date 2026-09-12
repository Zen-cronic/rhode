# Native documented dock-time correction

The dispatcher can create a source-backed visit-time correction from More → Detention evidence & billing. The form retains a scoped SQLite draft, requires explicit UTC dates, and binds the selected stored document version/hash, visit fingerprint and original correction version. The source must be opened and byte-verified. Confirmation rechecks current evidence, freshness and acknowledgement; a queued command retains its original body and version. Correction creates a draft invoice. Billing approval remains a separate review.

## Verification, September12

50 mobile tests and native TypeScript pass, including strict UTC validation, changed source/stop/version rejection, real SQLite reopen, scoped draft persistence and exactly-once queue flushing. Android arm64-v8a/x86_64 release and iOS Hermes export pass. Installed Android SHA256 matches `b2574c57c06271de36d4b5006ba964753126354e7f86f6f82faa53dd61b18bb7`. iOS export is not native iOS execution; physical devices remain deferred.

A fresh synthetic carrier was seeded through existing job execution `roadstar-seed-gb4rv`. The harness dispatched/accepted RS1042, recorded confident Milton GPS arrival12:30UTC/departure15:15UTC and approved a baseline CAD75 invoice. One same-shipment synthetic PDF was uploaded through the existing Cloud Storage/Tasks/Vertex pipeline; extraction completed before source review. Those preparation actions are not native UI claims.

The actual Android app opened the PDF in the installed viewer and entered its12:40UTC/15:10UTC dock times with evidence note/reason. After airplane mode and Wi-Fi/data disable, the final APK was installed with data preserved and the app restarted, PID15301→16439. The saved source selection, times and notes remained readable offline; source opening and recording required fresh online evidence. A modal system-bar overlap discovered during inspection was repaired before this final build.

After reconnection, a harness document review changed source version3→4 while the native confirmation was open. Tapping Record correction refused stale evidence. API readback found zero time corrections and only the two original invoice revisions. The refreshed draft retained entered fields and required reopening the new source version and a new acknowledgement.

The refreshed native confirmation recorded exactly one time correction and prepared revision3 at CAD50. The original GPS and approved revision2 at CAD75 remained unchanged. The new invoice remains a draft with separate source/note/acknowledgement controls; no second billing approval was issued in this packet.

Runtime completion and exact retained revisions are recorded in `docs/evidence/native-correction-2026-09-12/verification.json`; screenshots identify native actions separately from harness setup. `checks.json` records the installed artifact and environment. No server deployment, new persistent cloud resource, payment or physical timestamp certification is part of this packet.

Reproduction uses `scripts/seed-cloud-native-correction.mjs` once for a fresh carrier, then `scripts/verify-native-correction.mjs prepare`, actual native draft/source/offline review, `change-source` with the confirmation open, `check-stale` after refusal, and `finish` after native recording. Existing fixture pointers refuse reseeding. Credentials, APKs and private configuration remain ignored.
