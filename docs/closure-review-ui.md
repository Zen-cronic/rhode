# Closure review interface

The dispatcher Recovery view retains the accepted third design and adds a collapsed closure review panel. Record source/time/bounds, rehearse remaining work, inspect returned geometry and toll disclosure, then explicitly approve. Unresolved reasons remain visible. Stale trip/load/resource evidence disables approval, including open dialogs; server revalidation remains authoritative. Additional closures mark earlier approvals historical. Offline commands are disabled.

The geometry is a diagram without a basemap or navigation guidance. Approval is not driver acknowledgement or simulator adoption; those remain outstanding. This packet is local, not deployed.

## Verification

With local API4010/PostgreSQL55432/optimizer4040/Valhalla48002 running, run `node scripts/prepare-closure-ui.ts` from the project root. This creates a fresh synthetic carrier and writes its identity to `/tmp/roadstar-closure-ui-fixture.json`. Build with `VITE_AUTH_MODE=local-demo VITE_API_URL='' npm exec --workspace=@roadstar/web -- vite build --outDir /tmp/roadstar-closure-built`; serve using Vite preview port5178 and that outDir. Run `node scripts/verify-closure-ui.mjs`. Each full rerun requires a fresh fixture.

The browser performs actual report/rehearse/approve actions; one direct synthetic GPS injection verifies stale-dialog protection. It checks explicit acknowledgement, blocked-terminal unresolved state, historical approval coverage and offline disabling. Dated evidence is in `docs/evidence/closure-ui-2026-09-11/`. Screenshots were directly inspected at desktop and390px widths. Initial test-build authentication/CORS configuration errors were repaired before operational mutations. No provider push, native closure adoption or cloud proof is claimed.
