#!/bin/bash
# Arranque del contenedor: un solo contenedor corre DOS procesos —
#   1) PocketBase (Go) en :8090, accesible solo desde las redes Docker.
#   2) Astro SSR (Node) en :4321, que Caddy publica por HTTPS.
# PB aplica sus migraciones Go solo al hacer `serve` (van embebidas en el binario).
# El CONTENIDO se carga aparte, una vez, con `fodaveg-pb import-legacy` (cutover).
set -euo pipefail

PB_DATA="${PB_DATA:-/pb/pb_data}"
mkdir -p "$PB_DATA"

# Superuser de PB (idempotente): lo usa el cliente de ESCRITURA de Astro
# (pb.ts, /admin). Se crea/actualiza en cada arranque desde el entorno.
if [ -n "${PB_ADMIN_EMAIL:-}" ] && [ -n "${PB_ADMIN_PASSWORD:-}" ]; then
  echo "[entrypoint] Asegurando superuser de PB ($PB_ADMIN_EMAIL)…"
  /pb/fodaveg-pb --dir "$PB_DATA" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" || true
fi

# 1) PocketBase escucha en todas las interfaces DEL CONTENEDOR. Compose no
# publica el puerto al host: Astro entra por localhost y Caddy por `edge`.
# Migraciones Go al vuelo. RP_ID/RP_ORIGINS/TRUST_PROXY llegan por Compose.
echo "[entrypoint] Iniciando PocketBase en 0.0.0.0:8090…"
/pb/fodaveg-pb --dir "$PB_DATA" serve --http=0.0.0.0:8090 --origins=https://admin.fodaveg.net &
PB_PID=$!

# Esperar a que PB responda antes de arrancar Astro (Astro le pega en el primer
# render). ~15s máx; si no, seguimos igual (Astro reintenta y devuelve 502 suave).
for _ in $(seq 1 30); do
  if wget -qO- http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    echo "[entrypoint] PocketBase listo."
    break
  fi
  sleep 0.5
done

# 2) Astro SSR.
echo "[entrypoint] Iniciando Astro en ${HOST:-0.0.0.0}:${PORT:-4321}…"
node dist/server/entry.mjs &
APP_PID=$!

# Si CUALQUIERA de los dos cae, tumbamos el otro y salimos → Docker
# (restart: unless-stopped) reinicia el contenedor entero, limpio.
wait -n "$PB_PID" "$APP_PID"
EXIT=$?
echo "[entrypoint] Un proceso terminó (code=$EXIT); parando el contenedor."
kill "$PB_PID" "$APP_PID" 2>/dev/null || true
exit "$EXIT"
