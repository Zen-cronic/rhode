# Matched 3D Highway 401 slowdown comparison

Status: functionally accepted on September 12, 2026. Local synthetic evidence only.

RoadStar now pairs two independently recorded simulator runs only when the simulator derives the same comparison-basis SHA-256 from their starting conditions. The basis retains the scenario clock, seed, Valhalla route geometry and source, modeled speed, stop layout and waits. It excludes the deliberate road-hold/slowdown settings and their model-version encoding. A changed route, clock, seed, speed, wait or stop layout produces a different basis and cannot enter comparison mode.

The accepted carrier `corridor-compare-5660be04-04b8-4c5e-984c-5c41afd7746e` contains two distinct accepted assignments with separate driver, truck and trailer reservations. Both runs start from the same Milton-to-London Valhalla truck route and retain 2,401 API-acknowledged observations through scenario T+40:00. The slowdown branch applies a declared 10% speed factor from T+10:00 through T+40:00.

At the shared final cursor, the baseline has traveled 40.973 km and the slowdown branch 13.316 km. The 3D view renders the baseline vehicle in ivory, the slowdown vehicle in signal orange and a restrained connector labeled as the recorded progress gap. The displayed gap is 27.657 km. Deterministic simulator forecasts place the slowdown completion 1,606 seconds, or 26m46s, after the baseline. Speed, odometer and completion values come from the two retained recordings; the browser does not recalculate vehicle movement or interpolate positions.

Comparison playback uses the last exact acknowledged observation at or before a shared scenario second. The user can select the shared start, slowdown boundary and intervention end; play the bounded shared history; inspect exact source identifiers; or use the equivalent dual-marker diagram when WebGL is unavailable. Reduced-motion mode disables automatic playback. Loading both recordings and moving the view cursor issue GET requests only.

## Acceptance evidence

- [`verification.json`](evidence/3d-slowdown-comparison-2026-09-12/verification.json) records the shared server-derived basis, distinct conditions hashes, both 2,401-event branches, the 27.657 km progress gap, the 1,606-second finish delta, zero browser writes and zero page errors.
- [`comparison-desktop.png`](evidence/3d-slowdown-comparison-2026-09-12/comparison-desktop.png) shows the full dual-vehicle 3D instrument at T+40:00.
- [`slowdown-boundary-desktop.png`](evidence/3d-slowdown-comparison-2026-09-12/slowdown-boundary-desktop.png) shows the exact T+10:00 transition before distance divergence.
- [`comparison-3d-narrow.png`](evidence/3d-slowdown-comparison-2026-09-12/comparison-3d-narrow.png) and [`comparison-diagram-narrow.png`](evidence/3d-slowdown-comparison-2026-09-12/comparison-diagram-narrow.png) verify the 390 px 3D and fallback compositions without document overflow.
- Before/after checks retain both simulator checkpoint files, inventory and carrier assignments, visits, invoices, proposals, resources and scenario state exactly. The browser issued no operational POST.

Verification passed:

```text
poetry run pytest tests/test_simulator_service.py -q                  # 51 passed
TEST_DATABASE_URL=... node --test tests/simulator-controls.test.ts    # 2 passed
node --test apps/web/tests/corridor-replay.test.ts                     # passed
npm run typecheck
VITE_AUTH_MODE=local-demo VITE_API_URL=http://127.0.0.1:4010 npm run build --workspace @roadstar/web -- --outDir ../../data/compare-web --emptyOutDir
node scripts/verify-3d-slowdown-comparison-ui.mjs                      # 2 × 2,401 events; 0 writes; 0 errors
```

`scripts/prepare-3d-slowdown-comparison.ts` creates a fresh isolated carrier and refuses to replace its retained pointer. It does not read or change the hosted presenter workspace. Rehearsal can use this local carrier without consuming the staged hosted `recommend → approve → D-02 accept` sequence.

## Limits

The comparison is a declared synthetic Highway 401 slowdown on retained Valhalla truck geometry rendered with software WebGL. It is not live traffic, a physical-GPU benchmark, certified GPS, billing evidence, measured revenue impact, hosted simulator control or a 131-vehicle rendering test. The accepted comparison ends at 40 minutes; neither branch completes the full route inside the displayed recording.
