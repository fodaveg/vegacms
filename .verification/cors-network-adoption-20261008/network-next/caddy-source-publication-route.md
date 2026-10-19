# Caddy ↔ Vega: ruta de fuente duradera antes de fase B

Estado: **PARCIAL; no ejecutar fase B**. Alcance: únicamente el Caddy
seleccionado y Vega stock. Este documento no autoriza SSH, publicación, lectura
de `Env`/Caddyfile ni recreación del proxy compartido.

La lectura real `edge-phase2-20261009.json` acredita que
`/srv/edge/compose.yml` es el archivo versionado seleccionado por el Caddy
actual: HEAD `2c3034b82efc070d5b747de8322936e3dbcc7459`, blob de HEAD,
índice y working tree `03bae62b20f3c9b7bba8661091b688fb4afbb2cf`, y
estado `EXACT_CLEAN` antes del cambio. La red `vega-edge` faltaba de forma
confirmada. El candidato generado de esos bytes conserva `edge` y añade la
red externa `vega-edge`; SHA-256 `6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977`.
El Caddy seleccionado era `ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a`.
Estos IDs y hashes son preimágenes históricas: requieren lectura fresca antes
de cualquier operación. No se ha identificado el propietario ni el mecanismo
de publicación de ese checkout; `TRACKED` no los acredita.

El contrato `infra/production/README.md:105–136` ordena validar y aplicar
**el Compose versionado de Caddy con ambas redes antes de mover Vega**.
El resultado previsto de fase A, `CADDY_ATTACHED_PARTIAL`, deja el archivo
modificado solo en el working tree y conecta el Caddy vivo por ID, sin
recreación. No cumple por sí solo la prueba de fuente publicadora ni la de
futura recreación. Por tanto, el candidato fase B `4437eaef…` no debe
ejecutarse tras fase A sin cerrar primero esa frontera.

## Ruta concreta condicionada

1. Root identifica al dueño de `/srv/edge` y su flujo de publicación sin
   exportar URLs remotas ni otros ficheros: rama/HEAD conocidos, presencia
   booleana de upstream, selección del archivo exacto por las labels Compose,
   y confirmación del responsable de que ese checkout alimenta la próxima
   recreación. Si hay otra fuente canónica, preparar el mismo delta allí y
   demostrar su correspondencia con el archivo seleccionado; no hacer un
   commit aislado en el servidor como sustituto de publicar la fuente.
2. Sobre un candidato fresco y propio, confirmar que el único delta del
   archivo es añadir `vega-edge` conservando `edge`, con el SHA-256 de bytes
   esperado; confirmar HEAD/índice/working tree y metadatos completos justo
   antes de escribir. La fuente y su rollback conservan copia privada de
   los bytes anteriores. El commit/publicación selecciona únicamente
   `compose.yml` y prueba árbol, SHA del blob nuevo, HEAD padre conocido,
   índice/working tree del archivo idénticos y ausencia de otros paths en
   ese commit. Otros cambios ajenos, staged o no, permanecen intactos.
   La prueba local de `git commit --only -- compose.yml` demuestra solo esa
   semántica en un repositorio sintético; hooks, firma, rama y autoridad de
   publicación del servidor siguen sin probarse.
3. Validar la sintaxis del candidato de Caddy en RAM, sin volcar el modelo ni
   resolver valores privados. En una fixture local, `docker compose
   --env-file /dev/null -f - config --no-interpolate --no-env-resolution
   --no-path-resolution --quiet` aceptó interpolación obligatoria y
   `env_file` ausente con exit 0 y cero bytes en stdout/stderr. Esto no prueba
   la versión remota de Compose ni un archivo real que use `include`/`extends`
   u otras referencias externas; un lector acotado debe excluirlas o
   detenerse antes de invocar el parser. Proyectar solo validez booleana y
   las membresías esperadas de `caddy`, `edge` y `vega-edge`.
4. El responsable del borde acredita cómo la fuente publicada se convierte
   en el Caddy futuro. La conexión viva y `config --quiet` prueban aspectos
   distintos y no demuestran la configuración efectiva tras recreación. Sin
   acceso autorizado a esa prueba o a una recreación controlada que preserve
   la configuración del proxy y compruebe los sitios consumidores, el estado
   continúa **PARCIAL** y la fase B queda retenida. El rechazo previo a leer
   valores privados de Caddy permanece vinculante.

## Incompatibilidad operativa de los candidatos actuales

`remote_edge_apply_candidate.py:104–112` y el adaptador fase B
`remote_stock_network_adapter.py:71` exigen HEAD antiguo, índice antiguo y
working tree **DIRTY** con el blob candidato. También el rollback de fase A
llama a `git_installed_guard`. Publicar un commit correcto del Compose antes
de fase B cambia HEAD/blob a `EXACT_CLEAN` y hace fallar esos guards.
Por eso **no** se deben encadenar los scripts APTO fase A → commit → fase B
ni intentar compensarlo relajando el guard en producción.

Preparar nuevos candidatos, dejando los APTO actuales intactos, con estado
de fuente publicada fijado por nuevo HEAD exacto, padre antiguo exacto,
`diff-tree` solo `compose.yml`, blob candidato en HEAD/índice/working tree,
bytes y metadatos completos del Compose, ID/imagen del mismo Caddy y red
propia con su ID/label. El rollback del archivo versionado requiere una
reversión **nueva y revisada** desde ese commit y prueba de que no hubo
escritor ajeno; no reutilizar la restauración que presupone HEAD antiguo
sin commit. Cualquier drift o fallo de selección implica STOP, sin reset,
checkout ni restauración ciega. La fase B y su rollback necesitan el mismo
guard de fuente publicada.

Pruebas pequeñas necesarias para el nuevo guard: HEAD nuevo con único path
esperado acepta; HEAD nuevo con otro path, blob/índice divergentes, cambio
de inode/metadata, fuente solo DIRTY, y escritura ajena entre lectura y
operación rechazan sin controlar red ni contenedor. La prueba de recuperación
debe demostrar que un HEAD publicado distinto no provoca restauración
automática sobre trabajo ajeno. No hace falta nueva suite global para esas
pruebas dirigidas.

Solo después de fuente publicada, equivalencia de Compose y prueba de
recreación futura conforme al contrato se reabre el gate de fase B: imagen
stock CORS actual, snapshot quiesced de `vega_data`, misma UID/health/CMD,
ningún puerto publicado y smoke de Vega y sitios autorizados del borde.
Ni un attach manual ni un commit local aislado certifican la red duradera.

Prueba local ligera de esta nota: fixture Compose exit 0, stdout/stderr 0;
fixture Git `diff-tree` contiene solo `compose.yml` y conserva otro archivo
staged. No hubo SSH, Docker de producción, lectura de configuración privada,
publicación ni cambio de los scripts fase A/B sellados.
