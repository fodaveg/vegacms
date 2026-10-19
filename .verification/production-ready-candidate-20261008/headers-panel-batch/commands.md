Comandos de referencia para un operador autorizado; **no ejecutados ni un runner nuevo**. Variables `headers_stage_root`, `headers_patch_dir` y `headers_validator_image` designan exclusivamente el staging privado preparado por la release owner; no son destinos de copia local de configuración.

La receta actual probada contiene `infra/production/validate.sh` SHA0f4083a6 (archivo conservado en el archive-context stock9165). Ese script usa `docker ... caddy validate`, pero completo también lee `.env`, exige HEAD/checkout limpio y red `vega-edge`. No debe ejecutarse como si validara el Caddy compartido de los tres hosts ni usarse para forzar cambios de redes en este sublote. La copia del checkout main tiene otro hash7319c689 y todavía inspecciona `edge`; no se confunden ambas recetas.

Dry-run de los tres diffs, una vez verificadas en RAM las anclas originales exactas y el hash base (los paths `a/srv/...` se resuelven desde el staging, no desde main):

```sh
cd "$headers_stage_root"
git apply --check --whitespace=error-all "$headers_patch_dir/admin.vegacms.com.patch"
git apply --check --whitespace=error-all "$headers_patch_dir/admin.lumbre.pro.patch"
git apply --check --whitespace=error-all "$headers_patch_dir/admin.fodaveg.net.patch"
```

Después de los tres checks, el mismo `git apply --whitespace=error-all <patch>` prepara los tres archivos **sólo en staging**. Los ocho hashes se comprobaron una vez antes del lote; registrar después los tres hashes resultantes. Git puede aceptar un offset: por ello no sustituye el check estructural previo de cada línea original dentro del host exacto, y no se permite usar `--recount`, `--unidiff-zero`, búsqueda fuzzy ni mover hunks para forzar éxito. Capturar exits/errores en RAM, proyectando sólo clase y estado; las salidas de fallo no se guardan como logs crudos.

La familia de comandos Caddy ya usada por la receta/proof es:

```sh
caddy adapt --config /srv/edge/Caddyfile --adapter caddyfile
caddy validate --config /srv/edge/Caddyfile --adapter caddyfile
```

Se ejecutará dentro de un contenedor aislado del binario/módulos fijados, con staging privado montado como `/srv/edge:ro`, working-dir consistente con los imports, sin puertos publicados ni admin/socket/certificados/storage activos. El esquema `docker run --rm --volume <staged-Caddyfile>:/etc/caddy/Caddyfile:ro <pinned-image> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` es el comando existente de la receta; para el compartido debe incluir su árbol privado de imports y paths reconciliados. La referencia fijada es `caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`; confirmar correspondencia con el Caddy vivo antes de aplicación. No hacer pull ni añadir credenciales para superar un fallo ambiental sin autorización.

`adapt` devuelve configuración completa: stdout debe permanecer en RAM privada para comparación, nunca en stdout del asistente ni en archivo local. `validate` provisiona módulos; no correrlo contra la instancia activa ni prometer que una configuración con recursos/variables privados valida sin reconciliarlos. Comparar original/staged fuera de los tres subárboles modificados, incluidos imports y loggers. Ninguna de estas capturas/comparaciones se ha ejecutado ni implementado como framework en este paquete; son condiciones del permiso privado pendiente.

Aplicación posterior con el mismo Git ya usado en el staging, **sólo después de autorización específica, recheck de los guards y backups privados completos**, desde la raíz de staging/productiva que resuelva los paths `srv/edge/...`. Una invocación conjunta comprueba el lote entero; luego otra aplica únicamente los tres diffs exactos:

```sh
git apply --check --whitespace=error-all "$headers_patch_dir/admin.vegacms.com.patch" "$headers_patch_dir/admin.lumbre.pro.patch" "$headers_patch_dir/admin.fodaveg.net.patch"
git apply --whitespace=error-all "$headers_patch_dir/admin.vegacms.com.patch" "$headers_patch_dir/admin.lumbre.pro.patch" "$headers_patch_dir/admin.fodaveg.net.patch"
```

Este ejemplo no sustituye el check de hostblock/anclas ni la instalación acordada por la release owner; si el dry-run exacto falla, no se añaden flags de bypass. Restaurar desde los tres backups originales completos ante un fallo del lote, validar y registrar hashes/exits sin contenido privado. No usar reverse patch para sustituir el rollback completo ni activar después de un fallo parcial.

Activación disponible en la herramienta Caddy:

```sh
caddy reload --config <config-path-real-del-Caddy-vivo> --adapter caddyfile
```

Es una plantilla **condicional**, no un comando productivo resuelto: el metadata-read no confirmó Config.Cmd/config path/admin endpoint del Caddy compartido. La release owner debe reconciliar la vía real antes de usar `docker exec edge-caddy ...` o un mecanismo de release existente. No se inventa `/etc/caddy/Caddyfile`, endpoint ni restart del servicio. Tras instalar por la vía autorizada los tres archivos staged, un único reload/activación y su rollback usan esa misma vía concreta; no se aplica ninguna de las siete modificaciones ajenas de la propuesta anterior.
