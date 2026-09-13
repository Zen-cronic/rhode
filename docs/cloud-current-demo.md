# Current hosted preview verification

The approved seven-day preview now serves the ranked recovery build, credential-free dock-to-recovery and matched-Highway-401 replays, and the four-minute film from the existing RoadStar GCP project.

## Release

- Web: `roadstar-web-00074-cic`
- Operational API: `roadstar-api-00036-woy`
- Optimizer: `roadstar-optimizer-00015-vuk`
- Document worker: `roadstar-documents-00021-tam`

Every revision passed a zero-traffic tagged health check before receiving 100% traffic. The interrupted first deployment left the prior optimizer at 100% and the new optimizer at zero traffic; the rollout resumed from that safe state using the already-built immutable images.

## Judge-facing checks

The public API reports PostgreSQL and Firebase authentication. The public web shell returns HTTP 200. The hosted MP4, SRT, PDF and editable PPTX are byte-identical to their tracked masters. The 240.096-second H.264/AAC film has SHA-256 `3654e535629d3c9e036604606d902e13a5b0976301d51a506efbaca3997cae0a`; its accepted audio packet is unchanged. The sidecar preserves the narrated text while formatting it into 77 deterministic cues, with at most two 42-character lines and a measured maximum of 21.999 visible characters per second; its SHA-256 is `b814c74b8d0013b1d9d939bb4b8e3be13821062d5293bdc1764466d6395a3d43`. Its recovery section now includes the public receipt's bounded CAD value frame between the ranked result and feasibility/approval evidence. The current PDF is `bdd5f50db0da136e841f486380f8f42512e39b42c591b2c7198b50f130d929e1`; the editable PPTX is `075d497670bec0439518fd0c2069ffe53b8aae4b016a7fbfb0290a938be3e4a6`.

An isolated Firebase-authenticated hosted scenario records a delayed RS-1042, identifies RS-1043 at risk, ranks Morgan with T-102/V-102 as feasible, and retains Taylor's missing/stale HOS evidence as a rejection. A dispatcher approves the pending revision; a separate driver accepts the resulting offer. A simulator-role approval returns 403 and a new approval against the applied proposal returns 409 without another mutation. The original assignment is superseded and the replacement is accepted.

The hosted recovery view also renders the stored decision-packet receipt at desktop and 390 px. It exposes the one request, two screened combinations, one feasible candidate, one rejected candidate and one retained reason. This read-only check issued no recommendation, approval or driver command.

The same comparison is also available without credentials at [the public matched Highway 401 replay](https://roadstar-web-739889188415.us-central1.run.app/?view=matched-401). It uses two complete 2,401-observation simulator recordings. Both runs share their assignment basis, seed, route, scenario clock, stops, waits and speed profile; only the declared Highway 401 slowdown differs. At `T+40:00`, it displays the verified `+27.657 km` baseline progress advantage and modeled `+00:26:46` slowdown finish delta. A paired profile reveals up to 64 exact at-or-before speed observations: ivory cylinders for baseline and signal-orange fins for slowdown, with height equal to recorded km/h. Missing or mismatched evidence remains a visible gap; the browser does not interpolate it. Browser verification loaded one static archive, made no operational API request and issued no write. The loaded replay remained inspectable offline and fit without horizontal overflow at 390 px.

The credential-free [dock-to-recovery receipt](https://roadstar-web-739889188415.us-central1.run.app/?view=dock-evidence) connects five retained milestones: the 08:30 ET inside-yard observation, the 120-minute contract boundary, the 11:15:09 ET outside-yard observation, an automatic CAD $75 detention draft, and the 11:20 ET rejection of D-01 with 40 on-duty minutes remaining before the separate D-02 recovery. It exposes the 13h/14h/16h planning gates without presenting RoadStar as an ELD. Its editable value scenario applies a disclosed CAD interpretation to the organizer brief's currency-unspecified $1,000–$7,000 load range, subtracts only modeled added-deadhead cost, and names the omitted costs. The page is read-only, stays interactive after network loss, provides a diagram fallback for its schematic 3D scene, and makes no operational API request or write.

Evidence and screenshots are in [`docs/evidence/cloud-ranked-recovery-2026-09-12`](evidence/cloud-ranked-recovery-2026-09-12/), [`docs/evidence/packaged-401-replay-2026-09-12`](evidence/packaged-401-replay-2026-09-12/), [`docs/evidence/public-401-replay-2026-09-12`](evidence/public-401-replay-2026-09-12/) and [`docs/evidence/public-dock-evidence-2026-09-12`](evidence/public-dock-evidence-2026-09-12/). The deployment receipt is in [`docs/evidence/cloud-current-demo-2026-09-12/deployment.json`](evidence/cloud-current-demo-2026-09-12/deployment.json).

## Limits

The scenario is synthetic. Route and schedule values are modeled with the configured services. It does not establish measured human task time, live traffic, revenue, profit or savings. Hosted simulator mutation controls remain unavailable because a simulator Cloud Run resource was outside the approved cost estimate. The public replays change only their inspection state and do not create or alter operational data. Physical Android and native iOS verification remain deferred.

Reproduce the release checks with:

```bash
node scripts/verify-deployed-release.mjs
```
