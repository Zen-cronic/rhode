# Public matched Highway 401 replay

The public replay is a credential-free view over the same static synthetic archive used by the authenticated Recovery panel. It renders through the shared RoadStar comparison component and has no operational API access.

Run the verifier against a compiled local build:

```bash
node scripts/verify-public-401-replay.mjs
```

Run it against the hosted preview:

```bash
WEB_BASE=https://roadstar-web-739889188415.us-central1.run.app node scripts/verify-public-401-replay.mjs
```

The verifier checks desktop and 390 px rendering, matched metrics, archive byte identity, offline inspection after loading, absence of authentication fields, and zero operational API requests or writes. This is deterministic synthetic evidence rather than live traffic, operational telemetry, certified GPS or billing authority.

Hosted verification passed on web revision `roadstar-web-00066-kig` at 100% traffic. The verifier loaded exactly one static replay archive, made no `/api/` request, issued no write, and reported no browser error. See `hosted-verification.json`, `hosted-desktop.png` and `hosted-narrow.png`.
