# Contacto SMTP TLS: candidato offline y plan discriminante

Estado: implementación preparada, sin ejecución de tests, OpenSSL, SMTP, PocketBase o Docker en este lote.
Propiedad: tests/contract/pb-harness/smtp-sink.ts y tests/contract/pocketbase.contact-notify-hook.test.ts.
Base: 0cacf4cb8673369fcdec7b40ea676277cec5c331. Worktree: /private/tmp/vegacms-contact-smtp-tls-20261007.
Presupuesto atribuido: 0.3 GiB; worktree aparente 14 MiB; df inicial 144 GiB, preparación 145 GiB; cierre de preparación 143 GiB en máquina compartida (no atribuido al WT).
No se han retirado artefactos: el candidato y esta evidencia se conservan para revisión/runtime.

## Casos y señales

1. CA nueva no confiable, nombre correcto localhost: PB usa TLS implícito; el SMTP observa rechazo del handshake, cero handshakes completados y cero correos. El cron deja el mensaje pending. Otro POST anónimo responde 200 en menos de 3 s y persiste independiente.
2. Opt-in de confianza por proceso: certificado DNS localhost, conexión a IP 127.0.0.1. PB debe rechazar, conservar pending y no entregar. Cambiar SOLO host a localhost permite reintentar el mismo registro: handshake TLS 1.2/1.3, un correo y sent; un segundo tick no duplica. Otro POST permanece independiente.
3. Las claves/CA se generan por OpenSSL existente en directorio privado efímero; no hay nueva dependencia npm ni CA global. El proceso PB recibe solo SSL_CERT_FILE/SSL_CERT_DIR y override de compatibilidad Go 1.27. Limpieza de sockets y directorio incluso si falla el test.
4. PocketBase local acreditado es Mach-O, v0.39.9, compilado Go 1.26.5: ignora la confianza por archivo en Darwin. El caso 2 queda skip sin VEGA_CONTACT_SMTP_TLS_TRUST_TEST=1. La raíz ha elegido activarlo solo tras acreditar soporte (Linux o Go >=1.27); no se construye ni descarga otro binario para forzar verde.
5. El SMTP de prueba acepta RCPT sin AUTH y usa TLS implícito, no STARTTLS. Acredita cliente real/hook frente a TLS local; no proveedor SMTP, credenciales, topología ni activación de NOTIFY_TO de producción.

## Runtime local pendiente: turno exclusivo de raíz

Prerrequisitos antes del primer intento: clonar por APFS únicamente .pbbin, node_modules y .svelte-kit ya existentes en el repo principal a este WT, sin instalar; Node 22.22.3 y OpenSSL ya disponibles. AVAILABLE debe ser verdadero, de lo contrario skip no acredita ejecución.

Comando focal inicial, sin pnpm test:pb porque ese comando puede descargar:
PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH" pnpm exec vitest run tests/contract/pocketbase.contact-notify-hook.test.ts --project server -t 'TLS'
El mismo comando con VEGA_CONTACT_SMTP_TLS_TRUST_TEST=1 solo tras acreditar soporte de trust-env.
Usar escalación desde la primera llamada por loopback, conservar handle/log/exit y resultado passed/skipped por caso. Después ejecutar contrato completo y consumidores plaintext pertinentes solo si raíz asigna turno y lo exige por el helper compartido.

## Imagen exacta: preparación sin Docker

Dockerfile vigente fija PB 0.39.9 linux_amd64 zip SHA256 4c5a1aced62ebf658bfbcfeaa944c4bfa88b173dd9d598d3cab55ea63587b36b; copia infra/production/pb_hooks a /pb/pb_hooks. La imagen final usa Alpine 3.23 y USER vega; la etiqueta de compose debe declarar revisión git. No construir: el Dockerfile implica install/pulls/apk/downloads, todos fuera del turno actual.

Primera discriminación cuando raíz autorice runtime: inspeccionar SOLO imagen ya presente por ID inmutable, registrar Id, arquitectura y etiqueta org.opencontainers.image.revision, y contrastar candidato. No aceptar un tag sin ID/label/bytes. Hash del hook esperado en esta base:
1727a1229fb49e62a057eaae4a706f99b6b06a8f7e80811e033f9e23113548c4  /pb/pb_hooks/vega-contact-notify.pb.js

Comandos de inspección/sonda test-only propuestos, NO ejecutados:
docker image inspect "$VEGA_CONTACT_TEST_IMAGE" --format '{{.Id}} {{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
docker run --rm --pull=never --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges --entrypoint /bin/busybox "$VEGA_CONTACT_TEST_IMAGE" sha256sum /pb/pb_hooks/vega-contact-notify.pb.js
docker run --rm --pull=never --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges "$VEGA_CONTACT_TEST_IMAGE" --version

Comando de PB empaquetado en entorno Linux test-only (propuesta; macOS Docker Desktop no comparte automáticamente loopback con el host):
docker run --rm --pull=never --name vega-contact-tls-proof --network=host --user "$(id -u):$(id -g)" --read-only --tmpfs /tmp:size=16m --cap-drop=ALL --security-opt=no-new-privileges --mount "type=bind,src=$VEGA_CONTACT_TEST_DATA,dst=/test-data" --mount "type=bind,src=$VEGA_CONTACT_TEST_CA,dst=/test-ca.pem,readonly" --mount "type=bind,src=$VEGA_CONTACT_EMPTY_ROOTS,dst=/test-roots,readonly" --env VEGA_CONTACT_NOTIFY_TO=editor@example.test --env SSL_CERT_FILE=/test-ca.pem --env SSL_CERT_DIR=/test-roots "$VEGA_CONTACT_TEST_IMAGE" serve --http=127.0.0.1:18090 --dir=/test-data --hooksDir=/pb/pb_hooks
Todos los paths deben ser exclusivamente efímeros del test; nunca volume vega_data, compose de producción, red vega-edge ni hook montado desde host. El controlador debe ejecutar los POST reales y comprobar pending→sent frente al sumidero, con cleanup del contenedor en finally. El comando por sí solo NO acredita el contrato. Para usar Vitest existente con esa imagen hace falta un adaptador de proceso test-only y acceso loopback acreditado; no está implementado ni afirmado como resuelto.

Límite actual: en este macOS no hay imagen exacta acreditada ni adaptador/red probados. Esta propuesta permite decidir después del control negativo local si compensa acreditar la imagen existente, sin instalar herramientas ni añadir infraestructura de producto. No cierre Lumbre: sigue pendiente SMTP del proveedor con TLS real y evidencia de empaquetado/runtime exactos.

## Resultado local posterior

La sonda CA no confiable pasó; Contacto y ajustes SMTP 38 passed/1 opt-in skipped; invitación SMTP 1 passed/129 filtrados; check 0 errores/0 avisos y ESLint2paths verdes. Árbol sin cambios. Positivo, imagen exacta y proveedor pendientes. Recibo runtime: receipt.json; versión offline histórica: offline-receipt.json. Turno propio liberado; otro Vitest de Claude en Hebra observado al cierre y comunicado a raíz. DF runtime 142 GiB antes/después (redondeado).
