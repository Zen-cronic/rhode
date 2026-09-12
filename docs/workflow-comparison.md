# Ranked recovery workflow comparison

Accepted packet: PB-RS-WORKFLOW-COMPARISON-20260912. The recovery card now derives a compact decision-packet receipt from the stored recommendation candidates. It states how many resource combinations the server screened, how many passed or failed, and how many constraint reasons were retained. It does not display inferred labour savings, revenue or a generic industry baseline.

## Matched synthetic comparison

Five isolated carrier pairs began with the same seeded Southern Ontario loads, D-01/T-101/V-101 assignments and recorded dock-delay shape. Browser automation started after local-demo login and the Recovery workspace were ready.

The manual path selected RS-1043, opened the resource form, entered D-03/T-102/V-102, received the missing/stale HOS rejection, changed the driver to D-02 and submitted again. The ranked path opened the same delay and requested ranked recovery. Both paths selected D-02/T-102/V-102; only the ranked proposal retained D-03 and its HOS rejection beside the feasible choice.

| Observed measure | Manual resource assembly | Ranked recovery |
|---|---:|---:|
| Scripted dispatcher activations after workspace readiness | 8 | 2 |
| Recovery command requests | 2 | 1 |
| Median local scripted elapsed time across five isolated runs | 768 ms | 511 ms |
| Rejected HOS reason retained in the proposal | No | Yes |

The activation difference is six and the command-request difference is one for this exact scripted task. Elapsed observations were manual `[1092, 768, 820, 724, 681]` ms and ranked `[574, 528, 509, 511, 493]` ms.

## Verification

- `node --test apps/web/tests/recovery-workflow.test.ts apps/web/tests/recovery-outcome.test.ts`: five passed.
- Root TypeScript and the production Vite build pass.
- `OPTIMIZER_URL=http://127.0.0.1:4040 node scripts/prepare-workflow-comparison.ts` creates five new manual/ranked carrier pairs without modifying prior evidence fixtures.
- `node scripts/verify-workflow-comparison.mjs` performs the two real browser paths through API4010 and the local optimizer, verifies matching selected resources and HOS rejection, and records the timings and activation/request counts.
- Desktop and 390 px decision receipts were inspected directly. No page error or horizontal overflow occurred.
- The Firebase-authenticated hosted receipt on `roadstar-web-00058-juc` was rechecked at desktop and 390 px. It reports one request, two combinations, one feasible candidate, one rejected candidate and one retained constraint reason without issuing a new operational command.

Evidence is in `docs/evidence/workflow-comparison-2026-09-12/verification.json` and `hosted-verification.json`. Captures include the manual HOS failure, manual feasible proposal, and ranked decision receipt locally and on the hosted preview at desktop and narrow widths.

## Limits

This is local Playwright automation against synthetic data. Elapsed values measure browser/API execution on one development machine. They do not measure dispatcher task time, usability, training, carrier savings, an external five-tool workflow or production latency. The activation count begins only after login and state readiness. A carrier-observed matched task remains the next proof needed for a human-time or financial claim.
