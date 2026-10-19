# Procedimiento pendiente de revisión y ejecución serial por root

1. Revisar el diff contra `../caddy-global-logs-20261015/` y el
   diagnóstico de la segunda sonda. Comparar `patch-inputs.json`,
   `global-log-fragment.caddy`, `projection.py` y `run_once.py` byte a
   byte con el candidato consumido; sólo cambian `remote_validate.py`,
   las regresiones y la documentación/evidencia local. Verificar
   `manifest.json` y su SHA antes de preparar autoridad.
2. Reconciliar pines vivos: cuatro Caddyfiles, imports del mismo scope,
   cuatro Compose, IDs de edge/consumidores, imagen y comando PID1. Si
   cambian, STOP y preparar otro candidato. Un éxito local no permite
   asumir que la fuente privada siguió igual.
3. Bajo la autoridad actual de **validación privada de los cuatro
   deltas**, la release owner crea el `execution-approval.json` exacto
   para este operationId, manifest y `run_once.SCOPE`. Eso autoriza una
   validación aislada, nunca aplicación/reload. Sin approval, wrapper
   sale antes de SSH o marker.
4. Ejecutar **una sola vez**
   `python3 -B .verification/caddy-global-logs-rawquote-20261015/run_once.py --operation-id 9a4f3ec9-8816-46a8-b69b-9a5e9ca37dc3`.
   El intento consumido no se reintenta con el mismo ID.
5. Revisar `execution-receipt.json` y `projection.json`: éxito exige
   `VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION`, `adaptExit=0`,
   `validateExit=0`, `globalLogMerged=true`,
   `globalLogFilterVerified=true`, `policyRestored=true`, CAS de fuentes,
   Compose/imports/referencias y scratch limpio. Si STOP, diagnosticar
   sólo la siguiente frontera acreditada; no relajar reglas a ciegas.
   Aplicación, reload y smoke servido permanecen en otra operación
   revisada y autorizada.
