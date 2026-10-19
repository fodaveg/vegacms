# Revisión independiente del lector Caddy reducido

Veredicto final: **APTO en revisión estática**, tras corregir el sello local del wrapper. No quedan must-fixes confirmados en este candidato. Ese resultado no autoriza ejecutarlo ni acredita validación o publicación en producción.

## Candidato final y cobertura

Directorio revisado: `.verification/worktrees/caddy-referenced-env-20261008/.verification/caddy-referenced-env-validation-20261008`.

- Manifest final: `f9298943a88e024a0ed95ae6b4d2d243e033c1da5e21c7b883105e5d63073184`.
- `remote_validate.py`: `8e09af37e0ba42015c15f50f65e00b818323eac059276e8cee5a4ee80fcb9d6e`, 863 líneas completas.
- `run_once.py`: `05edebe999a9007f23e20b688cc55e8b7e88515508c2e33598a8dd70d5b392c6`, lectura inicial completa y delta final completo.
- `projection.py`: `51604bea1a37e4ee0d4603e48e4810c5e3023c9455c8f880ef0616afe2f37222`, 45 líneas completas.
- `probe.py`: `e98be3c47200dcff7b4e852fc35094ec29004c3179f010101655700dd69649f0`, 263 líneas iniciales completas y delta final del test de mutación completo.
- `patch-inputs.json`: `6ff2eb3a8b8ea3eb249271eec63fb10c1a1c50a1951cae2a595810182a47ad40`, tres patches completos.
- `proposal.md`: `b110c0e6deab818a5d79ae73ca86f24efd1a2e14f64e7220e1cedf593fb077ce`, 54 líneas iniciales y cambio de snapshot leído.
- `verification.md`: `30c6173085af1ffd67751fa1a858c0f799248d6c3e55224ddf49cae7075ce934`, evidencia final completa.
- `probe.log`: `1e1f15a6ff9e9d0b573683b3aaa40522604f2f45c7d974578d8d1f25f3486c70`, evidencia local de 20 tests verdes; no repetida por este revisor.

Inventario inicial por `git diff --stat` y `git diff --name-status` contra `/dev/null`: todos los archivos anteriores son nuevos en el paquete de verificación. Ambos manifests leídos completos. Verificación independiente final de bytes: **8/8 hashes exactos** y hash de manifest final exacto. Descubrimiento primero mediante grafo del proyecto `vegacms`: cero resultados en esta superficie excluida; lectura posterior de los paths conocidos del encargo.

## Hallazgo inicial y cierre

**P1 cerrado — `run_once.py:41`, `run_once.py:63` y `run_once.py:79` del antecedente `ffd482…`: el sello no fijaba los bytes enviados.** `authorize()` parseaba el manifest, volvía a abrirlo para calcular su hash y abría cada artefacto para verificar su digest. Después `main()` volvía a abrir `patch-inputs.json` y `remote_validate.py` para construir el payload. Una modificación posterior al chequeo podía cambiar los parches o el programa ejecutado bajo una aprobación concedida a otros bytes. La prueba inicial solo llamaba otra vez a `authorize()` después de modificar: no cubría el intervalo entre autorización y envío.

Corrección comprobada en `05edebe…`: `authorize()` lee una sola vez aprobación, manifest y ocho artefactos; el hash del manifest, las verificaciones de artefactos, el parseo de patches y el payload usan esos mismos buffers. Se conserva el marcador de una sola ejecución. `test_post_authorization_mutation_sends_only_approved_snapshot` modifica script, patches, manifest y aprobación después de autorizar, intercepta el transporte sintético y exige byte-identidad con el payload aprobado. La evidencia final recoge **20/20 tests, exit0**. Script remoto y proyección permanecen en sus hashes revisados inicialmente.

## Contratos y seguridad comprobados

- La propuesta requiere aprobación runtime nueva de modo y alcance exactos; el rechazo anterior de lectura completa del entorno de Caddy permanece vigente. La operación consumida anterior no se reutiliza. No hay `.Config.Env`, `/proc/*/environ`, `printenv`, `eval` ni inventario de nombres o valores. Solo se consulta una variable validada por cada referencia encontrada en los archivos autorizados y en su cierre de imports.
- `query_value()` preserva valores multilínea mediante un marcador de presencia y `printf` integrado. Distingue ausencia de presencia vacía. La sustitución y el avance al final del reemplazo coinciden con `replaceEnvVars` de [Caddy v2.11.4](https://raw.githubusercontent.com/caddyserver/caddy/v2.11.4/caddyconfig/caddyfile/parse.go), líneas 63–102: `LookupEnv`, default solo en ausencia y sin expansión recursiva de los bytes recién insertados. Las referencias restantes o de proveedores runtime se rechazan.
- Antes de consultar valores se comprueban los cuatro hashes Caddy, los dos guards Compose, la identidad de imagen oficial, el argv de creación y el argv de PID 1, los mounts y el binario/loader sin sombras. El guard Vega `bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e` coincide con `stock-apply-20261008.json:newComposeSha256`, posterior a la adopción de imágenes. Cambios durante la operación vuelven a comprobarse al final.
- Los imports deben mapear a `conf.d/*.caddy` antes de listar o abrir; se rechazan traversals, mapeos ambiguos, symlinks de directorio y hoja, FIFO y archivos no regulares. Las aperturas usan descriptores con `O_NOFOLLOW`; los límites de archivos, bytes, nombres y valores están cerrados. Se conserva el cierre y se vuelve a cotejar su contenido y expansión de globs.
- La adaptación usa la misma identidad de imagen, archivos resueltos en una copia tmpfs y los mismos paths lógicos. Los tres patches se restringen a sus bloques de host, conservan los bytes externos y pasan seis comprobaciones/aplicaciones nativas en esa copia. El gate previo conservador evita módulos no comprendidos; la salida adaptada pasa además un esquema cerrado de módulos y recursos antes de provisionar.
- Adaptación y validación corren en contenedores efímeros independientes: red `none`, raíz readonly, usuario 65534, capacidades retiradas, sin privilegios nuevos, límites de memoria/CPU/PIDs y logs Docker desactivados. No se montan certificados, volúmenes ni archivos vivos de producción. Validate solo recibe el JSON de prueba; las rutas de logging/storage se remapean a scratch y se demuestra igualdad exacta al revertir esos cambios.
- stdout y stderr de los comandos quedan privados y acotados; stderr se descarta. La proyección pública permite únicamente campos/estados/errores conocidos, contadores, booleanos e identidades/guards definidos. No exporta archivos Caddy, JSON adaptado, nombres o valores consultados, errores arbitrarios ni hashes derivados de secretos.
- La limpieza solo afecta nombres de contenedor generados por esta invocación y su directorio tmpfs. Hay eliminación y comprobación fresca de ausencia con timeout propio; una limpieza no acreditada convierte el resultado en STOP. No hay reload, cambios de archivos activos ni publicación.

## Límites

Revisión de lectura, sin SSH, Docker, builds, ejecución del protocolo ni modificación de sus fuentes. Se reutiliza la evidencia final de 20 probes sintéticos del paquete; no prueba el estado remoto. El subconjunto de sintaxis/módulos puede detener legítimamente configuraciones que incluyan `root`, `file_server` u otras construcciones no comprendidas. Eso es un STOP permitido: no se debe ampliar el alcance ni omitir su semántica para obtener verde.

Un resultado posterior `VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION` solo acreditaría la copia aislada con recursos remapeados. No acreditaría permisos de producción, ACME, upstreams, configuración ya cargada por API, CSP servida, bloqueo del panel ni autorización para publicar.
