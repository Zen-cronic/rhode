# Hosted dock exposure and HOS parity — September12

The existing GCP preview now serves the source-bound open-dock estimate and complete-budget HOS display from `2ae6b6d` / `9d95ff0`. Third-pass design retained. API32-kiy, web50-yuy, optimizer13-gas and documents17-tol each passed an HTTP200 check on its exact tagged revision before receiving100% traffic. Temporary rollout tags were removed. Full image digests and provider traffic records are in `evidence/cloud-dock-hos-2026-09-12/deployment.json`.

No migration or new persistent resource was needed. The existing seed job completed as `roadstar-seed-8brn9`, succeededCount1, completion18:15:49UTC. It created only `dock-hos-cloud-d6226f9f-10d1-47d2-94fd-b886b1530d4c`, with synthetic scenario inputs authored before operational commands. No new model calls. Existing preview usage continues within the previously approved estimate; marginal build/request cost was not separately measured.

## What was verified

Firebase-authenticated commands reviewed the same synthetic overnight duty CSV as the local S06 run, offered and accepted the short London trip, and ingested four retained simulator checkpoints at0,60,150 and165dock minutes. Each hosted observation retains the original source sample in the verification artifact and uses a distinct hosted event ID/assignment. The four samples reproduce on-duty headroom60→0 and provisional detention CAD0→CAD50→CAD75. They are selected observations from the local run, not a continuous hosted simulator run or a precision claim for the intervening gaps.

The latest confirmed inside sample bounds the provisional amount. No departure or invoice is created. Dispatcher/browser evidence at1440px and390px shows the assigned driver's on-duty hold, configured terms, observation time and sample IDs. Driver snapshots exclude provisional pricing. An exhausted-driver proposal is rejected409 without creating another assignment/proposal. An eligible D-02/T-102/V-102 proposal for the next previously openRS1043 receives explicit hosted dispatcher approval and acceptance in a separate390px Firebase driver session.

Advancing only scenario time to121seconds beyond the latest sample holds the estimate and removes the amount. An additional authored500m-accuracy point also holds the amount; the narrow hosted UI displays the reason with no previousCAD75 remaining on the card. Both original and next assignments stay accepted, the original visit stays open, and no invoice exists. The earlier axle-cloud workspace remains accessible with its accepted assignment intact.

All five retained screenshots were inspected directly: desktop/narrow source cards, approval, accepted manifest and uncertain hold. No horizontal overflow in checked narrow layouts. One screenshot selector initially matched both the manifest and map panels; it was scoped to the manifest heading. The already successful approval/acceptance were retained and the resumed capture did not reissue them. This packet proves responsive web behavior, not new native application parity or simulator movement interlocking.

## Reproduce and inspect

With the existing deployment authenticated:

```bash
node scripts/seed-cloud-dock-hos.mjs
node scripts/verify-cloud-dock-hos.mjs prepare
node scripts/verify-cloud-dock-hos.mjs web
node scripts/verify-cloud-dock-hos.mjs holds
```

Preparation refuses to overwrite an existing ignored `data/cloud-dock-hos-fixture.json`. Its command records retain idempotency keys and original versions for interrupted API steps. Inspect the existing seed execution before retrying; provider wait time is not evidence of failure. The `web` phase can finish capture after a successful recorded approval/acceptance, and refuses a completed phase. The final fixture deliberately remains held for uncertain GPS. Preserve all source observations and receipts when inspecting it.

Production application code is unchanged since the prior104/104backend checks, root/web TypeScript checks and compiled build. This rollout additionally passes the deployment script's TypeScript check, all four exact-revision health gates, Firebase operational checks and the actual hosted browser journey. Current local5174/API4010 remain available; Android emulator stays in the prior hosted axle workspace with tracking off. Native exposure parity, remaining correction/reconciliation work and demo/submission alignment remain next. Physical/iOS testing stays deferred.
