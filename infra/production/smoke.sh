#!/usr/bin/env bash
set -euo pipefail

origin="${VEGA_ORIGIN:-https://admin.vegacms.com}"

check() {
	local name="$1"
	local url="$2"
	local expected_content_type="${3:-}"
	local headers
	headers="$(mktemp)"
	trap 'rm -f "$headers"' RETURN

	curl --fail-with-body --silent --show-error --location --max-time 20 \
		--dump-header "$headers" --output /dev/null "$url"

	if [[ -n "$expected_content_type" ]] &&
		! grep -Eiq "^content-type: *${expected_content_type}" "$headers"; then
		echo "ERROR: $name no devolvió Content-Type $expected_content_type" >&2
		return 1
	fi

	echo "OK: $name"
}

check "Vega raíz" "$origin/" "text/html"
check "Vega deep link" "$origin/login" "text/html"
check "PocketBase health" "$origin/api/health" "application/json"

asset_path="$(
	curl --fail --silent --show-error "$origin/" |
		sed -n 's/.*src="\([^"]*\/_app\/[^"]*\.js\)".*/\1/p' |
		head -n 1
)"

if [[ -z "$asset_path" ]]; then
	echo "ERROR: no se encontró un asset JavaScript de Vega en index.html" >&2
	exit 1
fi

check "Asset JavaScript" "${origin}${asset_path}" \
	"(application/javascript|text/javascript)"

echo "OK: smoke de Vega completo."
