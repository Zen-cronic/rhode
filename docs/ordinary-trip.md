# Ordinary accepted trip — S01

Accepted packet: PB-RS-ORDINARY-TRIP-20260912. One retained synthetic London trip now has a same-fixture browser receipt across the driver manifest, dispatcher tracking and the evidence ledger.

Driver D-01 accepted RS-1042 before movement. The independent simulator then emitted 7,801 one-second observations over actual Valhalla truck geometry. PostgreSQL contains 7,801 distinct telemetry IDs for the assignment, with observed speed ranging from 0 to 68.6 km/h and odometer movement from 0 to 4.436 km. The dispatcher mileage report includes every retained observation; the breadcrumb view renders the most recent 500 recorded coordinates with their speed, odometer and GPS accuracy.

The same assignment has a completed `london-dock` destination visit. Arrival and departure retain their exact source observation IDs. The 121-minute visit creates a review-required CAD $1.67 draft under the bound FTL terms: 120 free minutes and one billable minute. The invoice remains a draft and the assignment remains accepted. A completed facility visit, driver acceptance and stop-completion are separate records.

## Reproduce

Run PostgreSQL on 55432, the local API on 4010 and the built web on 5185. The retained route-egress carrier must still exist in PostgreSQL.

```bash
node scripts/verify-ordinary-trip-ui.mjs
```

The verifier is read-only. It opens independent 1440px dispatcher and 390px driver contexts, checks the same assignment through both identities, captures tracking/mileage and billing, and compares the browser-visible records with PostgreSQL and the route-egress receipt.

Evidence is in `docs/evidence/ordinary-trip-2026-09-12/`: accepted driver manifest, complete-trip mileage, breadcrumb trail, destination visit and detention draft, plus `verification.json` with exact record IDs and measurements.

## Limits

This uses the local built responsive web, API and PostgreSQL over a retained synthetic London route. It is responsive driver evidence rather than native-device verification. Valhalla routing and deterministic replay are linked from the prior route-egress receipt. GPS samples are observations with recorded accuracy, not certified physical boundary crossings. RoadStar is not represented as a certified ELD. The detention revision is neither approved nor collected revenue.
