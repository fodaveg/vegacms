La propuesta headers/panel8 se conserva congelada. Este análisis sólo precisa el permiso privado pendiente; no descubre imports/hosts privados ni ejecuta lecturas o validators.

Los ocho destinos de la lectura anterior fueron exactamente:

1. `/srv/vega/infra/production/compose.yml`
2. `/srv/lumbre-admin/compose.yml`
3. `/root/fodaveg/compose.yml`
4. `/srv/edge/compose.yml`
5. `/srv/edge/conf.d/fodaveg.caddy`
6. `/srv/edge/conf.d/admin-lumbre-pro.caddy`
7. `/srv/edge/conf.d/vega.caddy`
8. `/srv/edge/Caddyfile`

FodCaddy y el Caddyfile global **no añaden paths** a ese inventario. Sí cambia la operación: de hash/metadata a parse/adapt/validate de su contenido privado y preparación de una copia staged. La lectura consumida fue metadata-only, sourceParsedfalse, sin writes ni CaddyGET; no acredita ese parse ni autoriza staging/validación/reload por sí sola. Los dos headers Vega/Lumbre ya tienen bases Git locales exactas; su dry-run puede avanzar bajo la autorización existente sin otra lectura privada. Los cuatro Compose no necesitan parsearse para este sublote de tres archivos Caddy.

La frase «Caddyfile compartido/imports» de next-step **puede añadir fuentes fuera de los ocho paths**. No se conoce su lista efectiva: el archivo global no se ha parseado y no se debe afirmar que importa únicamente los tres admins. Tampoco se conocen recursos de módulos, variables o certificados requeridos por validate. No se consulta el directorio, no se adivinan otros nombres de archivo/host ni se atribuye cobertura a esos bloques.

Una validación completa de Caddy exige resolver los imports realmente declarados. Ejecutar adapt/validate contra una copia aparentemente limitada antes de resolver esa frontera podría cargar archivos externos automáticamente. No es una validación de alcance fijo de ocho archivos y no debe presentarse así al mecanismo de aprobación.

Paso mínimo útil ya autorizado: cerrar los dry-runs locales del productor y mantener sus resultados separados de compatibilidad CSP servida y validación completa de Caddy. El permiso nuevo recomendado es **una sola operación de validación privada, sin aplicación**, que nombre los cuatro archivos Caddy anteriores y autorice explícitamente sólo su cierre de imports declarado dentro del árbol real `/srv/edge`, procesado en RAM/staging privado remoto. Esa autorización sería más amplia en fuentes que los ocho paths originales si aparecen imports adicionales, aunque sólo se cambien los tres bloques admin. Debe explicitar que puede cargar internamente bloques de otras aplicaciones y que sus nombres, rutas, contenido y credenciales no se proyectarán ni se conservarán en el equipo.

La operación propuesta no hace un scan recursivo del servidor: carga sólo archivos alcanzados por directivas import necesarias del Caddyfile, incluyendo los matches de un glob declarado únicamente dentro de ese árbol. No se asume que tales imports/globs existan. Un realpath/symlink fuera de `/srv/edge`, recurso externo, lectura de env/secret/certificado no incluida expresamente o dependencia ambigua detiene el validator con clase/contador sin leerla. Nada de HTTP admin GET, reload, source de dotenv, escritura activa, redes/CORS/logs/imágenes ni lectura de logs. El staging puede ser volátil y los outputs raw de adapt/errores quedan en RAM remota; sólo se retienen los ocho hashes conocidos, exits/clases, igualdad fuera de los tres bloques y hashes resultantes de esos destinos, sin paths adicionales.

Este cierre por referencia, dentro de un árbol fijo, permite pedir una única validación necesaria sin fingir una lista de imports desconocida. Si el usuario sólo autoriza los ocho paths literales, la alternativa conservadora termina antes de adapt/validate ante cualquier import fuera de esa allowlist; no puede prometer el Caddy completo y podría necesitar una segunda decisión. Ninguna de las dos autorizaciones está dada por este documento ni por una respuesta ambigua anterior.

Texto concreto que la raíz puede someter a aprobación cuando disponga del dry-run local: «Autorizar una única validación privada aislada de los tres diffs headers/panel, usando los cuatro archivos Caddy indicados y sólo los imports que declaren dentro de `/srv/edge`, con datos crudos exclusivamente en RAM/staging volátil remoto y salida limitada a hashes/estados. Sin cambios activos, reload ni publicación; detenerse ante recursos fuera de ese alcance». Si se pretende provisionar módulos que requieran env/certificados, esa necesidad se declara antes de ampliar el permiso, sin intentar eludirla con configuración recortada.
