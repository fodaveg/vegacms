# Caddy: cuarto delta local del logger global default

Estado **CANDIDATO LOCAL PARA REVISIÓN**, operación
`12925dcb-b2eb-4b74-9e58-0d81ca692ba4`. No hay approval, grant ni
intento remoto. El pin Fodaveg señala el runtime NEW
`c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6`,
imagen `sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e`
y Compose `eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b`
observado sano por el
[diagnóstico dirigido](../../../../cors-network-adoption-20261008/fodaveg-delivery/forward-cutover-diagnostic-20261015.json).
El journal del corte seguía en HEALTH en ese recibo; root comprobará los
pines vivos antes de ejecutar. Esta propuesta no autoriza lectura privada
ni aplicación.

El diagnóstico [e544](../../../../release-adoption-plan-20261008/logs-runtime-next/execution-receipt.json)
observó `logging.logs.default` con writer y encoder omitidos y sin reglas
de filtro de token; no exportó config ni logs. El fragmento vigente
`global-log-fragment.caddy` tiene SHA-256
`79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`:
filtra `request>uri` desde el primer `?` y elimina Referer, sin `wrap`
ni `output`. Sustituye la receta histórica `query delete token`/`wrap json`.

El validador conserva los tres patches de sitio CSP/panel y añade una
inserción exacta en el **único bloque global `log default` existente**
de `/srv/edge/Caddyfile`. Sólo acepta la fuente si tiene un bloque global
inicial reconocible, un `log default` único y ningún `format` o `import`
dentro de él. Ante ausencia, duplicación o formato previo, STOP sin
adaptar. El resto de los bytes queda idéntico: writer, nivel, routing,
`include`/`exclude`, sampling y comentarios se conservan. La fuente
original sin expandir se examina en RAM y se comprueba de nuevo tras la
expansión de los valores ya referenciados. La copia expandida necesaria
para adaptación/validación aislada vive en `/dev/shm`; no se exporta.

Los cuatro Caddyfiles conservan sus hashes CAS; imports y recursos no
se amplían. Tras adaptar, la política JSON permite exactamente el
encoder `filter` en `logging.logs.default`, con `request>uri` regexp y
Referer delete, sin wrap; rechaza otros campos, formatos o módulos.
El mismo control de origen relee los cuatro ficheros, imports, valores
referenciados y Compose antes de devolver éxito. El recibo proyecta
`globalLogMerged` y `globalLogFilterVerified`, sin rutas privadas nuevas,
contenido, nombres de variables ni errores brutos.

Se reutiliza la evidencia local del mismo fragmento: cinco 502 con
marcador saneado y dos ZIP 200 con query y bytes intactos. Usó otra
imagen Caddy 2.11.4; no demuestra la fusión con la fuente privada, el
binario seleccionado ni el destino servido. Los loggers nombrados,
`msg`, colectores, logs históricos y marcadores en path quedan fuera.
El cuarto delta necesita revisión y **autoridad runtime nueva** para
leer/validar esa fuente junto a los tres patches; un permiso de
validación no concede aplicación ni reload.
