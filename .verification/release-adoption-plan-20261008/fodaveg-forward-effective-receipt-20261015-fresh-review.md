# Revisión independiente: recibo Fodaveg de estado efectivo (15 oct 2026)

**Veredicto: APTO para la dependencia CORS local acotada; sin must-fix.** No acredita que el corte original haya terminado correctamente: su recibo sigue `STOP_NEEDS_OPERATOR / HEALTH / NewRuntimeUnhealthy` y el journal remoto sigue `CREATED`. Tampoco acredita una comparación pública inmediatamente anterior al corte: la baseline es del 9 de octubre.

## Candidato y alcance

- Worktree: `.verification/worktrees/fodaveg-cutover-failure-20261008/.verification/fodaveg-forward-reconcile-20261015/`.
- Inventario diff-first: `git diff --stat` y `git diff --name-status` vacíos porque son artefactos sin seguimiento; se contabilizaron los seis ficheros `aggregate.py`, `selftest.py`, `receipt.json`, `BRIEF.md`, `selftest.log` y `SHA256SUMS`. Se leyó íntegro el delta y el consumidor directo `remote_dependencies.py:17-64`.
- SHA-256 de `receipt.json`: `ac3334c07a2f95db384a8422987a79d109539cbc9f904fc6f3a015b9cd7e80c1`. El sello 5/5 y los seis tests dirigidos figuran en el candidato; no se repitieron.

## Evaluación

`aggregate.py:10-35` fija por SHA los cuatro recibos de entrada. `aggregate.py:45-80` exige el STOP original con su backup/record propios, la clonación completa (71 archivos, 875285637 bytes), el diagnóstico de NEW sano y propio, y el smoke público `CORS_PUBLIC_OK` de 155/155 con origen propio, ajeno, nulo, preflights, discovery y peers. `aggregate.py:81-103` limita expresamente el significado de PASS al estado efectivo observado y conserva el STOP, el journal `CREATED` y el carácter histórico de la baseline. El hash del diagnóstico observado es `49d03b44db3aa147cfac0b9be9e853aac5722b8b4d890d46546b818afc43fc3f`.

Se contrastó la procedencia de ese diagnóstico: `.verification/fodaveg-diagnostic-20261015/submitted-inline.py` tiene SHA-256 `f6acf5b757c8a97bf88692cf9f674b305a84bbd48c4298b52a0f80f255728eea`; su parametrización en RAM cambia únicamente `BACKUP_ID` en el lector remoto y validador local. `PROVENANCE.md` conserva la ejecución aprobada de solo lectura (chunk `6757df`, sesión `49185`, terminación `5dfbbe`, exit 0); este documento se creó después de la ejecución, por lo que la asociación exacta con el comando enviado depende de esos tool calls. La especificación congelada de `remote_cutover_controlled.py:36-38` coincide con Compose target `eb62c044...`, imagen `sha256:22cf0983...` y rutas/env que validó el lector. No se ejecutó otra lectura remota en esta revisión.

El consumidor `remote_dependencies.py:17-28` requiere `status=PASS` y tupla cerrada con ID, imagen, Compose y `receiptSha`; el `receiptSha` externo es el hash del agregado anterior. `remote_dependencies.py:47-64` vuelve a comprobar en vivo ID, imagen, running y Compose antes de operar; no consume ni requiere una fase del journal Fodaveg. Así, el agregado basta como evidencia local para esa dependencia concreta, sujeto al guard vivo. La causa original de `NewRuntimeUnhealthy` no quedó explicada por el snapshot posterior; no hace falta editar el journal ni repetir el corte para cumplir este contrato consumidor.

## Hallazgos y límites

- **Must-fix: ninguno.**
- **Límite operativo:** el diagnóstico es puntual; el PASS local no sustituye la revalidación viva de la tupla. El smoke público posterior no demuestra continuidad entre ambas observaciones.
- **Límite de atribución:** no hay baseline pública fresca inmediatamente anterior; la de 9 de octubre solo ofrece comparación histórica. No declarar equivalencia exacta antes/después del corte.
- **Fuera de esta revisión:** ejecución remota de `remote_dependencies.guard()`, conciliación del fallo HEALTH, replay, rollback, despliegue y efectos de red. No hubo SSH, Docker, builds ni permisos nuevos en esta revisión.

**Listo para adoptar como recibo de estado efectivo y dependencia CORS revisada.** El corte formal permanece detenido; los efectos posteriores deben ejecutar su guard vivo sobre la tupla exacta.
