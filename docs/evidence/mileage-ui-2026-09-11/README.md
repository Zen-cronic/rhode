# Mileage interface verification — September 11, 2026

Accepted third design retained. Web reports live under Tracking; Android driver and dispatcher reports live under More. Choices come from the identity's authorized assignments/work sessions. Report figures are dated, scoped to all retained observations, and separate odometer increments from GPS estimates. Gaps/unknown odometers remain explicit. A work session is not a certified HOS shift.

## Verified artifacts

- Production-built web, desktop 1440px and narrow 390px: trip and session selection, retained sample count, 0.32 km odometer / 0.23 km GPS estimate and one excluded interval. Offline state keeps the downloaded dated result and disables refresh. No horizontal overflow or browser errors. Screenshots directly inspected.
- Initial browser assertion expected the older fixture's 0.24 km total. Read-only inspection found five current observations totaling 0.32 km. Updated the assertion to current database evidence; no distance code changed to satisfy it.
- Hosted Firebase dispatcher, same synthetic sensor carrier as Android: four retained observations, no odometer, 0.27 km GPS chord estimate, closed work-session interval. See `cloud-verification.json` and `cloud-session.png`.
- Android API35 standalone release: original driver's single observation correctly yields unknown odometer and GPS distance. Existing synthetic sensor carrier's closed session displays four observations and the same 0.27 km estimate as web.
- Android airplane mode plus Wi-Fi/data disabled; force-stop/reopen; select the same work-session report. Identity-scoped SQLite retains the report with its original as-of timestamp. Unavailable/stale message visible; pending observations excluded. Screenshots and UI assertion receipt directly inspected. Network restored afterward; original native-current-20260911 driver D02 preview restored.
- The synthetic sensor carrier's existing `1 failed` queue indicator is the earlier retained 200.5 km/h GPS outlier. It is not a new mileage-report error. No new telemetry or work session was created in cloud by this packet.

## Checks and deployment

Root and native TypeScript pass. Production web build passes. Existing web suite: 14 passed / 2 Firebase configuration skips; native suite: 29 passed / 0 skipped. Backend report's 47-test proof is in `../mileage-api-2026-09-11.md`; this packet adds presentation/shared types, not new mileage calculations.

Android `assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --max-workers=2` succeeded in 38 seconds, installed with upgrade preservation. APK SHA256: `bbe13a75c6c3cb596c52b600cc14ecc0f34bcceb22798ff7ad15caa3fb4dfda8`.

Existing approved preview: API `roadstar-api-00017-z46`, web `roadstar-web-00029-59z`, documents `roadstar-documents-00007-gl4`; optimizer unchanged `roadstar-optimizer-00006-2rw`. Immutable images, exact created-revision traffic routing. Emulator tracking allowlist remains disabled. No new resources or push.

Remaining: physical Android/iOS explicitly deferred; full regulatory HOS profile support, remaining scenario matrix, measured operational value and current demo/submission alignment remain open. Web report cache was verified during the current browser session, not across browser termination. Android report storage was verified across process termination. No full-shift coverage or actual vehicle mileage claim is made from incomplete GPS data.
