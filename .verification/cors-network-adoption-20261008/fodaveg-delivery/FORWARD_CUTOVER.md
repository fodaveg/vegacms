# Fodaveg: siguiente cutover propio, pendiente de revisión y ejecución

Este candidato sustituye únicamente el ejecutor de snapshot/clone y su atribución de presupuesto. No repite controlled43: sus fuentes, helpers y recibos permanecen inmutables. `remote_cutover_forward.py` conserva runtime, patch, Compose CAS, created selection, create, start, espera healthy de OLD y rollback del candidato43. Los tests comparan esas funciones por AST y el tramo desde staging hasta antes del recibo de éxito por bytes.

La imagen sigue siendo OCI22cf/config1b, commitcc8f3b14dca9bf10e4a60502da9e17503362bbb8. OLD seleccionado es6bddffa8…/OCI0e0ef563…, Compose BASEa18777c5…→TARGETeb62c044…, dotenv SHA6c673031…. PB94d356/hookc11 y155 assets permanecen evidencia del mismo candidato; este lote no construye imagen ni modifica producto. Las pruebas locales nativas y CORS acreditadas se reutilizan para ese alcance.

## Evidencia real y presupuesto

`reprobe-test-execution.json` SHAbe5c282e179635e0f2bdc4891351f268517b044d4498a76880e403e0afdde2ab acredita root4948/terminal532f12 EXIT0: ownrecord `fodaveg-reprobe-20261009T054222Z-86851`,71 archivos/875290525 bytes, primary null y cleanup vacío, TEST_REPROBE_PASSED_AND_CLEANED. Demuestra restore/direct-PB/health/cleanup del backup quiescido existente3656162 con fixed IDs. No demuestra el nuevo snapshot ni un cutover productivo.

`retire-image-archive-execution.json` SHA23468c3b3474cfdfa13ecb52161f47fee856fda12a57e6a4343c5facb6e2d900 acredita únicamente retirada exacta del tar remoto488653312B autorizada por usuario. Copia local, imagen cargada y backups conservados; freeAllocator1252700→1729900KiB. Grant/marker consumidos no autorizan este forward.

El nuevo preflight mide DockerRootDir/volumes real, nunca el filesystem del volumen productivo como sustituto. Exige antes de escribir y de STOP:

- snapshot comprimido máximo128MiB, clone expandido máximo900MiB, PB128MiB, reserva512MiB, metadata1MiB (cada Compose original/nuevo y dotenv limitado a128KiB);
- si comparten FS, mínimo1709056KiB en srv y1708032KiB en allocator; el valor posterior a retirada1729900KiB sólo daba20844KiB de margen sobre ese mínimo, por lo que no acredita disponibilidad actual;
- MemAvailable mínimo1536MiB para gzip RAM acotado, consumo del proceso y reserva de host de al menos1GiB. Sólo ese campo de `/proc/meminfo` se selecciona.

Los900MiB son un límite efectivo de headers, no una inferencia desde `du` físico. Los128MiB se aplican durante captura con el capturador canónico d48e4a27…, que drena y descarta stderr. No se escribe un gzip mayor ni se extrae un miembro que exceda el máximo expandido. Si falla un límite después de STOP, el archivo nuevo que ya exista se conserva y la recuperación de OLD mantiene los guardas exactos. No se reduce la reserva para obtener verde.

## Secuencia y efectos

