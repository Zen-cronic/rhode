# Route egress and detention departure evidence

RoadStar's simulator may retain routed road geometry after the final service location. The truck completes its dock dwell at the final service stop, then follows that retained geometry until the route endpoint. This produces a real outside GPS observation for the operational geofence processor instead of treating a stop-completion action as a departure timestamp.

## Simulator contract

`POST /runs` accepts optional `service_location_ordinals`, an ordered unique list of indices into the Valhalla request's location sequence. It must start at `0`, identify at least two routed locations and stay within the routed location bounds. The selected locations become service stops; any later routed locations form road egress. When the field is omitted, every routed location remains a service stop, preserving existing requests.

`route_location_indices` in the response maps each routed location to its coordinate index. `stop_indices` contains the selected service-stop coordinate indices. `route_egress` is true when the final service stop precedes the final route coordinate.

After the final service dwell, replay phase returns to `driving` and reaches `route_complete` only at the end of all retained geometry. Dwell remains `on_duty`. The initial conditions already include the route coordinates and stop indices, so reset/replay fingerprints cover the egress without changing historical run identifiers.

## Verified operational lifecycle

The local synthetic London run used an actual Valhalla route through a pickup, `london-dock`, and a post-service egress point. The driver accepted the assignment before motion. The simulator delivered 7,801 acknowledged one-second observations through the operational API and PostgreSQL.

- The destination visit arrived at `2026-09-13T12:32:47.000Z` and closed at the confident outside observation at `2026-09-13T14:34:16.000Z`.
- The visit points to the exact arrival and departure event IDs. The departure ID maps to an operational geofence state of `outside` and to the retained source event's `driving` phase.
- The 121-minute observed visit produced one automatic CAD draft under the bound `demo-ftl` terms: 120 free minutes, one billable minute, CAD $1.67. It remains a review-required draft; this is neither an approved invoice nor collected revenue.
- No stop-completion action supplied the billing timestamp.

Resetting the same run reproduced the exact 7,801-event SHA-256 hash `ec44ba2a74ca526c6cc15a38530c6ac608558247caee755996ad4d9b9008c724`. Reprocessing left telemetry, visits, invoice revisions, assignments, reservations, disruptions, approvals, resources, loads, scenarios, duty events, stop completions and the carrier event ledger byte-equivalent, with operational snapshot hash `7b02425a07430fb83d17db760685a028adb25af197d9d10ec3b495bd3e7abe00`.

Evidence is in `docs/evidence/route-egress-2026-09-12/verification.json`. Reproduce the initial isolated fixture with `node scripts/verify-route-egress.ts`; it intentionally refuses to overwrite the retained local pointer. Reproduce idempotent consumption of that fixture with `node scripts/verify-route-egress-replay.ts` while PostgreSQL 55432, API 4010, optimizer 4040, simulator 4020 and Valhalla access are running.

This proof uses synthetic locations, terms and seeded road speeds. Geofence times are received GPS samples with explicit accuracy handling, not certified physical dock times. Same-run replay proves deterministic, idempotent consumption; it is not an independent counterfactual comparison.
