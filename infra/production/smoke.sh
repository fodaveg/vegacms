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

# No seguir redirects: un 302 al panel tampoco acredita el cierre público.
check_panel_closed() {
	local route="$1"
	local status
	status="$(curl --silent --show-error --max-time 20 --output /dev/null \
		--write-out '%{http_code}' "$origin$route")"
	if [[ "$status" != 404 ]]; then
		echo "ERROR: $route devolvió $status, se esperaba 404" >&2
		return 1
	fi
	echo "OK: panel cerrado en $route"
}

# CORS se prueba por cabeceras; un origen rechazado puede conservar HTTP 200.
check_cors() {
	local method="$1"
	local request_origin="$2"
	local expected_origin="$3"
	local headers allow_origin
	local -a args=(--request "$method")
	headers="$(mktemp)"
	trap 'rm -f "$headers"' RETURN
	if [[ -n "$request_origin" ]]; then
		args+=(-H "Origin: $request_origin")
	fi
	if [[ "$method" == OPTIONS ]]; then
		args+=(-H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: Authorization')
	fi
	curl --fail --silent --show-error --max-time 20 \
		"${args[@]}" --dump-header "$headers" --output /dev/null "$origin/api/health"
	allow_origin="$(sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: *//p' "$headers" | tr -d '\r')"
	if [[ "$allow_origin" != "$expected_origin" ]]; then
		echo "ERROR: CORS $method ($request_origin): autorización inesperada" >&2
		return 1
	fi
	echo "OK: CORS $method ($request_origin)"
}

for route in /_ /_/ /_/index.html; do
	check_panel_closed "$route"
done
for method in GET OPTIONS; do
	check_cors "$method" "$origin" "$origin"
	check_cors "$method" 'https://vega-cors-denied.invalid' ''
done
check_cors GET '' ''

check "Vega raíz" "$origin/" "text/html"
check "Vega deep link" "$origin/login" "text/html"
check "PocketBase health" "$origin/api/health" "application/json"

index_html="$(curl --fail --silent --show-error "$origin/")"
asset_candidates="$(
	printf '%s\n' "$index_html" |
		sed -n \
			-e 's/.*<script[^>]*src="\([^"]*\.js\)"[^>]*>.*/\1/p' \
			-e 's/.*<link[^>]*rel="modulepreload"[^>]*href="\([^"]*\.js\)"[^>]*>.*/\1/p' \
			-e 's/.*<link[^>]*href="\([^"]*\.js\)"[^>]*rel="modulepreload"[^>]*>.*/\1/p'
)"
asset_path="${asset_candidates%%$'\n'*}"

if [[ "$asset_path" != */_app/*.js ]]; then
	echo "ERROR: no se encontró un asset JavaScript de Vega en index.html" >&2
	exit 1
fi

check "Asset JavaScript" "${origin}${asset_path}" \
	"(application/javascript|text/javascript)"

echo "OK: smoke de Vega completo."
