# Recorded 3D corridor replay

Status: functionally accepted on September 12, 2026. Visual assessment: `VISUAL_NEEDS_REVISION`, 8.0/10 after the allowed initial critique and two reassessments.

RoadStar's recorded corridor is a view-only instrument over an API-acknowledged simulator run. It assembles the exact retained observations in frozen, fingerprinted pages; binds every event to the route epoch that generated it; and renders the selected observation as a procedural truck on the retained Valhalla geometry. The replay cursor never changes simulator time, HOS, assignments, approvals, reservations, invoices, or detention evidence.

The dispatcher can switch between perspective, plan and manual diagram views; play the historical cursor at 30x, 60x or 120x; select origin, first movement or latest; and move to an exact event through the range input, Home, End and arrow keys. Reduced-motion mode disables automatic playback. The exact observation ID, route key, recording fingerprint, assignment and run remain available in the source disclosure.

The browser discards all partial pages if a continuation fingerprint changes. A changed run event count or conditions hash clears the displayed recording and starts again at page zero. A completed recording remains usable after a connection loss and is labeled as saved history; offline-before-load, empty, API-error, WebGL-loss and manual-diagram states remain explicit.

The simulator validates every displayed source field before freezing a recording. The first request validates, copies and fingerprints the source; later bounded pages slice a cached immutable projection. `save_run` invalidates the cache before every durable simulator mutation. Against the preserved 10,201-event run, the local first 1,000-event page took 267 ms and the next cached page took 55 ms. These are local observations rather than capacity claims.

## Acceptance evidence

- [verification.json](evidence/3d-corridor-2026-09-12/verification.json) records 10,201 assembled source events, a 77-coordinate retained route, zero operational writes, zero page errors and unchanged operational/simulator state.
- [origin perspective](evidence/3d-corridor-2026-09-12/origin-perspective-desktop.png) and [movement perspective](evidence/3d-corridor-2026-09-12/movement-perspective-desktop.png) show the exact origin and first-motion observations in the built artifact.
- [narrow event view](evidence/3d-corridor-2026-09-12/event-narrow.png) verifies the 390 px composition without document overflow.
- [epoch switch](evidence/3d-corridor-2026-09-12/epoch-switch-narrow.png) uses a labeled two-epoch browser fixture to prove that the React renderer selects the new route at the exact cursor boundary. Deterministic route-event identity is separately tested against the simulator service.
- Loading, saved-offline, diagram, WebGL context-loss, continuation-conflict and empty-source screenshots live in the same evidence directory.

Verification passed:

```text
npm run typecheck
node --test apps/web/tests/corridor-replay.test.ts apps/web/tests/dock-rehearsal.test.ts
poetry run pytest -q                                      # 67 passed
TEST_DATABASE_URL=... node --test tests/simulator-controls.test.ts  # 2 passed
VITE_AUTH_MODE=local-demo VITE_API_URL=http://127.0.0.1:4010 npm run build --workspace @roadstar/web -- --outDir ../../data/slowdown-web --emptyOutDir
node scripts/verify-corridor-replay-ui.mjs                 # 10,201 events; 0 writes; 0 errors
```

The renderer is lazy-loaded only after the user opens the replay. Its corridor chunk is 5.94 kB minified and 2.48 kB gzip; the existing shared React Three Fiber vendor chunk remains separate. Route geometry and rail instance matrices are memoized by route key, while cursor changes update only the truck marker and camera target.

The final screenshot-only critic scored the surface 8.0/10. It found a distinctive and consistent Precision transport system and unusually disciplined desktop-to-narrow restructuring. Remaining visual work is higher-detail route/vehicle and restrained geographic context, larger provenance microcopy, and clearer weighting within the dense narrow playback controls. Functional and accessibility evidence does not depend on the visual score.

## Limits

The evidence uses a local synthetic recording and software WebGL. Browser fixtures cover inventory revision, partial-page conflict, the second route epoch and the empty source state. No physical GPU, hosted 3D deployment, native 3D surface, certified GPS, billing timestamp, physical Android device or iOS runtime is claimed. Current HOS and detention values remain in their operational evidence surfaces and are intentionally absent from the historical cursor.
