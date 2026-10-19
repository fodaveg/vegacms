# Red durable Vega — revisión independiente del candidato nuevo

Fecha: 2026-10-09. Veredicto: **CAMBIOS REQUERIDOS / HOLD de ejecución del lote A → publicación → B** por un fallo confirmado del rollback de B. La publicación durable y su guard estático no presentan otro must-fix identificado. Esta revisión no autoriza ejecución remota.

## Candidato e inventario diff-first

Candidato: `/Users/david/code/vegacms/.verification/worktrees/network-durable-20261009/.verification/network-durable-candidate-20261009`; base HEAD `b00186ce5587fcc7323aefdd9d3cdcbfea281750`, rama declarada `codex/network-durable-20261009`.

`git diff --stat` y `git diff --name-status` inicialmente vacíos: los artefactos completos son untracked (`?? .verification/` en el worktree). Se revisaron las fuentes nuevas como adiciones desde `/dev/null` y todos los otros artefactos en representación legible. Inventario completo: 11 archivos, 1081 líneas.

| Archivo | Líneas | Revisión |
| --- | ---: | --- |
| BRIEF.md | 52 | Completa; alcance, secuencia, recreación futura y pendientes |
| remote_edge_durable.py | 408 | Diff completo y helpers directos de publicación/rollback |
| remote_stock_durable.py | 59 | Diff completo y consumidores del guard en apply/rollback |
| remote_dependencies.py | 64 | Diff completo; esquema, tuplas y límites de proyección |
| run_candidate.py | 154 | Diff completo; bootstrap, transporte y recibos cerrados |
| selftest.py | 266 | Diff completo; límites reales de los 12 tests |
| seals.json | 12 | Esquema y hashes reales de los 10 módulos comprobados |
| SHA256SUMS | 10 | Todos los 10 hashes comprobados: OK |
| dependencies.draft.json | 34 | DRAFT/PENDING rechazado; no prueba dependencias reales |
| offline-selftest.log | 17 | Evidencia existente 12 PASS, reutilizada sin rerun |
| frozen-stock-selftest.log | 5 | Evidencia existente 5 PASS, reutilizada sin rerun |

Identidades revisadas: edge durable `b61ff6c8ec78a235a724b02928f1e80d7593e2cff92ba5aab0ac957550063c14`; stock durable `7d24647323340afba5b5e46112abc4b3465be8d1eb62947afa9fa9bae3ae1f71`; dependencias `4b4486aaee4308f10dabd35fb231ac518beb3391e27dfc1aaf3c3e936c806ba2`; runner `719b8b69b5731867fee8f5937b01b698d5729cb70a2c834759fc3727da619f7d`; manifiesto `1852c923b05b9e4d6c7922dffba61dfa5478a9f52f32504e33b0269162e508f6`.

## Must fix — un único grupo de recuperación

🔴 **P2 — El guard rechaza el PocketBase ya restaurado sobre edge y deja el rollback sin cierre.** Ubicación nueva: `remote_stock_durable.py:31–32,44–45`.

El guard infiere `require_pb = selected_pb != stock.OLD_ID and stock.h.is_running(stock.NAME)`. Un rollback desde CREATED/AWAITING_PUBLIC_SMOKE recrea PocketBase sobre la red anterior `edge`, conserva el volumen y obtiene otro ID. Después de arrancarlo y comprobar su runtime sano, `cors_apply.rollback` llama `gate_files` en `remote_apply.py:651`. Ese consumidor congelado llama al guard sin argumento (`remote_stock_network_adapter.py:107–109`). Como el ID restaurado difiere de OLD_ID y está running, el guard nuevo exige que esté en vega-edge, aunque la recuperación correcta lo ha llevado a edge. La red propia contiene correctamente solo Caddy y se lanza `RunningPBAbsentFromOwnedNetwork`.

La comprobación falla antes de escribir ROLLED_BACK (`remote_apply.py:653–654`); el registro conserva ROLLBACK_CREATED aunque el servicio ya esté recuperado. El resultado termina STOP_NETWORK_ROLLBACK_NEEDS_OPERATOR y exige reconciliación manual. No se trata de un problema hipotético ni de un simple nit del recibo.

Reproducción dirigida offline sobre los módulos sellados, sin SSH/Docker: se simularon exclusivamente las fronteras externas del guard con el recibo publicado exacto, red vega-edge propia/Caddy-solo, un ID de PB distinto de OLD_ID y `is_running=True`. La llamada real `stock_durable.edge_guard()` produjo `RunningPBAbsentFromOwnedNetwork`; el control `edge_guard(require_pb=False)` aceptó la misma red. Resultado de la sonda:

```json
{"actualGuard":"RunningPBAbsentFromOwnedNetwork","explicitRecoveryMembershipAccepted":true,"probe":"rollback recreated healthy PB on edge with new ID; vega-edge contains Caddy only","remoteCalls":0}
```

Arreglo sugerido: adaptar en los archivos nuevos el contexto explícito de la recuperación y los consumidores de gate_files, vinculando la exigencia de membresía a la fase/fuente e ID acreditados. No inferir la topología exclusivamente por ID diferente al original. Mantener exigencia de PB en la red propia durante apply y rollback previo a retirar PB, y Caddy-solo tras la restauración acreditada sobre edge. No editar ni relajar los candidatos A/B congelados.

