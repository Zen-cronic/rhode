# RoadStar build checkpoint

Updated: 2026-09-10. Status: AUTHENTICATED_CLOUD_PREVIEW; FULL_PLATFORM_BUILD_IN_PROGRESS.
Current accepted state: authenticated GCP preview, actual Ontario truck routing, OR-Tools consolidated dispatch, atomic reservations, web/native recovery and ordered execution, source-linked document/facility/detention review, and role-scoped tracking history. Backend22 tests pass (one real-road test opt-in), separately enabled real-road consolidated/backhaul check passes; Python7; native23. Web cloud planning and tracking, Android API35 offline termination/reconnect and complete four-stop consolidated execution passed. Physical Android/native iOS explicitly deferred.
Branch: build/roadstar-platform. Local preview http://localhost:5174 (Demo dispatcher, demo-carrier); API4010 and optimizer4040. Visible Chrome and Android emulator remain open.
Cloud: https://roadstar-web-739889188415.us-central1.run.app ; API00010-t58, web00008-mxq.
Four-minute film and editable13-slide deck/PDF complete and publicly served under /demo/. Ten-field local draft prepared. Source repository publication requires explicit approval after automatic review rejected public GitHub egress; no remote exists. Final submission remains separate. Recorded audio transcript checked, human listening pending.

## Authorized objective

Build the complete all-in-one RoadStar platform end to end in this repository; then run demo-director, prepare submission-devpost against the custom RoadStar portal, and prepare the in-person finale demo. Preserve fleet/load matching/dispatch, routing/optimization, driver scheduling, driver/dispatcher apps, integrations, separated simulation, satellite mapping and auditable detention billing.

Approved stack: React dispatcher web + Expo driver/dispatcher Android/iOS, shared TypeScript domain/API, Fastify, dedicated Cloud SQL PostgreSQL/PostGIS, Python OR-Tools, Valhalla VM, Firebase, Cloud Tasks/Storage and Vertex. User implementation-plan instruction supersedes previous pause and stack question. Jammi inspected: shared KMP targets Android/iOS/desktop, no web target; recorded iOS proof remains pending in its checkpoint. No Jammi code copied.

## Task graph and required proof

1. Persistent core/API: reservations, version checks, acceptance, telemetry dedup/order, geofences/detention, HOS and capacity screening. Packet 001 in progress.
2. Workbook importer: all five sheets, string IDs, duplicated rows, null/sentinel normalization, source-row lineage, quarantine; imported historical records never relabeled live. Actual-data path must be verified locally.
3. Routing/optimization: Southern Ontario road geometry, supported truck constraints, backhauls and LTL grouping; schedule conflict propagation and feasible recovery; unknown axle/routing evidence visible.
4. Independent simulator: separate process with routes, driver duty, speeds/odometer, dock waits, deterministic pause/reset/replay and duplicate/out-of-order cases.
5. Design-direction before UI: grounded brief; dispatcher map/satellite, load/driver/schedule views, exception explanation, trace and detention evidence. Inspect built artifact in browser at desktop/mobile widths, loading/empty/error/success/recovery states.
6. Expo driver: Android/iOS native surfaces plus accessible web route, accept/reject assignment, route/stops, duty logs, offline retry with no duplicated events. Native bundle and actual runtime/device proof required; source presence does not establish iOS/Android success.
7. Integrations: import + scoped adapter endpoints for TMS/ELD/telemetry, authentication/role boundaries, observability, docs. Show fixture versus live adapter clearly.
8. Stable preview: persistent always-on backend, protected writes, shareable web and driver preview. Production release is separate from authorized preview.
9. Demo-director: verified 3–5 minute film, target 4 minutes; actual app recordings, narration, export/probe and visual/audio verification. No fabricated runtime claims.
10. In-person finale: 10–15 minute presentation, rehearsed two-screen/phone handoff, local replay, offline video/deck, setup and Q&A plan. Venue Sept 13 SPUR, Waterloo; noon setup, 2 PM presentations. Operator attendance not yet personally confirmed.
11. Submission-devpost Draft mode: all ten actual portal fields, plain text, actual URLs/evidence, counts/unknown limits; no generic Markdown Story template. Deck/video URLs and final submission remain unverified until produced. Final submit requires explicit operator action.

## Open dependencies and gates

