# Return-load feasibility — S16

A London return pickup is at 11:45 a.m. ET, but the truck remains committed to its Milton–London delivery until noon. The pickup is at the same facility (zero deadhead). RoadStar leaves it open and offers the later Kitchener–Milton return, whose 1:30 p.m. pickup is reachable after the original commitment. These are explicitly synthetic appointments; attractiveness means proximity, not verified revenue.

The separate Python worker consumes actual Ontario Valhalla truck matrices. The final route has 117 driving minutes, 30 service minutes and 14 waiting minutes: **161 on-duty minutes**. The prior assignment and its three reservations remain unchanged; approval adds three non-overlapping reservations. A separate responsive driver accepts the new manifest. The missed return remains unassigned.

## Product corrections

- Dropped loads whose pickup ends before every compatible vehicle's availability now explain that conflict. Other unresolved loads retain the bounded-search caveat; this does not claim optimality.
- Reported duty consumption now includes all modeled waiting from vehicle availability through final service. The previous total omitted waiting even though the feasibility time constraint already counted it. Subsequent planning consumes the corrected manifest total.
- The `on-duty-wait-v2` policy is part of the evidence hash. Existing pending proposals computed under the prior policy require recomputation. Historical approved manifests are retained and are **not rewritten**. Further planning derives service from the original stored plan and duty from the full manifest interval, so an old displayed total cannot silently restore consumed waiting. Progress-aware checks keep service separate from waiting instead of treating the new duty total as service.
- Planning history uses the API's `recorded_at` timestamp, fixing an observed ordering bug caused by the nonexistent `created_at` field. Computation time, vehicle availability and the rejected pickup's location/time are visible.

## Verification

`docs/evidence/return-load-2026-09-11/verification.json` retains final API identities, exact comparison inputs, result hash, approved group, actor actions and PostgreSQL reservations. All six screenshots were inspected at desktop or 390px width. The fixture checks direct-dispatch rejection, repeated optimization, stale approval without mutation, exact approval retry, offline approval blocking, dispatcher approval and separate driver acceptance. The final verifier asserts manifest duty equals its entire reserved interval and exceeds travel plus service by the planned wait.

- Backend full suite with both routing variables: **94 passed**, zero skipped, 40.81s; includes the historical-manifest compatibility fix.
- Python full suite: **44 passed**, 12.94s; final policy-hash follow-up: **7 focused passed**, 10.23s.
- Real Valhalla/OR-Tools consolidated-dispatch and subsequent-backhaul integration: **1 passed**, 15.10s, no skip; test intentionally gives an approved historical manifest its pre-fix duty total and verifies the following load still deducts the full interval.
- Web: **14 passed**, two Firebase-configuration skips; root TypeScript and built-web TypeScript/Vite pass.
- Final built artifact: `/tmp/roadstar-return-built`, served at `http://127.0.0.1:5180`; regular preview remains `http://localhost:5174`.
- Repaired verification issues: local Valhalla SSH tunnel had terminated (service status confirmed exit 255); restored existing tunnel and verified its status endpoint. Initial optimizer-health-only check did not detect the failed dependency. An initial full backend run omitted OPTIMIZER_URL (86 passed, eight failed); these failures included explicit routing-not-configured errors and were rechecked with both routing variables set. Invalid Vite mode and exact login-label selector were corrected. Browser then exposed the actual history-ordering bug; no approval bypass was used.

Reproduce with the existing local API (4010), optimizer (4040), Valhalla tunnel (48002), PostgreSQL and built web (5180) running:

```bash
export TEST_DATABASE_URL=postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar
node scripts/prepare-return-load.ts
node scripts/verify-return-load-ui.mjs
```

Each preparation creates a new synthetic carrier. The browser verifier refuses to repeat a completed approval journey. Scenario time never overwrites live operational time. No customer workbook data is used.

## Boundaries and next work

This is local API/built-web proof, not a hosted or native rollout. The cloud API, optimizer and web still use the previous revisions. Original Android preview, third design pass and film/deck remain unchanged. Existing routing VM use stays within the approved preview; no new resources or model calls were made, and incremental usage cost was not measured.

The prior delivery uses its full planned work because this fixture has no live progress observations. This is not a rate-maximization benchmark, observed savings study, certified ELD, axle-loading proof or complete 20-scenario acceptance. The batch planning API still omits the direct-dispatch `axleClearance` gate. S15 needs that bypass closed plus explicit gross/axle-group evidence and a dedicated gross-pass/axle-fail scenario. Ontario's limits depend on configuration, axle/tire ratings and geometry; a single declared flag is not a legal clearance calculation. See [Ontario Regulation 413/05](https://www.ontario.ca/laws/regulation/050413), checked September 11 local time.

## Work packet

PB-RS-S16-20260911; product-build/commit-split; INLINE_DEGRADED single-agent implementation and verification. Approved repository `/home/zin-kg/code/hackathons/roadstar-2026/placeholder-1`, branch `main`, 30-minute maximum, two repairs per blocker, no new cloud resources/model budget. Hypothesis: a nearby return cannot outrank an unreachable pickup constraint, and the reachable alternative preserves prior work and all modeled duty. Mutation scope: optimizer explanations/reporting, historical API budget projection, planning review, bounded synthetic verifier, evidence/checkpoints. Keep on deterministic and built-browser proof; otherwise revert only packet changes. Conservative readiness September 13 noon EDT; official deadline/rubric conflicts unchanged. Full product goal remains active.
