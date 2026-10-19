# Sonda acotada del STOP léxico en `merge_default_log`

El validador de cuatro deltas operación
`12925dcb-b2eb-4b74-9e58-0d81ca692ba4` terminó `STOPPED` con
`failureClass=SYNTAX_UNSUPPORTED`, `globalLogMerged=false`,
`sourceFiles=0` y `nativePatchChecks=0`. La fuente root y los cuatro
Compose cumplieron sus guards; la copia tmpfs se retiró. Por el orden del
validador, el fallo ocurrió en `merge_default_log(original Caddyfile)`
antes de expandir `{$...}`, leer imports o consultar valores. El
[recibo](../caddy-global-logs-20261015/execution-receipt.json) y la
[proyección](../caddy-global-logs-20261015/projection.json) acreditan
esa frontera, no el motivo exacto.

Nueva operación propuesta `728f92f0-4623-4a74-9324-8873f78da905`.
`remote_probe.py` usa los **mismos bytes** del validador SHA
`d980095b44a9d5c53940fea86dc4863619273bafed8c64798247516c5e37503f`
y del fragmento SHA
`79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.
Lee sólo `/srv/edge/Caddyfile` a RAM mediante `read_source` ya revisado,
exige SHA root
`ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b`,
reproduce la llamada exacta a `merge_default_log` y clasifica el primer
rechazo en el mismo orden: decodificación, guard global `CR/NUL/"{"/"}"`,
`tokens` por línea en RAM, estructura de llaves. La categoría y el
contexto son enums cerrados; no devuelve bytes, líneas, números de línea,
tokens, nombres de variables, hashes derivados de contenido ni errores
brutos. Ni Docker ni consulta Env, expansión o lectura de log.

El validador contiene un guard global `"{"`/`"}"` que también detecta
comentarios, y el lexer reducido rechaza backslash en token quoted. Ambos
son hipótesis; esta sonda distinguirá esos casos de CR, NUL, comillas
mal formadas o llave inline. No se relaja ninguna regla antes del
resultado. El candidato de aplicación queda pausado.

La release owner revisa `manifest.json`, fuente, tests y proyección;
si su autoridad vigente cubre esta lectura acotada, crea un
`execution-approval.json` exacto con el `SCOPE` de `run_once.py` y el
SHA del manifest. Después ejecuta una sola vez
`python3 -B .verification/caddy-root-log-syntax-20261015/run_once.py --operation-id 728f92f0-4623-4a74-9324-8873f78da905`.
Un rechazo, timeout o proyección desconocida consume el ID; no repetir.
No hay aprobación ni llamada SSH en este candidato local.