- Official noon/2 PM deadline and missing rubric 5% remain unresolved. Build authorized by user; no claim that organizer clarified them. Prepare by noon.
- Restricted Google web/Android Maps keys and actual road/satellite rendering verified. iOS native Maps remains unverified.
- Full terms/pre-existing code/data publication unknown. Write new code; keep source workbook private to local import and use labeled synthetic fixtures for public preview until publication permission is established.
- User has no Android phone, iPhone or Mac/Xcode available and explicitly deferred physical-device testing. API35 x86_64 Android emulator installed and running; runtime verification in progress. Do not claim physical background-location reliability or native iOS verification.
- User approved US$85 estimated seven-day preview in new roadstar-2026-kzh project on My Billing Account, and reiterated approval based on GCP credits. No organizer messages or final submission authorized.

## Ledger

- 001: initialized repository and recorded complete task graph. Implementation/verification pending.

## September 10 accepted packet PB-RS-002

- SQLite spike preserved at c35fdef. Server now requires DATABASE_URL. Migrations use checksums and transaction/advisory locking. PostgreSQL exclusion constraints enforce driver/truck/trailer/dock reservations.
- Fastify API: carrier membership, dispatcher approvals, driver responses, command idempotency/version checks, cursor invalidations, explicit work sessions, telemetry dedup/order/accuracy handling, same-stop detention drafts against configured terms. Recovery supersedes and offers atomically; driver notifications currently queued in outbox, not delivered.
- Verification: npm run typecheck passes; TEST_DATABASE_URL=postgresql://roadstar:local-roadstar-only@127.0.0.1:55432/roadstar NODE_ENV=test npm run test:integration passes 9/9 against postgis/postgis:16-3.5. Local database: docker compose -p roadstar -f infra/compose.yaml up -d --wait. Credentials are local fixture values only.
- Operational truth uses real server recorded_at; synthetic clock isolated in scenarios and never advanced by telemetry. Remaining limitations: straight-line screening until Valhalla; full recovery risk propagation/optimizer/simulator, import, actual document/cloud jobs, mobile offline/device proof and web all pending. Firebase code present but live token verification not tested.
- Local Docker/GCP auth verified. Cloud/model spend $0. No resources provisioned or customer data published. Need concrete cost approval plus target GCP project before provisioning. Native Android SDK is present; no physical-device or iOS proof.
- Design brief and current API contract in docs/design-direction.md and docs/api-contract.md; design execution can now proceed.

## September 10 cloud and execution packet PB-RS-003 (in progress)

- Cloud approval: US$85 estimated seven-day preview; not a billing cap. Dedicated project roadstar-2026-kzh (739889188415), billing linked. Terraform reviewed 42 additions / 0 changes / 0 destruction; apply in progress. State/plans/credentials ignored. `infra/gcp/cost-estimate.md` holds estimate and assumptions.
- Backend: 14 integration checks pass, including delay propagation, ordered stop completion, document content/idempotency, roles and all four resource exclusion types. Separate document worker and internal lease/result endpoints recently added; their new checks still pending.
- Imported all five private workbook sheets: 15,197 rows, 82 exact duplicate dispatch rows; historical sources stay in isolated local private-import carrier. Public cloud seed must contain synthetic data only. `docs/evidence/workbook-import.json`.
- Web: real browser delay → proposal → dispatcher approval → driver acceptance; stale proposal conflict and PNG upload/download verified. Responsive/offline screenshots exist in /tmp awaiting evidence copy.
- Mobile: driver/dispatcher, persistent SQLite drafts/actions/documents, consented session-bound background tracking, push registration. Nine persistence/policy checks, typecheck, both Hermes platform exports pass. Android native development APK compilation underway. No physical device attached, no iOS native build proof.
- Optimization: real OR-Tools standalone worker supports capacity/pickup-delivery/time windows/equipment/duty budgets/FTL separation/LTL; five Python tests pass including deterministic route replay. Operational API integration with real Valhalla still pending; current approval uses explicitly modeled distance screening.
- Local 131-driver burst: 524 telemetry and 524 synchronization pairs, zero failures; telemetry p95 1,800ms, synchronization p95 309ms, own-commit-to-snapshot lag p95 2,064ms. Local fixture benchmark, not Cloud SQL capacity proof. `docs/evidence/load-test-131.json`.
- Cloud work next: finish infrastructure, actual Ontario routing tiles, Firebase identities/Maps restrictions, build/push/deploy services, migrate synthetic cloud database, verify authenticated hero journey and task worker.
- Scope still open: actual route matrices integrated into approvals/optimizer/UI, reviewed facility/document corrections, invoice approval/revisions, native phone proof, cloud load measurements, complete demo/deck/submission artifacts. Do not claim complete platform.

## Cloud verification update (September10, ~20:15UTC)

