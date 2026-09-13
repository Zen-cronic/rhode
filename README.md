# RoadStar

Carrier dispatch and driver execution for Southern Ontario. Rehearse a dock delay, review the next load at risk, approve a recovery and retain the detention evidence with the shipment.

[Public dock-to-recovery receipt](https://roadstar-web-739889188415.us-central1.run.app/?view=dock-evidence) · [Public matched Highway 401 replay](https://roadstar-web-739889188415.us-central1.run.app/?view=matched-401) · [Authenticated cloud preview](https://roadstar-web-739889188415.us-central1.run.app). Public demonstration data is synthetic. Preview credentials are provided separately; private organizer workbook rows are never included in the cloud demonstration.

## Judge access

The fastest review path is the [four-minute recording](https://roadstar-web-739889188415.us-central1.run.app/demo/roadstar-demo.mp4), followed by the credential-free [dock-to-recovery receipt](https://roadstar-web-739889188415.us-central1.run.app/?view=dock-evidence) and [matched Highway 401 replay](https://roadstar-web-739889188415.us-central1.run.app/?view=matched-401), then the authenticated operational workflow. The repository is intentionally private. Before judging, invite the organizer's GitHub account as a read-only collaborator and deliver the preview dispatcher credentials through the organizer's private channel. Do not put passwords or Firebase tokens in Devpost, this repository or the recording.

Once signed in, open **Recovery**. The **Judge replay · matched Highway 401 slowdown** panel provides an immediate read-only 3D comparison of two complete, matched simulator recordings. For the live hero workflow, select **RS-1042 dock delay** and compare the ranked plans for the next at-risk load. The chosen plan uses D-02 / T-102 / V-102; the alternate is visibly rejected because its HOS evidence is missing or stale. Approve the recovery, then switch to the provided driver identity to accept the replacement trip. **Tracking** and **Billing** expose the retained breadcrumbs, speed/odometer history, geofence visit and detention evidence.

If the cloud preview is unavailable, the recording, [presentation PDF](https://roadstar-web-739889188415.us-central1.run.app/demo/roadstar-pitch.pdf) and local preview below preserve the same synthetic recovery narrative. Hosted simulator mutation controls are intentionally disabled; the cloud preview packages the verified matched recordings for read-only interaction, while the local rehearsal uses the independent simulator service.

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

See [API contract](docs/api-contract.md), [cloud inventory and expiry](infra/gcp/README.md), [approved cost estimate](infra/gcp/cost-estimate.md) and [build checkpoint](BUILD_CHECKPOINT.md).

## Verification

```bash
npm run typecheck
TEST_DATABASE_URL='postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar' NODE_ENV=test npm test
npm run build --workspace @roadstar/web
```

Python uses the `.roadstar` pyenv virtualenv and Poetry. Explicitly export `VIRTUAL_ENV` and prepend its bin directory before `poetry install`/`poetry run pytest` in `services/optimizer`. Never install into system Python.

Evidence under `docs/evidence` includes cloud authentication/document extraction, actual truck routing, LTL solver results, independent replay, source import counts and a131-driver cloud benchmark. The real-road consolidated-trip integration test is opt-in with `ROAD_ROUTING_TEST_URL` pointing at a running optimizer.

## Current limits

This is an implementation preview. HOS checks declared budgets and is not a certified ELD or comprehensive legal compliance calculation. OSM route restrictions are limited by source coverage. Consolidated optimization currently accepts synthetic trips with a disclosed26-pallet allowance; live use needs verified capacities. Consolidated trips require complete-manifest review for recovery.

Completed deliveries retain authorized tracking until an existing facility visit closes. Completion occurrence and receipt times are stored separately from geofence evidence. Shipment-bound FTL terms generate one review-required detention draft on departure; uncertain GPS, missing terms and LTL shipments cannot silently create charges. Regression tests cover completion inside the facility, later departure, duplicate telemetry and the two-hour threshold.

Dated manual duty and valid telemetry observations now consume an explicit initial budget basis. The original shift deadline is retained. This is a declared-budget model: missing basis, conflicting history, day rollover and potential rest resets require review; it does not certify full HOS/ELD compliance. The independent simulator follows Valhalla geometry with per-stop waits, seeded speed changes and explicit road holds. Canonical one-second observations preserve intermediate geofence events across accelerated advances. Interrupted batches retry identical event IDs; pause remains responsive. Replay state is atomically checkpointed on local disk and restored paused after service restart; independent comparisons need fresh scenario assignments. See docs/simulator-persistence.md. Tracking shows Receiving or Feed quiet from real-time receipt age; stopping a source ages the indicator even with a paused scenario clock. Observed dock waits and road holds now submit a modeled completion delay through the API when it exceeds the planned end; affected commitments are returned without changing reservations. Road holds enter the forecast only once observed. Forecasts include configured stop dwell and seeded speed, are bounded to seven days, and are not physical completion evidence. Exact delay commands/receipts survive retries, service restart and same-run reset. Restored runs require explicit resume and stay bound to the original operational API. Road holds do not automatically find a new route. Native GPS has no odometer source. The new client saves GPS commands before network checks under a verified same-session grant, bounded by credential expiry and a server session check within the last hour. Cached duty is explicitly marked and excluded from HOS consumption; the client requires the matching API capability before enabling this mode. Device stop and sign-out end collection; queued samples remain visible pending or failed. The installed API35 release verified background GPS callbacks, offline retention, force-stop/reopen, reconnect and stop behavior in an isolated expiring emulator-only workspace; web historical trails break across missing or implausible intervals. Loaded-history odometer totals exclude resets and missing readings; GPS chord estimates are separately labeled and exclude stationary uncertainty. Complete shift mileage and physical-device/iOS background verification remain unfinished. See docs/native-emulator-verification.md for the bounded native proof and the preserved rejected speed outlier. These are current implementation limits, not verified production capabilities. New recovery proposals retain current/replacement pickup readiness, lateness, modeled completion and constraint reasons; approval checks both sides’ resource versions. Preceding trips with same-trip GPS no older than 120 seconds and valid accuracy use Valhalla through dated uncompleted manifest stops for remaining driving. Historical duty consumption is unchanged. Future waiting until release consumes on-duty/cycle allowance. Full service allowance is retained because service is not allocated per stop. Missing current progress falls back to full declared work, so conservative rejection remains possible. Dispatcher time savings and recovered revenue remain unmeasured.

The measured131-driver cloud burst had zero failed commands but p95 acknowledgement-to-snapshot lag about5.4s; two-second polling is not a two-second delivery guarantee. The benchmark includes a burst barrier and disclosed warm-data conditions.

Android ARM64/x86_64 standalone builds pass. API35 emulator verification passed Firebase login, satellite/truck routes, offline acceptance across force-stop/restart/reconnect, recovery approval and the four-stop consolidated manifest. Mobile has 24 passing tests. The September 11 release passed fresh Firebase driver login and offline acceptance across force-stop/restart/reconnect against the updated API. The recovered trip remained offered on the server while pending locally, then became accepted version2 with one synchronized queue item. Physical Android and native iOS testing are deferred because devices/Mac are unavailable. Background push is not configured. Satellite tiles are not an offline navigation cache. Invoice approval preserves a reviewed revision; it does not collect payment. GPS uncertainty is never silently promoted to an authoritative billing timestamp.

The approved seven-day GCP preview has stop tasks scheduled for September17,2026 at20:00UTC. Retained storage continues charging; task execution must be checked. The cost estimate is not a billing cap.

## Demonstration

[Four-minute recording](https://roadstar-web-739889188415.us-central1.run.app/demo/roadstar-demo.mp4) · [Presentation PDF](https://roadstar-web-739889188415.us-central1.run.app/demo/roadstar-pitch.pdf) · [Editable deck](https://roadstar-web-739889188415.us-central1.run.app/demo/roadstar-pitch.pptx). These are hosted on the seven-day preview. The ten-field submission draft remains local, with the private repository URL recorded; judge access, live portal checks and video-host acceptance remain unverified.

The video is 240.096 seconds, 1920×1080, 24 fps, H.264/AAC. SHA-256: `1b750bcbc18fde996648aab66a5d44357aaacd61755e259350e2784867787cb0`.


## Precision transport redesign

The dispatcher web, Android driver/dispatcher views, four-minute film and editable pitch deck share the graphite, ivory and signal-orange identity selected on September 10. The route motif uses actual operational geometry inside maps and clearly illustrative studio artwork in the opening/closing scenes. See [design direction](docs/design/precision-transport.md), [reference study](docs/design/references.md), [film sources](docs/design/demo-source/README.md) and [deck sources](docs/design/deck-source/README.md).

The local web preview is available at http://localhost:5174 while the preview processes are running. The Android API35 emulator uses the standalone x86_64 APK; the temporary user service `roadstar-preview-emulator.service` keeps the existing emulator window open without enabling it at boot. Native iOS and physical-device background tracking remain deferred.
