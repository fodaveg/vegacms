# CORS y redes: siguiente lote acotado tras las tres imágenes

**CORS y retirada de `edge` siguen CONDICIONALES. Se puede cerrar su inventario y preparar candidatos sin leer valores de Caddy.** El rechazo del lector Caddy completo y del lector reducido no autoriza otra consulta equivalente. Ninguna lectura de Environment/Config.Env es necesaria para las primeras acciones de este documento.

## Evidencia revisada y vigencia

Leídos completos los seis patches originales (`edge-caddy-networks`, `fodaveg-networks`, `lumbre-admin-pb-networks`, `vega-pb-networks` y los dos `*-cors-command.proposed`) y sus variantes contextuales locales; inventario de adiciones mediante `git diff --no-index --stat/--name-status`. Leídos el inventario/review local de peers, ambas proyecciones runtime previas, el recibo final de adopción de imágenes, los guards del cutover y la recuperación Fod. Contexto adicional: defaults de preview/publisher, llamadas Fod a PB y resolución Vega de URL del backend. Descubrimiento de código Vega mediante grafo antes de lectura de sus paths; configuraciones y artefactos conocidos se leyeron directamente.

La proyección `private-runtime-ready-20261008/projection.json` es **anterior** a las nuevas imágenes. Sus IDs y hash stock `812e521c…` no son guards actuales. El recibo `production-image-delivery-receipt-20261008.json` acredita tres admins servidos, pero marca `fullSecurityContractPassed:false` y deja CORS/red pendientes.

Guards de partida tras adopción: stock Compose **`bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e`**, Lumbre Compose `7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd`, Fod Compose `a18777c55d583c8eab43671d968108c9560f8a41152440e04ba610e583a9b500`, edge Compose `c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2`. Son bases de los recibos, sujetas a recheck fresco antes de cualquier candidato ejecutable.

Las tres identidades efectivas son OCI: stock `dd978b8d…`, Lumbre `40df6a9b…`, Fod `0e0ef5…`, conservando separados sus config IDs locales. No volver a utilizar los IDs previos ni cambiar a otro binario PB para estrechar CORS.

## Dos inventarios distintos

