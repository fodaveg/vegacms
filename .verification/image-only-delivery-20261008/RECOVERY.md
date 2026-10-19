# Recuperación acotada de un corte de imagen

La release owner ejecuta los cortes uno por uno: `vega-pb`, `lumbre-admin-pb`, `fodaveg`.
El recibo de `apply` contiene el directorio restringido del snapshot, su SHA-256, el ID viejo
y el nuevo. El directorio conserva `compose.old`, `dotenv.old` y `data.tgz`; no se copia al
equipo ni se imprime su contenido. No ejecutar `docker compose down --volumes`.

Si `apply` devuelve `STOP_PREMUTATION`, ningún archivo remoto se cambió. Si devuelve
`STOP_BEFORE_NEW_IMAGE_RESTORED`, el programa ya restauró los archivos previos y comprobó
que el runtime viejo volvió sano. Cotejar ID/selector/health y el smoke público antes de
decidir reintento. `STOP_RESTORE_NEEDS_OPERATOR` exige inspeccionar el estado exacto, ya que
puede haber quedado el servicio detenido o un archivo sin reponer; preservar backup y
volumen, no repetir `apply` a ciegas.

Si devuelve `STOP_AFTER_NEW_IMAGE_POSSIBLE_DATA_MIGRATION`, el nuevo proceso pudo haber
modificado el esquema y el programa intenta detenerlo. Confirmar primero que ningún
contenedor escribe en el volumen real y conservar una segunda copia de su estado posterior
al intento. Comparar el ID/selector/Compose actual con el recibo. Para `fodaveg`, el binario
anterior es PB 0.39.7 y el nuevo 0.39.9; reiniciar el viejo sobre la base nueva no es una
reversión acreditada. Stock y Lumbre también pueden haber aplicado migraciones propias.

Si el arranque pasó pero falla el smoke servido, mantener la imagen nueva bajo vigilancia o
parar **solo** ese servicio mientras se decide. Antes de restaurar datos activos se necesita
una decisión concreta sobre las escrituras recibidas desde el snapshot: preservar el estado
posterior, identificar el alcance perdido y escoger restauración o corrección hacia delante.
La copia TEST ya prueba legibilidad del archivo, pero no autoriza a sobreescribir datos vivos.
Una restauración, si se autoriza para ese fallo, debe verificar volumen exacto, contenedores
escritores cero, hash del snapshot y los archivos de configuración previos, restaurar en un
volumen aislado nuevo, comparar bytes y solo entonces ejecutar el cambio explícito elegido.
No hay un comando genérico de restauración destructiva en este paquete.

Los cinco hashes de `/srv/edge` se comprueban antes y después; cualquier diferencia detiene
el siguiente servicio. El smoke completo de producción sigue separado: este corte no cambia
Caddy ni implementa las reglas de panel/CORS aún pendientes.
