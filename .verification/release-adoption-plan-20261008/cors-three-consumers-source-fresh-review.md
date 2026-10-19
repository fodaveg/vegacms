# Revisión de CORS para tres consumidores PocketBase

Veredicto: **APTO estático de los tres parches**. Pendientes aplicación/gate CORS real y, en Fod, construir/acreditar una imagen nueva. Sin SSH, builds, ejecución de tests ni cambios de fuentes por el revisor.

## Candidato revisado

Base `.verification/cors-network-adoption-20261008/`; manifiesto `cors-patch-manifest.json` SHA `7d11d746bc2f27cf29f09b4723aea6d7dc0ae2f7fd3461fdc6ffd7ca10d1f64d`.

| Cambio | Patch SHA-256 | Preimage → target |
|---|---|---|
| Vega Compose | `6546ff00ee61c4e1cbe11739eb2f44c09e136f7e0615b407fd18d1413b633eb1` | `bae812ef0031b5e6aeb65f4678905e65d74cfadf62a5e78fe156250166377f7e` → `11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde` |
| Lumbre Compose | `1b305a6dcf280d9b159992ba396ab0fcd74aa19f0020f6d0c8dc530185d191f8` | `7ed9a9e225790a4e15ccef3ce4c110b8d3b22e0fef53e6c1840d286181ebb8dd` → `56caa1a1273feaa3c56b34db7724177c448190d1c28d723d53a5b62fbe110ae9` |
| Fod entrypoint | `75e0486f5a0f3a683d3f8cda77d5f1d1b7bbc9932f8d886ea4a98276087e13b6` | `17ca1bafb11ba117e1f864707345a8753e2c8423f3bb5191f939347bfc6bace5` → `7a4a8e8063d0f3ffbf679def34739c1f360eb92aec761bb5173bf0f901384d7a` |

Inventario diff stat/name-status y diff completo: Lumbre commit `4439b3a6c64bc33a7e309493af10e7ede5282159` modifica solo admin-compose.yml (+6); Fod WT fodaveg-vega-adoption modifica solo docker-entrypoint.sh (+1/-1). Los tres patch files y manifiesto completos están contabilizados y sus hashes verificados. Lectura de contexto: Compose/Dockerfile Lumbre, Fod entrypoint/Dockerfile/PB main, Node pb.ts/pb-auth.ts, defaults/resolver públicos Vega, proyección RO actual y contrato Deployment topology.

Stock: reconstrucción local en RAM de la copia conocida del Compose original812e más STOCK_CMD del contrato image-only remoto produce exactamente bae812; añadir una sola línea origins produce exactamente11593. No se exportó ni se volvió a leer Compose remoto. Esta cadena y el SHA de la proyección actual acreditan la correspondencia del preimage. Lumbre hashes git show padre/candidato y Fod hash HEAD/archivo coinciden con el manifiesto.

## Comportamiento e invariantes

- Vega añade solo `--origins=https://admin.vegacms.com` a su command actual. Listener8090, dir/publicDir, imagen, volumen y edge no cambian.
- Lumbre define command que reproduce exactamente el CMD de la imagen actual `/pb/lumbre-admin` y añade solo `--origins=https://admin.lumbre.pro`. No sustituye ENTRYPOINT ni omite opciones efectivas observadas. Conserva hook/directorio, extensiones Go, puente publisher, migraciones, mounts, env selectivo, health y edge. No requiere nueva imagen para aplicar el command.
- Fod añade `--origins=https://admin.fodaveg.net` exclusivamente al hijo PB. Preserva --dir "$PB_DATA", serve/listener8090, arranque de Node4321, espera/terminación de ambos, tini -g y loopback Node→PB. Dockerfile copia ese entrypoint dentro de la imagen: la modificación del fichero local no cambia la imagen servida. Requiere una imagen nueva y cadena de identidad validada antes de corte.

Los tres consumidores usan PocketBase0.39.9. La [implementación primaria del comando serve](https://raw.githubusercontent.com/pocketbase/pocketbase/v0.39.9/cmd/serve.go) registra origins como StringSlice y lo transmite a AllowedOrigins, antes default*. App.Start de los custom conserva ese comando y sus rutas custom; no hay nueva ruta o middleware manual que cambie auth. Contrato `docs/PROJECT-CONTRACT-v1.md:1088`: cross-origin permite el origen de Vega tanto en discovery como en API normal. La allowlist no sustituye auth ni añade activación opt-in.

La proyección RO actual aporta los tres argv PB sin desconocidos y los cuatro Compose exactos. Node SSR/BFF de Fod llama PB sin trasladar Origin del browser (headers de Accept/Auth/Content-Type/IP seleccionados); la restricción de origen PB no exige autorizar fodaveg.net por esas llamadas server-to-server. No se ha probado runtime CORS ni inferido de esa lectura que todos los métodos/custom handlers estén cubiertos.

## Pendientes de entrega

No hay must-fix de código en estos tres cambios. No confundir el patch stock remote-exact con fuente durable integrada: main de Vega mantiene todavía otro Compose, con red dedicada y command ausente. El release owner debe reconciliar la adición CORS en su fuente/candidato apropiado; este informe no integra ni cambia red. El commit Lumbre es fuente candidata aún sin afirmar integración; Fod se revisó como diff local con SHA exacto, no como imagen nueva.

La aplicación deberá acreditar allowlist efectiva con origen legítimo/ajeno/null, preflight usado y petición sin Origin en cada PB, discovery/API/custom, auth preservada, imagen/argv/health y peers servidos. Negativos exigen ausencia de ACAO permisivo, no un403 universal. El protocolo ops aún no formaba parte del lote recibido y no está certificado por esta revisión. Config pública/overrides de browser deben distinguirse del destino server PB_URL; el clasificador público tiene su revisión separada. No se tocan redes dedicadas, secretos de Caddy o activación preview/share/SMTP.
