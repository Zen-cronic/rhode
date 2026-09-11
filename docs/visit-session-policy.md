# Visit sessions, boundary jitter and short exits

Accepted local implementation, September 11, 2026. Policy `confidence-disk-split-v1` names the existing accuracy-disk behavior and makes its billing implications explicit.

An observation establishes arrival only when its complete reported accuracy disk is strictly inside one unambiguous trip-stop fence. A disk touching or straddling the fence holds the prior visit state. A confidently outside observation closes the visit at its own sample time. A later confident arrival starts a separate visit, even one minute later. There is no exit grace period or automatic merge. The configured free-time allowance applies separately to each observed visit. Dispatchers must check that this supported rule matches their shipment terms; other session/aggregation terms are not implemented.

This is an observation policy, not an assertion of exact physical dock times. Accuracy is source-reported. A wrong location with overstated confidence can still create a false crossing. Missing signals do not establish a departure, and no boundary timestamp is inferred or backdated. Automatic drafts require separate dispatcher approval.

## Retained evidence and implementation

- Shared `fenceConfidence` applies the same strict inside/outside tests in ingest and occurrence-ordered reconciliation. Invalid or >100m accuracy is uncertain. Multi-stop identity ambiguity still prevents new arrivals.
- Migration018 names the existing rule in `stop_visits.session_policy`. It does not change visit IDs, timestamps, source records or invoice revisions and does not recertify historical GPS quality.
- New applied telemetry retains each stop's distance, radius and confidence classification in derived `geofence_evidence`, separate from immutable source bodies. Historical observations are not rewritten. The selected Track & Trace sample shows this evidence, including boundary holds.
- New invoice drafts snapshot the visit-session rule and per-visit free-time scope. Prior invoice bodies remain unchanged. Reconciliation includes the rule in its fingerprint and retained review evidence.
- Evidence & billing explains short-exit splitting. Each invoice identifies its observed visit timestamps; the approval dialog repeats the rule. Historical revisions without a stored rule say so.

## Verification

Four focused tests in `tests/visit-session-policy.test.ts` cover strict equality at the fence and invalid inputs; 24 repeated jitter observations with duplicate delivery, one visit and one 45-minute draft; valid late jitter reconciled without changing visit/invoice IDs; a one-minute confident exit/re-entry producing two150-minute visits and two30-minute drafts; and no inferred arrival before the first confident fix. Existing overlap and reviewed reconciliation cases also pass (13 focused cases total).

Full backend suite:89pass,0skip,24.32seconds. Web:14pass,two Firebase-configuration skips. Root/web/mobile TypeScript and built web pass. Initial test callback typing and screenshot selector were corrected before acceptance; no product checks weakened.

`node scripts/prepare-visit-policy.ts` creates a separate synthetic fixture. `node scripts/verify-visit-policy-ui.mjs` verifies the actual local-demo production build on5179 against API4010. Desktop1440 and mobile390 evidence shows two separate150-minute visits and two$50drafts, explicit per-visit free time, the jitter confidence detail and the approval rule. Five captures inspected; no horizontal overflow or page errors. Map rendering is outside these captures and is not claimed as new evidence.

Evidence: `docs/evidence/visit-policy-2026-09-11/verification.json` and adjacent images. Current test carrier `visit-policy-abd3256a-1266-4827-bf8d-cddc45f4e238`. Local preview http://localhost:5174 is current. Migration018 is local only; cloud API00020-mxh/web00033-84x/documents00010-d4d/optimizer00007-lhb remain unchanged. Native policy UI, configurable grace/aggregation and manual source-conflict corrections are not part of this packet. Physical Android/iOS remain deferred. No new resources, model usage or push.

Update September11: reviewed stored-document corrections are now implemented locally in [visit-time-review.md](visit-time-review.md). The original packet limitations above are retained as dated scope; migration018 is still awaiting cloud deployment.
