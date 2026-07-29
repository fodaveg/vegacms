# Encargos versionados

Cada fichero de esta carpeta es el **contrato de tarea** de un lote delegado a un agente
implementador, bajo `CLAUDE-CODEX-WORKFLOW v1.1`. El contrato exige que exista **antes** de que el
crítico lo lea y **antes** del despacho, y que esté versionado: el `prompt_hash` que viaja en el
despacho es el SHA-256 del fichero tal y como quedó commiteado, así que cualquier edición posterior
invalida el despacho y obliga a recalcularlo.

Esto no es documentación de producto. Es la trazabilidad de quién encargó qué, sobre qué base, con
qué criterios de aceptación y qué decisiones quedaron reservadas al humano. Sirve para responder,
meses después, a «¿por qué este código hace esto?» sin depender de la memoria de una conversación.

## Cómo se calcula el hash

```sh
shasum -a 256 encargos/<slug>.md
```

Se calcula sobre el fichero YA commiteado, y se copia al campo `prompt_hash` del despacho, no al
propio fichero: un hash que se incluyera a sí mismo no podría cerrarse.

## Rutas: las deriva el script, no las inventes

`~/code/scripts/codex-dispatch.sh` calcula las dos rutas a partir del `slug`, y el `slug` es el
`task_id`. Si el encargo declara otra cosa, el worker **falla cerrado** por `WF-014` sin tocar nada
y el despacho se pierde entero:

| campo del contrato | valor obligatorio                                |
| ------------------ | ------------------------------------------------ |
| `repos[].worktree` | `/private/tmp/vegacms-<task_id>`                 |
| `expected_reports` | `/private/tmp/vega-informes/<task_id>.md`        |
| `repos[].branch`   | el que le pases al script, sin derivación mágica |

Pasó dos veces el 29 jul 2026: un informe escrito en `feat-<slug>.md` que el canario no vio (lote
perfecto marcado como «sin entrega»), y un `worktree: /private/tmp/vegacms-site-seeding` cuando el
script crea `/private/tmp/vegacms-site-seeding-one-step`. **Antes de despachar, comprueba que las
dos rutas del contrato contienen el `task_id` literal.**

## Ciclo de vida

Un encargo no se borra al completarse el lote. Se queda como registro histórico; el estado vivo
(qué se integró, con qué recibos) vive en el historial de git y en los informes del lote.
