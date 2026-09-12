# RoadStar seven-day GCP preview

Provisioned September 10, 2026 under explicit US$85 estimated seven-day approval. Existing billing credits do not make this a hard cap. Project `roadstar-2026-kzh` (739889188415), billing account “My Billing Account”. No Cargo Release resources or data reused.

- Web: https://roadstar-web-739889188415.us-central1.run.app
- API: https://roadstar-api-739889188415.us-central1.run.app
- Private optimizer: https://roadstar-optimizer-739889188415.us-central1.run.app
- Private document worker: https://roadstar-documents-739889188415.us-central1.run.app
- Dedicated PostgreSQL16: `roadstar-postgres16`, connection `roadstar-2026-kzh:us-central1:roadstar-postgres16`, PostGIS/btree_gist; secret `roadstar-database-url`.
- Private files: `gs://roadstar-2026-kzh-roadstar-documents`. Synthetic demonstration only.
- Routing VM: `roadstar-valhalla`, us-central1-a, private 10.42.0.2:8002, e2-standard-4, persistent 100GB tiles. SSH through IAP; no public routing ingress.
- Valhalla image: `ghcr.io/valhalla/valhalla-scripted@sha256:6c5a521b76c3b6e2ae4797964572d4ec0f1ae778e4ff37de513ddef828a43c74` (3.8.3). Ontario source `ontario-260909.osm.pbf`, SHA256 `b853e364f7af75ed5b6cb5ebbd6e41735b7209eb59aa3acfe5598349389ca8d9`. Ontario tiles are built and serving. Verified Milton–London route:138.882km, about98 minutes,864 coordinates with the supplied synthetic dimensions. No live traffic feed is configured.
- Firebase email/password with four synthetic app identities. Operator-only credentials: ignored `data/preview-credentials.json`, mode0600. Never publish that file. Server memberships, not client roles, authorize operations.
- Separate Maps web referrer and Android package/certificate restrictions. Public client identifiers in ignored app `.env.production`; Firebase key is a public app identifier, not an admin credential.
- Cloud Tasks `roadstar-jobs`, Scheduler `roadstar-recover-jobs` every minute, OIDC identities on worker/API internal endpoints. Global extraction allowance <=300 attempts, <=10,000 input tokens +1,000 output tokens per attempt. No automatic approval of extraction/billing.

## Expiry

One-time Cloud Tasks in queue `roadstar-expiry` are scheduled for **September17 20:00UTC / 4PM Toronto**, stopping the routing VM and setting SQL activationPolicy NEVER. Data remains retained and storage/backup charges continue. Tasks `stop-routing-seven-days` and `stop-sql-seven-days` can be inspected with `gcloud tasks describe --queue=roadstar-expiry --location=us-central1 --project=roadstar-2026-kzh TASK`. These are scheduled operations, not a guarantee that future API execution will succeed. Confirm completion at expiry; delete retained resources only after export/retention review. Extending runtime requires a new cost decision.

## Infrastructure and deployment boundaries

`main.tf` owns initial database, network, VM, registry, storage, queue and service identities. Terraform state contains database credentials and is ignored; do not publish it. The initial42-resource apply required one dependency-order correction, then completed with no replacements/destruction. Docker Terraform1.14.6 / google8.2.0 lock retained.

Firebase apps/auth, restricted API keys, Cloud Run services, Scheduler, preview identities and one-time expiry tasks were configured through project-scoped gcloud/REST. They are not yet fully imported into Terraform; destroying Terraform alone does not remove all preview resources. Always pass `--project=roadstar-2026-kzh` because the user's global gcloud default belongs to another project.

Build with `infra/Dockerfile.api`, `.optimizer`, `.web`. Web build requires its public VITE args; mobile requires `.env.production`. API uses Firebase auth, Cloud SQL connector, Secret Manager DATABASE_URL and Cloud Storage DOCUMENT_BUCKET. It refuses local-demo auth on Cloud Run. A separate seed job calls migrations/Store methods and rewrites only synthetic memberships to the Firebase UIDs. Raw private workbook data was never sent to GCP.

## Verified evidence

- Real Firebase dispatcher and driver-scoped reads: `docs/evidence/cloud-auth-smoke.json`.
- Browser cloud recovery and Google road/satellite screenshots: `docs/evidence/roadstar-cloud-*.png`.
- Synthetic PDF → Storage → Scheduler/Tasks → Gemini2.5Flash → API result: `docs/evidence/cloud-document-extraction.json`; status unreviewed and source SHA preserved.
- Android development-signed standalone APK installed and exercised on API35 x86_64 emulator: login, offline termination/reconnect, recovery approval/acceptance, duty and work-session controls. Physical Android and native iOS testing were explicitly deferred.
- Cloud131-driver burst:524 telemetry and524 sync pairs, zero failures; p95 acknowledgement-to-snapshot lag5448ms. SQL maxobserved CPU8.53%, memory50.99%, connections40. See cloud-load-test-131.json and cloud-database-metrics.json for limits and methodology.


## Current revisions and local operation

September12 verified revisions: API00030-xek, optimizer00011-vog, web00048-fop and documents00015-kov serve100% traffic. Migration020, source-bound axle review, planned-wait duty accounting and native-to-web manifest acceptance are verified in [cloud-axle-review.md](../../docs/cloud-axle-review.md). Inspect current revisions before redeploying because later checkpoints may advance these values.

Use `scripts/deploy-preview.sh` to rebuild and update the existing approved services. It builds every artifact first, probes each temporary tagged revision before switching traffic, and removes the rollout tag afterward. It does not provision projects, databases, identities or keys. Configuration changes and complete Terraform import remain separate work. Client keys are loaded from ignored apps/web/.env.production as public build arguments; private account passwords never enter the image.

Use `scripts/preview-local.sh` to launch local synthetic web/API after installing dependencies and starting the local PostgreSQL container. Pass OPTIMIZER_URL for an available local worker. The running session uses optimizer4040 and an IAP tunnel48002 to the existing routing VM. Keep local-demo bound to loopback.

Extra one-off Cloud Run jobs seeded emulator-demo, planning-demo, film-demo and native-planning-demo. They contain only synthetic data and do not keep a running instance after execution. The first film seed's direct private routing call failed because jobs do not have K_SERVICE; initialization was completed through the authenticated operational API. Do not rerun a seed against a carrier already being demonstrated.
