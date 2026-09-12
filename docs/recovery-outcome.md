# Modeled recovery outcome receipt

The recovery decision card now turns its retained current-versus-proposed screening timestamps into a short operational receipt. It reports pickup lateness recovered, modeled completion difference and replacement deadhead difference before showing approval state. The detailed timestamps, constraints and route evidence remain directly below it.

The calculation is a pure presentation projection over the proposal's stored comparison. It does not call a routing service, change an assignment or recalculate historical evidence in the browser. Missing or malformed current/proposed timing returns no receipt. Signed results remain visible when an alternative is later or farther.

## Verified scenario

The preserved complete-replay fixture uses the same RS-1043 appointment for both alternatives. The delayed current driver is modeled 123 minutes late to pickup and complete at 17:41:50 ET. The accepted replacement is modeled on time and complete at 15:39 ET. Both start the comparison at the London dock, so modeled replacement deadhead minus current-plan deadhead is 0.0 km.

The receipt therefore displays:

- `123 min recovered` for pickup risk;
- `123 min earlier` for rounded modeled completion;
- `0.0 km` added deadhead.

Exact timestamps remain in `docs/evidence/complete-replay-2026-09-12/verification.json`; the rounded minute values are presentation only. The card explicitly says shipment revenue is absent and financial impact is not calculated. Detention billing remains a separate evidence-reviewed workflow. This does not claim human task-time reduction, live ETA accuracy, margin, revenue protection or collected savings.

## Verification

`node scripts/verify-recovery-outcome-ui.mjs` reads the retained comparison, opens the production web build and verifies the exact displayed values at desktop and 390-pixel widths. It confirms the saved receipt remains visible offline, observes no page errors or operational HTTP writes, and compares the full carrier response before and after except for its volatile `serverTime` field.

Evidence is in `docs/evidence/recovery-outcome-2026-09-12/`. The three screenshots were inspected directly. The complete web test set passes 24 tests with two Firebase credential checks skipped by configuration; root TypeScript and the production web build pass.
