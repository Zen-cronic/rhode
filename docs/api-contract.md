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

Not implemented yet: stop completion, duty event command, file transfer, importer viewer, optimizer, simulator controls, cloud push. Do not create fake working buttons for these. Coordinate additions with root. Loading/empty/offline/error states and signed-in identity selection matter. Native app must persist downloaded state and queued actions in expo-sqlite; pending/failed/synchronized labels survive app restart. Only retry network/transient failures automatically; conflicts require review.
