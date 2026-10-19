# Fodaveg: retiro de un export remoto propio

Veredicto final: **APTO estático**, limitado a operación `836eb9dd-ec1b-4d81-a542-3c57a855b7de`. No ejecución por el revisor, no grant creado. Requiere aprobación runtime nueva; no autoriza TEST ni cutover.

## Material revisado

Inventario stat/name-status de cinco archivos nuevos y lectura completa, más delta final y vecinos de los imports ya revisados:

- Remote `retire-image-archive.py`: `a143747fb74f0a7fef630adb11e45d9e477fe9cb357af9bad13a28e8ed8c9531`.
- Wrapper final: `792c311a393e646a1b4a6ab2d7e7c3da0fe9cff7dbe7678de16a0602dc14d6fd`.
- Selftest final: `3a1ebe56c8e74949b3382456781f5e629a1d15c08e200144b7e64b349b4f4129`.
- RETIRE_IMAGE_ARCHIVE: `b05f398d7b87130aa75fd160ebba44eec851c6378ba4ff0ec8c36b7f5d40bccf`.
- Manifest final: `6c513e2bfb13f9d35ff61379ca2091be33325291dd7a9577fded893fb85550da`.

Imports frozen: helper5d4131, controlled43b68a, transportad47c6 y captured48e4. Rutas conocidas de verificación fuera del índice del grafo; no se ejecutaron los ocho tests del owner ni se releyó el archive488MB para esta revisión.

## Hallazgos resueltos

P1 inicial wrapper183337: tras comprobar el archive local había persistencia del marker antes del transporte sin última comprobación de identidad. El wrapper final revalida inmediatamente después del marker el mismo FD previamente hasheado, leaf/fullidentity y parent literal antes de conectar. El negativo dirigido reemplaza el local por otro inode con idénticos bytes durante markerwrite y exige cero Popen, marker consumido, receipt UNKNOWN y conservación del archivo ajeno.

P2 inicial manifest0f447: las rutas metadata de cors_apply/image_transport apuntaban incorrectamente al helper. El manifiesto final fija remote_cutover_controlled.py y remote_transport.py. Sin must-fix pendiente en el sello final.

## Alcance comprobado

Sólo unlink del export remoto conocido488653312B/SHAabac0eb3, conservando la copia local acreditada por FD durante toda la llamada y comprobada después, OCI22cf cargada/layers, OLD fijo healthy y todos los backups/datos. El reader exige archivo regular0600/euid/nlink1, hash y fullidentity por el mismo FD, parent0700/no symlinks; los dev del archivo, allocator real y backup deben coincidir. Persistencia/fsync de intención propia PREPARED y UNLINK_ISSUED precede al efecto. Tras el último save, los guards comprueban FD/leaf/parent y cadena literal inmediatamente antes del unlink relativo al parent FD. No elimina replacements ajenos ni otros recursos.

Los pins de Id/RootFS.Layers e Id/Image/Running/Health.Status, el state propio PREPARED y allocator escalar RAM se revalidan. El FD del archive se cierra antes de observar espacio liberado. Sólo free real posterior puede producir budgettrue para allocator1510136KiB y srv1511160KiB, con las reservas ya fijadas. Presupuesto insuficiente da RETIRE_COMPLETED_BUDGET_FALSE; no se interpreta st_size o unlink como recuperación física garantizada. No se leen Env, Health.Output/Test, logs privados, datos del volumen o configuración amplia; no Docker control/build/pull/unload.

Wrapper: buffers grant/manifest/fuentes importadas son los mismos hasheados/transmitidos; exige scope exacto y referencia runtime real, un marker exclusivo antes de SSH, salida cerrada sin errores privados, JSON0600 y máximo un intento. Un archivo local APPROVED no sustituye el consentimiento o aprobación del entorno. UNKNOWN/STOP consume el intento y exige una sonda nueva para conocer el efecto; nunca un segundo unlink ciego.

## Límites

APTO es revisión de protocolo, no prueba de ejecución. La estabilidad se verifica en puntos definidos, no constituye un bloqueo global sobre escritores concurrentes; una deriva posterior provoca STOP/UNKNOWN. El presupuesto es instantáneo, no reserva. No se limpian TEST no registrados, datos, imágenes o backups. No se valida todavía la receta de reprobe/cutover siguiente.
