# RoadStar preview cost estimate — September 10, 2026

USD, us-central1, on-demand, no credits/free tiers assumed. **Operator approved September 10: $85 estimated allowance for seven days. Provisioning underway**, including model allowance below; budget alert is not a hard spending cap. Stop/review after seven days; database/disk retention continues to bill until explicitly decommissioned. No teardown of evidence-bearing storage is authorized here.

| Resource/assumption | Seven days |
|---|---:|
| Cloud SQL Enterprise: 2 vCPU × $0.0413/h + 7.5GiB × $0.007/GiB-h, 168h | $22.70 |
| Cloud SQL 50GiB SSD + 10GiB backup allowance (conservative upper storage rate) | $4.10 |
| Valhalla e2-standard-4, $0.13402284/h ×168h | $22.52 |
| 100GiB balanced tiles +20GiB boot, external IPv4, small egress allowance | $5.00 |
| Cloud Run API/worker/web, bounded preview traffic and builds | $8.00 allowance |
| Storage/Tasks/Scheduler/Secrets/Logging | $4.00 allowance |
| 1,000 billable Dynamic Maps loads at $7/1,000 (free tier ignored) | $7.00 |
| Vertex extraction allowance: up to 100 documents, 10k input +1k output tokens each, Gemini2.5Flash reference pricing (model availability still unverified) | $3.00 allowance |
| Contingency | $8.68 |
| Proposed seven-day allowance | **$85.00** |

Fixed compute baseline is about $6.46/day before disks and usage, roughly $197/month if left running continuously. Full ongoing deployment is estimated $220–260/month before material traffic/model usage, not $0. A 72-hour rehearsal costs roughly $20 fixed compute plus storage and usage; request the seven-day envelope to preserve judging access.

Model arithmetic at reference rates: 1M input tokens×$0.30/M +0.1M output×$2.50/M = $0.55; $3 allowance covers retries and token variation. Code caps output at1000 and job attempts at3; input bytes limit12MB is not a token guarantee. Confirm exact available model and token cost before enabling any call; AI remains disabled. Model output never approves dispatch or billing.

Official sources checked Sept10: [Cloud SQL CPU/memory](https://cloud.google.com/sql/pricing?authuser=1), [Cloud SQL storage](https://cloud.google.com/sql/pricing), [Compute E2 rates](https://cloud.google.com/products/compute/pricing/general-purpose?hl=es-419), [disk pricing](https://cloud.google.com/compute/disks-image-pricing), [Cloud Run](https://cloud.google.com/run/pricing), [Maps](https://developers.google.com/maps/billing-and-pricing/pricing), [Vertex model pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing). Allowance lines are estimates, not quoted SKU totals. Final selected project/region/billing account may change taxes, currency conversion, quota and rates.
