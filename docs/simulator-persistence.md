# Simulator restart and replay

Run one simulator worker per state directory. Default storage is the project’s ignored `data/simulator` directory; override with `SIMULATOR_STATE_DIR`. The service obtains an exclusive writer lock on startup. Checkpoints use atomic replacement and file/directory fsync. They contain scenario geometry, motion, generated samples, pending delivery progress and exact delay commands/receipts. Credentials are read from the environment and never checkpointed.

`GET /runs` lists known IDs. After a service restart, `GET /runs/{id}` restores its checkpoint with `paused: true` and `restored: true`. `POST /runs/{id}/resume` explicitly resumes. The next advance first finishes any pending batch; its requested duration does not generate additional time until that batch is resolved. API origin binding prevents silently sending an existing run to a different backend.

An uncertain acknowledgment can cause another delivery of the same event/command ID and payload. The operational API’s idempotency prevents repeated effects. Delay expected versions are saved before dispatch; a restart never regenerates them from a newer assignment. Reset preserves delay receipts, reuses sample IDs and never rewinds operational time. A pending batch must be resolved before reset. Independent before/after comparisons require fresh assignments with identical recorded starting conditions.

A checkpoint write failure pauses the run and prevents new nondurable delivery. Repair disk permissions/space, preserve the checkpoint and explicitly resume. Corrupt/incompatible checkpoints return an error and remain untouched; the service does not silently create a replacement run. Pre-checkpoint process-local runs cannot be automatically imported from old public exports, which omit internal motion state.

This is durable local service restart support. Disk loss, container replacement without a persistent volume, distributed writers, automated backups and cloud-hosted simulator durability are not proven. Do not run multiple workers sharing the directory. The operational database remains the authority for actual assignments and billing; simulator storage contains only synthetic run state.

## Verification

With the local RoadStar API, PostgreSQL, Valhalla tunnel and `roadstar-preview-simulator.service` running, execute `node scripts/verify-simulator-restart.ts` from the repository root. It creates a fresh synthetic carrier, starts an actual Valhalla route, records a dock-delay consequence, restarts the named local simulator service, resumes and replays. It asserts unchanged reservations, no approvals, one disruption and five unique telemetry samples. It writes `docs/evidence/simulator-restart-2026-09-11.json`.

`poetry -C services/optimizer run pytest -q` additionally kills and relaunches a real Uvicorn subprocess, checks identical motion/IDs after restore/reset, and fault-injects lost telemetry/delay acknowledgments followed by checkpoint reload. Storage failure, corrupt checkpoints and API retargeting are rejected. Use the configured `.roadstar` pyenv/Poetry environment.

Approved route adoption additionally persists the original replay, receipt, selection time and exact transition snapshots/cursor. Reset applies transitions at their original elapsed seconds and retains per-sample event identities; see `simulator-adoption.md`.
