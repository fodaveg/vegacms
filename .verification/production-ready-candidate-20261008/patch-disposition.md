Los diez diffs están copiados byte por byte y mantienen sus hashes revisados. Las carpetas expresan su condición; no son un lote de aplicación.

| Grupo | Archivos | Decisión actual |
|---|---|---|
| Headers/panel | `admin.vegacms.com.patch`, `admin.lumbre.pro.patch`, `admin.fodaveg.net.patch` | Conservar delta exacto. Exigir hash/base frescos, hostblock/anclas sin fuzzy, identidad de upstream/SPA y validación Caddy aislada. Fod conserva el bloqueo de panel existente y todo su bloque público. |
| Red | `edge-caddy-networks.patch`, `vega-pb-networks.patch`, `lumbre-admin-pb-networks.patch`, `fodaveg-networks.patch` | Conservar delta exacto condicionado a peers reales. Si un renderer legítimo llama directamente a PB, estos diffs necesitan una variante durable específica antes de retirar edge. No inventar nombres de peers. |
| CORS stock | `vega-pb-cors-command.proposed.patch` | Retenido. La imagen be130 ya contiene origins admin; resolver override efectivo/clientes antes de añadir un command redundante o distinto. Si no hay override y la allowlist final coincide, este patch puede resultar innecesario; no se aplica por duplicación. |
| CORS Lumbre | `lumbre-admin-pb-cors-command.proposed.patch` | Retenido. La imagen c883 no contiene origins; resolver clientes y command existente. Adaptar el array final preservando argumentos reales, en vez de asumir un único origen por hostname. |
| Logger default | `edge-default-runtime-log.patch` | Retenido. Skip de access logs conocido para3hosts no demuestra asociación con runtime/error/default ni writer/rotación/colectores. Puede necesitar un merge específico del sink real; no hay named logger nuevo ni claim de saneamiento global. |
| Access fragments (3, fuera de10) | `excluded-access-log-reference/admin.*.access-log.proposed.caddy` | Excluidos. Se conserva su texto sólo como referencia histórica; no habilitar logging ni quitar skip. |

No se regeneraron diffs, no se ejecutó nuevo parse/check ni se modificó la propuesta31 sellada. `patch-inventory.json` da rutas y hashes completos; `destination-matrix.json` asocia cada archivo destino y sus pendientes reales. Adoptar las nuevas imágenes requiere un delta de pin/transport definido sobre la base privada actual: no está incluido en los diez diffs históricos y no se inventa aquí.
