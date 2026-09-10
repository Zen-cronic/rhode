# API contract for web and native clients

Base http://127.0.0.1:4010 in local development; configure native reachable origin separately. All protected requests: Authorization Bearer <Firebase ID token>, X-Carrier-Id. Explicit local AUTH_MODE=local-demo supports tokens demo-dispatcher, demo-driver-1, demo-driver-2, demo-simulator and carrier demo-carrier; server binds loopback and refuses this mode on Cloud Run.

GET /api/state: {serverTime,cursor,scenarios,loads,assignments,resources,proposals,visits,invoices}. Load, assignment and resource records have version. Domain Load and Assignment types in packages/domain/src/index.ts. Resource has kind driver/truck/trailer plus body fields. proposals retain SQL {id,load_id,expected_version,revision,status,body}; visits and invoice records retain snake_case DB names. Driver state includes only own assignments/loads/resources; billing/proposals/scenarios omitted.
GET /api/updates?cursor=0: {cursor,changes:[{cursor,kind,recordedAt}]}. Poll every 2s while foregrounded; refresh state after changes and actions. Driver changes omit sensitive event contents.

POST commands always use Idempotency-Key UUID and If-Match integer header. Persist exactly same key/body/version when retrying. Error {error:{code,message,requestId}}. Conflict 409 means show failed/pending action and refresh; never silently change expectedVersion and replay approval.
POST /api/dispatch {loadId,driverId,truckId,trailerId}, If-Match load.version.
POST /api/propose same fields + reason?, If-Match load.version. Returns {id,revision,status,loadId,body} with proof/rejected reason; proposal creation never dispatches.
POST /api/approve {proposalId}, If-Match proposal.revision. Returns {proposalId,assignment,status}.
POST /api/respond {assignmentId,action:accept|reject}, If-Match assignment.version. Driver role only.
POST /api/work-session {action:start}, If-Match 0. Returns {id,version,status:active}. End {action:end,sessionId}, If-Match session.version. Driver only; tracking requires this explicit session.
POST /api/telemetry {id,assignmentId,sessionId?,at,position:{lat,lng},accuracyM,speedKph,odometerKm,duty,provenance}. Only accepted trips; simulator synthetic trips, driver live trips. No fabricated device GPS for synthetic trips.
POST /api/detention {visitId,contractId}, If-Match latest invoice revision or 0. Synthetic configured contract demo-ftl. Returns draft only, never invoice approval.

The routes below implement stop completion, duty events, evidence transfer, import lineage and planning. Push registration exists, but delivery is disabled until native push credentials are configured. Simulator controls belong to the independent Python process, not the operational clock. Loading/empty/offline/error states and signed-in identity selection matter. Native app must persist downloaded state and queued actions in expo-sqlite; pending/failed/synchronized labels survive app restart. Only retry network/transient failures automatically; conflicts require review.

Execution additions: GET state includes actor {role,driverId?,carrierId}, workSessions,dutyEvents,stopCompletions,disruptions,documents. POST duty {duty,at,note?}, If-Match driver resource version; POST complete-stop {assignmentId,stopId,note?}, If-Match assignment.version. POST delay {assignmentId,expectedEnd,observedAt,reason}, If-Match accepted assignment version; returns impactedLoads. GET imports and source-rows provide historical source lineage to dispatchers only. Nullable odometerKm/speedKph preserve unknown device values.
Documents: POST document {loadId,mediaType,kind,filename}, If-Match load.version registers pending upload. PUT documents/:id/content authenticates raw JPEG/PNG/PDF bytes (max12MB), If-Match document.version + stable command key; GET same path downloads authorized evidence. Stored bytes immutable by object UUID; corrections require a new revision.


## Reviews and resource holds

All commands below use the same idempotency/version headers. Dispatcher role is required.

| Command | Body | Expected version |
| --- | --- | --- |
| `POST /api/review-document` | `{documentId,fields:{billNumber,signedBy,observedDate,notes},reason}`; four fields string or null, reason at least10 characters | Document version |
| `POST /api/facility-note` | `{documentId,stopId,instructions}`; source must be reviewed and stop belong to the same load | Document version |
| `POST /api/approve-invoice` | `{invoiceId,acknowledgeObservedSamples:true,evidenceNote}`; note at least20 characters | Draft revision |
| `POST /api/maintenance` | `{action:"hold",resourceId,startAt,endAt,reason}` or `{action:"release",resourceId,holdId}` | Resource version |

Document corrections retain original source bytes, source hash and model output. Reviewed fields are separate; late worker results cannot replace human review. Invoice approval appends an approved revision, preserving its draft, and rechecks the current contract and same-stop visit evidence. It does not charge a customer. Maintenance release retains hold history.

## Routing and consolidated planning

`GET /api/route?loadId=...&truckId=...` returns actual Valhalla truck route geometry and provenance. Driver access is restricted to assigned resources. Missing dimensions, invalid input, unavailable routing and forbidden access are distinct failure states. Do not draw a straight-line fallback as a verified truck route.

`POST /api/optimize` accepts `{loadIds:[...],vehicles:[{driverId,truckId,trailerId}]}`, with expected version0. Limits are20 loads and8 vehicles; every load/resource choice must be distinct. Current consolidation uses explicitly synthetic capacity assumptions; live planning is rejected until verified pallet capacity exists. Already assigned, unsupported horizon and missing-input loads remain listed with explanations.

The result is `{id,version:1,status:"proposal",result:{routes,infeasible_loads,input_hash,routing_evidence,assumptions}}`. Each route contains `vehicle_id`, ordered `{load_id,stop:"pickup"|"delivery",minute}` stops and driving/duty minutes relative to the preserved scenario clock. Store and display assumptions alongside the plan.

`POST /api/approve-plan {planId}` uses the planning version. The API rechecks load/resource versions, current commitments, scenario clock and recomputed route-matrix/solver input hash. Approval creates assignments, one reservation set for each vehicle trip, group membership, manifests, approval evidence and notification outbox atomically.

Snapshot includes `planningRuns`, `tripGroups`, `manifests` and `stopCompletions`. A trip group body contains the ordered stops with both assignment and load IDs. `POST /api/respond` on any offered member accepts/rejects the whole group. `POST /api/complete-stop` enforces the next global manifest stop. Completing one member retains vehicle reservations until every member is complete. Same facility IDs across loads are not interchangeable; use assignment ID plus stop ID. Individual reassignment of a consolidated member is rejected with `GROUP_RECOVERY_REQUIRED`.

## Synchronization and authentication bounds

Snapshot data comes from one PostgreSQL statement for a consistent MVCC view. Independent telemetry trips use shared carrier locks; consequential commands use an exclusive carrier lock. Event insertion is serialized through transaction commit so cursor polling cannot skip a late-committing event.

Firebase revocation checks may be cached for at most10 seconds, bounded by token expiry. Carrier membership is re-read on every request. Foreground two-second polling does not guarantee delivery within two seconds: the recorded131-driver cloud burst measured approximately5.4 seconds p95 acknowledgement-to-snapshot lag.

Native clients persist immutable command keys, payloads and expected versions. Retry only transient errors automatically; conflicts require human review. Local demonstration authentication is loopback-only and forbidden on Cloud Run.
