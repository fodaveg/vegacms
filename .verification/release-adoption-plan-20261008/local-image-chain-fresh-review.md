# Review de la cadena local del archivo de imágenes

Veredicto: **APTO para comparación con la lectura remota selectiva**.

Projector completo corregido revisado, SHA-256 `a2e283fbcf6b36aaf0c3570b9f34d35ce3cc1d0d3740dd03c5038c73ccb3343a`. Resultado leído completo: local-archive-image-chain.json SHA-256 `c4d6b992b60643a35c6bd041cee26211f2978c939883d2dc6d9624edcb745a2b`.

La fuente verifica tamaño/SHA del archivo sellado, hashes de bytes de los blobs config y manifest OCI, relación manifest.config.digest con configId y correspondencia de digests de layers comprimidos entre representaciones OCI y Docker. Proyecta diffIDs, plataforma y revisión desde el config validado; configEnvProjected=False. Los tres configIds del resultado coinciden con los IDs certificados en el manifest original. El gap del projector inicial —descriptores y config independientes sin enlace criptográfico— queda corregido.

El lector remoto se revisó por separado en image-identity-ro-fresh-review.md, hashes 2dc473e1… y 515d7c9b…. Para reconocer las imágenes, la release owner debe comparar digest descriptor/ID remoto con manifest OCI validado y diffIDs/plataforma con los campos validados del config, sin basarse solo en label. Este informe no certifica aún esa comparación viva, no rebaja el guard del cutover ni autoriza reintentar load. No ejecuté DockerAPI, SSH, tests ni el projector ni repetí el hash de los 606 MB; reutilizo el resultado local comunicado por owner y reviso su lógica y coherencia.

## Correspondencia remota comprobada posteriormente

Leído el resultado RO ejecutado por root, image-identities-20261008.json SHA-256 `8108bc21cc678c9337b2c6147143ba2e3790f8aa67792bd4485cf6a96cf0c0d8`. Comparación independiente local exit 0: tres tags exactos; 3/3 ID remoto y Descriptor.digest iguales al manifest OCI validado; mediaType, diffIDs, OS/arquitectura y revision iguales al config/manifest validado. Flags remotos de escritura, Env, logs y Caddy falsos. Esta comprobación acredita correspondencia de contenido y explica el desacuerdo anterior entre ID OCI y configId; los IDs de config originales permanecen documentados y no se confunden con los manifests.

Queda pendiente únicamente revisar el delta del guard de cutover que use estos manifests observados como newId. No se ejecutó otro load. La revisión de esa versión nueva será un informe separado con su hash exacto.
