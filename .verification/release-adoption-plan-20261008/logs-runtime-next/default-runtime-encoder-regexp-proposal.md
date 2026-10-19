# Candidato mínimo: redacción del logger `default` existente

**Propuesta local, no instalada.** La sintaxis se validó con la imagen local
Caddy 2.11.4; el flujo real de logs sigue sin probarse. Alcance: solo el
encoder del `logging.logs.default` observado por e544 en el Caddy 2.11.4
seleccionado por c459. El fragmento
[`default-runtime-encoder-regexp.proposed.caddy`](default-runtime-encoder-regexp.proposed.caddy)
se fusionaría **dentro del bloque global `log default` existente**, sin crear
un destino ni un access log nuevo y sin modificar otros hosts/peers. Hay que
conservar `output`, nivel, filtros existentes, `include`/`exclude` y cualquier
consumidor del logger; si la fuente efectiva no permite una fusión exacta,
STOP. La lectura de la configuración privada y la aplicación siguen fuera
del permiso de este lote.

La propuesta histórica `edge-default-runtime-log.patch` usa `query delete
token` + `wrap json`. El código **del tag v2.11.4** muestra que `QueryFilter`
llama a `url.Parse` y devuelve la cadena original ante error; eso no cumple
el caso malformado del contrato `infra/production/README.md:179–216`.
`RegexpFilter` aplica `regexp.ReplaceAllString` directamente al valor del
campo, sin parser URL; la expresión `(?s)[?].*` sustituye desde el primer
`?`, incluso con saltos de línea, por `?REDACTED`. En un `RequestURI` con
query, retiene el path y descarta **toda** la query, normal, repetida,
codificada o con `%zz`. [QueryFilter:383–409](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L383-L409),
[RegexpFilter:534–588](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L534-L588),
[sintaxis RE2 `(?s)`](https://github.com/google/re2/wiki/Syntax#flags).

`request>headers>Referer delete` elimina el campo completo, incluidos
valores múltiples. Omitir `wrap` hace que `FilterEncoder` elija JSON o
console con la misma condición de terminal de stderr que el encoder por
defecto del tag; conserva **la clase de formato condicional**, sin afirmar
identidad byte a byte o que el proceso real no sea terminal. El destino
stderr se conserva al no declarar `output`. El fragmento solo cubre
`request.uri` y `request.headers.Referer` del logger `default`.
[FilterEncoder:34–55](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L34-L55),
[FilterEncoder:73–125](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L73-L125),
[logging.go:315–354](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L315-L354).

**Límites:** una ruta que lleve el marcador antes del primer `?` o no tenga
`?` no se sanea por esta expresión. Si el criterio exige ocultar cualquier
marcador en cualquier URI, usar `request>uri replace REDACTED` y aceptar la
pérdida de la ruta en ese log, como permite el README. `msg` es campo
fundamental que `FilterEncoder` no puede filtrar, de modo que productores
custom que incrusten URLs en mensajes requieren arreglo en origen o una
política separada. Los loggers nombrados no heredan automáticamente el
encoder de `default`. Nada aquí acredita canales, colectores o retención
desconocidos ni cierra `8ce56224`.
[FilterEncoder:44–55](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L44-L55).

## Discriminador local y verificación pendiente

El modelo ligero `python3 -B test_default_uri_regex_model.py` pasó 3 tests
(exit 0): ruta intacta sin query; token normal, clave codificada, repetido,
`%zz` antes/después, y salto de línea con query; negativo explícito de
`msg` fuera del alcance. **No es una prueba de sintaxis ni de ejecución
de Caddy/Go.** El test comprueba la semántica propuesta de la expresión,
no su adaptación Caddyfile ni la versión exacta del proceso local.

La prueba real local previa [SEC41](../../production-security-real-20261007/receipt.json)
usó imagen `sha256:6b08…` y dos sinks **propios** para tres 502 sintéticos:
sin filtro el marcador apareció en ambos; `query` lo retiró en los tres
casos medidos y `replace` también. Acreditó 41 assertions, pero **no es la
imagen actualmente seleccionada** (`sha256:5f5c…`), no contiene el nuevo
`regexp`, no prueba otros estados ni sinks productivos y no se repite aquí.

El primer discriminador usó un fixture pequeño con el binario/imagen 2.11.4
exacto. La [sonda sintética](default-regexp-probe/receipt-arm64.json)
pasó con la imagen exacta `sha256:6b08…` en Linux/arm64: `adapt` y `validate`
salieron 0; el modelo adaptado conserva `default` sin `writer` ni `wrap`,
incluye el `regexp` y elimina Referer; `validate` rechazó una expresión
regular inválida. No había `output`, nivel, routing ni filtros preexistentes
en ese fixture, por lo que su conservación en el bloque real sigue pendiente.
El primer preflight asumió amd64 y se detuvo sin abrir contenedores; se
conservó su [recibo](default-regexp-probe/receipt.json). Los cuatro
contenedores de la ejecución arm64 fueron efímeros y `--rm` retiró todos.

El caso `%zz` y Referer se comprobaron después con un error de proxy 502,
como se detalla abajo. La aplicación real exige candidato de config
propietaria, revisión, permiso runtime y verificación de servido separados.

## Flujo sintético del logger `default`

La [prueba local de stream](default-regexp-probe/stream-receipt-bridge.json)
usó la misma imagen 2.11.4 y un proxy sintético que respondió 502. El control
sin filtro registró el marcador en `request.uri` y Referer. Los cinco casos
filtrados (query normal, clave codificada, clave repetida, `%zz` y salto de
línea codificado `%0A`) mantuvieron su path, sustituyeron la query completa
por `?REDACTED`, eliminaron Referer y no dejaron el marcador en el registro
JSON. Los seis requests llegaron al proxy y dieron 502; no hubo rechazos 400.
Los logs sintéticos se analizaron en RAM y solo se guardaron resultados
finitos. La red y los contenedores eran propios, el puerto era efímero de
loopback y se retiraron al terminar. El [primer intento](default-regexp-probe/stream-receipt.json)
se detuvo en `docker port` con red interna antes de cualquier petición; la
ejecución acreditada usó una red bridge propia, como SEC41.

Este flujo acredita el logger `default` solo ante errores 502 de ese proxy
sintético. No acredita que emita records para 200/403/429, no inspecciona el
bloque privado real ni prueba otros loggers, sinks o servidores. Tampoco
demuestra que la query llegue intacta al upstream en una descarga 200;
eso se prueba por separado en la sección siguiente.

## Query y ZIP sintéticos con el mismo fragmento

La [sonda dirigida](default-regexp-probe/zip-upstream-receipt.json) ejecutó
el mismo fragmento global en un Caddy local 2.11.4. Su listener `:8080`
proxió dos GET a otro listener del mismo proceso, `:8081`, que servía un ZIP
sintético. Un access logger **instrumental de ese listener interno** permitió
observar que la URI llegó íntegra, tanto con token normal como con `%zz`,
clave codificada y repetida. Las dos respuestas fueron 200 y sus 175 bytes
coincidieron con el SHA-256 del ZIP original. El token se generó en RAM;
el receipt guarda solo verificaciones y hashes, no el valor ni logs crudos.
El contenedor y la red propios se retiraron y `df` permaneció en
122800000 KiB libres.

Esto cubre la integridad de query y bytes en ese proxy sintético. El access
logger adicional es solo instrumentación local y no representa un logger
nombrado de producción. No acredita descargas autenticadas, la configuración
privada efectiva, otros servidores ni la versión servida. La fusión exacta
del bloque real, su revisión y la verificación posterior siguen pendientes.
