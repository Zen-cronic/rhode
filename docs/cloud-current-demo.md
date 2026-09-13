# Current hosted preview verification

The approved seven-day preview now serves the ranked recovery build, interactive read-only matched-Highway-401 replay and four-minute film from the existing RoadStar GCP project.

## Release

- Web: `roadstar-web-00064-vuj`
- Operational API: `roadstar-api-00036-woy`
- Optimizer: `roadstar-optimizer-00015-vuk`
- Document worker: `roadstar-documents-00021-tam`

Every revision passed a zero-traffic tagged health check before receiving 100% traffic. The interrupted first deployment left the prior optimizer at 100% and the new optimizer at zero traffic; the rollout resumed from that safe state using the already-built immutable images.

## Judge-facing checks

The public API reports PostgreSQL and Firebase authentication. The public web shell returns HTTP 200. The hosted MP4, SRT, PDF and editable PPTX are byte-identical to their tracked masters. The 240.096-second H.264/AAC film has SHA-256 `1b750bcbc18fde996648aab66a5d44357aaacd61755e259350e2784867787cb0`. The current PDF is `bdd5f50db0da136e841f486380f8f42512e39b42c591b2c7198b50f130d929e1`; the editable PPTX is `075d497670bec0439518fd0c2069ffe53b8aae4b016a7fbfb0290a938be3e4a6`.

An isolated Firebase-authenticated hosted scenario records a delayed RS-1042, identifies RS-1043 at risk, ranks Morgan with T-102/V-102 as feasible, and retains Taylor's missing/stale HOS evidence as a rejection. A dispatcher approves the pending revision; a separate driver accepts the resulting offer. A simulator-role approval returns 403 and a new approval against the applied proposal returns 409 without another mutation. The original assignment is superseded and the replacement is accepted.

The hosted recovery view also renders the stored decision-packet receipt at desktop and 390 px. It exposes the one request, two screened combinations, one feasible candidate, one rejected candidate and one retained reason. This read-only check issued no recommendation, approval or driver command.

The same view exposes a packaged 3D comparison of two complete 2,401-observation simulator recordings. Both runs share their assignment basis, seed, route, scenario clock, stops, waits and speed profile; only the declared Highway 401 slowdown differs. At `T+40:00`, it displays the verified `+27.657 km` baseline progress advantage and modeled `+00:26:46` slowdown finish delta. Browser verification loaded one static archive, made no simulator presentation request and issued no operational write. The loaded replay remained inspectable offline and fit without horizontal overflow at 390 px.

Evidence and screenshots are in [`docs/evidence/cloud-ranked-recovery-2026-09-12`](evidence/cloud-ranked-recovery-2026-09-12/) and [`docs/evidence/packaged-401-replay-2026-09-12`](evidence/packaged-401-replay-2026-09-12/). The deployment receipt is in [`docs/evidence/cloud-current-demo-2026-09-12/deployment.json`](evidence/cloud-current-demo-2026-09-12/deployment.json).

## Limits

The scenario is synthetic. Route and schedule values are modeled with the configured services. It does not establish measured human task time, live traffic, revenue, or savings. Hosted simulator mutation controls remain unavailable because a simulator Cloud Run resource was outside the approved cost estimate. The packaged replay changes only its historical cursor and does not create or alter operational data. Physical Android and native iOS verification remain deferred.

Reproduce the release checks with:

```bash
node scripts/verify-deployed-release.mjs
```