- Infrastructure provisioned; web/API/private optimizer/document worker deployed, synthetic Cloud SQL seed and real Firebase sign-in verified. `infra/gcp/README.md` inventories resources and expiry.
- Cloud browser recovery + satellite passed. Cross-tab Firebase logout bug reproduced; web worker fixing it before final redeploy.
- Actual synthetic PDF extraction pipeline passed with Gemini2.5Flash; source hash retained and fields unreviewed. New global300-attempt guard deployed.
- Standalone ARM64 Android APK built with embedded Hermes/config, development certificate; no Metro dependency. Native device checks and iOS native compilation still pending.
- Sixteen PostgreSQL/import tests pass, including leases/idempotency and incomplete-driver membership rejection.
- Actual road integration code added: required dimensions/evidence, private optimizer calls, route cache/provenance, route travel-time screening; live dispatch refuses missing routing. Ontario graph compiling; this new path still awaits real route verification.
- One-time stop tasks scheduled Sept17 20:00UTC for routing/SQL compute; storage retained/billable.

## September10 local preview and emulator update (~21:05UTC)

- User requested Android emulator instead of unavailable physical phones, and local app launch. Official emulator/API35 Google APIs x86_64 installed with existing SDK licenses; KVM usable. Development-signed standalone app launched without Metro and signed into isolated emulator-demo. Native runtime bugs discovered in SQLite handle concurrency, session persistence and Android insets are being repaired and retested.
- Local web refreshed at http://localhost:5174 with synthetic demo authentication and restricted Maps key. API4010 migrated/current, actual routing via local optimizer4040 and IAP tunnel48002. HTTP web/API checks passed; rendered verification pending. Keep these processes running for user preview.
- Cloud API revision00008 includes planning/group commands. Real Valhalla/OR-Tools integration verifies two LTL loads in one manifest, one set of three resource reservations, stale/idempotent approval, whole-manifest acceptance, enforced stop order and final release. Web planning deployment/isolated cloud verification in progress.
- Cloud131-driver burst:524 telemetry +524 synchronization pairs, zero failures; latest telemetry p95 3053ms, sync p95 4075ms, own-ack-to-snapshot lag p95 5448ms. Does not meet a2s end-to-end target under this burst; barrier/warm-data assumptions recorded with artifacts. SQL observed CPU max8.53%, memory50.99%, connections max40. No production capacity claim.
- Human document review/source-linked facility instructions, observed-sample detention approval preserving draft, and maintenance hold/release verified in actual cloud browser. Original private workbook stays local.
- Remaining: complete emulator runtime checks, verify planning UI in cloud, native grouped-manifest UI, reproducible deployment/docs, demo film/deck/ten-field submission draft, broader acceptance gaps. Physical phone/iOS testing deferred, final submission remains separate.

## Accepted checkpoint September10 21:40UTC

- Real Android API35 KVM emulator: encrypted sign-in/cache/draft/idempotency command survive offline force-stop and relaunch; reconnect creates one accepted assignment. Dispatcher recovery → receiving driver acceptance passed. Separate two-LTL plan approved, whole manifest accepted and four ordered stops completed; all command versions synchronized. Final emulator remains visible on emulator-demo D02 accepted route. See docs/evidence/android-*.json and apps/mobile/README.md. No physical background/camera/push or iOS runtime proof.
- Tracking API paginates immutable sampled/received timestamps and disposition with carrier/role scope. Web keeps null measurements unknown, breaks uncertain/out-of-order trail segments and retains downloaded history offline. Cloud dispatcher/own-driver checks pass.
- Cloud load benchmark remains about5.4s p95 acknowledgement-to-snapshot lag; zero failed commands across524 telemetry/snapshot pairs. Not a2s end-to-end guarantee.
- Demo240.096s H264/AAC, captions,13-slide deck with speaker notes and PDF verified. Direct video/PDF URLs200. Public host acceptance and live portal limits remain unverified. Human listening/live rehearsal pending.
- Source publication to Zen-cronic/roadstar was rejected by automatic approval review for missing explicit public-source authorization. No repository created; prepare final commit and request permission. Source data, passwords and generated native signing material excluded.
- Local browser/API healthy21:39UTC. Keep all user preview processes and emulator running.

Later TODOs: physical Android/background/camera and native iOS verification; real push provider setup; verified live capacity/HOS inputs; full consolidated-trip recovery and combined route display; commercial TMS/ELD connectors; self-serve fleet billing/onboarding and owner-operator mode; ClickHouse only after measured need. RevenueCat eligibility/rights remains a separate later decision.
