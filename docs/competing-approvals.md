# Competing dispatcher approvals — S18

Accepted packet: PB-RS-COMPETING-APPROVALS-20260912. Two independent dispatcher browser contexts opened different eligible pending proposals before either command was issued. RS-1042 and RS-1044 overlap and both proposed truck T-101; their drivers and equipment-specific trailers differ.

The two approval buttons were activated together. One request returned 200 and created the RS-1042 driver offer. The competing RS-1044 request returned 409 `INELIGIBLE` with the visible message `Resource reserved by RS-1042.` The losing proposal remains pending with its original review evidence, so a dispatcher can revise it instead of losing the work.

PostgreSQL contains exactly one resulting assignment, one approval, one approved proposal and three active reservations for the winning driver, truck and trailer. The competing proposal is still pending. Both browser contexts completed without page errors. This closes the missing judge-visible S18 concurrency presentation while retaining the lower-level exclusion-constraint and transaction tests.

## Reproduce

Run PostgreSQL on 55432, the local API on 4010, the proposal-only optimizer on 4040 and the built web on 5185. The optimizer must be able to reach Valhalla because approval rechecks current route feasibility.

```bash
node scripts/prepare-competing-approvals.ts
node scripts/verify-competing-approvals-ui.mjs
```

The preparation command creates a fresh isolated synthetic carrier and stores its ignored pointer in `data/competing-approvals-fixture.json`. The verifier intentionally mutates that carrier once; prepare a fresh carrier before rerunning the race.

Evidence is in `docs/evidence/competing-approvals-2026-09-12/`. It includes the two ready approval dialogs, the losing conflict, the winning synchronized view and the final cardinality receipt.

## Limits

This is a controlled concurrency demonstration using two local browser contexts, the built application, local API and PostgreSQL. Both browser processes run on one machine. It is not a distributed contention benchmark or a claim about human coordination time. The resulting assignment remains an offered trip until the designated driver accepts it separately.
