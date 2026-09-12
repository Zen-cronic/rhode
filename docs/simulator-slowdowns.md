# Sustained traffic slowdowns

The separate simulator supports a timed nonzero reduction in driving speed. A slowdown keeps the truck moving along its routed geometry and consumes driving duty. A stationary road hold and a dock wait retain their existing on-duty behavior. These are declared synthetic events, not live traffic detection or posted-speed-limit simulation.

Add these optional fields to `POST http://127.0.0.1:4020/runs` alongside the existing accepted assignment, carrier, start time and truck-route request:

```json
{
  "slowdown_start_seconds": 600,
  "slowdown_seconds": 1800,
  "slowdown_factor": 0.1
}
```

This starts ten minutes into the scenario and applies 10% of the seeded driving speed for thirty minutes. Duration defaults to 0, disabling the event. Start defaults to 60 seconds and factor to 0.35. Start/duration accept 0–86,400 seconds; the factor must be finite and strictly between 0 and 1. Use the existing road-hold fields for a complete stop.

The event uses the global scenario elapsed-time interval `[start, start + duration)`. Pause freezes that clock. Dock waits and road holds take precedence; they are never converted into driving or extended to compensate for an overlapping slowdown. Route adoption preserves the original interval and remaining duration rather than restarting it.

The sample phase is `road_slowdown` and duty is `driving` during active movement. Phase and duty take effect at the observation timestamp. Speed measures the preceding second: the sample exactly at slowdown start still reports the prior normal-speed interval, and the sample exactly at slowdown end reports the final slow interval. Odometer remains the integral of those interval speeds. This distinction matters for renderer interpolation and HOS consumers.

The simulator forecasts completion using only the road-hold and slowdown events it has observed. Observing a slowdown does not prematurely include a future hold, or vice versa. If modeled completion exceeds the accepted assignment's planned end, the existing authenticated delay command records it. Assignment version advances to invalidate stale reviews; driver/truck/trailer bindings, status, schedule and reservations remain intact until a reviewed operational action changes them. Pending telemetry and exact delay command receipts survive retries and restart.

## Replay compatibility

Runs without an effective slowdown retain `road-events-v2` initial conditions, fingerprints and observation identities. Configured slowdown runs use `road-events-v3` and include the three parameters in their fingerprint. The service restores both versions paused. Existing route transitions retain the event parameters and timing.

The updated service restored all eight existing runs with unchanged progress, initial conditions, event histories, route transitions and pending state. The new model also regenerated every one of the 10,201 observations from the previously verified complete 165-minute dock-wait run without emitting any telemetry. See the legacy restoration/regeneration receipts in [the evidence directory](evidence/simulator-slowdown-2026-09-12).

## Controlled Ontario comparison

Two separate synthetic carriers start with identical normalized loads, resources and scenario clock. They use identical actual Valhalla Milton-to-London geometry, seed, start time and stop conditions. Only the slowdown intervention differs; carrier and observation identities are isolated. The retained fixture file contains both actual initial snapshots and requests.

| Result after 40 simulated minutes | Baseline | Slowdown |
|---|---:|---:|
| Acknowledged one-second observations |2,401|2,401|
| Traveled distance |40.973 km|13.316 km|
| Driving duty consumed |40 min|40 min|
| Modeled route completion, UTC |14:45:07|15:11:53|
| Delay records |0|1|

The declared slowdown begins at 600 seconds and lasts 1,800 seconds at 10% speed. No delay is reported at 599 seconds. The first slowdown observation at 600 seconds produces one delay record, with a forecast 26m46s later than baseline. All 1,800 affected interval speeds remain positive and exactly 10% of the baseline's corresponding interval speeds. Integrated speeds match recorded odometers. Both drivers retain identical budgets: reduced movement grants no rest or driving-time credit.

Reset/replay of the slowed branch reproduces all 2,401 events and leaves nine operational record sets unchanged, including the delay record, assignment version, reservations, visits and invoice revisions. Comparison covers the first 40 minutes and the full slowdown window; the routes are not completed in this comparison. No recovered revenue, measured business savings or real-world ETA accuracy is claimed.

## Verification and reproduction

`services/optimizer/tests`: 53 tests pass in 15.07 seconds. New cases cover positive-speed duration boundaries, seed/batch/reset equivalence, odometer integration, duty classification, dock/hold overlap, independently observed forecasts, validation, legacy fingerprints, route adoption and lost delay acknowledgment/restart. The first service-test attempt compared equivalent `Z` and `+00:00` timestamp strings; it was corrected to compare instants.

With API4010, simulator4020, PostgreSQL55432 and existing routing access running:

```bash
node scripts/verify-simulator-slowdown.ts
VITE_AUTH_MODE=local-demo VITE_API_URL='' npm run build --workspace @roadstar/web -- --outDir ../../data/slowdown-web
# From apps/web, in a second terminal:
npx vite preview --host 127.0.0.1 --port 5184 --strictPort --outDir ../../data/slowdown-web
# From the repository root:
node scripts/verify-simulator-slowdown-ui.mjs
```

The ignored `data/simulator-slowdown-fixture.json` preserves both branches and intermediate receipts. Default preparation refuses to replace it. `node scripts/verify-simulator-slowdown.ts resume` resumes an incomplete retained two-branch verification; it does not reseed. The first integration check incorrectly expected the assignment version to stay unchanged after delay. The verifier now checks the required version increment separately from unchanged assignment bindings and reservations, and resumed those same branches without repeating telemetry.

The browser verifier inspects the existing compiled third-pass UI, source IDs, speed/duty evidence, simulator totals, 390px layout and offline cached history. It performs no operational POST commands. Its selectors distinguish the telemetry card from the mileage card, and speed comparisons respect the displayed hundredth precision. No new basemap, native-device, cloud control or design pass belongs to this packet.

A final actual simulator process stop/start retained all ten saved runs, including the new v3 slowdown: exact observations, progress, initial conditions, delay commands/results and route transitions were unchanged, and all runs restored paused. See `process-restart.json`. Screenshots of studio totals and baseline/slowdown source panels were inspected directly; the narrow source panel stays readable and contained. The offline capture is the retained source card; the offline banner was asserted in the browser, outside that crop.
