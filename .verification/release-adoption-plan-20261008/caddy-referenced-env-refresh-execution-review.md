# Caddy a511: alcance del STOP real

Resultado: **STOP de validación aislada**, no verde de adaptación ni de producción. El wrapper PROJECTED significa que aceptó el esquema del resultado; transportExit0 no equivale a validación exitosa. Ejecución root14484/terminal278724 EXIT1 del wrapper, `validationStatus=STOPPED`, `failureClass=SYNTAX_UNSUPPORTED`. Revisión RO sin SSH/Docker/tests ni diagnóstico del lexer, cuya corrección pertenece al owner native.

Recibos existentes:

- `execution-receipt.json`: `abf6b8fb774243aa26d1ab5fe8f573b4fbdb7ed8d423426839eaa27fdcec34b1`.
- `projection.json`: `24efbf6146669517e88413bfef19f0129d99cba6ffb7abdbe10d064eda10479f`.

Scope autorizado nuevo aportado por root: consentimiento exacto del usuario para valores referenciados en RAM y tres patches en validación aislada, seguido de aprobación runtime nueva. No se transforma el rechazo previo en permiso ni se replayea su grant. Se reutiliza sello reader9c30f990/wrapperb9d5af35/manifest609ed934 y su revisión estática3aaeb83.

## Contadores y frontera alcanzada

En `remote_validate.py:766`, los counts empiezan en0. `sourceFiles`, `referencedCount` y `presentCount` sólo se asignan en807 **después de que closure retorne**. Closure puede leer imports y consultar valores antes de fallar; por tanto esos ceros, aisladamente, no prueban cero lecturas o queries. Tampoco `closureVerified=false` prueba por sí solo que no comenzó closure.

Esta ejecución concreta aporta `knownGuards` rootff093 y vega772440, `commandVerified=true`, imagen5f5c y `nativePatchChecks=0`. En el flujo sellado9c30, FILES se recorre root→vega→lumbre→fod; cada guard se registra tras leer/hash y antes del staged_patch. La preparación de todos los archivos precede al bucle git apply, y éste precede a closure/query_value. La combinación observada sitúa el STOP en preparación parcial, antes de llegar a closure, adapt o validate. Ésta es una **inferencia del flujo y estado finito**, no un contador de consultas ni una traza directa de cada acceso. No se reconstruye sintaxis ni se lee cuerpo privado para precisar la causa.

Sí están acreditadas lecturas y guards de los Caddyfiles root/vega, además de la procedencia Docker/Compose/PID1 que permitió commandVerified. `composeGuards` contiene constantes esperadas, no resultados individuales; se corroboran por provenance completada, según el flujo. El propio staging crea Docker-client config y scratch tmpfs: no se afirma ausencia de todas las escrituras remotas.

## Límites

AdaptExit/validateExit null, nativePatchChecks0, closureVerifiedfalse y policyRestoredfalse no acreditan patches comprobados, adaptación, validate ni política aislada remapeada. `scratchRemoved=true` acredita limpieza del staging por el protocolo; no hubo contenedores adapt/validate alcanzados en la frontera inferida. No se modificó configuración activa ni se reinició Caddy o consumidores; este runner carece de esos comandos. La proyección contiene sólo campos finitos y hashes conocidos, sin exportar valores, nombres referenciados o cuerpos/errores privados.

No se declara CSP/panel efectivo, loggerdefault79cb aplicado, versión servida modificada ni cierre de tarea. Un candidato corregido debe recibir revisión estática del delta y conservar alcance autorizado; cualquier lectura más amplia requerirá nueva autoridad. No se concede acceso wholeEnv, Config.Env, logs o Admin API como vía de diagnóstico.
