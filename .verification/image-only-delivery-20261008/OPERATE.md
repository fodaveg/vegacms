# Secuencia pendiente para la release owner

Estado: preflight, diagnóstico Go y hash-only inicial del edge verdes; `images.tar` llegó
sellado. La primera llamada a `load` falló sin recibo, pero la sonda residual y la proyección
de identidad acreditaron tres tags cargados. `loaded-image-correspondence-20261008.json`
enlaza sus `.Id` OCI remotos con los config IDs del archivo local, sin reintentar `load` ni
retaggear. Cutover todavía pendiente; cada comando exige SHA y revisión independientes.

1. Conservar los recibos `load-residual-20261008.json`, `image-identities-20261008.json` y
   `loaded-image-correspondence-20261008.json`. Los IDs OCI efectivos del servidor son los
   nuevos guards de `remote_cutover.py`; los config IDs originales siguen en `manifest.json`.
   No repetir `load`: los tres tags ya están cargados y el archivo se enlazó 3/3.
2. Para `vega-pb`, tomar `served_smoke.py --stage baseline --service vega-pb` con salida nueva.
   Después `run_cutover.py --stage check --service vega-pb`, cotejar SHA del Compose propuesto,
   presupuesto de `/srv` y Docker, IDs, montajes, red, argv, old image y `command` stock sin
   `--origins`. Si todo concuerda, ejecutar `--stage apply` **solo para ese servicio**.
   El programa detiene su contenedor, guarda archivos íntegros y snapshot de su volumen,
   restaura ese snapshot en volumen TEST, comprueba bytes, cambia selector y comprueba
   runtime nuevo. Un STOP requiere `RECOVERY.md`, no reintento ciego.
3. Tras `CUTOVER_WAITING_SERVED_SMOKE`, ejecutar `served_smoke.py --stage after --service
   vega-pb --baseline <JSON fresco del paso 2>`; exigir 153/153 archivos exactos, MIME,
   HTML root/deep, salud, CORS y comportamiento de panel/asset ausente sin regresión.
   Repetir `run_edge_hashes.py` con JSON nuevo y confirmar cinco hashes sin cambio.
4. Solo entonces repetir el ciclo con `lumbre-admin-pb` y un **baseline nuevo**, luego con
   `fodaveg` y otro baseline nuevo. Lumbre coteja 153/153 contra stock; Fodaveg coteja
   155/155 contra su propio manifiesto ZIP, con clon que ejecuta `serve` de PB 0.39.9
   antes de tocar el volumen vivo PB 0.39.7. Cada servicio conserva snapshot/imagen anterior.
5. Tras los tres, ejecutar los smokes global y específicos compatibles con la política actual
   y registrar qué apartados del contrato completo permanecen pendientes (panel/CORS, login y
   acciones autenticadas). No marcar esas tareas como terminadas por un `IMAGE_ONLY_SERVING_OK`.

Los wrappers usan salida JSON filtrada y `0600`; no guardar stdout/stderr de Docker/Compose ni
datos privados. La release owner conserva el handle de cada operación hasta exit terminal.
