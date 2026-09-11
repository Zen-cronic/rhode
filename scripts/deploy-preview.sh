#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
roadstar_project=roadstar-2026-kzh
roadstar_region=us-central1
roadstar_registry="$roadstar_region-docker.pkg.dev/$roadstar_project/roadstar"
[[ -f apps/web/.env.production ]] || { echo 'Missing ignored public web client configuration' >&2; exit 1; }
npm run typecheck
for component in api optimizer; do
  docker build -f "infra/Dockerfile.$component" -t "$roadstar_registry/$component:preview" .
  docker push "$roadstar_registry/$component:preview"
  roadstar_digest=$(gcloud artifacts docker images describe "$roadstar_registry/$component:preview" --project "$roadstar_project" --format="value(image_summary.digest)")
  [[ "$roadstar_digest" == sha256:* ]] || { echo "Missing pushed image digest" >&2; exit 1; }
  [[ "$component" != api ]] || roadstar_api_image="$roadstar_registry/api@$roadstar_digest"
  gcloud run services update "roadstar-$component" --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_registry/$component@$roadstar_digest" --quiet
done
roadstar_args=()
while IFS= read -r line; do
  [[ "$line" == VITE_*=* ]] && roadstar_args+=(--build-arg "$line")
done < apps/web/.env.production
docker build -f infra/Dockerfile.web -t "$roadstar_registry/web:preview" "${roadstar_args[@]}" .
docker push "$roadstar_registry/web:preview"
roadstar_web_digest=$(gcloud artifacts docker images describe "$roadstar_registry/web:preview" --project "$roadstar_project" --format="value(image_summary.digest)")
[[ "$roadstar_web_digest" == sha256:* ]] || { echo "Missing pushed web digest" >&2; exit 1; }
gcloud run services update roadstar-web --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_registry/web@$roadstar_web_digest" --quiet
# Explicit traffic pins can keep latestReadyRevisionName on an older image.
roadstar_web_revision=$(gcloud run services describe roadstar-web --project "$roadstar_project" --region "$roadstar_region" --format="value(status.latestCreatedRevisionName)")
[[ -n "$roadstar_web_revision" ]] || { echo "Missing created web revision" >&2; exit 1; }
gcloud run services update-traffic roadstar-web --project "$roadstar_project" --region "$roadstar_region" --to-revisions="$roadstar_web_revision=100" --quiet
# Document worker shares the operational image; existing command/env/service identity remain unchanged.
gcloud run services update roadstar-documents --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_api_image" --quiet
