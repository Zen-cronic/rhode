# RoadStar native application

Expo SDK 54 + React Native 0.81, Android and iOS. Driver Today / Trips / Duty / More screens and a dispatcher approval view share the operational API and domain types. The server-returned actor selects the verified role after synchronization. Firebase email/password login is configured with public app configuration; API carrier membership remains authoritative. Firebase session material and the selected workspace are encrypted with Expo SecureStore; login passwords are never written to the SQLite cache. Sessions, scoped downloads, drafts and pending commands restore after app termination, including while offline. Sign-out removes the secure session. Expired or revoked authentication still requires a fresh sign-in before server synchronization.

From the product repository root, install with `npm install`, then copy this folder's `.env.example` to `.env` and configure the API origin. Run `npm start -w @roadstar/mobile`. For an attached Android device, `adb reverse tcp:4010 tcp:4010` forwards the loopback API. Explicit `EXPO_PUBLIC_AUTH_MODE=local-demo` exposes synthetic demo identities; the API itself only allows them in local-demo mode. For physical iPhone testing, use an authenticated HTTPS API reachable by the phone. Do not expose local-demo mode as a public service.

Maps use `react-native-maps`; Android needs a package/certificate-restricted Maps SDK key and a native rebuild. iOS uses its native map provider. The map displays satellite imagery and pickup/delivery markers, with an unavailable state on Android without a key. The current source also requests authenticated `/api/route?loadId=...&truckId=...` geometry and draws a Polyline only when complete `valhalla-truck` evidence matches the assigned load/truck. Loading, route failure and manual refresh are explicit. Verified routes preserve the server fingerprint, vehicle profile, dataset, warning and download timestamp in the carrier/user-scoped SQLite cache. Changed stop coordinates or truck record version produce a new cache key; authorization/input failures clear the cached route instead of using it as a fallback. Network/server failures can show the prior downloaded route with a visible stale-data notice. Satellite base-map imagery itself is not downloaded by this cache. No straight-line route fallback exists. API-verified driver and dispatcher operations refresh using the update cursor every two seconds while foregrounded and immediately after actions.

SQLite persists snapshots, notes, exact command payloads, idempotency keys, expected versions, failures and server results, scoped by API origin + carrier + user. Network failures, 408/425/429 and server failures remain pending. Other 4xx errors become failed and require review. No code changes the version on a retry. Pending duplicate acceptance taps reuse an entry. Camera/library POD capture first copies the file into the app's persistent document directory, then stores the registration/upload intent. Reconciliation repairs interruption before registration and between registration and upload, using independently fixed command IDs. Missing source files produce a visible terminal failure.

A driver can start/end a work session. Live accepted trips may explicitly enable foreground GPS sharing. App switching stops it; returning requires another explicit sharing action. Synthetic trips never send phone GPS. Missing accuracy is withheld; unknown speed/odometer remain null. A separate explicit background-tracking control requires a native development build and background permission. It stores a revocable session grant in SQLite and a short-lived Firebase ID token in SecureStore. A global TaskManager handler verifies the current server-side driver, carrier, session and accepted live assignment before retaining/sending each batch. No GPS is retained if that check is unavailable. Session end, logout, revoked permission and token expiry revoke tracking. The app renews credentials while foregrounded; a long background period past token expiry requires reopening and explicitly enabling tracking again. Android shows an ongoing foreground-service notification; iOS shows its location indicator. OS termination may stop delivery, so continuity remains device-test dependent. Duty events are manual records, not ELD certification; stop completion does not produce a billing timestamp.

Verification commands:

```sh
npm run test -w @roadstar/mobile
npm run typecheck -w @roadstar/mobile
cd apps/mobile
EXPO_NO_TELEMETRY=1 npx expo install --check
EXPO_NO_TELEMETRY=1 npm run export
```

Six queue tests use real Node SQLite databases, including close/reopen boundaries, ambiguous server responses, stale approvals, carrier isolation, rate limits and independent document transfer phases. Three additional policy tests cover explicit consent, permission revocation, expired authentication, ended sessions, changed carrier/driver, synthetic trips and invalid sample timestamps. These tests verify queue/policy behavior, not the Expo native bridges, background OS lifecycle or camera behavior. Android/iOS Hermes export verifies both module graphs. A subsequent local Android native build also passed (details below); iOS native compilation and physical-device evidence remain unavailable. The build host now has a running Android API 35 x86_64 emulator with KVM, but no physical phone and no xcodebuild. Emulator evidence below covers native authentication, map rendering and offline termination/reconnect. Physical Android/iPhone behavior, background permissions, camera upload and native iOS compilation remain unverified. Android preview signing is verified locally; iOS signing remains unverified. No EAS/store operation has run.

