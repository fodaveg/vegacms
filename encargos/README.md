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

## Ciclo de vida

Un encargo no se borra al completarse el lote. Se queda como registro histórico; el estado vivo
(qué se integró, con qué recibos) vive en el historial de git y en los informes del lote.
