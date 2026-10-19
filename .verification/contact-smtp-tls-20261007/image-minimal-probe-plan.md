# Sonda mínima imagen exacta: evaluación estática

Plan estático revisado: receta vigente fija PB0.39.9 linux_amd64 ZIP SHA256 4c5a1ace…b36b, Alpine3.23 por digest, ca-certificates y copia del hook a /pb/pb_hooks; hook actual coincide con el esperado 1727a122…48c4.

No encontré inventario persistido con ID/digest/arquitectura/labels de una imagen exacta ni attestation del build; los recibos consultados mantienen explícita la deuda. Docker cache16.52GiB es dato aportado por raíz, no evidencia de imagen.

Siguiente sonda mínima autorizable: SOLO inspect de imágenes locales y selección de ID sha256 inmutable; después extracción/versionado/hash del PB y hook empaquetados, y contraste con receta/build acreditado. Sin ID/bytes/procedencia coincidentes, no ejecutar una imagen sustituta ni declarar paridad.

Una vez exista imagen acreditada: PB real con /pb/pb_hooks, datos efímeros y CA montada readonly solo para ese proceso; tres señales: CA desconocida→rechazo/pending, CA confiable+hostname incorrecto→rechazo/pending, hostname correcto→mismo registro sent y correo TLS1.2/1.3.

En macOS el fixture bind127/localhost actual no prueba acceso desde Docker. La sonda necesita primero acreditar loopback compartido o adaptar SOLO el fixture a DNS de gateway y el launcher a imagen ID; no usar --network=host como si equivaliera automáticamente a Linux, ni montar el hook host encima.

Coste previsto si imagen y Node/harness reutilizables existen: 1 PB efímero, 1 sumidero, pocos POST/cron y ≤0.1GiB de datos/logs; implementación adaptador test-only acotada a esta verificación. No hay estimación fiable del tiempo total hasta conocer imagen/red disponibles.

Si falta la imagen exacta: build actual implica pnpm install/build + apk/wget; no cabe bajo la autorización offline ni el presupuesto0.3GiB confirmado. Coste de cache incremental sin inspección indeterminado; 16.52GiB ya supera la política habitual10–15GiB, sin autoridad para podar cache ajena.

DF leído140GiB. No build, Docker, runtime ni modificación de fuentes en este turno; commit57ad992 y árbol a9000fd5 permanecen intactos. Proveedor SMTP real, AUTH/STARTTLS y activar NOTIFY_TO siguen fuera de esta prueba local.

## Inventario local autorizado: resultado

Las dos imágenes relevantes se han inspeccionado sin Env/Cmd ni runtime; metadatos en image-inspect-metadata.json. Ambas linux/amd64, tags fodaveg del 4 octubre, sin digest de distribución ni labels OCI; ENTRYPOINT tini/docker-entrypoint.sh contradice /pb/pocketbase. Ninguna acredita la receta exacta.

Propuesta para decisión de raíz: presupuesto incremental2GiB y estimación10–30min para build fiel desde contexto revisado/fijado con linux/amd64 y label de revisión explícita. Base de estimación: dependencias actuales206MiB, evidencia37MiB, final Alpine+PB estimado50–100MiB; margen para builder/base/store/capas. Caché existente16.52GiB aportada por raíz, su reutilización no acreditada. Estimación de certeza baja/moderada; no build ni instalación/pull ejecutados. No pruning ajeno. No procede tratar la autorización estrecha de este brief como prohibición inmutable de trabajo local: raíz puede asignar presupuesto/turno si decide construir.
