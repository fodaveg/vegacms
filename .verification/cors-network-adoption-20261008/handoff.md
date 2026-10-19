# CORS/red: lector selectivo preparado, 8 oct 2026

**Candidato local; no ejecutado en VPS.** Parte del análisis [cors-network-next-actions](../release-adoption-plan-20261008/cors-network-next-actions.md). La proyección antigua precede a las imágenes actuales y los cuatro hashes Compose del informe necesitan comprobación fresca. Esto no aplica CORS, no retira `edge` ni certifica orígenes browser legítimos.

`remote_probe.py` SHA-256 `537269fa2eddb43d7050f50c7ade571e4f10c9dabe5325ea64b3ed7655bc5f10` lee únicamente:

- SHA-256 de los cuatro Compose literales, máximo 2 MiB cada uno, con descriptores `O_NOFOLLOW|O_NONBLOCK` (una hoja FIFO se rechaza sin esperar), y comparación con el recibo anterior.
- ID, imagen efectiva, estado, ENTRYPOINT/CMD proyectados, argv del único proceso PB seleccionado, nombres de red conocidos, aliases conocidos y recuentos desconocidos, puertos de contenedor permitidos y **solo booleano** de publicación host para `edge-caddy`, `vega-pb`, `lumbre-admin-pb`, `fodaveg`, `lumbre-preview`. Fod puede quedar con `pbArgs=null` si el proceso no se identifica de forma única; ese valor no acredita el argv.
- ID de la red `edge`; miembros con nombre en esa misma allowlist y **solo cantidad** de miembros desconocidos. Exige concordancia de nombre **e ID** con las membresías de los cinco contenedores y rechaza IDs duplicados.
- GET público sin auth de `/vega.config.json` en los tres dominios admin exactos, sin proxy ni redirects, máximo 8 KiB: estado y destino solo si es uno de esos orígenes públicos, más flag same-origin. `overrideUninspected=true` recuerda que el almacenamiento browser individual no se lee y puede cambiar el backend resuelto.

No solicita `Config.Env`, entorno de proceso, `.env`, Caddyfile/valores, logs, `Health.Output`, IP/MAC, host IP/puerto, nombres de peers desconocidos ni cuerpos JSON públicos en el resultado. Los errores producen `STOP` o estado `UNAVAILABLE/UNKNOWN` sin mensajes crudos. El wrapper `run_once.py` SHA-256 `1cea039df92d906754a4013bf9053e7efe0ca996b37e038b746edfd83abe412e` fija la fuente por hash, exige output JSON nuevo, descarta stderr y valida esquema exacto antes de persistir. Solo release owner tras revisión:

```sh
python3 -B .verification/cors-network-adoption-20261008/run_once.py --execute --script-sha256 537269fa2eddb43d7050f50c7ade571e4f10c9dabe5325ea64b3ed7655bc5f10 --out .verification/cors-network-adoption-20261008/projection-20261008.json
```

Verificación local: AST de ambas fuentes; origen y flag `--origins` públicos pasan, valor privado queda contado; Fod `--dir /pb/pb_data`, `--publicDir`, `--hooksDir`, `--http` y `--hooksWatch` en pares se normalizan a `flag=valor` solo para valores permitidos; tres valores privados se cuentan y no se emiten. Una hoja FIFO de Compose se rechaza de inmediato, y un ID distinto entre miembro conocido de `edge` y contenedor provoca STOP. Alias desconocido y miembro `edge` desconocido solo suman contadores; esquema de ejemplo con 13 miembros (cinco conocidos, ocho desconocidos) válido; alias privado inyectado en la salida y campo `privateValue` con marcador sintético se rechazan sin fichero persistido. No se ha probado contra Docker/HTTP remotos. `PROJECTED` solo entrega metadatos actuales; un `matchesReceipt=false`, `unknownCount>0`, `pbArgs=null` o config `UNKNOWN/UNAVAILABLE` conserva el hold de la decisión afectada.
