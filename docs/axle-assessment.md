# Source-bound axle loading — S15 foundation

RoadStar now calculates a supported static tractor/one-semitrailer loading model and enforces its configured group limits in direct dispatch, recovery approval, route revision, LTL planning, plan approval and driver acceptance. This is a backend/optimizer packet; the dispatcher assessment editor, readable source demonstration and native review are next. No new interface or screenshot proof is claimed.

## Supported calculation

Inputs are the empty **coupled combination's** steer/drive/trailer group masses; tractor steer-to-drive-group wheelbase; fifth-wheel position; kingpin-to-trailer-group span; cargo centre; equalized drive/trailer group axle counts; and reviewed gross/group limits. The server uses the load's actual stored pounds, converted with 0.45359237 kg/lb. Two successive moment balances distribute cargo first between kingpin and trailer group, then between steer and drive groups. Empty masses are added once. The reaction calculation follows the balance method described in [Volvo's body-builder instructions, pages 19–22](https://www.volvotrucks.us/media/vtna/files/shared/body-builder/manuals/2026/volvo-section-0-general-information-approved.pdf#page=19); the supported three-group application and restrictions are RoadStar's model, not manufacturer certification.

The model rejects a fifth wheel behind the drive-group centre, cargo outside the kingpin-to-trailer-group span, missing masses, invalid dimensions and unequalized groups. Lift/steerable auxiliary axles, multiple trailers, cargo movement, dynamic braking/cornering, side-to-side distribution and independent tire/axle measurements are not modeled. Equalized group averages cannot establish actual individual-axle loading.

Limits are supplied source-reviewed inputs. RoadStar does **not** select the correct legal limit from Ontario vehicle classifications, tire ratings, axle spacing, permits or seasonal/route rules. [Ontario Regulation 413/05](https://www.ontario.ca/laws/regulation/050413) makes those configuration-dependent limits material; no single default gross/group number is presented as legal clearance. Both primary sources were checked September11 local time.

## Operational boundary

`POST /api/review-axles` uses the exported `@roadstar/domain/axle` schema. `If-Match` is the current truck version; the body also carries expected load, trailer and document versions, same-load source document ID, model inputs, source note, reason and explicit modeled-load acknowledgment. Only dispatchers can record reviews. The result retains the source ID/version/SHA, physical-input fingerprints, configuration fingerprint, immutable revision, actor and recorded time in migration020.

Recording any assessment activates required assessments for **every future load on that truck** and advances its resource version, invalidating prior proposals. A different configuration invalidates earlier assessments against the old configuration. Reviewing another load against the same configuration keeps its other current assessments usable. The existing declared axle-clearance flag remains a separate gate; this command does not silently set it to verified.

Failed assessments are retained and block dispatch. Correcting cargo position requires another reviewed revision; it does not overwrite prior evidence or assign a load. Current non-synthetic dispatch requires an assessment. Unassessed synthetic fixtures retain their explicitly declared-only screening mode, with an assumption identifying physical loading as unverified. An axle model never independently grants legal or dispatch approval.

`GET /api/axle-review?loadId=…&truckId=…&trailerId=…` returns up to100 descending revisions and the current proof in a repeatable-read view. Drivers require that exact assigned load/truck/trailer; other drivers and carriers cannot read it. Source, payload or vehicle changes invalidate current proof. Routine offered/accepted load-version changes do not invalidate unchanged physical inputs.

## LTL and approval

OR-Tools receives per-vehicle allowed loads and three gram-valued cargo reactions. Capacity dimensions check every onboard state, including intermediate pickups. Payload capacity also respects configured gross and the declared routing weight; group capacities respect declared routing axle weight. Payload reactions round up and remaining capacities round down to grams, so boundary quantization is conservative.

The API separately rechecks each original source and every onboard state when approving a stored plan and when a driver accepts it. Rejected vehicle candidates are retained separately from unserved loads, so a load served by another truck is not mislabeled unresolved. The solver policy hash is now `axle-groups-on-duty-wait-v3`; older pending proposals require recomputation. Original accepted manifests are retained.

## Evidence

`docs/evidence/axle-assessment-2026-09-11/` contains:

- `ftl.json`: 32,000lb cargo, 14,000kg empty combination, 40,000kg configured gross maximum. At cargo centre8m on a10m trailer span, gross remains below40t while the trailer group exceeds14t. Moving the same modeled cargo centre to5m passes with the same gross and limits. Immutable bad/good revisions, exact retry, stale source, approval and blocked stale-source driver response are retained.
- `ltl.json`: 10,000lb and9,000lb loads each fit individually. Their overlapping pickups exceed a10.5t configured trailer-group limit; the real Ontario Valhalla/OR-Tools run leaves one unserved, and the API independently refuses the combined sequence. A separately reviewed **synthetic alternative configuration** with12t limit allows both, followed by plan approval and driver acceptance. Editing a limit does not physically increase a trailer's rating; this is a declared configuration comparison, not an instruction to raise a limit.
- `runtime.json`: actual restarted local API returns retained history/stale-source rejection, permits the assigned driver's current LTL assessment, rejects another driver403 and confirms regular preview5174HTTP200.

The integration source files are minimal synthetic PDF-signature bytes used to test document storage identity, hashes and version binding. They are not rendered or interpreted source-document proof. The readable source and human review interface must be demonstrated in the next packet.

Tests: **102 backend passed**, zero skipped,38.54s; **46 Python passed**,15.89s; final mass-bound validation follow-up **9 focused passed**,12.22s; **14 web passed**, two Firebase-configuration skips. Root/web/mobile TypeScript passed. Static tests verify moment/mass balance, overload despite passing gross, exact thresholds, unsupported geometry and invalid inputs. PostgreSQL/real-worker tests verify roles, changed payload/source, competing reviews, idempotency, direct/batch bypass protection, LTL cumulative constraints and separate approval/acceptance.

Reproduce the six backend integration cases with the existing local PostgreSQL, optimizer4040 and Valhalla tunnel48002:

```bash
TEST_DATABASE_URL=postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar \
OPTIMIZER_URL=http://127.0.0.1:4040 ROAD_ROUTING_TEST_URL=http://127.0.0.1:4040 \
AXLE_EVIDENCE_FILE=/tmp/roadstar-axle-integration.json NODE_ENV=test \
node --test tests/axle-review.test.ts
```

## Packet and remaining work

PB-RS-S15-20260911; product-build/commit-split; INLINE_DEGRADED single-agent implementation and verification. Approved main,30-minute cap, two repairs per blocker, no new resources/model calls. Hypothesis: gross compliance cannot mask a supported axle-group overload; approval must recheck physical/source identity and cumulative LTL loading. Scope: shared model, migration, API/source reviews, optimizer dimensions, deterministic tests, evidence and checkpoints. Keep only with passing model, PostgreSQL, real routing and role/version checks. No presentation changes requiring screenshots in this packet.

Product4636231 is pushed to private main. Migration020 and current API/worker are local only; approved cloud API/optimizer/web revisions remain unchanged. Third design/media and installed Android preview remain unchanged. Incremental use of the existing routing VM was not measured; no new persistent resources or model calls. Physical Android/iOS remain deferred. Full goal remains active: next dispatcher/native review and actual source proof, then approved preview rollout and combined simulator/recovery/billing demo/submission work. Conservative readiness target September13noonEDT; official deadline/rubric conflicts remain unresolved.
