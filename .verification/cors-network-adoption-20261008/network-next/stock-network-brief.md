# Red dedicada solo Caddy ↔ Vega stock — candidato local

**Alcance:** tarea de red `725be6e4-9daa-4b33-856d-9fcf6c9373d4`, únicamente
`edge-caddy` y `vega-pb`. No se han ejecutado SSH, Docker, builds ni cambios
de producción para esta propuesta. El corte CORS Vega sigue siendo una fase
separada; su resultado terminal y smoke público deben fijarse antes de usar el
SHA de preimagen `11593d1…` aquí.

## Candidato revisable

El Compose stock remoto CORS (`/srv/vega/infra/production/compose.yml`) se
reconstruyó desde la copia local previamente acreditada `812e521…`, el
`STOCK_CMD` exacto del image-only cutover y el delta CORS sellado. La preimagen
resultante tiene **SHA-256 `11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde`**
y está en `stock-after-cors-preimage.compose.yml`. La diferencia de
`stock-vega-edge.candidate.compose.yml` (SHA-256
`50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a`)
es exactamente:

- membresía del único servicio `pocketbase`: `edge` → `vega-edge`, conservando
  alias `vega-pb`;
- definición externa `vega-edge` añadida, conservando la definición `edge` y
  todos los demás bytes, incluidos `--origins`, volumen, puertos no publicados,
  UID/imagen, healthcheck y logging.

Para Caddy, `edge-caddy-vega-only.patch` (SHA-256
`cb294ac750168623d0553629862a640d6296fee8c4868d46d6367c0638a96dc5`)
añade **solo** `vega-edge` al servicio `caddy` y su definición externa; conserva
`edge`. `git apply --numstat` valida la forma del patch (6 inserciones, 2
líneas de contexto sustituidas), **no** su aplicabilidad contra el Compose
real. La copia íntegra de `/srv/edge/compose.yml` no está en este workspace:
su hash selectivo es `c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2`.
No hay SHA candidato Caddy calculable sin sus bytes actuales. Tampoco está
acreditado qué repositorio/versionado instala ese Compose; resolver su
propietario y la persistencia del cambio antes de activarlo.

El checkout Vega `a51b8521e1eeef52a522d2a065b36a03578c0c3a` ya declara
`vega-edge` en `infra/production/compose.yml` y su Dockerfile ya fija el CMD
`--origins=https://admin.vegacms.com`. La preimagen remota conserva un
override explícito de CMD por el cutover CORS. La selección remota final debe
compararse con ese contrato versionado para futuras publicaciones, sin
atribuir al checkout una modificación que no contiene.

## Condiciones de ejecución root-only

1. **Frescura y fuente durable.** Verificar fase CORS servida, hash Compose
   stock `11593d1…`, imagen/ID/binario/argv sanos, Caddy Compose
   `c6c47d…` y contenedor `edge-caddy` exacto. Confirmar fuente propietaria de
   `/srv/edge/compose.yml` y preparar allí el mismo delta. Leer solo identidad
   y segmentos de red necesarios; no exportar Caddyfile, `.env`, `Config.Env`,
   logs, Health.Output ni otras configuraciones. Rechazar drift o fuentes
   concurrentes.
2. **Red y configuración.** Verificar si `vega-edge` existe, su driver/alcance,
   `internal=false`, propietarios y miembros. Si falta, crear únicamente esa
   red externa sin borrar `edge`. Validar ambos Compose efectivos con su
   entorno privado en servidor RAM (`config --quiet`, sin stdout de valores),
   anclas exactas y ausencia de cambios en imagen, mounts, puertos, flags y
   servicios vecinos. Backup privado de los dos Compose con hash, modo,
   uid/gid e inode antes de escribir; CAS/guard de identidad inmediatamente
   antes de cualquier replace, recreate o undo. Snapshot quiesced de
   `vega_data` con prueba aislada de restauración antes de recrear PB, conforme
   al patrón ya acreditado para CORS.
3. **Orden de corte.** Caddy conserva `edge` y adquiere `vega-edge` primero.
   El contrato `infra/production/README.md:105-135` exige que su Compose
   **durable** represente ambas redes y advierte que un attach manual aislado
   no lo sustituye. Un `docker network connect` al Caddy vivo podría evitar
   su recreación inmediata solo si el Compose propietario ya está instalado,
   el runtime exacto coincide con ese desired state y root acepta cómo
   certificar la persistencia tras recreación controlada; sin ello, queda un
   estado provisional, no el cierre de la tarea. Recrear Caddy afecta 80/443
   de trece miembros `edge`; requiere rollback propio y smoke de los sitios
   compartidos. Después se recrea únicamente `vega-pb` sobre la red dedicada
   con el volumen existente y sin build/pull/down-volumes.
4. **Comprobación.** Caddy debe alcanzar `vega-pb:8090` por `vega-edge`; Vega
   debe pertenecer solo a `vega-edge`, Caddy a `edge` y `vega-edge`, con alias
   y puertos/volumen originales. `vega-edge` debe contener solo los dos peers
   esperados; los ocho miembros de `edge` no identificados permanecen en
   `edge` sin conexión directa nueva al PB. Confirmar admin/API y todos los
   sitios del borde; desde un peer conocido que siga solo en `edge`, comprobar
   que `vega-pb:8090` no es ruta directa. El acceso HTTPS público sigue
   disponible para renderers externos; preview/publisher usan el PB público
   según sus fuentes/defaults conocidos y no se conectan a `vega-edge` por
   inferencia. Repetir la selección tras recreate controlado para acreditar
   durabilidad; no certificarla por attach temporal.
5. **Rollback.** Restaurar primero el Compose Vega propio, recrear solo
   `vega-pb` sobre `edge` con `vega_data` intacto y verificar salud/admin.
   Retirar `vega-edge` de Caddy solo tras acreditar que ningún backend depende
   de ella, restaurando el Compose propietario y sus demás redes. Nunca
   limpiar volúmenes, imágenes previas ni otras redes durante recuperación.

## Fronteras de evidencia

La proyección de red del 8 de octubre acreditó `edge` con 13 miembros: los
cinco conocidos son Caddy, los tres PB y `lumbre-preview`; ocho solo son
cantidad, no identidades ni clientes PB probados. El clasificador público
encontró HTML fallback de `/vega.config.json` en las tres SPA y resolución
same-origin por defecto; overrides locales de navegador no fueron
inspeccionados. Nada de eso exige conectar Lumbre/Fod/preview a esta red.
No se leen valores del Caddyfile ni de su entorno para este delta de membresía;
la validación de funcionamiento sigue necesitando los checks públicos y
runtime descritos. El lector bloqueado de valores Caddy sigue fuera del
alcance y no se reintenta con otro nombre.

Esta propuesta es **candidato local, no ejecución ni certificación**. Falta
la fase CORS stock final, el SHA y fuente completos de Caddy, preflight actual
de red/presupuesto/propiedad y un protocolo root-only de cutover/rollback
revisado sobre esos datos. No amplía la tarea de red a los otros dos PB.
