# Public dock evidence verification

The credential-free `/?view=dock-evidence` page was verified against a compiled production build on September 12, 2026.

Run:

```bash
WEB_BASE=http://127.0.0.1:5187 node scripts/verify-public-dock-evidence.mjs
```

The verifier exercises all five milestones, D-01's exact 417 driving / 40 on-duty / 340 elapsed minutes remaining, the next assignment's 99 driving + 45 service = 144 on-duty requirement, the 10,201-observation retained duty basis, explicit London/Milton scenario separation, the editable deadhead-cost scenario, the diagram fallback, a 390 px viewport, and continued milestone inspection after the browser goes offline. It fails on any operational API request, any non-read network request, any browser error, or horizontal overflow.

The public receipt is the London 165-minute / 45 billable-minute / CAD 75 scenario. The film separately uses a Milton 167 / 47 / CAD 78.33 billing example; their values are never combined.

The page is a read-only retained synthetic fixture. Its observations are not certified geofence crossings, its 3D scene is schematic, its Canadian HOS figures are planning gates rather than ELD certification, and its value model is an explicitly bounded scenario rather than measured commercial value.