El `Origin` browser identifica la página que origina la petición. `PB_URL` identifica su destino o el destino de un proceso servidor; no se convierte automáticamente en una entrada CORS. La allowlist habilita lectura cross-origin del navegador y no sustituye autenticación o autorización. Un HTTP200 ajeno no demuestra que su respuesta sea legible por el navegador. [Fetch, protocolo CORS](https://fetch.spec.whatwg.org/#http-cors-protocol).

| Consumidor acreditado | Camino PB | Dato mínimo pendiente |
|---|---|---|
| Vega SPA stock | Origen de página `https://admin.vegacms.com`; backend same-origin por defecto o config/override explícito | Confirmar config pública de la instancia servida y si existen otros clientes browser **legítimos** hacia este PB |
| Lumbre SPA admin | `https://admin.lumbre.pro` hacia su PB | Misma confirmación de clientes browser; no agregar `preview.lumbre.pro` por el mero iframe |
| Fod SPA admin | `https://admin.fodaveg.net` hacia su PB | Distinguir llamadas browser directas desde `fodaveg.net` de las llamadas al BFF/Node propio. RP_ORIGINS de WebAuthn no acredita por sí solo CORS PB |
| Lumbre preview SSR | Loader compilado con `PB_URL`; default durable HTTPS `admin.lumbre.pro` | Acreditar el destino del **bundle de la imagen nueva**, por fuente/build/identidad, y clasificarlo PUBLIC_ADMIN o UNKNOWN; no consultar todo el entorno |
| Lumbre publisher/builder | Runner conocido `964182…`: default `VEGA_PUBLISH_PB_URL`→HTTPS `admin.lumbre.pro`; `docker run` sin `--network` explícita y con PB_URL | Fuente/unit/drop-ins conocidos y su selección vigente; si queda un override efectivo desconocido, mantener UNKNOWN y proponer solo la lectura concreta necesaria, sin Environment completo |
| Lumbre PB→publisher | Puente de archivos `/pb/publish` | Conservar mount y runner. No es un peer de red PB ni un origen browser |
| Fod Node SSR/auth | PB en el mismo contenedor, default `http://127.0.0.1:8090` | Preservar loopback y ambos listeners 4321/8090. La fuente `pb-auth.ts` crea sus headers sin reenviar Origin browser; verificar este comportamiento en el binario/candidato exacto |
| Sitio estático Lumbre | Caddy sirve archivos; lecturas PB durante build | No añadirlo a una red PB por inferencia. Un recurso browser nuevo que sí llame PB necesita su propia fila |

Vega admite backend público configurable y override local de URL; la URL elegida no cambia el origen de la página. No se necesita enumerar storage de usuarios o credenciales para inventariar qué despliegues browser legítimos deben conservarse. No se debe autorizar automáticamente cualquier otro origen capaz de apuntar su Vega genérico a estos PB.

### Proyección HTTP pública mínima de la configuración browser

Ruta exacta que consume `src/lib/session/backend.ts:442`, con `cache:no-store`: `https://admin.vegacms.com/vega.config.json`, `https://admin.lumbre.pro/vega.config.json` y `https://admin.fodaveg.net/vega.config.json`. Es la misma para las tres SPA, independientemente del namespace de assets Kit.

Sea `O` el `window.location.origin` de la página SPA. Sin consultar overrides de usuarios, la fórmula de `resolveBackendUrl()` es: `config.backendUrl.trim()` si es una URL absoluta http/https válida, y `O` en caso contrario. Un override local válido tendría prioridad, pero no se lee ni se infiere en este inventario. `Origin` continúa siendo `O` aun cuando el destino PB sea otro. El loader trata respuesta HTTP no exitosa o JSON no parseable como configuración ausente; un HTTP200 con fallback HTML de la SPA **no** acredita config. Una forma JSON de backendUrl inesperada debe clasificarse UNKNOWN sin inventar un destino.

Proyección por host limitada a `httpStatus`, clase MIME, clase de parseo JSON, `backendUrlPresent`, `backendUrlString`, validez sintáctica http/https, modo `SAME_ORIGIN|KNOWN_PUBLIC|LOOPBACK|UNKNOWN`, origen de destino únicamente entre los tres admins conocidos o enums LOOPBACK/UNKNOWN, y booleanos de path no raíz/userinfo/query/fragment. No exportar URL desconocida, query, credenciales, body completo, authCollection, manifestKey ni claves extra. Un límite pequeño de body y ausencia de redirects a destinos ajenos mantienen la lectura acotada. Esta lectura identifica la configuración pública por defecto; no prueba ausencia de otros clientes browser legítimos ni overrides locales y no certifica una allowlist completa por sí sola.

## Acciones que avanzan sin valores de Caddy

1. **Reconciliar identidad/argv actuales de los tres PB.** Reutilizar receipts actuales y preparar, solo si falta el campo, una proyección nueva de IDs efectivos, ENTRYPOINT/CMD y argv del proceso PB seleccionado por ruta conocida. Exportar únicamente args allowlisted, origins explícitos públicos y unknownCount; cero Config.Env, logs, Health.Test/Output o procesos ajenos. Recheck de los cuatro hashes Compose anteriores. Fod debe conservar tini, hijo PB y Node; no introducir el command stock en Compose.
2. **Completar la tabla browser de tres instancias.** Config pública servida y fuentes del cliente bastan para localizar sus destinos por defecto. Enumerar únicamente orígenes legítimos que acceden directamente a PB; separar página pública Fod/BFF, preview iframe/postMessage y SSR. `unknownCount>0` conserva el hold de la allowlist de ese consumidor, sin bloquear el inventario de los otros.
3. **Preparar CORS independiente de redes.** Los patches contextuales `local-contextual-patches-20261008/patches/*cors*` anclan `vega-edge` y `lumbre-admin-edge`: hoy dependen de haber aplicado primero los patches de red. Para avanzar CORS por separado hay que rebasarlos a los Compose actuales aún en `edge`, con stock `bae812…`, preservando imagen nueva, volúmenes, flags, readonly, health y todas las demás opciones. Los originales son borradores condicionales, no un candidato actual ejecutable. El flag `--origins` y su default `*` están definidos por [PocketBase v0.39.9, cmd/serve.go](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.39.9/cmd/serve.go); el custom debe acreditar que conserva esa frontera en la fuente/binario exactos.
4. **Comprobar CORS sobre el consumidor exacto.** Positivo de cada origen legítimo, negativo de origen ajeno y `null`, preflight de métodos/headers que usa el cliente y petición normal sin Origin para SSR/build. En el negativo exigir ausencia de un ACAO que conceda lectura; no inventar como criterio universal HTTP403. Conservar respuesta/auth/rutas y custom handlers. OPTIONS por sí solo no prueba autorización ni los flujos reales. No usar tokens productivos como marcadores ni persistir bodies/headers privados. Aplicación/serving son una fase posterior de root.
5. **Completar metadata de peers para red.** Leer solo identidad/membresías/aliases/puertos publicados de edge-caddy, los tres backends y preview; enumerar miembros actuales de edge con representación cerrada de nombres conocidos y cantidad de desconocidos. La lista previa de 13 miembros es una base antigua, no prueba actual ni evidencia de que los 13 consuman PB. Reconciliar referencias directas a aliases/8090 en las fuentes o unidades durables de consumidores identificados; no inventariar entornos enteros para descubrirlos.

## Gate específico de redes

Los cuatro patches de red conservan la definición externa vieja `edge`, sustituyen solo la membresía del backend y añaden las tres redes al proxy compartido. La intención es coherente, pero el retiro es **CONDICIONAL** hasta acreditar peers y alias de ingress actuales. No conectar el viejo edge completo a las redes PB.

Si preview/publisher usan HTTPS público acreditado, su camino pasa por Caddy y no necesitan red renderer PB directa. Mantener egress HTTPS/DNS necesario para PB y registro de paquetes; no marcar redes `internal` sin justificarlo. Si se acredita un renderer que sí usa alias interno PB, conectar solamente ese renderer y ese PB a una red dedicada mediante cambios durables revisados de ambos consumidores antes de retirar edge. No inventar nombre de contenedor persistente para el builder efímero.

Fod es un runtime compuesto: Caddy debe seguir alcanzando **tanto** `fodaveg:4321` del sitio/SSR **como** `fodaveg:8090` del admin/PB en la red nueva. El loopback Node→PB no se migra ni requiere conectar otro peer. Preservar aliases, volumen y startup. Una comprobación solo del admin perdería el criterio del sitio público.

Preparar edge durable antes del backend, conservar edge para todos sus clientes restantes, y verificar redes externas/propiedad/conflictos antes de crearlas. La recreación de Caddy afecta entrada compartida y requiere ventana y rollback concretos de root; no se autoriza con esta revisión. Estos cambios de membresía no modifican Caddyfiles ni requieren por sí solos leer valores de su entorno, aunque la publicación conserve su propio gate. Después, un consumidor por vez: ingreso positivo, peer antiguo de edge sin acceso directo a PB, sin puertos al host, sitio/SSR/publisher preservados y persistencia tras recreación controlada. No usar attach manual como certificación durable ni borrar redes/volúmenes anteriores durante el lote.

## Veredicto y límites

**Candidato existente: CONDICIONAL, no listo para aplicar.** Pendiente concreto: configuración/argv actuales tras imágenes, inventario de orígenes browser por PB y metadata/referencias de peers directos. Esas tres lecturas/preparaciones pueden avanzar separadas del acceso Caddy pendiente; no hace falta una lectura de valores secretos para definir su alcance. CORS/red mantienen sus criterios productivos y no se cierran por el recibo image-only o por fixtures locales.

Revisión local de lectura y documentación solamente: sin SSH, builds, Docker, pruebas browser, mutaciones de fuentes o configuración, Config.Env ni logs. No se rehizo el gate del candidato final ni se exige activar share/auth o QA humana reservada para cerrar la adopción L13. Una prueba de policy/red debe limitar sus afirmaciones a lo que observe; no se atribuye aquí salud productiva nueva ni inventario efectivo completo.
