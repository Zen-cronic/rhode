# Native dock exposure and HOS holds — September12

Dispatcher More now shows each open visit's server-derived provisional detention, limiting HOS budget, configured terms and exact source IDs. Synthetic scenarios are labeled. The card creates neither invoices nor departure times and is excluded from driver mode. Web and native share the open-visit type and HOS label logic.

The card uses the existing API/carrier/user-scoped SQLite snapshot. Offline amounts are explicitly saved observations, with their download and evidence times; no client timer accrues detention or restores HOS. A fresh held response removes the previous amount. Older snapshots without this field show an unavailable state.

Inspection found that the native cursor shortcut could suppress changes caused only by time, including stale GPS. Duty and More now request a full snapshot while foregrounded, at the existing two-second interval. Other tabs retain cursor-based polling. Two regression tests cover an unchanged cursor with a newly held estimate, first/forced fetches and observable network errors. This is a modest additional snapshot workload on More; a new fleet-wide capacity benchmark was not run in this packet.

## Actual emulator and hosted evidence

A new synthetic workspace, `dock-hos-native-3d9945ce-eb10-459e-8818-6b5fee3c1655`, was authored by the existing seed job, execution `roadstar-seed-ggmgb`. The prior cloud and axle fixtures were preserved. Four selected observations from the local S06 run entered the hosted API after reviewed overnight HOS history and short-trip acceptance. These fixture commands were issued by the verifier; they are not claimed as continuous native GPS or hosted simulation.

The installed Firebase Android application showed zero on-duty headroom, CAD75 provisional detention at165observed minutes, configured120free minutes and source IDs. Airplane mode was enabled and Wi-Fi/data disabled. The final APK was installed with app data retained and launched offline after terminating the prior process: PID13779→14027. The saved75 snapshot remained visible, explicitly dated and labeled non-updating. The cache originated before the final synchronization refinement; this also checks compatible snapshot restoration across that app update. After networking was restored, the final build downloaded current evidence again.

The verifier then advanced the scenario beyond121seconds of source age and appended a500m-accuracy observation. The native card changed to “Detention estimate held,” removedCAD75, retained the original arrival ID and showed the new uncertain source. No invoice or departure was created. Source IDs wrap; the complete source pair is visible in uncertain-held.png and retained UI XML. The separate source-scroll capture clipped the arrival under the fixed header and was excluded from the screenshot set.

The native dispatcher explicitly approved the proposed next openRS1043 assignment. After signing out, native D-02 separately accepted it. Independent Firebase API readback confirms an approved proposal, accepted D-02/T-102/V-102 trip and the retained open, held D-01 visit with no invoice. Native driver More excludes the pricing card and shows `Accept RS-1043` synchronized at original version1. This is a new-load assignment, not automatic roadside relief or replacement of an already committed load.

One UI automation login attempt targeted a field obscured by the keyboard. Verification was corrected to require an actual visible EditText and dismiss the keyboard between fields; credentials were not printed or committed. Application login behavior was unchanged. No new notification, location-sharing, or billing-approval action was taken.

## Build and reproduction

46mobile tests, mobile/root/web TypeScript, two PostgreSQL open-visit regressions and the compiled web build pass. The Android bundle was explicitly regenerated for Firebase before packaging both arm64-v8a and x86_64. The installed APK hash equals the built hash: `d11c8ba21fc282e554f65171e9a7964baf3b9863f35bf0e90e9adb2ef5ddc65f`. The final iOS Hermes export passes; it is not native iOS execution. APKs, configuration and credentials remain ignored.

Use `ROADSTAR_DOCK_LABEL=native` with the existing seed/verification scripts to prepare a distinct native fixture. Preparation refuses an existing pointer. After `prepare`, inspect native More, disconnect/restart/reconnect the emulator, run `native-hold`, then approve and accept through the native UI. `native-finish` performs independent readback. See `docs/evidence/native-dock-hos-2026-09-12/verification.json`, `checks.json` and captured UI records. Earlier104backend and53Python proofs remain unchanged; no repeated broad server test is claimed.

The emulator is left online in this new native fixture as D-02 with acceptedRS1043, tracking off. Earlier axle and driver workspaces remain in their separate caches. Local5174 remains available; hosted services are unchanged from the preceding rollout. Remaining native correction creation/reconciliation, combined scenarios, workflow measurements and demo/submission evidence stay in scope. Physical Android and native iOS testing remain operator-deferred.
