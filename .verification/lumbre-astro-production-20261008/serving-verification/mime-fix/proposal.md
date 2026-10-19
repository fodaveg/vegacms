# Discovery JSON: ajuste acotado de Caddy interno de Lumbre

**Candidato local verificado, pendiente de revisión/integración/aplicación por la raíz.** La lectura pública observó que los55 assets coinciden en bytes/SHA; `/api/vega/discovery` da200 con `text/plain`, único MIME incorrecto. El diagnóstico sólo exportó clase finita TEXT_PLAIN y confirmó SHA1877b618…; no hubo SSH, tokens, headers/cuerpos guardados ni lectura de entorno.

Propiedad exclusiva: `infra/production/Caddyfile` en `/Users/david/code/vegacms/.verification/worktrees/lumbre-discovery-mime-20261008`, rama `fix/discovery-json-mime-20261008`, baseLumbre `abb2bb2f8fd7627534c069b9e9ec5bd727adb12b`. Cinco líneas añadidas, matcher path EXACTO `/api/vega/discovery` y `header @vegaDiscovery Content-Type application/json`. BeforeSHA `fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba`; afterSHA `d909f78a737b7970fae80468bb895cd8ac9ee035b1c5892273e73f8f10536d17`. [Parche remoto exacto](web-Caddyfile.patch), [candidato](web-Caddyfile.candidate). Los archivos estáticos L13, Compose, deploy/publish scripts y el lector Caddy privado permanecen intactos.

La fuente durable ya existe: `infra/production/compose.yml` monta `./Caddyfile` readonly en `/etc/caddy/Caddyfile`; `infra/production/deploy.sh` copia ese fichero a `/srv/lumbre-web/Caddyfile`. Integrar este único cambio en el repo Lumbre conserva la corrección en futuros deploys. No hace falta reconstruir imágenes ni el archive estático de55 archivos. El hook de publicación de contenido conserva los bytes JSON; la corrección pertenece al servidor estático.

Caddyv2.11.4 sólo deduce el MIME del archivo si Content-Type no está establecido: [fuente fijada](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/fileserver/staticfiles.go#L506-L514), [header](https://caddyserver.com/docs/caddyfile/directives/header). Por eso el matcher/header core antes de file_server resuelve el endpoint sin cambiar su cuerpo. El matcher path conserva query strings (query no forma parte del path) y no incluye subpaths.

## Evidencia local real

Imagen LOCAL existente de CSPfinal/SEC: `sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4`, RepoDigest caddy@sha256:5f5c8640… acreditado, versionv2.11.4. Se usó el bounding set mínimo ya documentado: cap-dropALL+cap-addNET_BIND_SERVICE, necesario por la filecap del binario. No builds, installs o pulls. Input: sólo el Caddyfile público y un sitio sintético readonly. Memoria64MiB/tmpfs16MiB/pids64/CPU1 por contenedor; presupuesto local <1MiB, sin suite pesada.

[Attempt1](local-caddy-receipt-attempt1.json): version/adapt/validate exit0. HTTP aún no se ejecutó porque la red --internal no publica puerto; todos los recursos propios se retiraron y su ausencia se confirmó. Se conserva la [fuente ejecutada](verify_local_caddy.executed-attempt1.py).

[Attempt2](local-caddy-receipt-attempt2.json): repitió SÓLO HTTP en bridge propia ligada a127.0.0.1, como autorizó la raíz, reutilizando native0 del candidato/imagen exactos. Discovery y query200 JSON; homepage200 HTML; asset200 CSS. El subpath400 sin JSON satisfacía la frontera, pero la fixture inicial exigía404. No hubo cambio de producto por ese supuesto; se corrigió únicamente la aceptación a400/404 noJSON y se preservó [esa fuente](verify_local_caddy.executed-attempt2.py).

[Attempt3](local-caddy-receipt-attempt3.json): exit0, cinco de cinco HTTP pasan; negativo subpath400 sin Content-Type JSON. Referencia SHA del recibo native inicial incluida y validada antes de repetir. [Runner actual](verify_local_caddy.py). Todos los contenedores/redes/scratch propios retirados y ausencia acreditada; imágenes compartidas y evidencias preservadas. `git diff --cached --check` exit0. Árbol verificado antes de commit `b3125bb6bd8ed56f5ccd77dbf763bfdf8127787c`.

## Receta de aplicación para la raíz (no ejecutada aquí)

1. Revisar fuente/diff/sellos y commit; confirmar autoridad vigente para el único fichero `/srv/lumbre-web/Caddyfile` y la recreación de `site`. Comparar guard actual con fb327… antes de escribir. No consultar `.env`, bloques de entorno, configuración del borde ni logs privados. Drift implica STOP.
2. Aplicar exactamente [web-Caddyfile.patch](web-Caddyfile.patch) con Git normal check/apply, conservando copia/guard del before para rollback. Exigir afterSHA d909… y byte-identidad fuera de las cinco líneas. El bind de fichero requiere recrear el servicio para ver inode/config nuevos; el admin interno está off, así que no se promete reload por API.
3. Recrear SOLAMENTE `site` con el Compose ya vigente `/srv/lumbre-web/compose.yml`, sin build/pull y sin cambios a peers/edge: `docker compose -f /srv/lumbre-web/compose.yml up -d --no-deps --force-recreate --no-build --pull never site`. No construir ni reemplazar imágenes. La breve recreación de este servicio pertenece al plan de publicación de raíz.
4. GET público `/api/vega/discovery`: exigir200, application/json y SHA1877b618…; comprobar query positivo y un subpath noJSON. Reusar evidencia55bytes sólo con guard de archive/candidato idénticos; comprobar que el único delta público esperado es el MIME discovery. Preview sin token y health tresadmins siguen siendo checks públicos independientes; el token real CMS continúa pendiente de su prueba específica.
5. Para rollback, restaurar el Caddyfile before EXACTO y recrear sólo `site` con la misma imagen/Compose. No sustituir el contenido servido ni tocar datos.

El recibo público inicial y la prueba positiva con token real no se convierten en verde por esta prueba local. Aquí no se aplicó nada en producción. El registro de decisiones compartidas queda bajo autoridad de la raíz; este ajuste implementa el contrato existente de discovery JSON y no toma una nueva decisión de producto.
