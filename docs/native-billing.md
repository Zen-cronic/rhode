# Native detention evidence and billing

The dispatcher’s **More → Detention evidence & billing** panel shows original observed GPS times, current reviewed document times, source provenance, configured terms and retained invoice revisions. It supports explicit approval of the latest draft. Creating or revising corrected times and reconciling late GPS remain dispatcher-web workflows; this packet does not claim those native controls.

A corrected invoice requires a substantive review note, explicit acknowledgement of GPS uncertainty and corrected document times, and opening the supporting source. The source is fetched only through the authenticated carrier API, checked against its retained SHA256, and opened locally. Android uses a read-granted content URI and the installed viewer; the emulator opened the actual synthetic PDF in its PDF viewer. The temporary copy is removed when the viewer returns. Abrupt process termination while viewing can leave the private cache copy until cache cleanup. iOS has a share/view handoff but has not been built or device-verified.

Implementation follows the installed Expo54 APIs: [IntentLauncher](https://docs.expo.dev/versions/v54.0.0/sdk/intent-launcher/), [FileSystem](https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/) and [Sharing](https://docs.expo.dev/versions/v54.0.0/sdk/sharing/). Compatible additions are expo-intent-launcher13.0.8 and expo-sharing14.0.8. No document is uploaded to an external viewer service by this code. The local viewer may offer its own explicit save/share controls.

## Integrity and persistence

- Fresh evidence is read every two seconds while active and cached in SQLite under the existing API/carrier/user scope. Denied or missing evidence invalidates the saved review. The evidence note persists separately. Cached history remains dated when offline.
- Approval is disabled for known offline/stale state, pending commands, changed source/version/hash, late GPS holds, changed visit evidence, changed contract, overlapping-visit flags or a superseded draft. The confirmation callback rechecks the evidence fingerprint, latest note/acknowledgement, foreground state and six-second freshness bound. The API still performs authoritative atomic constraint checks.
- A reviewed command is saved before transmission. If connectivity disappears after review, it remains visibly pending and resumes with its original command ID after restart/reconnect. A saved history or opened viewer does not itself approve billing. Prior approved revisions are history, not additive charges.
- Source opening is not a machine assertion that someone read the document. The user must explicitly confirm their review. Physical GPS crossing precision is not inferred from either source.

## Verification — September11 evening, Toronto

All40mobile tests pass, zero skips, including three new cases for source/acknowledgement requirements, stale source/visit/contract/correction/late evidence and newest-revision selection. Mobile TypeScript passes. Android release built in67seconds; a final resolved-offline-message polish built in37seconds and passed the same40tests again. The final build was installed with app data retained.

Actual emulator API35 → Firebase → hosted API/Cloud SQL flow:

1. The already-reviewed synthetic carrier `dock-evidence-cloud-20260911` retained the original$75approval and document-reviewed$50approval. A new draft5 was prepared from that same existing source; no document upload or model call was made.
2. Android displayed original08:30–11:15ET GPS versus08:40–11:10ET document times, actual source note/version/SHA,150reviewed minutes and30billable minutes at the configured$100/hour after120free minutes.
3. The actual authenticated PDF opened locally with the expected written times. The review note was saved and corrected-time acknowledgement selected.
4. While the revision5 confirmation stayed open, a separate API command prepared draft6. Android refused the old confirmation with “Evidence changed”; the cloud still contained six revisions with no new approval.
5. A fresh revision6 review was confirmed as emulator connectivity was removed, then the app was force-stopped and restarted offline. The saved history, review note and pending approval survived. The offline UI hierarchy retained the actual pending-command text and disabled approval switch/button. The pending line was below the screenshot viewport; `offline-control-state.json` preserves its observed UI node rather than claiming it is visible in the screenshot.
6. Reconnect produced exactly one approved revision7 for$50. One time correction and all seven invoice revisions remain. API tracking observations, original visits and resources match the pre-native fixture. Hosted web displayed the native approval with no page errors or overflow.

The functional APK hash is retained separately from the final APK hash because the final change only clears a resolved offline warning after a successful refresh. Final installed-build reconnect/history evidence is recorded in `docs/evidence/native-billing-2026-09-11/`. Original source images and the existing third design pass were retained. Physical Android reliability, native iOS, missing PDF-viewer devices, native correction creation and native late-GPS reconciliation remain unverified or unimplemented as stated above.

The first synthetic draft request omitted the required contract ID and was rejected without mutation; the corrected request used the bound contract. The long UI helper initially tapped a partially clipped accessibility node and navigated away; subsequent actions required fully visible bounds. A premature dialog frame was replaced after observing the actual native Alert. These were verification-harness repairs, not weaker product checks.

The original `native-current-20260911` driver preview was restored: D-02/T-102/RS-1043 accepted. Dispatcher billing is absent in driver mode; Wi-Fi/data are enabled and airplane mode is off. Local web5174/API4010 remain available. No new cloud resources, model calls, payment or final submission occurred.
