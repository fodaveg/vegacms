# Procedimiento pendiente de revisión y autorización

1. La release owner comprueba estado vivo Fodaveg/edge/Vega/Lumbre y
   Compose/Caddyfile. Si difiere un pin, actualiza el candidato local,
   repite pruebas afectadas y prepara un operationId y manifiesto nuevos.
2. Revisa `remote_validate.py`, el fragmento, los tres patches, scope,
   política de proyección y evidencia local. El sello definitivo incluye
   todos los artefactos de `run_once.ARTIFACTS`; cualquier cambio lo invalida.
3. Solicita autoridad runtime específica para leer en RAM la fuente real
   `/srv/edge/Caddyfile`, resolver sólo valores referenciados, fusionar
   el cuarto delta y validar los cuatro deltas en copia aislada. No incluye
   aplicación, reload, exportación de valores/config/logs ni inventario Env.
4. Sólo tras revisión y grant exacto, la release owner crea
   `execution-approval.json` para ese manifiesto y ejecuta una vez
   `python3 -B .verification/caddy-global-logs-20261015/run_once.py --operation-id <ID>`.
   Sin approval, el wrapper no abre conexión. Un intento consumido no se
   reintenta con el mismo ID.
5. Revisa `projection.json` y `execution-receipt.json`. Éxito de copia
   aislada no equivale a aplicación; preparar después el cambio activo,
   su revisión/autoridad propia y la comprobación servida con marcador
   artificial, según `infra/production/README.md`.
