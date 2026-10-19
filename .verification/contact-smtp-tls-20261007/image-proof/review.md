# Contacto SMTP TLS — revisión independiente del fixture de imagen

2026-10-07. **Sin hallazgos confirmados; apto por revisión para ejecutar la prueba de imagen autorizada.** La prueba TLS real de este candidato queda pendiente del autor; esta revisión no la ejecutó ni certifica SMTP externo o producción.

## Candidato y contabilización

Worktree `/private/tmp/vegacms-contact-smtp-tls-20261007`. Base `57ad99221e174173f9575a36624ea219b49c24a5`; árbol inicial `1bc37913d3ed1dbcef630be79a23da50a995ebfc`, árbol final `ee5e4c00eda92d1204070225a7c8445f13164e5a`. Inventario --stat/--name-status y lectura de todos los cambios: **3/3 archivos,305inserciones y4eliminaciones**. Se revisó separadamente el delta de chmod:1/1archivo,3líneas, sin cambio de criterio o flujo. Las tres fuentes vivas coinciden byte a byte con el árbol final al escribir este informe.

- `tests/contract/pb-harness/docker-server.ts`: fixture nuevo,158líneas.
- `tests/contract/pb-harness/smtp-sink.ts`: hostname opcional, validación y CN/SAN asociados; contexto completo del sink TLS, sesión SMTP y cierre de sockets.
- `tests/contract/pocketbase.contact-notify-image.test.ts`: contrato opt-in nuevo,142líneas, leído completo.

SHA256 final por archivo, respectivamente: `18ac94873691f81e23a33890712faa13f0e9aa1d8e25218d9005500c0ec480f5`, `d59038361214f533721dd54a8605b041269c92cfd658c323d42b3e52cd14de35`, `5115d975b48b674e29d9ece2730892b8f7d6b2fcabf20903852d349822653001`.

## Contexto e invariantes comprobadas

Se usó el grafo primero para descubrir el fixture stock y el hook de contacto. El snippet stock no aportaba todo el cierre/contexto y el índice no contiene estas fuentes nuevas; se leyó fuente explícita de los paths afectados, el hook real, Dockerfile y las pruebas TLS nativas relacionadas. No se hizo auditoría amplia del producto ni se indexó otro worktree.

El runner exige imageIDsha256 para arrancar PB y usa --pull=never/linuxamd64. Conserva USER de la imagen, capabilities eliminadas/no-new-privileges/rootreadonly y sus hooks en `/pb/pb_hooks`; los mounts son datos efímeros, credenciales de preparación readonly y una copia readonly de la CA pública. No monta hooks host, clave privada del certificado, almacén global ni activa InsecureSkipVerify. La contraseña no aparece en los argumentos Docker del host: se lee desde el archivo protegido por el directorio mkdtemp0700 y se borra tras preparar el superusuario. El archivo0644 permite leer al UID10001 dentro del mount aislado; no hace accesible el padre0700 en host. El delta chmod garantiza permisos legibles de config/directoriosCA pese al umask. Solo el bind de datos necesita permisos de escritura para ese UID.

La CA y el servidor se generan localmente y la extensión SAN contiene solo DNS del hostname validado, sin IP. El hostname opcional conserva localhost por defecto para consumidores anteriores. La prueba usa host.docker.internal y su IPv4 real para discriminar hostname: con la CA confiable, la IP carece de SAN válida; al cambiar solo SMTP.host al nombre correcto, la misma fila debe acabar sent y llegar correo por TLS1.2/1.3. El sink no simula validación cliente, cuenta handshakes aceptados y tlsClientError, y acepta SMTP solo dentro de TLS en este carril.

La primera prueba exige rechazo de CA desconocida, cero handshakes/correos, pending y una segunda alta anónima independiente <3s. La segunda exige rechazo de IP con CA confiable y después el envío de la misma fila, un solo correo tras otro tick, y otra alta pending. API/startup/error assertions fallan si la imagen no contiene hook, si no puede leerCA/config, si usa confianza inválida o si cambia el resultado del POST. La comprobación `To: editor@example.test` reutiliza el criterio del contrato TLS nativo; los mensajes provienen del sink TCP real, sin sustituir mailer o hook. No acredita AUTH o STARTTLS.

Se comprobó el flujo real del hook: el POST solo marca pending, el cron usa newMailClient y vuelve a pending cuando send falla; después de éxito cambia a sent y evita otro envío. El estado sending/lock y el cron real siguen activos. Los fixtures cierran PB y sink en afterEach/fallos y destruyen sus directorios/sockets; la revisión no ejecutó esos caminos.

## Evidencia reutilizada y límites

Se leyeron build-metadata.json y packaged-bytes.log: imagen configurada `sha256:f59dc6354915b5716febbc933817a3f59aca135a32a8946f6be6d8d3a1f29a6b`, descriptorlinuxamd64, UID10001, PB0.39.9, ca-certificates y hookSHA256 `1727a1229fb49e62a057eaae4a706f99b6b06a8f7e80811e033f9e23113548c4`. Este último coincide con el hook del worktree leído. La build y la sonda Docker→host son evidencia del autor/raíz, no ejecuciones de esta revisión. La identidad concreta usada por el opt-in deberá quedar ligada al recibo terminal de la prueba.

Se ejecutaron únicamente inventarios, lecturas, hashes y diff --check estático sin errores. No hubo Docker, SMTP, navegador, runtime, instalación, test, suite o build. No se editaron fuentes, datos, ramas o cambios ajenos; se escribió solo este informe. Los permisos efectivos de claves, el handshake/rechazo real de cada caso y el correo/estado observados deberán comprobarse en la prueba y su recibo, sin sustituirlos por un veredicto de código. Prueba local de imagen, gate completo, SMTP del proveedor, despliegue y producción permanecen estados distintos.
