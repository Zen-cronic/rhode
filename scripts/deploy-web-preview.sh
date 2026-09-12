#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

roadstar_project=roadstar-2026-kzh
roadstar_region=us-central1
roadstar_registry="$roadstar_region-docker.pkg.dev/$roadstar_project/roadstar"
roadstar_service=roadstar-web

[[ -f apps/web/.env.production ]] || {
  echo 'Missing ignored public web client configuration' >&2
  exit 1
}

npm run typecheck
roadstar_args=()
while IFS= read -r line; do
  [[ "$line" == VITE_*=* ]] && roadstar_args+=(--build-arg "$line")
done < apps/web/.env.production

docker build -f infra/Dockerfile.web -t "$roadstar_registry/web:preview" "${roadstar_args[@]}" .
docker push "$roadstar_registry/web:preview"
roadstar_digest=$(gcloud artifacts docker images describe "$roadstar_registry/web:preview" --project "$roadstar_project" --format='value(image_summary.digest)')
[[ "$roadstar_digest" == sha256:* ]] || {
  echo 'Missing pushed web image digest' >&2
  exit 1
}
roadstar_image="$roadstar_registry/web@$roadstar_digest"

gcloud run services update "$roadstar_service" \
  --project "$roadstar_project" \
  --region "$roadstar_region" \
  --image "$roadstar_image" \
  --no-traffic \
  --tag=rollout-check \
  --quiet
roadstar_revision=$(gcloud run services describe "$roadstar_service" \
  --project "$roadstar_project" \
  --region "$roadstar_region" \
  --format='value(status.latestCreatedRevisionName)')
[[ -n "$roadstar_revision" ]] || {
  echo 'Missing created web revision' >&2
  exit 1
}
node scripts/check-preview-revision.mjs "$roadstar_service" "$roadstar_revision"
gcloud run services update-traffic "$roadstar_service" \
  --project "$roadstar_project" \
  --region "$roadstar_region" \
  --to-revisions="$roadstar_revision=100" \
  --remove-tags=rollout-check \
  --quiet

echo "Verified ready web preview revision: $roadstar_revision ($roadstar_image)"
