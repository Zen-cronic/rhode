# RoadStar

Carrier dispatch and driver execution for Southern Ontario. Rehearse a dock delay, review the next load at risk, approve a recovery and retain the detention evidence with the shipment.

[Authenticated cloud preview](https://roadstar-web-739889188415.us-central1.run.app). Public demonstration data is synthetic. Preview credentials are provided separately; private organizer workbook rows are never included in the cloud demonstration.

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

The measured131-driver cloud burst had zero failed commands but p95 acknowledgement-to-snapshot lag about5.4s; two-second polling is not a two-second delivery guarantee. The benchmark includes a burst barrier and disclosed warm-data conditions.

Android standalone builds exist and API35 emulator verification is underway. Physical Android and native iOS testing are deferred because devices/Mac are unavailable. Background push is not configured. Satellite tiles are not an offline navigation cache. Invoice approval preserves a reviewed revision; it does not collect payment. GPS uncertainty is never silently promoted to an authoritative billing timestamp.

The approved seven-day GCP preview has stop tasks scheduled for September17,2026 at20:00UTC. Retained storage continues charging; task execution must be checked. The cost estimate is not a billing cap.
