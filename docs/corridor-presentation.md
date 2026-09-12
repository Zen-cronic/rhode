# Recorded corridor presentation feed

Accepted September 12, 2026, packet PB-RS-CORRIDOR-FEED-20260912. Feature commit `4cb5d17`; local API/simulator only. The existing 3D dock view is unchanged. Corridor rendering and view-time controls are the next packet.

`GET /api/simulator/:runId/presentation?offset=0&limit=1000` returns a dispatcher-only recording page. Supply the returned `snapshot` fingerprint for every continuation; `next_offset: null` ends the recording. Limit is 1–1000, default 500. Responses are private/no-store. Driver, foreign-carrier, wrong-API and non-synthetic assignment reads are rejected. Hosted control remains unavailable under `K_SERVICE`.

The source projection whitelists acknowledged sample fields and retained route geometry. Every event carries its original sample plus `route_key` and `elapsed_seconds`. Every route carries its original GeoJSON LineString, stop indices, conditions key and source; approved replacements also carry revision ID/number and adoption boundary. Event identity is checked against the deterministic run/conditions/time hash, so the old sample exactly at a route replacement retains the old route. Consumers select geometry by the event's route key, not by the latest inventory phase or the last route in the array.

Pending generated observations are excluded. Runs generated with emission disabled are refused. Appending, resetting or changing recording content invalidates the snapshot: reload from page zero on conflict, never splice pages from different recordings. The projection makes no control commands, clock updates, invoice revisions or HOS calculations. Speed describes the preceding interval; phase/duty describe the instant of observation. A historical cursor must not reuse current HOS balances or detention totals as historical values.

## Verification

- 47 Python simulation/service/route-transition tests pass, including 8 new presentation cases. Focused service suite: 30 passing tests.
- Two PostgreSQL-backed adapter tests pass, including returned-binding rechecks, driver/carrier boundaries, invalid pagination, stale source response and hosted/live refusal. One malformed assignment fixture exposed a raw PostgreSQL UUID error; the adapter now rejects invalid assignment identities before querying.
- Root TypeScript and diff whitespace checks pass.
- `node scripts/verify-corridor-presentation.ts` reads the retained complete replay: all 10,201 source samples match exactly across 11 pages; 10,200 elapsed seconds; real Valhalla route coordinates match. Maximum measured sequential page response was 313 ms on this machine. This is not a concurrency or 131-driver capacity result.
- All 43 carrier-scoped database record sets and all 11 checkpoint files retain identical hashes after the read-only proof; the completed run remains paused. Runtime evidence: `docs/evidence/corridor-presentation-2026-09-12/verification.json`.

## Limits and next work

Page responses limit sample count; this first local implementation rebuilds the full recording fingerprint on each request and repeats route metadata. It is intended for explicit replay loading. Large recordings/concurrent readers need measured caching/indexing work before scale claims. A continuously changing run can invalidate pagination; the caller should explicitly pause through existing controls or retry a fresh view, never automatically mutate the simulator to satisfy a read.

Next: connect a lazy 3D corridor scene to these exact recorded samples, with view-only play/pause/scrub, route-specific geometry, dated observation details, and honest historical milestone comparison. Keep current dock billing/HOS separate from replay time. No new cloud resources, model calls or public publication were used for this packet.
