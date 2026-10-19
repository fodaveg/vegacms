# Caddy 2.11.4: defaults del logger estructurado y límite de redacción

**Resultado dirigido:** el lector real c459 observó en el Caddy seleccionado
`version=2.11.4`, `Config.Tty=false`, misma Id/imagen antes y después, y
disponibilidad de los módulos filter/json/stderr. El lector anterior e544
observó en `/config/logging/logs/default/` writer y encoder omitidos y
`tokenFilterRules=[]`. La lectura Docker previa observó para `edge-caddy`
driver `json-file`, `maxBytes=10485760` y `maxFiles=3`. Ninguna de estas
lecturas examinó el contenido de logs, `Config.Env`, Caddyfile, rutas de otros
loggers o configuración efectiva de un colector. [Recibo c459](binary-execution-receipt.json),
[recibo e544](execution-receipt.json),
[recibo Docker](../../worktrees/caddy-referenced-env-20261008/.verification/release-adoption-plan-20261008/logs-selective-next-step/execution-receipt.json).

## Qué hace exactamente el tag observado

En **`v2.11.4`**, `BaseLog.provisionCommon` asigna `StderrWriter{}` cuando
`WriterRaw` falta y llama a `newDefaultProductionLogEncoder` cuando falta
`EncoderRaw`. `setupNewDefault` usa el `default` configurado si existe y
lo provisiona; los campos omitidos del objeto observado, por tanto, toman
esas ramas del código. [logging.go:128–153](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L128-L153),
[logging.go:315–354](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L315-L354).

Ese encoder produce **console solo si `os.Stderr` es terminal del proceso**;
de lo contrario produce JSON. La sonda `Config.Tty=false` describe la
configuración de TTY del contenedor, no el resultado de
`term.IsTerminal(int(os.Stderr.Fd()))` del proceso Caddy. JSON es la
consecuencia esperada en el caso no terminal, pero el formato realmente
emitido no quedó medido y esta nota no lo certifica.
[logging.go:682–695](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L682-L695).
`json-file` 10 MiB × 3 acredita rotación del stream Docker observado, no
ausencia de otros sinks, lectores o copias.

El encoder por defecto de esa rama **no es `FilterEncoder`**. La presencia
del módulo en `list-modules` solo indica que podría configurarse. El objeto
`default` observado no declaraba encoder ni reglas de token; no hay redacción
de `request.uri` en esa ruta de serialización por defecto. Esto no prueba
que no exista otro `core`, logger nombrado o productor que emita/copíe datos:
esas superficies no se leyeron. [logging.go:337–354](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L337-L354),
[filterencoder.go:49–71](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L49-L71).

El riesgo no es hipotético para un error HTTP: el servidor clona la petición
antes de los handlers, asocia ese objeto al logger de errores y emite los
errores 5xx al nivel `ERROR`. `LoggableHTTPRequest` serializa
`r.RequestURI` como campo `request.uri`, por lo que una URL con `token=`
puede llegar al stream estructurado de errores si esa ruta de log está
habilitada. El hook de redacción de PocketBase actúa después y no modifica
esa copia de la petición en Caddy.
[server.go:314–326](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/server.go#L314-L326),
[server.go:356–430](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/server.go#L356-L430),
[marshalers.go:423–463](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/marshalers.go#L423-L463).
El reverse proxy también construye un campo `request` en una entrada de
roundtrip `DEBUG`; el nivel normal de ese logger se desconoce aquí.
[reverseproxy.go:968–993](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/reverseproxy/reverseproxy.go#L968-L993).

## Dirección del delta mínimo existente

Reconciliar el **patch global ya preparado**
`production-rollout-proposal-20261007/patches/edge-default-runtime-log.patch`
con la fuente real de Caddy, conservando el bloque global y cualquier
`output`, filtros, nivel y destinos efectivos. Su intención es poner un
`filter` en `default`, con `request>uri query { delete token }`, eliminar
`request>headers>Referer` y envolver el encoder existente/esperado en JSON;
`infra/production/README.md:184–205` ya describe esa obligación. El tag
confirma el recorrido de campos anidados del encoder y la existencia de
`QueryFilter` y `DeleteFilter`.
[filterencoder.go:235–253](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L235-L253),
[filters.go:298–325](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L298-L325).

**Límite crítico del patch:** `QueryFilter` usa `url.Parse` y devuelve la
cadena original si falla; además trabaja sobre parámetros que el parser
reconoce. No garantiza eliminar variantes malformadas ni tokens embebidos
en `msg` u otros campos de productores custom. La propuesta requiere
validación sintáctica y corpus sintético de éxito/403/429/502, token normal,
codificado, repetido y malformado, Referer, y cada sink identificado antes
de afirmar redacción efectiva. No instalar los tres fragments de access log
propuestos: el mapeo real de hosts conserva `skip_hosts`; el parche global
no se hereda automáticamente por loggers nombrados.
[filters.go:383–409](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L383-L409).

**Estado de `8ce56224`: abierto.** Esta investigación es solo lectura de
recibos locales y fuente pública exacta `v2.11.4`: sin SSH, Docker, GET de
Caddy, Env/config privada, logs ni edición de producto. No decide nuevos
colectores, política de retención, acceso a logs ni un inventario de otros
loggers. El patch existente sigue siendo candidato, no configuración
instalada ni cobertura demostrada.
