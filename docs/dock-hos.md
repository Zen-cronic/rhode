# Open dock exposure and exhausted duty headroom

This local packet preserves the third design. Evidence & billing now shows a dated, provisional detention estimate for an open visit alongside the assigned driver's limiting HOS budget. Fleet uses all four supported budgets instead of showing only unused driving minutes. Existing API dispatch, proposal, approval and acceptance checks remain authoritative.

The snapshot projection runs inside the existing read-only, repeatable-read database transaction. It uses the bound FTL contract and the latest same-assignment GPS record. The latest observation must confidently establish this stop, be applied, and be no more than 120 seconds old against the appropriate operational/scenario clock. Missing terms, unsupported visit policy, uncertain GPS, future/stale observations and unresolved late GPS hold the amount. Driver snapshots expose no provisional pricing. The existing carrier/assignment/time telemetry index supports the lookup.

The calculation ends at the latest confirmed inside sample, floors observed minutes, applies the configured free-time allowance, and rounds the configured hourly amount to cents. It does not extrapolate a departure or create an invoice. A confident exit and the existing separate billing review still govern the invoice workflow. An estimate is a source-bound observation, not a claim that a shipper owes payment.

## S06 fixture

The fixture is a new synthetic London local trip using Valhalla truck geometry. A reviewed CSV preserves off-duty history through September12 23:30UTC and overnight on-duty history through the September13 noonUTC scenario start. The existing ordinary federal south-of-60 solo planning profile yields 90 remaining on-duty minutes at noon. It is not a certified ELD or a complete implementation of exceptions.

The first short trip is feasible when offered and accepted. An authored ten-hour dock wait is then observed only through its first 165 minutes. Every one-second sample enters the operational HTTP API from the separate simulator. The truck stays at the dock; this proof does not establish a simulator movement interlock, roadside relief, or a completed route.

At 60 dock minutes, on-duty headroom reaches zero while unused driving time remains 780 minutes. At 150 and 165 minutes, the same open visit yields provisional CAD50 and CAD75 using the configured 120-minute free period and CAD100 hourly rate. No exit or invoice exists at those checkpoints. Further work proposed for that driver is rejected without changing assignments or proposals. A separately eligible driver for the next open load is reviewed and approved by the dispatcher, then accepted in a separate responsive driver session. This is a new-load assignment, not a claim that an already committed load was rescued by an automated handoff.

## Reproduction

Use PostgreSQL55432, the updated local API4010, independent simulator4020 and existing Valhalla-backed optimizer4040. No new cloud resources are required.

```bash
OPTIMIZER_URL=http://127.0.0.1:4040 node scripts/verify-dock-hos.ts
VITE_AUTH_MODE=local-demo VITE_API_URL=http://127.0.0.1:4010 npm run build --workspace @roadstar/web -- --outDir ../../data/slowdown-web
# Serve that compiled output from apps/web on 5184, then:
node scripts/verify-dock-hos-ui.mjs
```

The preparation script refuses to replace an existing ignored `data/dock-hos-fixture.json`. Preserve that pointer and simulator checkpoint for review; archive explicitly before creating another independent fixture. `node scripts/verify-dock-hos.ts resume` continues an incomplete retained run without re-emitting completed checkpoints. The browser verifier performs real approval and acceptance commands and is intended for a newly prepared fixture, not repeated approval of an already accepted trip.

Focused tests cover two-hour/free-time boundaries, amount growth, duplicate idempotency, no invoice creation, role/carrier isolation, exact freshness threshold, uncertain GPS and late-evidence holds. The full 104-test backend suite passes with real routing enabled; API and web TypeScript checks and the compiled web build pass. Local UI and combined-scenario receipts are retained in `docs/evidence/dock-hos-2026-09-12/`. Hosted rollout, native parity and physical-device testing are outside this packet.

The first integration verifier read the API error code at the wrong JSON level; two bounded corrections reached `error.code`, and the same paused fixture resumed without reseeding or repeating telemetry. The browser navigation selector was corrected to include the Recovery pending-count badge. Product checks remained unchanged. Desktop and 390px source panels, approval dialog and accepted driver manifest were inspected directly. The driver screenshot retains an unfinished basemap load; it proves acceptance, not fresh mapping behavior.
