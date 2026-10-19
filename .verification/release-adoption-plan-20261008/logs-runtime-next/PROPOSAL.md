# Logs 8ce56224: lectura única del logger default activo

Preparación local, sin ejecución remota ni suite. No hay grant nuevo instalado ni
archivo de aprobación. Este lote no modifica el paquete Fodaveg sellado.

El criterio original conservado en `../../production-security-real-20261007/local/tasks-read-snapshot.json`
es que el `?token=` de una descarga nativa no quede en logs Caddy/PocketBase. El hook PB
literal `c11c225c…` desplegado y sus pruebas nativas acreditadas se reutilizan. El mapeo
aprobado de `../../caddy-approved-logger-mapping-20261008/projection.json` fija
`srv1`, `hostSkipped=true` para los tres admins; se conserva y no se activa access logging.
La lectura Docker ya consumida, recogida en `../logs-docker-production-observation-20261009.json`,
acredita JSON_FILE, 10 MiB y 3 ficheros en los cuatro contenedores, con pins rechecked;
no acredita filtros de token. No se añaden criterios de retención, readers o colectores.

## Alcance nuevo que debe autorizarse

Una conexión SSH por la raíz al alias existente, y una única petición local dentro del
contenedor `edge-caddy` fijado por ID/imagen:

```http
GET /config/logging/logs/default/ HTTP/1.1
Host: localhost:2019
Connection: close
Accept: application/json
```

El endpoint pide únicamente el objeto `logging.logs.default` de la configuración activa.
Ese objeto podría incluir campos privados de writer, filtros o namespaces: su respuesta
permanece exclusivamente en RAM del proceso remoto. El proyector accede solo a los tipos
de writer/encoder y reglas para los campos exactos `request>uri` y
`request>headers>Referer`, incluidas acciones con la clave literal `token`.
No exporta ni resuelve valores de reemplazo, patrones, paths, credenciales,
include/exclude ni identidades de módulos custom. El parser recibe el subtree entero
en RAM remota y lee output/format para clasificar módulos desconocidos como OTHER;
ese acceso potencial privado forma parte explícita del grant nuevo.
No devuelve nombres/valores crudos del objeto.

Antes y después se solicita exclusivamente `.Id` y `.Image` de `edge-caddy`; el GET usa
el ID fijado, no un nombre reemplazable. Son como máximo tres comandos Docker:
dos `inspect --format` de dos scalars y un `exec -i <ID> nc` que recibe el GET por stdin.
No Config.Env, Caddyfile, logs, servidor/rutas, lista de loggers, configuración completa,
otros hosts, marcadores productivos, cambios, restart ni Docker run/build/pull.

**Autorización:** este alcance no está autorizado para ejecución por este encargo de
preparación. Requiere revisión independiente de las fuentes exactas y un grant runtime
nuevo que nombre explícitamente el endpoint, el subtree privado temporal en RAM remota,
los dos campos de identidad y la proyección limitada. El grant Docker consumido y el
mapping Caddy consumido no se reutilizan. El rechazo de Env Caddy permanece vigente.
No hay motivo para leer Env como prerrequisito ni se propone un bypass.

Si el mecanismo runtime permite a la raíz solicitar y obtener ese grant sobre el alcance
exacto, se procede solo después del resultado. Si exige consentimiento humano para este
nuevo acceso privado, la raíz pide ese consentimiento describiendo exactamente lo anterior;
la autorización de preparación o de otras lecturas no lo sustituye. No se crea una
aprobación ficticia. Un rechazo se comunica con su motivo y mantiene la lectura pendiente.

## Receta revisable

`read_default.py` contiene únicamente `read_default()` y sus guards, sin entrada SSH ni
ejecución al importar. `project_default.py` es el proyector de ese objeto. `run_default.py`
prepara el wrapper one-shot según el protocolo ya revisado del lector Docker: snapshot
único de fuentes/manifest/grant reales, hashes comprobados sobre esos mismos buffers,
operación nueva con marcador exclusivo antes de la conexión y cero conexiones sin grant.
El payload remoto inyecta desde ese snapshot el helper canónico `capture.py` como
`bounded_capture`, el proyector y el lector, llama una vez a `read_default()` y serializa
solo su resultado cerrado. `OPERATE.md` concreta la invocación que la raíz debe someter a aprobación runtime.
No hay fichero execution-approval instalado; solo la invocación realmente aprobada
puede crearlo, de forma exclusiva, con su referencia de revisión y grant exactos.

Se reutiliza el capture canónico `d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01`:
stdout HTTP máximo 96 KiB en RAM remota, cuerpo JSON máximo 64 KiB, stderr drenado y
descartado, GET timeout 15 s y pins timeout 12 s/1024 bytes. No redirect ni retry.
Un 404 devuelve `DEFAULT_ABSENT_EFFECTIVE_UNRESOLVED`; no presume logger implícito ni
consulta otra ruta. MIME inesperado, shape/tamaño desconocidos o identidad cambiada
descartan la proyección. Módulo omitido/custom conserva `UNRESOLVED` sin emitir su nombre
ni seguir su destino.

## Resultado y criterio de esta lectura

La salida permitida tiene únicamente endpoint fijo, estado/attempts finitos, flags de
lectura y una proyección `defaultLogger` con:

- `writerType`: enum público de módulo, u omitido/custom no resuelto.
- `encoderTypes`: cadena acotada de FILTER/JSON/CONSOLE o no resuelto.
- `tokenFilterRules`: por cada FILTER conocido, clase de regla URI/token y Referer.
- `effectiveTokenSafetyProved`, `customProducerMessageSafetyProved`,
  `namedLoggerCoverageProved`: siempre false.

Una regla URI query con delete de clave literal `token`, y delete del campo Referer,
acredita **configuración observada**, no ausencia universal del token ni cobertura de
campos fundamentales `msg`. El corpus SEC41 existente delimita su prueba local; no se
inyecta nada en producción ni se leen registros para fabricar un verde.

Esta operación termina cuando aporta esa proyección del default activo con identidad
conservada, o un STOP explícito. No cierra 8ce56224 ni garantiza persistencia tras restart.
Si muestra configuración insuficiente, permite concretar un delta del **mismo logger**
sin modificar writer/rotación. Eso requerirá candidato y autorización separados.

## Canales custom relevantes, sin inventario ajeno

La lectura no enumera named loggers ni aplica filtros nuevos. Un writer/encoder custom
en el propio default es relevante y queda identificado solo como clase OTHER_UNRESOLVED;
su resolución requiere otro alcance concreto, no abrir sus valores ni otros loggers.
El default no hereda filtros hacia named loggers. No se atribuye al default la cobertura
de un named/custom productor de errores o de mensajes con URL incrustada.

El siguiente paso solo puede seleccionar un canal adicional si una referencia ya
acreditada lo vincula al camino de descarga/errores de los tres admins. El mapping actual
no acredita ninguno y los nombres históricos de otros clientes no conceden ese vínculo.
Mantener el límite explícito es preferible a inventariarlos. No se agregan requisitos de
retención, ACL ni políticas de lectores a la tarea original.

Fuentes locales actuales: informe `../contact-logs-next-actions.md`, observación Docker
anterior, recibo consumido de `logs-selective-next-step/execution-receipt.json` en su
worktree, mapping aprobado y revisión SEC41. La receta canónica está en
`../../worktrees/release-0.11.0-20261008/infra/production/README.md`, sección «Caddy:
modificar el encoder del destino existente»; explica que cada destino y categorías
include/exclude necesitan correspondencia real. No se hicieron consultas web ni se
atribuyó verificación nueva al binario/config productivos.
