# Rhode

Carrier dispatch and driver execution for Southern Ontario. Rehearse a dock delay, review the next load at risk, approve a recovery and retain the detention evidence with the shipment.

[Public dock-to-recovery receipt](https://roadstar-web-739889188415.us-central1.run.app/?view=dock-evidence) · [Public matched Highway 401 replay](https://roadstar-web-739889188415.us-central1.run.app/?view=matched-401) · [Authenticated cloud preview](https://roadstar-web-739889188415.us-central1.run.app). Public demonstration data is synthetic. Preview credentials are provided separately; private organizer workbook rows are never included in the cloud demonstration.

## Judge access

The fastest review path is the [four-minute recording](https://roadstar-web-739889188415.us-central1.run.app/demo/rhode-demo.mp4), followed by the credential-free [dock-to-recovery receipt](https://roadstar-web-739889188415.us-central1.run.app/?view=dock-evidence), [matched Highway 401 replay](https://roadstar-web-739889188415.us-central1.run.app/?view=matched-401). The repository is public under the MIT License. No password is needed for either read-only synthetic replay.

The staged dispatcher and both staged driver identities pass independent, storage-empty hosted-browser login, role-navigation and sign-out checks at desktop/390px. The redacted receipt records no email address, password, token or browser state and the verifier issues no operational POST. See [judge access readiness](docs/evidence/judge-access-readiness-2026-09-13/README.md). Credentials for the authenticated operational workflow are delivered privately for the live presentation; no password is committed to the public repository.

Once signed in, open **Recovery**. The **Judge replay · matched Highway 401 slowdown** panel provides an immediate read-only 3D comparison of two complete, matched simulator recordings. Its progressive speed profile pairs exact at-or-before observations, with height equal to recorded km/h and a diagram fallback. For the live hero workflow, select **RS-1042 dock delay** and compare the ranked plans for the next at-risk load. The chosen plan uses D-02 / T-102 / V-102. The public receipt retains D-01's exact 417 driving / 40 on-duty / 340 elapsed minutes remaining and rejects the 144-minute on-duty requirement because the 40-minute budget binds. Approve the recovery, then switch to the provided driver identity to accept the replacement trip. **Tracking** and **Billing** expose the retained breadcrumbs, speed/odometer history, geofence visit and detention evidence.

The public London receipt keeps its 165-minute dwell, 45 billable minutes and CAD 75 draft separate from the film's Milton 167 / 47 / CAD 78.33 billing example. Both are synthetic and their values are never combined.

If the cloud preview is unavailable, the recording, [presentation PDF](https://roadstar-web-739889188415.us-central1.run.app/demo/rhode-pitch.pdf) and local preview below preserve the same synthetic recovery narrative. Hosted simulator mutation controls are intentionally disabled; the cloud preview packages the verified matched recordings for read-only interaction, while the local rehearsal uses the independent simulator service.

## Local preview

Requires Node24+, Docker and PostgreSQL16/PostGIS. From this repository:

```bash
npm install
docker compose -p roadstar -f infra/compose.yaml up -d --wait
export DATABASE_URL='postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar'
AUTH_MODE=local-demo AUTO_MIGRATE=true npm run api
```

In another terminal:

```bash
VITE_AUTH_MODE=local-demo npm run dev --workspace @roadstar/web -- --port 5174 --strictPort
```

Open http://localhost:5174, choose Demo dispatcher and carrier `demo-carrier`. Local fixture authentication binds the API to loopback and is rejected on Cloud Run. These credentials are only for the local database. Optional `VITE_GOOGLE_MAPS_KEY` must allow the local referrer. Set `OPTIMIZER_URL` on the API to the Python worker for actual truck routing and consolidated planning; missing routing remains visible.

Run `scripts/preview-local.sh` to start the API and web together after the database is available. It accepts `OPTIMIZER_URL` from your shell.

The current development session runs the API on4010, web on5174 and optimizer on4040. The optimizer reaches the approved Ontario routing VM through a local IAP tunnel. Restarting the machine requires restarting these processes/tunnel.

## Implemented architecture

- React/TypeScript dispatcher and driver web, Expo/React Native Android/iOS source, shared validated commands and API client.
- Fastify operational API with Firebase authentication, carrier/role membership, idempotent commands, optimistic versions and PostgreSQL resource exclusion constraints.
- Dedicated Cloud SQL PostgreSQL16 with PostGIS and btree_gist; operational state, source lineage, reservations, event cursors and evidence revisions.
- Python FastAPI/OR-Tools worker with actual Valhalla truck matrices. Dedicated routing VM stores pinned Ontario tiles. Independent simulator produces explicitly synthetic telemetry and replay comparisons.
- Private Cloud Storage documents, Cloud Tasks/Scheduler leases and Vertex Gemini extraction. Human review is required for consequential approvals; deterministic code computes feasibility and detention.
- Device SQLite retains downloaded trips and queued commands. Tracking requires an explicit work session; offline actions remain pending until server acknowledgement.

See the [API contract](docs/api-contract.md), [cloud inventory and expiry](infra/gcp/README.md), and [approved cost estimate](infra/gcp/cost-estimate.md).

## Verification

```bash
npm run typecheck
TEST_DATABASE_URL='postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar' NODE_ENV=test npm test
npm run build --workspace @roadstar/web
```

Python uses the `.roadstar` pyenv virtualenv and Poetry. Explicitly export `VIRTUAL_ENV` and prepend its bin directory before `poetry install`/`poetry run pytest` in `services/optimizer`. Never install into system Python.

Evidence under `docs/evidence` includes cloud authentication/document extraction, actual truck routing, LTL solver results, independent replay, source import counts and a131-driver cloud benchmark. The real-road consolidated-trip integration test is opt-in with `ROAD_ROUTING_TEST_URL` pointing at a running optimizer.

## Demonstration

[Four-minute recording](https://roadstar-web-739889188415.us-central1.run.app/demo/rhode-demo.mp4) · [Presentation PDF](https://roadstar-web-739889188415.us-central1.run.app/demo/rhode-pitch.pdf) · [Editable deck](https://roadstar-web-739889188415.us-central1.run.app/demo/rhode-pitch.pptx). These are hosted on the seven-day preview. The ten-field submission draft remains local; live portal checks and video-host acceptance remain operator verification steps.

The video is 240.096 seconds, 1920×1080, 24 fps, H.264/AAC. Its recovery section shows the bounded organizer-value scenario after the matched route comparison and before the feasibility/approval evidence. Signal-level narration verification passes at−16.0LUFS integrated,2.5LU range and−1.4dBFS true peak with no ≥0.8-second silence below−45dBFS; a human end-to-end listen remains required. SHA-256: `3654e535629d3c9e036604606d902e13a5b0976301d51a506efbaca3997cae0a`.


## Precision transport redesign

The dispatcher web, Android driver/dispatcher views, four-minute film and editable pitch deck share the graphite, ivory and signal-orange identity selected on September 10. The route motif uses actual operational geometry inside maps and clearly illustrative studio artwork in the opening and closing scenes.

The local web preview is available at http://localhost:5174 while the preview processes are running. The Android API35 emulator uses the standalone x86_64 APK; the temporary user service `roadstar-preview-emulator.service` keeps the existing emulator window open without enabling it at boot. Native iOS and physical-device background tracking remain deferred.
