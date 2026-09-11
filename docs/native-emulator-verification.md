# Native emulator verification

The September 11 receipt is in `docs/evidence/native-sensors-2026-09-11/verification.json`. This exercises the installed Android release, Expo native callbacks, device SQLite and Firebase-authenticated Cloud Run telemetry. It does not establish physical GPS accuracy, iOS behavior or OEM background reliability.

Ordinary synthetic demonstration carriers reject device location. Verification requires all three API environment settings, and is off when any is absent/expired:

- `EMULATOR_TRACKING_CARRIER`: an isolated synthetic fixture carrier.
- `EMULATOR_TRACKING_DRIVER`: the fixture driver ID.
- `EMULATOR_TRACKING_UNTIL`: a future ISO timestamp with an explicit short test window.

The native client additionally checks the Android emulator model and displays a verification-only consent dialog. Every sample remains `provenance: synthetic`, `deviceSimulation: true`, and `dutyEvidence: cached-declaration`. The source label is a test declaration, not cryptographic attestation. No production or ordinary demo carrier should be allowlisted. Cached duty cannot change HOS history.

The verified sequence was:

1. Create a fresh synthetic carrier, rebase its scenario times to test time, dispatch and accept a test trip through normal APIs, then sign in as its driver on API35.
2. Start a work session in the app, grant location permissions, and select **Enable emulator GPS verification**. Confirm the dialog. Android registered a high-accuracy native request.
3. Inject Milton coordinates using `adb -s emulator-5556 emu geo fix -79.8774 43.5183`. One synthetic observation appeared in the cloud.
4. Press Home; disable emulator Wi-Fi/data and enable airplane mode. Inject two moved positions at least 15 seconds apart. The cloud remained at one observation; the native queue showed two pending GPS records.
5. Force-stop `com.roadstar.carrier` and reopen while still offline. The two pending records remained visible.
6. Restore networking. The pending records synchronized; native SQLite payloads exactly matched cloud records. An additional callback after reopening also synchronized.
7. Stop background sharing, inject another position, and compare stored queue rows: no change. End the work session, remove the three API environment settings and verify the capability is false. Restore the original preview workspace.

Four unique observations synchronized. A fifth sample contained an emulator-reported speed of **200.5058 km/h**, above the API's supported 160 km/h bound. It remained a visible failed command with its original payload. It was not erased, rebased or described as successfully synchronized. This negative case is retained in the receipt.

The release app's queue was inspected through the owned emulator's temporary ADB debug access, querying only RoadStar telemetry rows; ADB was restored to uid2000 afterward. No credential storage or other app data was read. Physical-device testing remains operator-deferred. Android mock-location metadata is documented in [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/); emulator hardware injection is not assumed to be physical or test-provider GPS.
