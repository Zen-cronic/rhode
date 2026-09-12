# 3D dock recovery rehearsal

RoadStar now has a procedural Three.js/React Three Fiber dock scene inside the local Recovery simulation studio. It shows the selected run's acknowledged phase and current source-backed driver/detention evidence. The facility, vehicle placement and fence are explicitly illustrative; no surveyed bay, queue position or physical boundary is inferred from the miniature.

## Preview

Open http://localhost:5174, select local identity `demo-dispatcher` and carrier `dock-hos-df041d1c-3788-4844-80b5-536be3e04872`. In Recovery, expand “Simulation studio · local synthetic runs”, select run `b86cc7dd-bd80-470a-bf19-b31f6c471e40` and open the3D dock rehearsal. The preserved scenario has9,901acknowledged observations,165observed dock minutes, zero on-duty headroom despite780driving minutes remaining, and a source-backed provisionalCAD75estimate. Its separately approved/accepted next open-load assignment remains in operational history. The scene does not perform a new dispatch or claim automatic roadside relief.

Overview, Dock and Plan cameras frame the same scene. Truck/dock/fence selection has ordinary button alternatives; keyboard activation and reduced motion work. The on-duty hold appears beside the truck. Evidence tabs show the original source IDs, dated observations and configured detention terms. Full source identifiers are disclosed on request. Diagram mode remains available and WebGL context loss returns to it.

## Integrity and implementation

`dock-rehearsal-model.ts` binds actor/carrier, synthetic assignment, acknowledged sample ID/time and current same-visit estimate. Generated-ahead phase never drives the scene. Incomplete HOS inputs remain unavailable; held or mismatched evidence cannot produce a billable amount. Rendering uses server amounts without recalculation. The scene never advances time or writes operational records. The current-evidence query refreshes every2seconds independently of event-cursor changes; offline values stay explicitly saved and dated. There is no historical scrubber mixing old positions with current HOS/billing.

`DockScene.tsx` contains only authored primitives, lights, finite camera easing and selection. No external model/texture service is used. The scene is lazy-loaded, uses demand rendering and capped1.5DPR, and unmounts when closed. Local build scene chunk is approximately917KB/247KBgzip; it is absent until explicitly opened. React/ReactDOM19.1.0, Fiber9.7.0 and Three/types0.186.0 are pinned. R3F's current peer range excludesReact19.3, which the prior web caret could resolve to; the compatible installed React19.1line was retained. No forced peer resolution or native Expo upgrade.

## Verification, September12

- Four source projection tests pass: acknowledged vs generated phase, source totals, scope, held/missing evidence and incomplete HOS.
- Web/root TypeScript and compiled Vite build pass. Existing50mobile tests and three web route-evidence tests pass. Two Firebase auth lifecycle tests were skipped because their required environment was absent; they are not claimed as new auth verification.
- Actual built Chrome1440/390width renders, three cameras, selected evidence, no horizontal overflow, dated offline values, manual diagram and real `WEBGL_lose_context` fallback pass. The held case is an explicitly intercepted browser response, not a changed operational record.
- API readback confirms assignments, visits, proposals, invoices and acknowledged event count unchanged by all scene interactions.
- Scene chunk is absent before opening and reused after close/reopen; canvas unmounts on close. Keyboard camera activation with reduced motion and actual local5174render pass. The long-running Vite process required reoptimization after dependency installation; the API and simulator remained running.
- Designer independently tested object picking, context-loss callback and zero animation frames during a400msidle interval in its isolated scene. This is not a131vehicle or physical-GPU performance benchmark.

Evidence: `docs/evidence/3d-dock-2026-09-12/{verification,lifecycle,artifact,visual-review}.json` and PNGs. Three fresh-context visual assessments informed two refinements; the9/10subjective target was not reached. Final readability fixes were rendered after the third assessment, so the final artifact has no independent score and design status remainsNEEDS_REVISION. Functional verification does not imply full design completion. The accepted third product design remains intact.

## Remaining 3D work

Complete corridor/replay playback, historical milestone projection, synchronized baseline/recovery comparison, and hosted simulation transport remain subsequent packets. This first scene is local and current-snapshot based. Existing Google Maps/Satellite remains the geographic inspection surface. The current cloud preview is unchanged; no new persistent resource or model-generation usage was required. Physical Android/nativeiOS verification remains deferred.
