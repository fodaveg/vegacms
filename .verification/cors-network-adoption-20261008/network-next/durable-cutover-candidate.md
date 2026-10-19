# Caddy ↔ Vega: estado real y receta condicionada (9 oct 2026)

Alcance exclusivo: `edge-caddy`, `vega-pb` y la red externa `vega-edge`.
Esta receta es una propuesta para root; no ha ejecutado SSH, Docker ni cambios
remotos. No lee valores de Caddyfile, `.env`, `Config.Env`, logs ni Health.Output.
El permiso denegado para lectura privada de Caddy permanece fuera del alcance.

## Base acreditada y delta

La lectura selectiva `edge-read-20261009.json` terminó `PROJECTED`/exit 0:
`/srv/edge/compose.yml` coincide con SHA-256
`c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2`,
es fichero regular modo `0664`, y su candidato **calculado desde los bytes
actuales en RAM** es
`6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977`.
El Caddy seleccionado coincide con ID
`ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a`
e imagen
`sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`;
está corriendo, solo en `edge`, con labels que señalan ese Compose y `/srv/edge`.
Git clasifica el archivo como `TRACKED`, sin acreditar HEAD limpio, upstream
ni el mecanismo que publica esa fuente. `networkClass=UNAVAILABLE` **no**
acredita que `vega-edge` no exista. El antiguo SHA hipotético del patch local
`cb294…` describe la intención, no es el SHA del Compose final real.

El delta Caddy es añadir `vega-edge` al servicio `caddy` **conservando** `edge`
y declarar la red externa; todos los demás bytes quedan idénticos. El delta
Vega stock ya preparado cambia únicamente la membresía de `edge` a
`vega-edge`, conserva alias `vega-pb` y añade la declaración externa:
`11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde`
→ `50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a`.
La fuente Vega versionada ya contiene red dedicada, pero el Compose remoto
actual lleva también el override CORS; el candidato debe preservar ambos.

## Siguiente lectura mínima, antes de cualquier escritura

1. Sobre **ese** archivo `/srv/edge/compose.yml`, acreditar HEAD completo,
   ruta tracked exacta, SHA del blob de HEAD y del índice, y ausencia de
   cambios staged/unstaged de esa ruta. Proyectar solo hashes, booleanos y
   clases finitas; no exportar el cuerpo del Compose ni URL de remote. El
   responsable de publicación debe identificar dónde se edita y publica la
   fuente de ese checkout. `TRACKED` por sí solo no basta para instalar un
   cambio durable.
2. Resolver `networkClass=UNAVAILABLE` con lectura selectiva por nombre exacto:
   éxito de daemon, `docker network ls` limitado a `vega-edge`, segundo
   muestreo y `inspect` por el ID encontrado. Emitir `MISSING_CONFIRMED` solo
   si ambas lecturas sanas no seleccionan ID; `EXISTING_EXPECTED` solo con ID
   estable, nombre/driver `bridge`/scope `local`/`internal=false` y miembros
   conocidos; cualquier otro estado es `UNKNOWN`/STOP. No emitir nombres o
   endpoints privados. Conservar el ID real para todos los guards siguientes;
   una clasificación repetida sin ID no detecta reemplazo.
3. Refrescar Caddy ID/imagen/labels/redes, Vega ID
   `007b755b8de76195d857181ce985a9522fe71c5d2941a2c1597b310d12d56881`,
   Compose `11593d1…`, imagen, argv, volumen, red y presupuesto; los IDs
   anteriores no son permisos de ejecución. Comprobar que el smoke CORS
   público de Vega terminó verde. No inferir clientes directos entre los
   ocho miembros de `edge` no identificados.

## Instalación condicionada y recuperación

Root debe preparar el cambio en el **repositorio propietario de Caddy** y
acreditar commit/publicación de esa fuente antes de tratar el Compose remoto
como durable. Para ambos Compose: leer por descriptores de directorio con
`O_NOFOLLOW`, verificar bytes y metadata completa
(`dev,ino,uid,gid,mode,size,mtime_ns,ctime_ns`), generar el candidato desde
esos mismos bytes y validar su delta inverso. Guardar backup privado con
hash, metadata y manifest antes de escribir. Hacer CAS de esa identidad
inmediatamente antes de reemplazo atómico; confirmar inode propio instalado,
hash/modo/uid/gid y guardar estado de fase **antes** de arrancar servicios.
Repetir guards del archivo y runtime antes de cada operación reversible y
del rollback; drift ajeno implica STOP, no restauración ciega.

Si la red está ausente **acreditadamente**, crear solo `vega-edge` y comprobar
su ID nuevo y atributos. Si ya existe, usar únicamente el ID acreditado.
Nunca crearla tras un `inspect` fallido aislado ni borrar `edge`. El orden de
corte es Caddy dual (`edge`+`vega-edge`) primero, Vega dedicado después;
validar Compose efectivos sin volcar configuración privada. Antes de recrear
Vega, usar el snapshot quiesced de `vega_data` y prueba de restauración
aislada del patrón CORS, sin tocar datos reales en rollback. Recrear solo
`pocketbase` sin build/pull/down-volumes. Exigir ID de red estable y peer
seleccionado por ID en cada frontera.

**Caddy tiene una restricción adicional:** su recreación podría reactivar
configuración privada/autosave obsoleta. Sin prueba específica de la fuente
efectiva y del comportamiento al reiniciar, no autoriza esta receta a
recrearlo. Instalar su fuente duradera y conectar la red al contenedor vivo
por ID sería un avance *provisional* si root decide hacerlo, con guard de ID
antes/después y rollback solo de esa conexión propia. No certifica el estado
tras `docker compose up`/recreación ni cierra la tarea de red. La prueba
pendiente es una recreación controlada desde la fuente propietaria publicada,
seguida de selección de Caddy con ambas redes, validación del proxy y smoke
de los sitios del borde. No se puede sustituir por `docker network connect`.

Para el corte completo, comprobar Caddy→`vega-pb:8090` en `vega-edge`, Vega
**solo** en esa red, Caddy en las dos, dos miembros conocidos y ningún otro
en `vega-edge`, ausencia de puertos PB publicados, salud/admin/API y sitios
del borde. Un peer conocido que permanece solo en `edge` debe carecer de
ruta directa a `vega-pb:8090`; no ensanchar Lumbre/Fod/preview por inferencia.
Rollback: restaurar primero Vega a `edge` con su mismo volumen y smoke
público; solo después, retirar Caddy de la red nueva si ningún backend
dependiente queda allí. La restauración de archivos exige identidad de bytes
propios y runtime fresco; si falla, STOP para operador. Conservar backups y
redes hasta cerrar verificaciones.

**Límite actual:** el lector RO no prueba HEAD limpio/publicador, existencia
de `vega-edge` ni permite un restart seguro de Caddy. Por ello no hay orden
de aplicación remota completa revisable aún, y la tarea de aislamiento no
está certificada.
