# Producción de `admin.vegacms.com`

Infraestructura de la instancia oficial de Vega en el VPS compartido con Lumbre:

```text
Internet
  -> edge-caddy (TLS, red Docker `edge`)
  -> vega-pb:8090
       |- /api/*      PocketBase 0.39.9
       `- /*          SPA de Vega en /pb/pb_public
```

No se publica ningún puerto de PocketBase en el host. La persistencia vive en el volumen Docker
`vega_data`; la imagen contiene solo el binario de PocketBase y el build estático de Vega.

> **Sin auth fuerte por defecto.** Este `Dockerfile` despliega PocketBase vanilla: **no** incluye
> la extensión [`extensions/vegaauth`](../../extensions/vegaauth/README.md) (TOTP, códigos de
> recuperación y passkeys). Esa auth es opt-in y exige ejecutar PocketBase como app Go aparte,
> según [`docs/POCKETBASE-INTEGRATION.md`](../../docs/POCKETBASE-INTEGRATION.md). No asumas que
> `admin.vegacms.com` tiene MFA disponible salvo que se haya desplegado esa variante.

## Ubicaciones del servidor

- checkout y Compose: `/srv/vega`;
- datos: volumen Docker `vega_data`;
- borde compartido: `/srv/edge`;
- fragmento activo de Caddy: `/srv/edge/conf.d/vega.caddy`;
- credenciales bootstrap, si todavía existen: `/root/.vega-bootstrap` (modo `0600`).

Nunca guardes credenciales, `pb_data` ni una `.env` real en Git.

## Validar y desplegar

El commit desplegado debe haber pasado `pnpm gate`, `pnpm check-bundle-budget`, revisión final y CI.
En el servidor:

```sh
cd /srv/vega
cp infra/production/.env.example infra/production/.env
# Sustituye ambos valores por el SHA completo que se va a desplegar.
infra/production/validate.sh

docker compose --env-file infra/production/.env \
  --file infra/production/compose.yml build --pull
docker compose --env-file infra/production/.env \
  --file infra/production/compose.yml up --detach --wait
```

Después copia `admin.vegacms.com.caddy` a `/srv/edge/conf.d/vega.caddy`, valida `/srv/edge`, recarga
el Caddy existente sin reiniciarlo y ejecuta el smoke global antes del específico de Vega:

```sh
cd /srv/edge
scripts/validate.sh
docker compose --env-file .env exec caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
scripts/smoke.sh

cd /srv/vega
infra/production/smoke.sh
```

No levantes otro proxy en 80/443. Si falla cualquier prueba del borde, retira
`/srv/edge/conf.d/vega.caddy`, vuelve a validar y recarga antes de investigar.

## Primer superuser

PocketBase no contiene credenciales en la imagen. Crea el primer superuser dentro del contenedor:

```sh
read -r -s -p "Contraseña inicial: " VEGA_ADMIN_PASSWORD
echo
docker exec vega-pb /pb/pocketbase superuser upsert \
  EMAIL "$VEGA_ADMIN_PASSWORD"
unset VEGA_ADMIN_PASSWORD
```

Si el despliegue genera una contraseña bootstrap, se conserva temporalmente en
`/root/.vega-bootstrap`, con permisos `0600`; recupérala por SSH, cámbiala en PocketBase y elimina el
fichero con `rm /root/.vega-bootstrap`.

En PocketBase configura además:

- nombre: `Vega CMS`;
- URL: `https://admin.vegacms.com`;
- proxy IP headers confiables: `X-Real-IP` y `X-Forwarded-For`;
- backup diario con retención adecuada o almacenamiento S3 separado.

## Verificación

```sh
infra/production/smoke.sh
docker inspect vega-pb --format '{{.State.Health.Status}}'
docker logs --since 10m vega-pb
```

Completa el smoke con login real, navegación, guardado reversible y comprobación de `/settings`.

## Backup

Para una copia manual consistente, detén solo Vega, archiva el volumen y vuelve a levantarlo:

```sh
docker compose --env-file infra/production/.env \
  --file infra/production/compose.yml stop pocketbase
docker run --rm \
  --volume vega_data:/source:ro \
  --volume /srv/vega-backups:/backup \
  alpine:3.23 \
  tar -C /source -czf /backup/vega-data-AAAA-MM-DDTHHMMSSZ.tar.gz .
docker compose --env-file infra/production/.env \
  --file infra/production/compose.yml start pocketbase
```

Comprueba cada archivo con `tar -tzf` y prueba periódicamente la restauración en un volumen temporal.
PocketBase también ofrece backups consistentes desde **Settings -> Backups** sin detener el servicio.

## Rollback

Para volver a una imagen anterior, conserva su tag SHA, actualiza `VEGA_IMAGE_TAG` y `VEGA_GIT_SHA`
en `infra/production/.env`, y ejecuta:

```sh
docker compose --env-file infra/production/.env \
  --file infra/production/compose.yml up --detach --wait --no-build
infra/production/smoke.sh
```

La imagen nunca contiene `pb_data`, por lo que cambiarla no altera el volumen. Si el primer
despliegue falla, elimina `/srv/edge/conf.d/vega.caddy`, valida y recarga Caddy, y detén el Compose
sin usar `--volumes`.
