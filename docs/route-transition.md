# Continuous remaining-route transition

`replace_remaining_route` creates a paused simulation fork. It retains the original traversed vertices through the exact current position, elapsed time, odometer, previous speed, current wait, seeded speed clock, configured road hold, completed stops and remaining stop dwell. Outstanding endpoints must retain their order and location. The original replay is unchanged.

The alternate must start within10cm of the exact current road position; smaller coordinate rounding is anchored to the prior sample. Larger gaps are rejected rather than bridged. This is stricter than the operational route preview's50m GPS snapping tolerance. A preview can therefore be feasible for dispatcher review while still requiring an unresolved simulator-access review. No rest credit or service completion is inferred.

## Verified evidence

32 Python tests passed in7.94s, including five focused transition cases: unchanged prior state and next-second continuity, current dock wait/global road hold, intermediate-stop completion and retained future dwell, unequal tick sizes, and missing/reordered stops/gaps/moving/completed state rejection.

The actual Ontario Valhalla smoke retains40seconds and0.3001423561278658km at an exact road vertex, then advances20seconds along a1016-point alternate with toll segments. Original replay state and transition sample are exactly equal. A separate interior sample has a0.797991m router start discrepancy and is explicitly rejected. Evidence: `docs/evidence/route-transition-2026-09-11.json`. Reproduce from the project root with the configured RoadStar pyenv/Poetry environment and `VALHALLA_URL=http://127.0.0.1:48002 poetry -C services/optimizer run python ../../scripts/verify-route-transition.py`.

## Service integration

The local simulator now consumes current approved/received route evidence, retains the original replay and a dated transition timeline, and restores the exact motion snapshot at each transition. Reset starts the original conditions; per-sample hashes preserve historical IDs. `docs/simulator-adoption.md` describes the accepted separate-process proof and remaining limits. The earlier motion-only receipt remains a dated prerequisite artifact.
