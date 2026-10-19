# Revisión independiente del protocolo MIME discovery

Veredicto: **APTO estático**, operación `56321639-b882-4caa-869b-f9a48877b9a7`. No concede aprobación runtime ni acredita aplicación o HTTP servido. Root es el único ejecutor. Revisión sin SSH, builds, cambios de fuentes ni ejecución de tests.

## Sello revisado

Base: `.verification/worktrees/caddy-referenced-env-20261008/.verification/lumbre-astro-production-20261008/serving-verification/mime-fix/ops-apply/`.

| Artefacto | SHA-256 |
|---|---|
| manifest.json | `9b0b5401e2cf6a4bde2c39b546d22815fddaa3387127c63d6cf9b33ea1dbc204` |
| remote_apply.py | `62ef7df57a6b4c605a6e38fed0b60e6ae9e50c452e4a87eb250afb28f8f84fff` |
| run_once.py | `568e7387174ce1a01782bfded1c3d03506c8a34c40bff5c715c396900e29cda5` |
| candidate.Caddyfile | `d909f78a737b7970fae80468bb895cd8ac9ee035b1c5892273e73f8f10536d17` |

Inventario inicial: ocho adiciones fuera del índice, contabilizadas mediante stat/name-status contra `/dev/null`: candidate.Caddyfile, capture.py, checks.json, manifest.json, proposal.md, remote_apply.py, run_once.py y test_ops.py. Lectura completa inicial y delta final de helper, llamadas, tres negativos, checks, propuesta y manifiesto. Verificación local de integridad: siete artefactos coinciden con su SHA en el manifiesto. Contexto adicional: `../evidence.json`, candidato publicado `4047607258fb890d54cc7be418061ccfa59b4e29`, árbol `b3125bb6bd8ed56f5ccd77dbf763bfdf8127787c`.

## Hallazgo cerrado

P1 del snapshot anterior: faltaba revalidar la identidad propia del Caddyfile inmediatamente antes de activar el forward y el rollback. Podía recrearse site con bytes ajenos introducidos después de instalar/restaurar.

Corregido en `remote_apply.py:222`, llamadas en `:261` y `:287`: `pre_recreate` compara guardas de Compose/site/publisher, imagen y container ID, y finalmente bytes y metadatos completos de la identidad instalada o restaurada. Drift detiene la siguiente recreación. Los negativos `test_ops.py:143`, `:158` y `:176` cubren cambio ajeno tras instalar, tras restaurar y cambio de Compose tras restaurar. Conservan bytes ajenos y no realizan la recreación adicional. No quedan must-fix en este sello.

## Contratos comprobados

- Matcher literal `/api/vega/discovery`, con query, añade solo Content-Type JSON. HTML/CSS/subpaths siguen fuera; recibo local enlazado acredita Caddy 2.11.4 adapt/validate y cinco casos HTTP, sin afirmar serving productivo.
- Config interno de Lumbre web exclusivamente; guard SHA anterior `fb32709db7dfdf999a41e44cdee6669c141de2ffc067168931a051c9bbad92ba`, Compose `680d04d18b7707fba2e7b377609c70e4f78f7067bb5e4e68e0f19972fd989ef5`. No lectura del Caddy de edge, Environment, `.env`, Health.Test/Output o logs.
- FD de ancestros/hoja sin symlinks, lectura regular acotada, identidad antes/después, atributos preservados, fsync, parent FD retenido y backup privado exclusivo. Identidad ambigua tras escritura exige operador; rollback solo de la identidad exacta propia.
- Imagen y selección de runtime actuales comprobadas sin confundir ID con manifest digest. Solo site se recrea, sin dependencias, pull/build ni env_file. Publisher ya pausado y sin request ni builders; no cambia su estado.
- Wrapper sella buffers únicos y usa esos mismos bytes en el payload; helper capture también proviene del buffer sellado. Scope/operación/manifiesto/aprobación exactos; marcador exclusivo antes de una sola conexión. Salidas cerradas: estados, booleanos, exits y hashes; stdout privado acotado, stderr descartado, sin mensajes crudos.

## Evidencia y límites

`checks.json` declara 20/20 tests offline, compilación del payload y Python, y wrapper sin aprobación con cero conexiones. Se leyeron tests y recibos; no se reejecutaron. El candidato es estático y las guardas de producción deben pasar durante la ejecución autorizada. Los checks secuenciales no son CAS ni locking frente a un escritor externo: se requiere la exclusividad de root y publisher pausado que explicita la propuesta. Caída de transporte o resultado ambiguo exige nueva lectura revisada, no replay.

La aprobación APTO no altera el rechazo vigente de lecturas privadas de Caddy ni acredita preview autenticado, click CMS o QA visual. Después del apply queda la comprobación pública clasificada de MIME; los 55 hashes estáticos son evidencia independiente.
