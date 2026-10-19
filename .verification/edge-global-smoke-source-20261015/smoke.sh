#!/usr/bin/env bash
set -euo pipefail

check_http() {
	local name="$1"
	local url="$2"
	local expected="$3"
	local code
	code="$(curl --fail-with-body --silent --show-error --location --max-time 15 \
		--output /dev/null --write-out '%{http_code}' "$url")"
	if [[ ! "$code" =~ ^($expected)$ ]]; then
		echo "ERROR: $name devolvió HTTP $code; esperado $expected" >&2
		return 1
	fi
	echo "OK: $name -> HTTP $code"
}

# Comprueba que una URL RESPONDE con redirección y a DÓNDE, sin seguirla.
# Existe porque `check_header` no puede validar un `Location`: parte el valor por
# `: *` con awk y se queda con el primer trozo, así que de `https://app.lumbre.pro/`
# solo compara `https` y aprueba cualquier destino. `%{redirect_url}` de curl da el
# destino entero sin saltar, que es justo lo que hace falta para exigir que un host
# haya DEJADO de servir contenido.
check_redirect() {
	local name="$1"
	local url="$2"
	local expected="$3"
	local out code target
	out="$(curl --silent --show-error --max-time 15 --output /dev/null \
		--write-out '%{http_code} %{redirect_url}' "$url")"
	code="${out%% *}"
	target="${out#* }"
	if [[ ! "$code" =~ ^30[0-9]$ || "$target" != "$expected" ]]; then
		echo "ERROR: $name devolvió HTTP $code -> '$target'; esperado 30x -> '$expected'" >&2
		return 1
	fi
	echo "OK: $name -> HTTP $code -> $target"
}

# Comprueba que una URL NO está servida por la app, sin seguir redirecciones.
# Sobrevive al relevo del host: hoy `lumbre.pro` responde 302 (la app se mudó a
# app.lumbre.pro) y cuando la WEB INFORMATIVA ocupe el host responderá 404 en estas
# rutas de app — las dos cosas cumplen la invariante «aquí ya no vive la app», y con
# un `check_redirect` clavado al 302 esto se pondría rojo el día del relevo. Importa
# porque este smoke es puerta COMÚN del edge: en rojo bloquea los deploys de fodaveg
# y de Senda.
check_not_served() {
	local name="$1"
	local url="$2"
	local code
	code="$(curl --silent --show-error --max-time 15 --output /dev/null \
		--write-out '%{http_code}' "$url")"
	if [[ "$code" == "200" ]]; then
		echo "ERROR: $name devolvió 200 — el host viejo está sirviendo la app otra vez" >&2
		return 1
	fi
	echo "OK: $name -> HTTP $code (no es la app)"
}

check_header() {
	local name="$1"
	local url="$2"
	local header="$3"
	local expected="$4"
	local value
	value="$(
		curl --fail-with-body --silent --show-error --max-time 15 \
			--dump-header - --output /dev/null "$url" |
			awk -F ': *' -v wanted="$header" \
				'tolower($1) == tolower(wanted) && value == "" { sub(/\r$/, "", $2); value = $2 }
				 END { print value }'
	)"
	if [[ "$value" != *"$expected"* ]]; then
		echo "ERROR: $name no contiene $header: $expected (recibido: $value)" >&2
		return 1
	fi
	echo "OK: $name -> $header: $value"
}

