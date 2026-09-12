#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
roadstar_project=roadstar-2026-kzh
roadstar_region=us-central1
roadstar_registry="$roadstar_region-docker.pkg.dev/$roadstar_project/roadstar"
declare -A roadstar_images
[[ -f apps/web/.env.production ]] || { echo 'Missing ignored public web client configuration' >&2; exit 1; }
npm run typecheck
for component in api optimizer; do
  docker build -f "infra/Dockerfile.$component" -t "$roadstar_registry/$component:preview" .
  docker push "$roadstar_registry/$component:preview"
  roadstar_digest=$(gcloud artifacts docker images describe "$roadstar_registry/$component:preview" --project "$roadstar_project" --format="value(image_summary.digest)")
  [[ "$roadstar_digest" == sha256:* ]] || { echo "Missing pushed image digest" >&2; exit 1; }
  roadstar_images[$component]="$roadstar_registry/$component@$roadstar_digest"
done
roadstar_args=()
while IFS= read -r line; do
  [[ "$line" == VITE_*=* ]] && roadstar_args+=(--build-arg "$line")
done < apps/web/.env.production
docker build -f infra/Dockerfile.web -t "$roadstar_registry/web:preview" "${roadstar_args[@]}" .
docker push "$roadstar_registry/web:preview"
roadstar_web_digest=$(gcloud artifacts docker images describe "$roadstar_registry/web:preview" --project "$roadstar_project" --format="value(image_summary.digest)")
[[ "$roadstar_web_digest" == sha256:* ]] || { echo "Missing pushed web digest" >&2; exit 1; }
roadstar_images[web]="$roadstar_registry/web@$roadstar_web_digest"
roadstar_images[documents]="${roadstar_images[api]}"
# Build every artifact before changing traffic. The new worker must be ready before
# the API starts issuing proposals under its matching solver policy.
for component in optimizer api web documents; do
  gcloud run services update "roadstar-$component" --project "$roadstar_project" --region "$roadstar_region" --image "${roadstar_images[$component]}" --no-traffic --tag=rollout-check --quiet
  roadstar_revision=$(gcloud run services describe "roadstar-$component" --project "$roadstar_project" --region "$roadstar_region" --format="value(status.latestCreatedRevisionName)")
  [[ -n "$roadstar_revision" ]] || { echo "Missing created revision" >&2; exit 1; }
  node scripts/check-preview-revision.mjs "roadstar-$component" "$roadstar_revision"
  # All services may have explicit traffic pins from earlier preview rollbacks.
  gcloud run services update-traffic "roadstar-$component" --project "$roadstar_project" --region "$roadstar_region" --to-revisions="$roadstar_revision=100" --remove-tags=rollout-check --quiet
  echo "Verified ready preview revision: $roadstar_revision (${roadstar_images[$component]})"
done
