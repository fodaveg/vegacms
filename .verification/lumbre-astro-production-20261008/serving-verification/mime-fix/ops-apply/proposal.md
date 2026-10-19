# Nueva operación MIME: revisión completa antes de aprobación runtime

Alcance: añadir únicamente `Content-Type application/json` al matcher exacto
`/api/vega/discovery` del Caddyfile de Lumbre web. Query conserva el matcher;
HTML, CSS y subpath permanecen fuera. Candidato de fuente: commit
`4047607258fb890d54cc7be418061ccfa59b4e29`, árbol
`b3125bb6bd8ed56f5ccd77dbf763bfdf8127787c`. Las pruebas Caddy 2.11.4 locales
(version/adapt/validate 0 y fixture HTTP 5/5) están en `../evidence.json`.
La modificación no demuestra preview con token real admin/CMS.

Leer completos `remote_apply.py`, `capture.py`, `run_once.py`, `test_ops.py` y
`candidate.Caddyfile`, además de este documento, `checks.json` y `manifest.json`.
No hay permiso runtime instalado; la raíz es el único ejecutor SSH. Este lote
no cambia ni ejecuta el lector privado reducido, ni amplía su rechazo vigente.

## Guardas y acción propuesta

- Antes: `/srv/lumbre-web/Caddyfile` SHA
  `fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba`.
  Después: `d909f78a737b7970fae80468bb895cd8ac9ee035b1c5892273e73f8f10536d17`.
- Compose conocido `/srv/lumbre-web/compose.yml` SHA
  `680d04d18b7707fba2e7b377609c70e4f78f7067bb5e4e68e0f19972fd989ef5`.
  Solo bytes de este fichero/config; jamás `.env` ni env_file ni Docker Env.
- Imagen seleccionada `caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`;
  el ID de imagen real debe coincidir antes/después. No comparar ID con digest
  de manifest. Imagen ya local: no pull/build/instalación.
- Runtime `lumbre-web` saludable, read-only, red única edge, dos montajes bind
  read-only exactos: Caddyfile y `/srv/lumbre-web/sites/a598bfe-astro020-pbadmin`.
  Solo proyección Docker de los campos enumerados en `run_once.SCOPE`.
- `vega-publish.path` y `.service` deben estar ya inactive; ausencia de request
  se comprueba por stat sin leerlo. Ningún builder de los dos tags autorizados
  en marcha. No detener, arrancar ni editar publisher.
- Crear backup privado exclusivo `.mime-discovery-<operationId>` modo0700,
  `before.Caddyfile` modo0600; conservarlo para diagnóstico/recuperación.
- Leer config sin symlinks en ancestros/hoja ni FIFO, máximo64KiB. Sustituir
  únicamente si SHA+modo+uid/gid+inode/device+size+mtime/ctime siguen iguales en
  dos lecturas. Mantener atributos, fsync y rename con parent FD retenido.
- Inmediatamente antes de CADA recreate, también rollback, comprobar de nuevo
  guardas completas, selección runtime/imagen/container ID y, al final, bytes y
  metadatos exactos propios. Drift => NEEDS_OPERATOR sin otra recreación.
- Recrear SOLO `site`, `--env-file /dev/null --project-name lumbre-web --project-directory /srv/lumbre-web`, `--no-deps --no-build --pull never
  --force-recreate --wait --wait-timeout 120`; verificar nuevo container ID,
  salud, misma imagen y selección/montajes/red, config instalada y guardas.
- Ante fallo, rollback únicamente si config conserva identidad exacta instalada
  por esta operación y guardas/imagen/montajes siguen aprobados (salud puede
  fallar). Restaurar bytes propios y recrear SOLO site, verificar runtime.
  Drift o identidad post-write desconocida => NEEDS_OPERATOR sin pisar terceros.

Las comprobaciones consecutivas NO son CAS atómico ni locking frente a un
escritor externo. La raíz debe mantener exclusividad del release/publisher.
Una caída de transporte no autoriza reintento: consultar recibo/estado por una
nueva operación revisada. Posible ventana de indisponibilidad de web durante
recreate; el borde y peers no se recrean. Nunca se leen logs para diagnosticar.

## Aprobación nueva y ejecución posterior de la raíz

Una revisión APTO local no concede permiso de producción. La raíz solicita al
runtime la acción exacta sellada, con acceso explícito a escribir ese fichero y
recrear site. Solo después crea `execution-approval.json` con los campos exactos
exigidos por `authorize()` y scope idéntico a `SCOPE`, operationId y SHA del
manifest, reviewStatus/status APPROVED y referencia real al grant del runtime.
No hay plantilla de autorización instalada ni referencias inventadas válidas.

`python3 -B run_once.py --operation-id <operationId-de-manifest>`

El wrapper snapshottea una vez los artefactos, comprueba esos mismos buffers y
forma payload con ellos. Marca operación consumida antes de abrir la única
conexión SSH. Salida: statuses finitos, booleanos, exits y tres SHA guardas;
ningún nombre de variable, valor, header, config, error crudo ni log exportado.
Sin aprobación exacta => ZERO_CONNECTIONS; sin retry/autofallback.

No se ha ejecutado SSH, escritura remota, recreación ni lectura privada por
este agente. Después del apply, la raíz debe repetir el GET público acotado y
clasificado del discovery; la evidencia de 55 hashes estática sigue independiente.
