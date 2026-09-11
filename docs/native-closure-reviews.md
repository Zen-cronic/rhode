# Native closure review and receipt

In More, open Road closures & route reviews and choose an accepted trip. Dispatchers rehearse an already-recorded closure, inspect route geometry/timing/tolls, and explicitly approve. Drivers inspect the approved revision and confirm receipt. Source entry remains on dispatcher web. Role/carrier checks and current-evidence checks are server-enforced; the native confirmation also rechecks the current visible revision. Pending commands use the existing durable queue.

Evidence is downloaded into the API/carrier/user-scoped SQLite drafts store, with its download time. Offline or failed refreshes keep the dated cache visible and disable consequential controls.403/401/404 responses clear the saved route evidence for that trip. Retained receipts remain distinct from simulator adoption and observed execution.

## Verified on Android API35

37 native tests, native TypeScript, standalone release build and emulator installation passed. The actual native dispatcher rehearsed and approved the closure in `native-closure-cloud-20260911`; native driver1 confirmed receipt. Cloud records contain one approved route record at revision3, approved_by preview-dispatcher and one receipt acknowledged_by preview-driver-1. An independent authenticated hosted-web session observed the native receipt. Airplane mode plus Wi-Fi/data disabled, force-stop and reopen retained the dated closure, route geometry and receipt. Networking and the original native-current D02/RS1043 Accepted preview were restored. Google map tiles happened to remain cached; offline basemap availability is not guaranteed by this proof.

Inspected screenshots and exact APK hash are in `docs/evidence/native-closure-2026-09-11/`. Native Alert buttons were inspected/invoked via UIAutomator; premature screenshot frames were excluded. The initial Gradle invocation needed ANDROID_HOME set to the existing SDK. A loopback Firebase verification attempt encountered absent ADC/quota configuration and then release cleartext restrictions; those restrictions were preserved and the successful workflow used the authorized HTTPS preview. The temporary loopback API and ADB forwarding were removed.

The existing preview now serves API00019-qrw, optimizer00007-lhb, web00032-fmd and documents00009-mst at100% with immutable digests recorded in deployment.json. Existing seed execution roadstar-seed-b5vpp completed with one-run arguments for the synthetic carrier; no source workbook was published. Emulator tracking remains disabled. No new infrastructure or model usage was added.

Physical Android/iOS and background push delivery remain unverified/deferred. Native creation of closure observations and dispatcher-facing simulator controls are not claimed by this packet.