Criterio de cierre: regresión offline del flujo de rollback real CREATED/AWAITING_PUBLIC_SMOKE → restaurar fuente → recrear ID nuevo sobre edge → arrancar sano → guardar ROLLED_BACK → recibo cerrado aceptado por run_candidate.valid. Casos negativos: ID de recuperación ajeno, PB dedicado running ausente durante apply, miembros ajenos y deriva de fuente/recibo. La sonda de guard aislada actual no acredita por sí sola todo ese flujo.

Un supuesto fallo adicional por backupId fue descartado: la fuente real `cors_apply.rollback:657–659` sí devuelve `backupId=backup.name`; el stub inicial de esa sonda lo omitía. No se reporta como hallazgo.

## Contexto y garantías estáticas comprobadas

Normativa: `infra/production/README.md:105–136` y dictamen `network-durability-contract-review.md`, SHA256 `0f2aad51fc9343bf458e10f38ac558ebbbdf7e5f6ba76c83c8749dbbabc43657`. No existe obligación derivada de push/upstream/publicador ni ensayo de recreación real de Caddy. La fuente real seleccionada versionada, validación/aplicación de modelo y correspondencia runtime siguen siendo obligatorias.

Publicación: commit-tree de un único path con padre exacto y blobs; CAS de HEAD, copia aislada del índice real y lock antes de validar/publicar, preservación del staging ajeno y untracked sin checkout/reset/hooks/push. Los estados pending reconocen las fronteras Git/índice/archivo sin fingir transacción automática. Rollback source hace commit inverso propio y reemplazo condicionado del inode/bytes; no restaura producción ni elimina redes/volúmenes.

Modelo y privacidad: delta completo de modelos en RAM con `--no-interpolate --no-env-resolution --no-path-resolution --quiet`, desactivación dotenv, rechazo include/extends y validación final del archivo seleccionado. Runtime proyectado omite Env, conserva Caddy ID/image, argv, mounts, ports, restart policy, start/restart counters y selección Compose; hash solo en RAM. Guards propios fijan ID, owner, bridge local no internal y miembros exactos. La igualdad no afirma equivalencia literal del entorno completo ni prueba valores privados en recreaciones futuras.

B nuevo fija HEAD/padre/diff-tree/blob/índice/working tree publicados y recibo/red propios. El flujo de volumen heredado hace backup quiescente y restore de prueba TEST, conserva UID/GID/volumen/argv/alias/health y ausencia de puertos; rollback recrea sobre el volumen existente. Se trazaron apply/rollback/preflight/gate_files y el validador de transporte directos. No se encontró una restauración de datos productivos en este flujo.

La ausencia de dependencies.guard en durable-check/rollback-source no se eleva a must-fix: el check acredita fuente/Caddy, no declara PASS de todos los consumidores, y rollback source exige su preimagen publicada exacta, Caddy seleccionado y red propia Caddy-solo; condicionar esa recuperación a repetir los CORS completos inventaría otra obligación. La protección amplia de tuplas se ejecuta en publicación/B.

Recreación futura: frozen A conecta con gw-priority=-1, mientras el Compose durable conserva la lista edge/vega-edge sin prioridad. La selección futura del default gateway puede variar; las rutas conectadas de ambas redes permanecen y no se identifica una política de egress o consumidor concreto que convierta esta diferencia en fallo demostrado. El efecto queda expresamente revisado como límite, sin prometer igualdad del gateway ni exigir un recreate como ensayo. Fuentes/config/mount/env e imagen futura deben seguir válidas bajo la operativa existente.

## Pendientes reales y límite del dictamen

El input canónico deberá ser un JSON cerrado REVIEWED cuyo hash revise y selle root, con tuplas reales ID/image/Compose y hashes de los tres recibos CORS PASS más Caddy preflight final válido; el draft actual no sirve. La publicación devuelve los IDs/HEAD reales, con los que se sella el siguiente input source. No se aceptan inventados como active-ready.

No se verificó producción, soporte Compose del servidor, modelo real, Git remoto, propiedad real, resolver/health desde Caddy ni smoke de cada consumidor. Fodaveg aún estaba pendiente de cutover según handoff de root, y el cierre final Caddy estaba pendiente de sus recibos definitivos. Tras corregir el must-fix, sigue siendo **APTO solo estático si pasa la revisión del nuevo árbol**, pendiente de dependencias reales, permisos de runtime vigentes y pruebas A/publicación/B/resolver/smokes. Esta revisión no concede permisos nuevos ni permite ejecutar los congelados con un HEAD distinto.

Operación de esta revisión: lecturas locales, comparación de hashes y dos sondas pequeñas offline de contratos, sin suites/builds/dependencias nuevas, SSH, Docker, dotenv, grant, push ni cambios a código/config. Única escritura encargada: este informe. No se retiraron artefactos: se mantienen las fuentes y evidencia necesarias; no se generaron residuos pesados.
