# Ranked recovery recommendation

RoadStar now turns a recorded disruption into a server-ranked recovery proposal with one dispatcher action. The command starts from the affected active assignment, excludes its currently committed driver, truck and trailer, and evaluates alternate combinations through the same route, HOS, capacity, reviewed axle, maintenance and reservation checks used for dispatch.

The operational API owns the ranking and stores both the selected combination and rejected alternatives. Feasible candidates sort by pickup lateness, modeled completion, deadhead distance and stable resource identifiers. A dispatcher still reviews and approves the exact proposal revision, and the replacement driver still accepts the resulting offer separately. Approval rechecks the selected resource versions and current evidence before applying the revision atomically.

## Verified workflow

The isolated synthetic carrier `ranked-recovery-999688eb-0441-45b7-baf4-7f9e1c37fad0` begins with RS-1042 accepted and RS-1043 offered to the same Alex / T-101 / V-101 set. A recorded dock delay moves the first trip's expected end to 1:00 p.m. ET and identifies RS-1043 as the next commitment at risk.

The dispatcher opens the retained delay and selects **Rank recovery options**. The API evaluates the two remaining driver combinations and selects Morgan / T-102 / V-102. Its stored comparison moves pickup lateness from 45 minutes to zero and modeled completion 45 minutes earlier while disclosing 138.9 kilometres of replacement deadhead. Taylor / T-102 / V-102 remains visible as rejected because current HOS evidence is missing or stale.

The dispatcher approves revision 1 in the compiled web application. A separate 390-pixel driver session receives and accepts the new offer. PostgreSQL then contains one recommendation, one approval, the original assignment in `superseded` state and the replacement in `accepted` state.

This is a synthetic Southern Ontario scenario using the configured Valhalla truck route and declared operational evidence. It does not claim human task time, live ETA accuracy, revenue recovery or financial savings. The existing recovery receipt keeps shipment revenue explicitly uncalculated.

## Verification

`node scripts/prepare-ranked-recovery.ts` creates the isolated pre-recovery state. `node scripts/verify-ranked-recovery-ui.mjs` drives the compiled application at desktop and narrow widths, records the three HTTP state transitions, asserts the retained candidate evidence and verifies the final PostgreSQL records.

Evidence is in `docs/evidence/ranked-recovery-2026-09-12/`. The desktop recommendation, narrow candidate disclosure, approval dialog and driver offer/accepted captures were inspected directly. The full configured root suite passes 106 tests; root and web TypeScript, the production web build and route-evidence tests pass. Two Firebase lifecycle tests remain skipped because test credentials are not configured.
