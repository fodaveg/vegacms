# Producción de `admin.vegacms.com`

Infraestructura de la instancia oficial de Vega en el VPS compartido con Lumbre:

```text
Internet
  -> edge-caddy (TLS, red Docker `vega-edge`)
  -> vega-pb:8090
       |- /api/*      PocketBase 0.39.9
       `- /*          SPA de Vega en /pb/pb_public
```

No se publica ningún puerto de PocketBase en el host. La persistencia vive en el volumen Docker
`vega_data`; la imagen contiene PocketBase, el build estático de Vega y los hooks de producción.

> **Sin auth fuerte por defecto.** Este `Dockerfile` despliega PocketBase vanilla: **no** incluye
> la extensión [`extensions/vegaauth`](../../extensions/vegaauth/README.md) (TOTP, códigos de
> recuperación y passkeys). Esa auth es opt-in y exige ejecutar PocketBase como app Go aparte,
> según [`docs/POCKETBASE-INTEGRATION.md`](../../docs/POCKETBASE-INTEGRATION.md). No asumas que
> `admin.vegacms.com` tiene MFA disponible salvo que se haya desplegado esa variante.

Si instalas esa variante Go, mantén **un único proceso de autenticación** mientras uses la extensión
de referencia: los retos pendientes y las pruebas recientes de cada sesión viven en su memoria.
Reiniciar el proceso obliga a repetir los retos y a acreditar posesión antes de cambiar factores
ya configurados.
Añadir réplicas requiere afinidad estable a través del login, WebAuthn y la renovación del token,
o un almacén compartido de pruebas y retos que la extensión no implementa; el token renovable no
sirve como clave estable de enrutado. Sigue los
[límites operativos de autenticación](../../docs/POCKETBASE-INTEGRATION.md#un-proceso-para-el-flujo-de-autenticación-reforzada).
Tener un único destino en el proxy o recibir un health check correcto no demuestra que la variante
Go esté instalada ni que sus rutas de autenticación reforzada estén activas.

## Ubicaciones del servidor

- checkout y Compose: `/srv/vega`;
- datos: volumen Docker `vega_data`;
- borde compartido: `/srv/edge`;
- fragmento activo de Caddy: `/srv/edge/conf.d/vega.caddy`;
- credenciales bootstrap, si todavía existen: `/root/.vega-bootstrap` (modo `0600`).

Nunca guardes credenciales, `pb_data` ni una `.env` real en Git.

## Publicar una versión antes de desplegar

Vega no es una app suelta: es una **dependencia** de varios proyectos (esta instancia oficial, el
admin de `lumbre.pro`, el embed de `fodaveg.net`). Por eso subirla empieza por **versionarla**, no
por desplegarla: sin bump nadie puede pedir «la nueva», y sin reconstruir la imagen los consumidores
se quedan en la que hubiera en el servidor.

1. Sube `package.json#version` — patch si son correcciones, minor si añade capacidades al
   manifiesto. `release.yml` compara el tag con ese campo y aborta en segundos si no casan.
2. `chore(release): vX.Y.Z`, push, `git tag vX.Y.Z` y push del tag: el workflow publica
   `vega-<version>.zip` como asset del Release.
3. Despliega ese SHA con el procedimiento de abajo.
4. **Repasa los demás consumidores de la imagen.** El tag de `vegacms:<sha>` es el SHA completo a
   propósito, así que `docker ps --format '{{.Image}}'` en el servidor los enumera. Un montaje que
   reutiliza la imagen ya construida (en vez de construir la suya) se queda congelado en la versión
   que hubiera el día que se montó, sin avisar.

Para saber qué build sirve un host sin entrar al servidor, compara los hashes de sus assets con los
del zip del Release — Vite los deriva del contenido, así que delatan la versión exacta:

```sh
curl -s https://admin.vegacms.com/ | grep -o '/_app/immutable/assets/[A-Za-z0-9._-]*\.css'
gh release download vX.Y.Z --repo fodaveg/vegacms -D /tmp/vega-rel
unzip -l /tmp/vega-rel/*.zip | grep 'assets/.*\.css'
```

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

## Red dedicada y cierre del panel

Antes de usar este Compose por primera vez, crea la red externa `vega-edge` y añade **de forma
durable** esa red al servicio real de Caddy en su Compose versionado. Este ejemplo se fusiona con
su definición existente; conserva las redes necesarias para los demás proyectos:

```yaml
services:
  caddy:
    networks:
      - edge
      - vega-edge
networks:
  vega-edge:
    external: true
    name: vega-edge
```

Orden de migración (requiere autorización del borde y sus fuentes reales):

1. `docker network create vega-edge` si aún no existe. No es una red `internal`: PocketBase
   necesita salida para SMTP, S3 y otras integraciones.
2. Valida y aplica el Compose de Caddy con ambas redes. Una conexión manual con
   `docker network connect` no sustituye ese cambio durable. Revisa el efecto de recrear el proxy
   compartido sobre los demás sitios antes de aplicarlo.
3. Recrea solo el servicio `pocketbase` con este Compose; conserva `vega_data`, UID/GID 10001,
   alias `vega-pb`, healthcheck y la ausencia de puertos publicados. No uses `down --volumes`.
4. Comprueba salud y resolución de `vega-pb:8090` desde Caddy; inspecciona las redes para acreditar
   que Vega pertenece a `vega-edge` y ya no a `edge`. Ejecuta el smoke de todos los sitios del borde.

Rollback: restaura la definición anterior de red del servicio Vega y recréalo sobre el mismo
volumen; conserva las redes que Caddy necesita. Cambiar solo la red de Vega, sin conectar antes
Caddy, corta el acceso al admin.

El fragmento responde 404 a `/_` y `/_/*`. `/_app/*`, `/api/*` y las rutas de Vega siguen pasando
al backend. Prepara el acceso de mantenimiento antes de aplicar el cierre: CLI dentro del
contenedor para superusers y operaciones de API autorizadas desde Vega. Los endpoints superuser
siguen exigiendo autenticación; cerrar el HTML no los elimina.

## CORS por instancia

El CMD de referencia permite únicamente `https://admin.vegacms.com` mediante `--origins`.
Consulta la [receta de integración](../../docs/POCKETBASE-INTEGRATION.md#cors-cross-origin-resource-sharing)
para otros orígenes. Los consumidores que solo copian `pb_public`, como la imagen documentada de
`admin.lumbre.pro`, deben cambiar su propio comando; no heredan este flag ni los hooks.
No amplíes la lista sin inventariar las peticiones de navegador del sitio público.

Con el candidato desplegado y autorización para medir cada instancia:

```sh
for origin in https://admin.vegacms.com https://admin.lumbre.pro https://admin.fodaveg.net; do
  VEGA_ORIGIN="$origin" infra/production/smoke.sh
done
```

El smoke comprueba 404 del panel, GET/preflight CORS permitido y rechazado, petición sin Origin,
SPA, deep link, asset y health. Complétalo con login, discovery, medios, SSE y cada consumidor
cross-origin realmente usado. Un test local no acredita estas tres instancias.

## URLs de copias en los logs

`pb_hooks/vega-backup-log-redaction.pb.js` conserva la query hasta después del handler de
PocketBase y la retira de `URL` y `RequestURI` al volver, antes de su activity logger. También
retira `Referer` si su query contiene `token` (también nombres codificados/repetidos) o no se puede
decodificar un nombre. Conserva referencias ordinarias. Esto se aplica a todas las rutas: una URL
sensible puede referir a otra petición.
Cubre los rechazos de autenticación/IP y rate limit gracias a la prioridad -1035, entre el
activity logger (-1040) y esos middlewares en **PocketBase 0.39.9**. La prueba de contrato real
es `tests/contract/pocketbase.backup-log-redaction.test.ts`; hay que ejecutarla al actualizar PB.
Los hooks que registren la petición antes de esta vuelta no quedan cubiertos.

La imagen de referencia copia el hook. En otras imágenes copia explícitamente este fichero al
`--hooksDir` efectivo y comprueba que su ejecutable incluye la JSVM; reutilizar solo `pb_public`
no lo instala. Se mantiene la descarga nativa por URL: PB requiere el token en query y no se carga
la copia completa en memoria del navegador.

### Caddy: modificar el encoder del destino existente

El fragmento de este repo no declara ningún `log`. Antes de aplicarlo, inventaría la configuración
adaptada de Caddy, su versión, sus access logs, logs de runtime (incluidos errores del proxy),
stdout/stderr y recolectores. No añadas un segundo access log dejando el primero sin sanear.
Dentro del `log` **ya existente**, conserva el `output` y fusiona este encoder con sus filtros:

```caddyfile
format filter {
  request>uri query {
    delete token
  }
  request>headers>Referer delete
  wrap json
}
```

La sintaxis está documentada por [Caddy, `log` y filtro `query`](https://caddyserver.com/docs/caddyfile/directives/log#query).
El filtro opera al serializar el log; no elimina el token que necesita el upstream. Quitar
`Referer` entero cubre sus valores múltiples. Debe aplicarse a **cada destino que serialice la
petición**, incluido un logger global de runtime si recibe errores del proxy. El mismo destino
puede recibir varias categorías: inspecciona `include`/`exclude` y no supongas cobertura global
por tener un filtro en el bloque del sitio. Conserva los filtros y formato requeridos por sus
consumidores; el ejemplo usa JSON.

**Pendiente del entorno real:** no se conoce aquí la versión de Caddy instalada ni su configuración
global. No se ha validado este encoder contra el binario fijado en `validate.sh`. Antes de aplicar,
ejecuta `caddy version`, adapta/valida con ese mismo binario y prueba el destino real con un marcador
artificial (nunca una credencial). El filtro `query` usa el parser de URLs: una URL mal formada puede
no sanearse; comprueba ese caso. Si el destino debe cubrirlas también, reemplaza `request>uri` entero
(`request>uri replace REDACTED`) en ese encoder, aceptando perder la ruta en ese destino.

Prueba una copia sintética pequeña: bytes íntegros al descargar y marcador artificial ausente de
los logs PB (mensaje, `data.url`, Referer y errores), Caddy y sus recolectores. Incluye 200, 403,
429, fallo de upstream, parámetros repetidos/codificados y Referer hacia otra ruta. Espera el vaciado
del buffer de PB antes de afirmar ausencia. Estos cambios no borran logs previos ni acreditan la
retención o acceso efectivo de las tres instancias.

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

## CSP del admin

La política vive en `admin.vegacms.com.caddy` (con un comentario por directiva) y se aplica solo a lo
que sirve la SPA, no a `/api/*` ni a `/_/*`. El token de sesión vive en `localStorage`, así que lo que
protege es sobre todo la inyección de script.

### Qué quedó validado en local (2 oct 2026, sin desplegar)

Con la SPA construida (`pnpm exec vite build`, adaptador `memory` de la demo) servida detrás de Caddy
2 (la imagen fijada en `validate.sh`) con el fichero real adaptado a `localhost` (sitio `:PUERTO`,
proxy a un servidor estático en lugar de `vega-pb`), y recorrida con Playwright como librería (un
Chromium; escucha `securitypolicyviolation` en todos los marcos y recoge errores de consola):
arranque y login, listado, formulario nuevo con texto enriquecido (TipTap), formulario con campo de
fichero e imagen (`blob:`), Medios con subida y detalle, vista de Markdown dividida con una imagen
`https` externa, ajustes, copias y el editor visual contra un sitio de OTRO origen
(`https://vega-visual-site.example`, el de `e2e/visual-site.ts`) hasta ver «Conectado al sitio» y los
contornos de los bloques. Resultado con la política final: **0 violaciones** y todas las pantallas en
verde, tanto con un servidor estático como a través de Caddy. `caddy validate` da «Valid
configuration» y `curl -I` confirma que `/` y las rutas de cliente llevan la CSP y que `/api/*` y
`/_/*` no.

La sonda demostró que caza: con `default-src 'self'; frame-ancestors 'none'; object-src 'none';
base-uri 'self'` (la política pedida en origen) la app no arranca y se miden `script-src-elem` en
línea (el `<script>` de arranque de SvelteKit) y `style-src-attr` en línea (el
`<div style="display: contents">` de `src/app.html`). Cada directiva se aflojó solo con una violación
medida delante, y se comprobó el control contrario: sin `https:` en `img-src` la imagen externa de
Markdown no carga; sin `https:` en `connect-src` el `POST` de `/api/vega-preview/token` del editor
visual se bloquea y no conecta; sin `https:` en `frame-src` se bloquea el `<iframe>` del sitio.

### Quitar `'unsafe-inline'` de `script-src` (no aplicado)

`script-src 'self' 'unsafe-inline'` es lo único grande que queda. Medido en una build de prueba con
`csp: { mode: 'hash', directives: { 'script-src': ['self'] } }` en `sveltekit({...})` de
`vite.config.ts` (no está en el repo): `adapter-static` escribe en el `index.html` de fallback un
`<meta http-equiv="content-security-policy">` con el hash del script de arranque, y la app arranca y
recorre las mismas pantallas con 0 violaciones. Un `<script>` en línea y un `onerror=` inyectados en
el HTML se bloquean; con la política de Caddy sola, el `<script>` en línea se ejecuta.

Cómo se combinan: la cabecera de Caddy y la etiqueta meta se evalúan por separado y gana la más
restrictiva. Por eso, **aunque se ponga el hash, la cabecera de Caddy debe conservar
`script-src 'self' 'unsafe-inline'`**: medido que con la cabecera estricta la app no arranca,
porque Caddy no conoce el hash (cambia en cada build). La vía que recomiendo es la meta de
SvelteKit para `script-src` y mantener el resto en Caddy; el hash solo puede salir del build. Una
política entera en la meta no sirve, porque `frame-ancestors` se ignora en una meta.

No se aplicó porque cambia el arranque de rutas que no se pudieron medir aquí: la suite e2e (que
sirve esta misma build con `vite preview`), `vite dev` y la demo de GitHub Pages con
`VEGA_BASE_PATH`. Antes de ponerlo: `pnpm test:e2e`, un arranque con `vite dev` y la build de Pages.

### Solo se puede validar desplegado

1. **El editor visual y la vista previa contra el sitio real de cada instancia**: la sonda usó un
   sitio de mentira interceptado por `page.route()`. Falta comprobar con el sitio de verdad que
   `frame-src` y `connect-src` dejan pasar su origen (el `POST /api/vega-preview/token` y el
   `<iframe>`), que el puente `postMessage` conecta y que no sale ningún `securitypolicyviolation`.
   La vista previa por `<form>` POST (no hay botón en la demo, no se recorrió) tampoco: por eso no
   hay `form-action`.
2. **`frame-ancestors` del lado del SITIO**: es otro Caddy y otra política. Debe permitir al admin
   de cada instancia (`https://admin.vegacms.com`, `https://admin.lumbre.pro`,
   `https://admin.fodaveg.net`) y la CSP de ese sitio no se ha tocado ni medido.
3. **Las cabeceras en las tres instancias**, con `curl -I` a la raíz y a una ruta de cliente, y sin
   CSP de este fichero en `/api/health`:

   ```sh
   for h in admin.vegacms.com admin.lumbre.pro admin.fodaveg.net; do
     echo "== $h"; curl -sI "https://$h/" | grep -iE 'content-security-policy|x-content-type|referrer-policy'
     curl -sI "https://$h/c/posts" | grep -ci 'content-security-policy'
     curl -sI "https://$h/api/health" | grep -i 'content-security-policy'
   done
   ```

   Las otras dos instancias tienen su propio Caddy fuera de este repo y no se tocaron.

4. **Con PocketBase real**: la sonda corrió con el adaptador demo en memoria. Falta un login real,
   una subida real de medios (`/api/files/…`, mismo origen), el realtime por SSE y la importación
   de una colección desde otro servidor. Se leyó en el código, no se midió.
5. Un día en `Content-Security-Policy-Report-Only` primero si se quiere un margen: es la misma
   cadena, cambiando el nombre de la cabecera.

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