Dispatch notifications are opt-in through More. Configure `EXPO_PUBLIC_EAS_PROJECT_ID` plus native APNs/FCM credentials; this implementation does not create those credentials. Explicit registration obtains an Expo push token and durably queues `/api/push-token`. Notification receipt/open refreshes the authenticated workspace. Logout queues `enabled:false`; if offline that revocation is pending until reconnection under the prior identity. Payloads must stay generic and contain no shipment/customer data. Revoked device permission queues deregistration. The backend keeps actual delivery disabled until its provider/device gates are cleared. No Expo/APNs/FCM provider calls or actual notifications were sent during implementation.

The installed SDK54 toolchain has upstream audit findings in build-time Metro/Expo dependencies (image-size/PostCSS). npm recommends an Expo major upgrade. This packet does not force that upgrade or claim the audit is clean.

API and storage patterns follow the [Expo SQLite reference](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/), [persistent File API](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/) , [TaskManager reference](https://docs.expo.dev/versions/v54.0.0/sdk/task-manager/), [Location reference](https://docs.expo.dev/versions/v54.0.0/sdk/location/), [Notifications reference](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/) and [ImagePicker reference](https://docs.expo.dev/versions/v54.0.0/sdk/imagepicker/).


## Local Android native build — September 10, 2026

`android/app/build/outputs/apk/debug/app-debug.apk` is a successfully compiled ARM64 debug APK (approximately 39 MB), not an exported JavaScript bundle. It requires Metro for JavaScript and the initial artifact has no cloud Firebase/Maps configuration. That initial debug artifact was not launched; the later standalone x86_64 build has emulator runtime evidence below.

- Actual package: `com.roadstar.carrier`; minimum Android SDK 24, target/compile SDK 36.
- Gradle 8.14.3, Java 21, NDK 27.1.12297006, build-tools 36.0.0.
- Build result: `BUILD SUCCESSFUL in 4m 17s`, 153 executed tasks.
- Logs: `/tmp/roadstar-android-prebuild.log` and `/tmp/roadstar-android-gradle.log`.
- `apksigner verify --print-certs` verifies SHA-1 `C6:12:C2:07:9F:6E:C0:5B:F0:CF:45:13:DB:44:8D:28:CB:71:D1:F8` and SHA-256 `76:A0:5E:1C:7D:4D:99:85:8F:A1:5A:44:CA:E0:85:36:33:8A:F0:E3:2A:ED:D7:59:9E:67:E3:9E:CF:80:74:28`.

The project-specific development certificate is in the gitignored `android/app/roadstar-debug.keystore`. It replaces Expo's shared template debug certificate for this generated project. Preserve this file and its `signingConfigs.debug.storeFile` reference when rebuilding; a clean prebuild can remove them and would invalidate the Maps certificate restriction. This certificate is for local preview, not a production store release.

Reproduce from `apps/mobile/android` with the existing accepted SDK licenses:

```sh
ANDROID_HOME="$HOME/Android/Sdk" EXPO_NO_TELEMETRY=1 ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
"$HOME/Android/Sdk/build-tools/36.0.0/apksigner" verify --print-certs app/build/outputs/apk/debug/app-debug.apk
```


## Cloud-configured standalone Android preview

The latest installable artifact is `dist/roadstar-preview-arm64.apk` (24,977,684 bytes), copied from `android/app/build/outputs/apk/release/app-release.apk`. This release variant is signed with the same local development certificate documented above. It includes the production Hermes JavaScript bundle and native ARM64 libraries, is non-debuggable, and disables React Native developer support; Metro is not required. No private login passwords were added to the application.

Packaged-artifact checks confirmed the API origin `https://roadstar-api-739889188415.us-central1.run.app`, the configured Firebase public project/key, and the restricted Android Maps key in the compiled manifest. The check report is `dist/android-preview-verification.json`; certificate verification output is `dist/android-preview-certificate.txt`. APK SHA-256: `e6d3bf5faee76c01c3050126d3604bfdce31f6639eb18cc16110304e771bca1d`.

Latest ARM64 and x86_64 release builds passed; the updated logs are `/tmp/roadstar-android-final-arm64-gradle.log` and `/tmp/roadstar-android-emulator-final-gradle.log`. Logs: `/tmp/roadstar-android-production-prebuild.log` and `/tmp/roadstar-android-route-preview-gradle.log`. The initial standalone build log remains `/tmp/roadstar-android-preview-gradle.log`. Reproduce with the public client configuration in `.env.production`, preserving the generated project's development keystore and signing reference:

```sh
# From apps/mobile; do not use --clean unless the development key is preserved.
NODE_ENV=production EXPO_NO_TELEMETRY=1 npx expo prebuild --platform android --no-install --skip-dependency-update react,react-native
cd android
NODE_ENV=production ANDROID_HOME="$HOME/Android/Sdk" EXPO_NO_TELEMETRY=1 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
```

The ARM64 artifact has native build and packaged-artifact checks. The x86_64 artifact additionally has Android emulator installation, launch, authentication, Maps authorization and offline workflow evidence below. No physical phone was connected, and iOS runtime remains unverified. No EAS, Apple signing, store upload or provider notification send occurred.


## Truck-route overlay source packet

Four additional tests cover route-response validation, changed vehicle/stop cache keys, authorization-aware fallback policy and SQLite restart/carrier isolation. Together with queue/tracking, facility-note scoping, secure-session persistence and stable trip-selection tests, 23 unit/persistence tests pass; TypeScript passes. These fixture tests do not prove live Ontario route availability. After the coordinator verified the live authenticated route endpoint, the standalone APK documented above was rebuilt with the route overlay. Packaged-artifact inspection confirms the route endpoint and route UI are present in its Hermes bundle. This does not establish physical map rendering or phone workflow proof.


## Reviewed stop instructions

Each pickup/delivery card displays `facilityNotes` from the synchronized snapshot only when its `load_id` and `stop_id` match and `reviewed_by` is nonempty. The instructions include the reviewer and selectable source `document_id`; a missing source is explicitly unavailable. Stops without reviewed notes show that state. Notes travel with the existing scoped snapshot, so already-downloaded instructions remain available offline. The current standalone APK includes this UI, verified through its bundled reviewed-instruction and source-label strings. The facility-note test excludes unreviewed, empty and other-load/other-stop records. End-to-end note delivery requires the backend facility-notes migration and remains separate from the native package check.

## Android emulator verification — September 10, 2026

Installed the previously missing stable Android emulator 37.1.11 and Google APIs API 35 x86_64 system image after reporting their absence and approximately 2.07 GB download. Existing SDK licenses sufficed. The `roadstar_api35` Pixel 6 AVD lives in the gitignored `.emulator/avd` directory. It uses KVM, 2 CPU cores, 2 GB RAM and software graphics. The emulator runs visibly on the host display as `emulator-5556`; no physical-device result is implied.

Actual native checks against the isolated cloud carrier `emulator-demo`:

- Standalone release APK installed and launched without Metro. Firebase driver sign-in succeeded, and foreground synchronization continued successfully.
- Certificate-restricted Google satellite imagery and the authenticated Valhalla road polyline rendered. The RS-1042 preview showed 98 minutes, vehicle dimensions and Ontario dataset provenance.
- Disabled emulator networking, accepted the offered RS-1042 trip and saved a trip-note draft. Both remained visibly pending/offline.
- Force-stopped and relaunched the app while still offline. The encrypted Firebase session restored automatically; downloaded manifest, original version-1 acceptance command and note survived.
- Re-enabled networking. The same queued acceptance changed from pending to synchronized. An independent server read confirmed exactly one RS-1042 assignment, accepted at version 2 from the original version-1 command. Screenshots preserve the before/after state.
- Signed out, authenticated the dispatcher and explicitly confirmed proposal `93e2cc6d-1543-469c-a155-7d7178df3db0`: pending revision 1 became approved revision 2, assigning RS-1043 to D-02/T-102/V-102.
- Signed out again and authenticated D-02. The revised trip appeared offered; native acceptance synchronized successfully. Its 99-minute authenticated truck route rendered. Current-trip selection remained stable after synchronization.
- Confirmed manual pickup completion, started and ended the work session, and logged on-duty status. All five D-02 commands (acceptance, completion, session start/end and duty) appeared synchronized. Synthetic provenance kept foreground/background GPS off throughout.

Emulator execution exposed and fixed repeated Expo SQLite native wrapper initialization, missing secure Firebase session persistence and literal newline/safe-area rendering issues. A further fix keeps the current active trip stable when synchronized assignment rows reorder, with a regression test. `src/storage.ts` shares one native SQLite handle; it is not closed by transient component lifecycles.

Evidence screenshots are local in `dist/emulator-evidence/`; native build logs are `/tmp/roadstar-android-emulator-fixes-gradle.log` and `/tmp/roadstar-android-emulator-final-gradle.log`. `.emulator/ui.py` is a local ignored adb harness that reads existing private preview credentials without printing them. These checks never mutate the public hero carrier. Synthetic trips deliberately withhold personal GPS, so emulator map success does not claim real tracking ingestion or physical background delivery. Push provider delivery, camera capture/upload and iOS runtime remain unverified.

The matching standalone emulator artifact is `dist/roadstar-preview-x86_64.apk` (25462738 bytes), SHA-256 `4dcc1bd79613b0691373decb64b03e59a6ea850c13bf9b3bef4f471afafbbad2`. Rebuild it with the same release Gradle command using `-PreactNativeArchitectures=x86_64`; install with `adb -s emulator-5556 install -r dist/roadstar-preview-x86_64.apk`. Both ABIs retain the same package and certificate.

To reopen the installed AVD visibly (after any existing instance is stopped):

```bash
cd apps/mobile
ANDROID_AVD_HOME="$PWD/.emulator/avd" "$HOME/Android/Sdk/emulator/emulator" -avd roadstar_api35 -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -accel on -memory 2048 -cores 2 -port 5556
# Separate terminal:
"$HOME/Android/Sdk/platform-tools/adb" -s emulator-5556 shell am start -n com.roadstar.carrier/.MainActivity
```

The visible emulator is left signed into the isolated `emulator-demo` carrier as D-02, showing the accepted RS-1043 trip. The work session has been ended and GPS is off. This native preview uses the authenticated cloud API; the separately running localhost web/API preview is maintained by the coordinator. The follow-up keyboard check enables the Android software keyboard and verifies that the login form scrolls with Sign in fully visible above the keyboard. Login uses KeyboardAvoidingView with bounded ScrollView height.

## Consolidated manifests and native planning review

Driver Today and Trips render the server's `tripGroups` with downloaded `manifests` member records. A response applies to the entire manifest. The only completion action follows the next global ordered stop and carries its assignment ID, stop ID and current assignment version. Review confirmation rechecks the captured group/assignment version and global next stop; it refuses a changed review. Same-facility stops on different loads remain distinct. Group members cannot use individual trip response/completion controls. Completed manifests remain readable in Trips. The individual load map is explicitly labeled as load context, not a combined route.

Dispatcher Planning lists downloaded planning records and opens a native review of pairings, appointments in Eastern time, unresolved inputs, routing evidence/hash and modeled assumptions. An explicit acknowledgment enables approval only for the server-verified dispatcher, an unresolved proposal with feasible Valhalla evidence and unchanged input versions. `/api/approve-plan` uses the captured planning revision in the same durable command queue. Failed approvals remain visible and are never rebased. Proposal creation remains on the web planning board.

Five additional tests cover same-facility assignment/stop identity, global order, stale review/group/assignment versions, driver ownership, dispatcher-only planning approval and input/evidence prerequisites. All 23 tests and TypeScript pass. Both Android ABIs compile; iOS JavaScript export passes, with native iOS execution still unverified. Builds: `/tmp/roadstar-mobile-groups-keyboard-gradle.log`, `/tmp/roadstar-mobile-groups-final-arm64-gradle.log`; iOS export: `/tmp/roadstar-mobile-groups-ios-export.log`.

Read-only emulator verification of `planning-demo` displayed its previously completed two-load/four-stop manifest and two member records without mutations. Software-keyboard screenshot `48-keyboard-submit-visible.png` shows empty login fields and Sign in above the open Android keyboard. The implementation follows the versioned [React Native KeyboardAvoidingView](https://reactnative.dev/docs/0.81/keyboardavoidingview) and [ScrollView](https://reactnative.dev/docs/0.81/scrollview) contracts.

The isolated `native-planning-demo` emulator test approved planning proposal `242db740-b67c-47a3-8fde-36971b0926f2`, accepted the resulting entire manifest `56326f3f-2552-4de9-b33e-fbddc2f028a2`, and completed all four stops in order: RS-1042 pickup, RS-1044 pickup, RS-1042 delivery, RS-1044 delivery. Both pickups shared one facility ID and both deliveries another; assignment IDs kept their evidence separate. Acceptance used assignment version 1, pickup commands version 2, and delivery commands version 3. The group stayed accepted after its first member completed, then became completed revision 3 after the final delivery. All five driver commands displayed synchronized. The earlier `planning-demo` carrier was inspected read-only.

Automatic action review initially classified plan approval as a real remote dispatch and rejected it. Read-only seed-script and live service checks established an isolated synthetic fixture and `PUSH_ENABLED=false`; the coordinator confirmed the user's authorized emulator verification scope. One explicitly scoped retry was allowed. The original native UI was used throughout, with no API bypass or real-driver notification.

Final native dispatcher readback confirmed approved planning revision 2 and the original version-1 approval command synchronized. The emulator was restored to D-02 in `emulator-demo` with the accepted RS-1043 route visible, software keyboard enabled, work session ended and GPS off. The earlier FTL demo recording remains valid and unchanged.
