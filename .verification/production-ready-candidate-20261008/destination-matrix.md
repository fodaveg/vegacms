Matriz de los ocho destinos: hashes completos en `destination-matrix.json`; los prefijos siguientes son sólo para lectura. Ningún guard fue refrescado ni ningún dry-run privado ejecutado.

| Destino | Guard histórico | Delta conservable/retendido | Dato efectivo faltante |
|---|---|---|---|
| `/srv/vega/infra/production/compose.yml` | `812e521c2280` | vega-pb-networks.patch · retenido: vega-pb-cors-command.proposed.patch | Fresh file hash/base; actual image/command and /pb/pb_public mount overlay; legitimate browser clients/origins; direct peers/renderer needs; distribution reference. |
| `/srv/lumbre-admin/compose.yml` | `7ed9a9e22579` | lumbre-admin-pb-networks.patch · retenido: lumbre-admin-pb-cors-command.proposed.patch | Fresh file hash/base; actual image/command/mounts and preview/builder peer topology; all legitimate browser origins; distribution reference. |
| `/root/fodaveg/compose.yml` | `a18777c55d58` | fodaveg-networks.patch | Fresh file hash/base; actual image/entrypoint/CMD and child PB argv if available; admin SPA mount/destination; actual direct peers and clients; distribution reference. CORS child-source delta still undecided. |
| `/srv/edge/compose.yml` | `c6c47d481ff6` | edge-caddy-networks.patch | Fresh hash/base; actual Caddy image/config mounts; networks/aliases and direct legitimate peers; shared-Caddy recreation window and private staging validation. |
| `/srv/edge/conf.d/fodaveg.caddy` | `0bdaa9f5ef1a` | admin.fodaveg.net.patch | Fresh hash/base and exact host bounds/anchors; actual admin upstream/SPA serving mount; Caddy isolated adapt/validate and untouched-subtree comparison. Fod public Node404 does not certify admin SPA. |
| `/srv/edge/conf.d/admin-lumbre-pro.caddy` | `9a3322ce1456` | admin.lumbre.pro.patch | Fresh hash/base and host bounds/anchors; actual route association to intended runtime/current151 image; isolated Caddy adapt/validate and unrelated-subtree comparison. |
| `/srv/edge/conf.d/vega.caddy` | `772440180332` | admin.vegacms.com.patch | Fresh hash/base and host bounds/anchors; actual route association and current image/assets mount; isolated Caddy adapt/validate and unrelated-subtree comparison. |
| `/srv/edge/Caddyfile` | `ff093f30330f` | Ninguno habilitado · retenido: edge-default-runtime-log.patch | Fresh hash/private base and imports; actual sensitive runtime/error channels and sinks/access/retention; writer/rotation/include/exclude/wrap preservation; isolated adapt/validate. No additional privateGET authorized here. |

Los tres bloques admin conservan la exclusión de access logs. Los datos históricos provienen de una observación de7oct y no acreditan la configuración efectiva actual. La futura lectura metadata-only del productor es independiente: sus campos desconocidos permanecerán desconocidos, sin rellenarlos mediante defaults locales.

Fresh guards no bastan para demostrar clientes legítimos, retención de colectores ni argv de un hijo PB. Esas fronteras siguen explícitas y preceden a la autorización concreta de aplicación.