# Renombrado, fase (c) — 25 jul 2026. `app.lumbre.pro` es YA el único host de la
# app; `lumbre.pro` dejó de servirla y su destino es la web informativa de
# producto. Lo que hay que vigilar cambió de sentido: antes se exigía que los dos
# hosts sirvieran lo MISMO, y ahora se exige que el viejo NO sirva la app.
#
# `check_not_served` en las TRES del host viejo, y NO `check_http`: este último sigue
# el salto (--location) y aprobaría mirando el host nuevo sin enterarse. Se comprueba
# la INVARIANTE («aquí ya no vive la app»), no el 302 concreto, para que el relevo por
# la web informativa no ponga el smoke en rojo.
check_http "Lumbre version (app)" "https://app.lumbre.pro/api/version" "200"
check_not_served "lumbre.pro no sirve la app" "https://lumbre.pro/api/version"
# El AASA del host viejo tiene que redirigir, no servirse: Apple lo descarga sin
# seguir redirecciones, así que esto documenta que los universal links de
# `lumbre.pro` están retirados a propósito y viven solo en el host nuevo.
check_not_served "lumbre.pro ya no sirve AASA" "https://lumbre.pro/.well-known/apple-app-site-association"
check_header "AASA app.lumbre.pro" "https://app.lumbre.pro/.well-known/apple-app-site-association" "Content-Type" "application/json"
# Rótulos corregidos y una comprobación RETIRADA (25 jul 2026). Los dos hosts
# estaban intercambiados y caducados: `lumbre.preproduccion.es` YA NO es la demo
# del rediseño, es el CLON DE STAGING, y tiene el modo demo APAGADO a propósito
# (`deploy/staging/compose.yml` no define LUMBRE_DEMO_MODE ni LUMBRE_ALLOW_DEMO;
# por el doble guard de `src/lib/server/runtime-mode.ts`, /api/demo/status
# responde 404 y ESA es la respuesta correcta). Exigirle modo demo dejaba este
# smoke en rojo permanente y, como es puerta común del edge, bloqueaba los
# despliegues de OTROS proyectos. Las dos de robots se conservan: pasan en los
# dos hosts, la cabecera no depende del modo demo.
# PARADO 21 sep 2026 (RAM, ver docs/ESTADO.md de Lumbre); David pidió el 23 sep quitarlo del smoke mientras siga parado. Reactivar al arrancarlo:
# check_http "Lumbre staging" "https://lumbre.preproduccion.es/api/version" "200"
check_http "Lumbre demo interna" "https://demo-lumbre.preproduccion.es/api/version" "200"
check_http "Modo demo (demo interna)" "https://demo-lumbre.preproduccion.es/api/demo/status" "200"
# check_header "Robots staging" "https://lumbre.preproduccion.es/api/version" "X-Robots-Tag" "noindex"
check_header "Robots demo interna" "https://demo-lumbre.preproduccion.es/api/version" "X-Robots-Tag" "noindex"
# Demo PÚBLICA (25 jul 2026): stack propio construido desde `main`, host nuevo
# demo.lumbre.pro. Se le exige modo demo ENCENDIDO (al revés que al clon de
# staging) porque ahí sí es el objetivo del entorno.
check_http "Lumbre demo pública" "https://demo.lumbre.pro/api/version" "200"
check_http "Modo demo (demo pública)" "https://demo.lumbre.pro/api/demo/status" "200"
check_header "Robots demo pública" "https://demo.lumbre.pro/api/version" "X-Robots-Tag" "noindex"
check_http "Captura PWA" "https://add.lumbre.pro/manifest.webmanifest" "200"
# La escotilla de `/updates/*` en el host viejo se RETIRÓ (decisión de David, 25 jul
# 2026): ya no se sirve nada ahí, ni el manifiesto. Se comprueba que TAMBIÉN redirige
# para que nadie la reabra por accidente creyendo que hace falta.
#
# INVARIANTE que esto crea: el manifiesto del updater NO puede referenciar
# `lumbre.pro` en sus URLs de descarga, porque el updater de Tauri no sigue
# redirecciones y la descarga fallaría. `publish-macos-update.sh` usa
# `app.lumbre.pro` por defecto (`UPDATE_BASE_URL`); si alguien lo sobreescribe con el
# host viejo, rompe el canal en silencio.
check_not_served "lumbre.pro ya no sirve el updater" "https://lumbre.pro/updates/latest.json"
# El canal de auto-update vive SOLO en el host nuevo, que es el que piden las builds
# desde 1.1.0.
check_http "Updater (app)" "https://app.lumbre.pro/updates/latest.json" "200"
check_http "fodaveg" "https://fodaveg.net/" "200"
check_http "Senda" "https://sendarutas.es/" "200"
check_http "Senda API" "https://api.sendarutas.es/api/health" "200"

# HTTP y WebSocket usan el mismo reverse_proxy sin matcher. Desde el VPS,
# comprueba además que el propio Caddy resuelve el alias y alcanza el upstream.
# El handshake WS real exige una cookie de sesión; lo cubre el gate de Lumbre.
if command -v docker >/dev/null 2>&1 && docker inspect edge-caddy >/dev/null 2>&1; then
	docker exec edge-caddy wget --quiet --spider http://lumbre-app:3000/api/version
	echo "OK: edge-caddy alcanza por HTTP el upstream compartido con WS"
	# La demo aislada del rediseño se retiró el 25 jul 2026 (ya no tenía sentido:
	# ningún host del edge apuntaba a ella y el rediseño está en producción). Se
	# paró el stack, se DESHABILITÓ su timer de reset —si no, resucitaba solo cada
	# media hora— y sus volúmenes (`lumbre-redesign-demo_pgdata`/`_miniodata`) se
	# conservan.
	docker exec edge-caddy wget --quiet --spider http://lumbre-staging-demo-app:3000/api/version
	echo "OK: edge-caddy alcanza la demo interna (staging)"
	docker exec edge-caddy wget --quiet --spider http://lumbre-public-demo-app:3000/api/version
	echo "OK: edge-caddy alcanza la demo pública (main)"
fi
