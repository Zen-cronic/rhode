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
  gcloud run services update "roadstar-$component" --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_registry/$component:preview" --quiet
done
roadstar_args=()
while IFS= read -r line; do
  [[ "$line" == VITE_*=* ]] && roadstar_args+=(--build-arg "$line")
done < apps/web/.env.production
docker build -f infra/Dockerfile.web -t "$roadstar_registry/web:preview" "${roadstar_args[@]}" .
docker push "$roadstar_registry/web:preview"
gcloud run services update roadstar-web --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_registry/web:preview" --quiet
# Document worker shares the operational image; existing command/env/service identity remain unchanged.
gcloud run services update roadstar-documents --project "$roadstar_project" --region "$roadstar_region" --image "$roadstar_registry/api:preview" --quiet
