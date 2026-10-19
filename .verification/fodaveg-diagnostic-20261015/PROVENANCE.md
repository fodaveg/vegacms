# Procedencia de la lectura Fodaveg del 15 octubre

La raíz ejecutó el cuerpo de `submitted-inline.py` por un heredoc `python3 -B -` desde `/Users/david/code/vegacms`, mediante `tools.exec_command` con `sandbox_permissions=require_escalated`. No se ejecutó el CLI antiguo sin parametrizar ni se modificaron sus fuentes congeladas.

El comando aprobado terminó su lanzamiento en `chunk_id=6757df`, devolvió `session_id=49185` y se continuó el mismo handle mediante `write_stdin`. El resultado terminal fue `chunk_id=5dfbbe`, `exit_code=0`, con la proyección completa `PROJECTED` del backup `fodaveg-20261015T020337Z-50583`. La evidencia de estos IDs y del comando está en los tool calls de la sesión actual; este documento se redactó después de aquella ejecución para hacer accesible su procedencia. No hubo reejecución para escribirlo.

La parametrización consiste exclusivamente en `m.BACKUP_ID=bid` dentro del bootstrap remoto y `w.BACKUP_ID=bid` en el validador local. Ambos reciben el backup propio emitido por `forward-cutover-execution.json`. El cuerpo del lector `diagnostic-read-v2.py`, el ejecutor `remote_cutover_controlled.py`, el helper y el validador conservan sus hashes. Todos los bytes transmitidos se capturaron, verificaron y codificaron en el mismo proceso; la lectura no cambia archivos ni contenedores remotos.

El JSON guardado es `.verification/cors-network-adoption-20261008/fodaveg-delivery/forward-cutover-diagnostic-20261015.json`. Su SHA256 es `49d03b44db3aa147cfac0b9be9e853aac5722b8b4d890d46546b818afc43fc3f`. El wrapper limita stdout a 2048 bytes, descarta stderr y exige el esquema cerrado con `remoteWrites=false` y `privateValuesExported=false`; ningún valor de configuración, log ni Health.Output se exportó.

`submitted-inline.py` es una copia posterior del cuerpo exacto enviado, conservada como evidencia; no ejecutarlo de nuevo. El recibo de corte sigue en STOP y el journal remoto en CREATED. Esta lectura acredita el estado observado, sin explicar la causa exacta del STOP ni sustituir los guards vivos requeridos antes de efectos posteriores.
