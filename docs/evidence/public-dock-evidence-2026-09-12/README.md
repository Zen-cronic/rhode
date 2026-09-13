# Public dock evidence verification

The credential-free `/?view=dock-evidence` page was verified against a compiled production build on September 12, 2026.

Run:

```bash
WEB_BASE=http://127.0.0.1:5187 node scripts/verify-public-dock-evidence.mjs
```

The verifier exercises all five milestones, the editable deadhead-cost scenario, the diagram fallback, a 390 px viewport, and continued milestone inspection after the browser goes offline. It fails on any operational API request, any non-read network request, any browser error, or horizontal overflow.

The page is a read-only retained synthetic fixture. Its observations are not certified geofence crossings, its 3D scene is schematic, its Canadian HOS figures are planning gates rather than ELD certification, and its value model is an explicitly bounded scenario rather than measured commercial value.
