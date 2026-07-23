#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

env_file="${VEGA_ENV_FILE:-.env}"

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ ! "${VEGA_GIT_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
	echo "ERROR: VEGA_GIT_SHA debe ser un SHA Git completo." >&2
	exit 1
fi

if [[ "${VEGA_IMAGE_TAG:-}" != "$VEGA_GIT_SHA" ]]; then
	echo "ERROR: VEGA_IMAGE_TAG debe coincidir con VEGA_GIT_SHA." >&2
	exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
head_sha="$(git -C "$repo_root" rev-parse HEAD)"

if [[ "$VEGA_GIT_SHA" != "$head_sha" ]]; then
	echo "ERROR: VEGA_GIT_SHA no coincide con el HEAD real ($head_sha)." >&2
	exit 1
fi

if [[ -n "$(git -C "$repo_root" status --porcelain --untracked-files=all)" ]]; then
	echo "ERROR: el checkout contiene cambios; no se construirá una imagen etiquetada como inmutable." >&2
	exit 1
fi

docker network inspect edge >/dev/null
docker compose --env-file "$env_file" config --quiet

docker run --rm \
	--volume "$PWD/admin.vegacms.com.caddy:/etc/caddy/Caddyfile:ro" \
	caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648 \
	caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "OK: Compose y fragmento Caddy válidos."
