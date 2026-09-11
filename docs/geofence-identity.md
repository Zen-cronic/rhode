# Ambiguous trip-stop arrivals

Policy `unique-possible-trip-stop-v1` holds new arrivals when a GPS accuracy disk could belong to multiple stops on the assignment's load. Candidate IDs and reason persist separately in `telemetry.geofence_evidence`; raw source body, timestamps and duplicate identity remain unchanged. Tracking coordinates and duty continue to apply. The authorized Track & Trace history shows the hold and competing stop IDs.

A later unique, confidently inside sample establishes its own arrival; it never backdates to the ambiguous sample. An existing visit still closes when confidently outside its fence, even if the same observation overlaps other stops. No arrival means no automatic visit or invoice. Boundaries use the existing strict inside/outside confidence rules.

This is a conservative hold, not a facility correction workflow. It compares stops belonging to one load; cross-assignment or grouped facility reconciliation is still unverified. Existing visits/invoices are not retroactively rewritten, and late GPS does not rebuild the visit sequence. Cloud rollout and native ambiguity display remain outstanding.

Verification on September 11:

- 75 backend tests pass, zero skips, including real PostgreSQL/PostGIS/routing; 23.315 seconds.
- Three new cases cover coincident stops, an accuracy disk touching a second stop, later unambiguous arrival without backdating, exact duplicate retention, driver ownership and closing an existing visit despite other ambiguous candidates.
- Root TypeScript and production web build pass; 14 web tests pass with two Firebase configuration skips.
- `node scripts/prepare-geofence-ui.ts` seeds a separate synthetic local carrier. `node scripts/verify-geofence-ui.mjs` checks the built local-demo artifact on port5179 against API4010. Desktop1440 and mobile390 screenshots inspected; no horizontal overflow or page errors. Map loader is pending in these captures; no new basemap proof is claimed.
- Evidence: `docs/evidence/geofence-identity-2026-09-11/verification.json` and two screenshots.

Local migration016 is applied and preview http://localhost:5174 is current. Cloud remains on its prior accepted deployment. No new resources, model usage or push.

Update September11: migration016 and reviewed late-GPS reconciliation are now deployed with the retrospective-mileage packet. The newer local visit-policy packet adds explicit boundary classifications and short-exit behavior; see [visit-session-policy.md](visit-session-policy.md). Earlier deployment/late-reconstruction limitations above describe the original packet, not the current accepted state.
