# Revisión del lector Docker de metadatos de logs

Veredicto: **APTO estático para el alcance selectivo**, operación47071b83-5d63-45af-9d32-b74edb89bfef. No cierra la tarea de logs ni acredita inventario runtime. Root debe obtener el nuevo permiso exacto; ningún rechazo Caddy previo cambia. Sin SSH/Docker/builds ni ejecución de tests por el revisor.

Base del candidato: `.verification/worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/`.

| Archivo | SHA-256 |
|---|---|
| manifest.json | `b052a02e9077a665890936b5fddb7d3504b092d6a6cc3791132a02509eacb4af` |
| remote_read.py | `8ec7e275959aca8f0bb5cfb29e7336ad273b28a26ba715fa48b4cabcd74b8d00` |
| run_once.py | `5cf220bc2894b68ce4a9014a63a2b3f42cbbb767760da98ab1b0f4a2863fc43f` |
| project_metadata.py | `365ef90796abf30359b3210026b0918e9e263a3f00f6560df31ac6b35bb7eacf` |
| capture.py | `d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01` |

Inventario stat/name-status contra `/dev/null`: once adiciones, todas contabilizadas y leídas completas: remote_read, run_once, capture, pins, project_metadata, test_executor, test_projection, proposal, receipt, checks y manifest. Diez artefactos del manifiesto comprobados por SHA. Contexto reutilizado: identidades actuales de la proyección CORS y recibo de las tres imágenes; capture idéntico al previamente revisado MIME.

No hay must-fix. Selección primera Id/Image de cuatro nombres literales exige pins exactos; consultas posteriores usan container ID, no nombres reemplazables. Se lee solo driver scalar antes de ninguna opción. Driver desconocido/externo/journald no pide opciones; para json-file/local/none la segunda consulta produce solo driver y booleano de claves ajenas. Unknown impide valores; la tercera pide exclusivamente cinco valores de rotación/delivery, y repite driver/key gate. Recheck final de las cuatro identidades invalida globalmente observaciones parciales si hay drift. Máximo20 comandos, timeout12 y stdout8192 por consulta.

Proyección conservadora: tamaños/counts acotados, enums finitos, ausencia no infiere defaults, none no prueba ausencia de otros sinks, límites de tamaño/count no se convierten en días de retención. Un valor ajeno no se refleja. Drivers/keys desconocidos conservan STOP del canal; identidad desconocida descarta los cuatro resultados. La salida no incluye IDs ni imagen, paths, nombres de opciones ajenas, valores privados o errores. No Config.Env, LogPath, Health.Test/Output, logs, Caddy GET, exec de contenedores, credenciales o marcadores productivos.

Wrapper: scope/grant/operación/manifiesto exactos y snapshot único de los diez buffers; checks y payload usan esos mismos bytes. Proyector/capture/pins además tienen SHA fijo. Helper capture proviene del snapshot, stdin Python sin archivos remotos, stderr drenado/descartado y stdout acotado. Marcador exclusivo antes de una sola conexión; sin aprobación o con operación consumida, cero conexiones. JSON final cerrado antes de persistir archivo exclusivo0600; globalTokenAbsence/taskClosure/remotewrites/logsread/configEnvRead siempre false.

Tests locales declarados en checks:14 executor +10 projector, compilación/payload0 y negativos de driver/key gate, private canary, identity drift, snapshot mutation, cero conexiones y replay. Se leyeron las pruebas y su evidencia, sin repetirlas. No se acreditó template Docker real; un error del template retorna STOP sin ampliar acceso. Los pins son anteriores a cortes CORS; tras una recreación este sello debe detenerse, no actualizarse ciegamente.

La propuesta conserva PB effective settings, Caddy default runtime/named/custom como no observados. Esas etiquetas registran límites, no crean nuevos criterios de producto ni un permiso para consultar fuentes privadas. La tarea original y la evidencia efectiva posterior deciden el cierre. Exclusividad de root y revisión de un nuevo alcance siguen siendo necesarias para cualquier acción posterior; no hay fallback ni retry.