1. Validar pins, Compose/dotenv fullidentity/hash, OLD running healthy con PB1/Node1/tini1 y argv sin origins. Verificar presupuesto fresco real; crear sólo backup privado exclusivo cuyo ID está ligado al grant antes de SSH. Guardar allí Compose/dotenv originales privados y PREPARED. Inmediatamente antes de STOP, repetir presupuesto, runtime healthy y files CAS después del último checkpoint.
2. Detener OLDfixedID; exigir su runtime stopped completo, BASE/env original y cero usuarios activos del volumen. Durante snapshot/clone ese guarda requiere OLD detenido: no sustituye un callback healthy ni afloja mounts, aliases, ports, image, CmdNULL o selección.
3. Persistir nonce, nombres e intent del snapshot antes CREATE. `docker create --pull=never --network none --read-only --entrypoint /bin/tar` monta sólo prodvolume:/source:ro. Persistir returned fixedID antes START. Revalidar sus campos exactos, OLD stopped, memoria y presupuesto inmediatamente antes de `docker start --attach fixedID`.
4. Capturar gzip sólo en RAM del servidor, límite128MiB/600s. Verificar exit/status seleccionado; escribir `data.tgz` privado0600 mediante parentFD exclusivo y fsync. Conservar el FD verificado mediante hash/fullidentity/parent; registrar tuple completo y headers sin nombres privados. Limpiar únicamente snapshot fixedID comprobado antes de crear clone. Si CREATE no devolvió ID acreditado, registrar outcome unresolved y no adoptar por nombre/labels/mtime.
5. Reutilizar la secuencia del TEST en una fuente nueva con inputs explícitos: volumen local/noopts, inode/mount proof real, presupuesto fresh sobre el mount real antes de extracción, extractor/PB creados sin `--rm`, IDs persistidos antes START, mismo FD para extracción y byteverify de todos los archivos. PB directo en TEST sin red, health JSON code200 y timeout35s. Ningún montaje productivo rw ni restore de producción.
6. Persistir primaryphase/class/exit antes de limpiar. Mantener cleanup failures separados; intentar una sola limpieza por rol. Refrescar proof, detener/rm cada fixedID propio, comprobar ausencia y persistir removed antes de volume rm. No eliminar volumen con CREATE desconocido o contenedor pendiente. Conservar metadata y archive aunque el probe falle.
7. Sólo después de probe positivo y limpieza completa continuar staging, CAS de Compose, INSTALLED persistido, fresh image/runtime/files antes CREATE, NEWID persistido antes START, guardas fresh antes START y healthy60s con PB1/Node1/tini1/argv origins propio. Pullnever/nobuild y mismo prodvolume.
8. Ante fallo previo a instalación, persistir el fallo de cutover antes de recuperación. Sólo BASE/env fullidentity originales, OLDfixedID y cero usuarios activos permiten arrancar OLD y esperar healthy60s. Rollback automático después de INSTALLED pero antes de CREATE conserva la receta43. Después de CREATE o transporte desconocido: STOP y diagnóstico propio, sin replay ciego ni restore de datos.

Las salidas sólo contienen IDs propios/conocidos, hashes, cantidades, estados finitos y códigos numéricos. No Config.Env, Caddyfile/config, logs, Health.Output, argumentos desconocidos ni errores raw. El contenido del gzip y las copias Compose/dotenv permanecen privados en el servidor. Leer memoria privada del snapshot forma parte explícita del scope nuevo.

## Operación nueva y aprobación

Wrapper `forward-cutover-run.py`, operación `d42f490f-606d-42d5-84f9-bd0c31da2492`, mode `fodaveg-owned-forward-cors-snapshot-clone-cutover`. Exclusivamente root ejecuta SSH serial. Este candidato todavía no tiene aprobación ni marker ni ejecución reales.

Tras APTO independiente y fullread root, el comando runtime aprobado debe crear por O_EXCL0600 **dentro de esa misma ejecución aprobada** `forward-cutover-approval.json`. Keys exactas: status/reviewStatus APPROVED, operationId/mode del wrapper, manifestSHA256 del archivo final, scope igual al literal SCOPE del wrapper, runtimeApprovalReference auténtica, forwardControlExplicitlyApproved=true, privateSnapshotRAMAccessExplicitlyApproved=true, ownedRecordId `fodaveg-reprobe-YYYYMMDDTHHMMSSZ-PID` nuevo y ownedBackupId `fodaveg-YYYYMMDDTHHMMSSZ-PID` nuevo. No se proporciona ni fabrica un approval anticipado.

El wrapper captura y valida los mismos buffers de manifest/fuentes/imports/evidencia antes de transmitir; genera el payload desde ellos. Persiste `forward-cutover-started.json` exclusivo con ambos IDs antes de la única conexión. Invocación dentro de ese comando autorizado:

```sh
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/forward-cutover-run.py --operation-id d42f490f-606d-42d5-84f9-bd0c31da2492
```

Presupuesto/pins se revalidan en servidor antes de efectos; el corte eléctrico comunicado invalida cualquier inferencia de frescura desde observaciones anteriores. Timeout1800s/salida8192B, cerrado; marker consumido y resultado desconocido nunca se reintentan. Root conserva receipt `forward-cutover-execution.json` y ambos grants/markers históricos. El éxito es AWAITING_PUBLIC_SMOKE: root aún debe comprobar155 SHA+MIME con alias canonical root para index, sitio Fod/peers, JSON discovery y CORS own/foreign/null/noOrigin. No afirma Caddy saneado ni cierre de las tres tareas por ejecutar sólo este lote.

## Verificación local y límites

Checks dirigidos, sin Docker/SSH/build/suite: `python3 -B forward-cutover-selftest.py` y `python3 -B forward-cutover-wrapper-selftest.py`; parser AST de los nuevos archivos. Pruebas de estado positivo fake y fallos agrupados; el TEST real anterior acredita la frontera nativa común. Snapshot stdout nuevo, presupuesto y cutover siguen pendientes de revisión/ejecución root. Grants de tests existen únicamente en TemporaryDirectory y son fixtures, no autorizaciones.
