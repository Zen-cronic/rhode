# Dated HOS profile foundation — September 11, 2026

Local implementation proof; not deployed. No profile-entry interface yet. Existing scenarios retain their declared-budget model unless an explicit reviewed profile revision exists.

## Rule basis and supported model

Primary source accessed September 11: [Commercial Vehicle Drivers Hours of Service Regulations, SOR/2005-313](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2005-313/FullText.html), definition of day and sections 12–29. Published consolidation says current to June 21, 2026. The ordinary federal south-of-60 model separates daily driving/on-duty, rest-based shift limits and cycle limits. It accounts for daily rest, qualifying consecutive rest, the additional off-duty block minimum, Cycle1 70h/7days, Cycle2 120h/14days and its 70h-since-24h-rest condition, preceding-14-day rest and declared cycle resets.

Implementation supports the explicitly selected `federal-south-60-solo-ordinary-v1` profile, Cycle1/2, an operator-designated 24-hour day anchor, contiguous sourced duty history, and explicit cycle-reset declarations with evidenced qualifying rest. It never selects jurisdiction from coordinates or silently selects a reset after a long rest. Sleeper time can count as consecutive ordinary rest; split-rest exceptions are unsupported.

Conservative boundaries: tail eight hours of each qualifying rest are allocated to mandatory rest. Additional fragments below 30 minutes do not qualify. Ambiguous historical daily-rest allocation may require review even where another allocation could be valid. Fixed 24-hour operator days spanning a detected daylight-saving change require review. Future continuous plans stop at the current day/rest horizon; future rest/day rollover is not optimized by this packet. Missing/overlapping/contradictory history, unsupported profiles and exceptions return incomplete evidence. Results are a planning aid, not a certified ELD or retrospective compliance certificate.

## Changes and verification

- `packages/domain/src/hos-profile.ts`: separate day/shift/cycle evidence, remaining rest, binding continuous-work horizon, sourced history and incomplete state.
- `012_hos_profiles.sql`: opt-in reviewed revision records with carrier/driver relationship, source, reviewer and provenance. No production profile is inserted by migration.
- `services/api/src/hos.ts`: latest explicit profile drives the same resource/snapshot/planning path as existing budgets. Original declared-budget fallback remains for drivers without a profile. Operational evidence contradicting reviewed history cannot be silently ignored; cached GPS duty remains excluded.
- PostgreSQL integration inserts two synthetic profile revisions. A rested driver can propose a load. Six 12-hour work days then leave fresh driving headroom but no cycle allowance: the actual proposal command rejects with `INELIGIBLE: Insufficient cycle budget.` Both revisions remain; snapshot includes source/reviewer/revision.
- 12 focused tests cover day/shift separation, same-day eight-hour rest, non-midnight operator days, Cycle1 exhaustion, both Cycle2 conditions, 24h/14day rest, explicit versus automatic cycle reset, short breaks/dock work, gaps/conflicts/exceptions and 20-versus-30-minute additional-rest blocks.
- Final backend/PostgreSQL/real-Valhalla suite: **60 passed, 0 skipped**, 19.563 seconds. Root TypeScript passes. Command: `TEST_DATABASE_URL=... NODE_ENV=test OPTIMIZER_URL=http://127.0.0.1:4040 ROAD_ROUTING_TEST_URL=http://127.0.0.1:4040 node --test tests/*.test.ts`.
- During review, corrected the initial extra-rest-fragment calculation before acceptance. Initial integration assertion expected an ineligible proposal object; actual API correctly rejects the command. Test now asserts that rejection. Shared result type explicitly models optional evidence for incomplete results.

No UI change, visual artifact or cloud deployment in this packet. Third design remains accepted. Next: dispatcher-reviewed profile entry with authorization/idempotency/version checks and visible day/shift/cycle evidence; then deploy and verify a synchronized scenario. Full simulator matrix, native dispatcher approval, measured operational comparison and demo/submission alignment remain open; physical/iOS verification remains user-deferred.
