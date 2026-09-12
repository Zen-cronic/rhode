# Complete dock-wait replay

This packet exercises the retained third-pass web build, a separate simulator process, the local operational API and PostgreSQL/PostGIS. It uses a fresh synthetic London workspace; other local, hosted and native workspaces are preserved.

The authored fixture replaces the first shipment with a 3.118 km London local route and keeps a London-to-Milton return load. It gives Alex 240 minutes of initial on-duty headroom and stages Morgan in London. The simulator receives actual Valhalla truck geometry, a seed of 42 and a configured 9,900-second (165-minute) origin wait. The default simulator road-speed model remains synthetic; it does not consume posted road speed limits or use the Valhalla travel duration as its motion clock.

The first acknowledged dock observation reports the modeled late finish and identifies the following offered load. It leaves dispatch unchanged. The server compares the original assignment with Morgan's alternative: the original fails the on-duty budget, overlapping resource commitment and pickup-arrival checks. A dispatcher explicitly approves in the compiled web application; a separate 390 px driver browser accepts the new offer. These are separate records and actions.

Every second of the configured wait and subsequent road movement is emitted through the operational HTTP API. A confident exit closes the origin visit and generates a draft using the configured 120-minute free-time allowance. The reviewed draft requires a separate dispatcher approval. The destination visit remains open: an animation reaching a route endpoint is not evidence of physical departure, load completion or billing authority.

After billing review, a same-run reset reproduces the complete ordered event hash and initial conditions. Database snapshots compare telemetry, visits, invoice revisions, assignments, reservations, disruptions, approvals, resources, loads, scenario clocks, duty events and stop completions. Reset deliberately reuses event identities and does not rewind the operational database. This is a deduplication/replay check, not an independent baseline-versus-recovery savings experiment.

## Reproduction

Requires the existing local API4010, separate simulator4020, optimizer4040/Valhalla routing access and PostgreSQL55432. The local API must have its existing local-demo simulator identity configured. Run from the product root:

```bash
node scripts/verify-complete-replay.ts prepare
node scripts/verify-complete-replay.ts recover
VITE_AUTH_MODE=local-demo VITE_API_URL='' npm run build --workspace @roadstar/web -- --outDir dist-replay
# In another terminal, from apps/web:
npx vite preview --host 127.0.0.1 --port 5184 --strictPort --outDir dist-replay
# Back at the product root:
node scripts/verify-complete-replay-ui.mjs approve
node scripts/verify-complete-replay.ts run
node scripts/verify-complete-replay-ui.mjs evidence
node scripts/verify-complete-replay.ts seal
node scripts/verify-complete-replay.ts replay
```

The ignored `data/complete-replay-fixture.json` retains the fixture and intermediate receipts. Preparation refuses to replace an existing pointer; preserve completed fixtures before intentionally creating another. A failed advance retains simulator pending work; inspect the same run rather than reseeding. Do not rerun the already-completed browser approval or billing phase.

The built screenshots and structured receipts live in [the evidence directory](evidence/complete-replay-2026-09-12). No cloud deployment, new resources, paid model calls or native build belong to this packet. No physical-device, regulatory certification, route-speed realism or measured financial savings claim follows from these synthetic checks.

## Observed results — September 12

The original run reached `route_complete` by the final 10,200-second advance boundary, retaining 10,201 observations. The origin visit spans 165 whole billable-calculation minutes: 120 free and 45 billable at CAD $100/hour, producing CAD $75.00. The dispatcher created approved revision 2 while retaining draft revision 1. Two visit identities exist: closed origin and still-open destination. Alex's modeled on-duty budget is 40 minutes at 15:20 UTC, down from 240 at the 12:00 UTC basis; the 200 consumed minutes include the 30-minute interval before the trip starts. The driver does not exhaust all HOS in this fixture.

The compiled dispatcher and independent responsive driver screenshots were inspected directly. Approval makes driver acceptance explicit. Billing preserves observed-sample uncertainty and the two source IDs. The 390px approved history has no horizontal overflow. Driver captures include a loading map, so they are not counted as mapping proof. No page errors occurred in either browser phase.

The retained 3D research recommends projecting acknowledged simulator/API events into a procedural corridor/dock scene. This fixture supplies a complete event stream and traceable detention/recovery chain for that future adapter. It does not implement 3D, continuous playback, a cloud simulator control plane or isolated counterfactual branches.

The full same-run replay passed: all 10,201 ordered observations have the identical SHA256 `abc688b8652682b33cbcf0b813c4ad285b8c3132a779cead246ecb4eb63007d2`, with identical initial conditions and all 13 compared database record sets unchanged. The approved CAD $75 revision remains one approval, not another charge. See `verification.json` and `post-replay-integrity.json` for exact identifiers and comparison receipts.
