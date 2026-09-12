# Current hosted preview verification

The approved seven-day preview now serves the ranked recovery build and current four-minute film from the existing RoadStar GCP project.

## Release

- Web: `roadstar-web-00058-juc`
- Operational API: `roadstar-api-00036-woy`
- Optimizer: `roadstar-optimizer-00015-vuk`
- Document worker: `roadstar-documents-00021-tam`

Every revision passed a zero-traffic tagged health check before receiving 100% traffic. The interrupted first deployment left the prior optimizer at 100% and the new optimizer at zero traffic; the rollout resumed from that safe state using the already-built immutable images.

## Judge-facing checks

The public API reports PostgreSQL and Firebase authentication. The public web shell returns HTTP 200. The hosted MP4, SRT, PDF and editable PPTX are byte-identical to their tracked masters. The 240.096-second H.264/AAC film has SHA-256 `54d7eb79775a0c0eb51f35da2a8cc2f2aba6768100f20a6e350256d6438dfe77`. The current PDF is `3a296462c2932d350760ba30fa6b9770aacd2cedeee4001053f11cf40861d006`; the editable PPTX is `bdbd5fa04f96a5d87fd04063b436f5780ba13a82664a38495afd1c7ba427b712`.

An isolated Firebase-authenticated hosted scenario records a delayed RS-1042, identifies RS-1043 at risk, ranks Morgan with T-102/V-102 as feasible, and retains Taylor's missing/stale HOS evidence as a rejection. A dispatcher approves the pending revision; a separate driver accepts the resulting offer. A simulator-role approval returns 403 and a new approval against the applied proposal returns 409 without another mutation. The original assignment is superseded and the replacement is accepted.

The hosted recovery view also renders the stored decision-packet receipt at desktop and 390 px. It exposes the one request, two screened combinations, one feasible candidate, one rejected candidate and one retained reason. This read-only check issued no recommendation, approval or driver command.

Evidence and screenshots are in [`docs/evidence/cloud-ranked-recovery-2026-09-12`](evidence/cloud-ranked-recovery-2026-09-12/). The deployment receipt is in [`docs/evidence/cloud-current-demo-2026-09-12/deployment.json`](evidence/cloud-current-demo-2026-09-12/deployment.json).

## Limits

The scenario is synthetic. Route and schedule values are modeled with the configured services. It does not establish measured human task time, live traffic, revenue, or savings. Hosted simulator controls remain unavailable because a simulator Cloud Run resource was outside the approved cost estimate. The deployed web contains the 3D renderer, while its source recording was verified locally and is shown in the hosted film. Physical Android and native iOS verification remain deferred.

Reproduce the release checks with:

```bash
node scripts/verify-deployed-release.mjs
```
