# Revisión del clasificador público de Vega

Veredicto: **APTO estático**, sin SSH, builds, ejecución de tests ni mutaciones externas por el revisor. Scope exclusivamente tres GET públicos sin autenticación.

Base: `.verification/cors-network-adoption-20261008/`.

| Archivo | SHA-256 final |
|---|---|
| public_config_probe.py | `577868ffde2a6bdb8a504bb397b7538fad9150d58c091f87f37cd54e65530915` |
| run_public_config_probe.py | `06bc69be767b456486f3fbaa05d9f7a0b93e685d34ebf91c9c7ffad3b0610ad4` |
| public-config-handoff.md | `6001c851f93bccf818416709c0dccb74c5fd0427b83fc1c362312945ed5458f8` |

Fuentes/handoff leídos completos y delta final comprobado; inventario stat/name-status de las fuentes contra `/dev/null`, 75 y 95 líneas finales. Integridad SHA verificada localmente. Grafo primero; el snippet de fetchVegaConfig correspondía a líneas obsoletas, por lo que se leyó la ruta conocida actual: `src/lib/session/backend.ts:442`, `src/lib/session/backend-config.ts:66` y `isAbsoluteUrl`. El contrato Deployment topology de PROJECT-CONTRACT-v1 concuerda con la resolución same-origin por defecto.

## Hallazgo corregido

P1, `public_config_probe.py:26`: el candidato cc274b trataba todo status diferente de200 como same-origin. No reproducía `res.ok`: por ejemplo, un206 con config backend distinto se clasificaba mal. Un302/307 bloqueado por la sonda tampoco demostraba ausencia de config, porque el fetch del navegador sigue redirects.

Final577868 acepta200–299 antes de parsear. Todo3xx se proyecta REDIRECT_UNFOLLOWED/UNDETERMINED, sin consultar Location ni ampliar destinos. El wrapper06bc valida coherencia status/shape/backend, también para otros2xx. No quedan must-fix. Referencia primaria: [Fetch Standard](https://fetch.spec.whatwg.org/#ok-status), OK status200–299 y comportamiento de redirects; la sonda conserva un resultado conservador cuando no reproduce el seguimiento del navegador.

## Flujo y privacidad

Tres URLs literales `/vega.config.json` de admin.vegacms.com, admin.lumbre.pro y admin.fodaveg.net. Sin proxy/redirects, timeout8s, máximo8193bytes para detectar exceso sobre8192. RAM local del proceso remoto; únicamente status, MIME categórico, forma JSON/parse categórica, clase de backend y flag overrideUninspected. Ni cuerpo, Location, headers crudos, URL ajena/hashes de URL, credenciales ni error se imprimen.

Un HTML200 no parseable produce SAME_ORIGIN: Vega devuelve null al fallar res.json y resuelve window.location.origin si no hay override válido. Arrays/primitivos y objeto sin backend también caen al default observable. Backend solo se identifica si coincide con alguno de los tres URLs públicos conocidos, tras trim; otras formas quedan UNDETERMINED. No se presume invalidez de una URL desconocida ni se expone su contenido.

El wrapper manda el mismo buffer cuyo SHA comprobó, descarta stderr, valida JSON de esquema cerrado antes de escribir, salida nueva exclusiva0600 con fsync. Nada solicita Config.Env, `.env`, Caddy, Health.Test/Output o logs. El permiso de ejecución corresponde a root y al runtime vigente; este APTO no reabre lecturas privadas rechazadas.

## Evidencia y límites

Handoff final declara ocho casos sintéticos/privacidad/esquema del owner, incluyendo206,302/307,404 y HTML200; no se reejecutaron. El lector no prueba usuarios autenticados, overrides locales, cada combinación de cookies/cache/service-worker ni todos los destinos cross-origin posibles. GET público aún pendiente de ejecución por root al emitir este informe. UNDETERMINED retiene la decisión afectada; PROJECTED no certifica que CORS permita efectivamente el origen legítimo o deniegue otros.
