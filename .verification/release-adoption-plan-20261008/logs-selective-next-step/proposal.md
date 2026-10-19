# Logs 8ce56224: siguiente lectura mínima, aún sin permiso runtime

**Resultado parcial:** puede prepararse una lectura de metadatos Docker de los
tres admins y su borde compartido sin Env, credenciales ni contenido de logs.
No permite cerrar `8ce56224-4787-4bf1-9ba4-6537a6ee3a2b`: faltan configuración
PB efectiva, runtime/error Caddy, canales custom/colectores y acceso/retención.
La pieza entregada incluye proyector original congelado, ejecutor Docker-only y
wrapper de una conexión sellada. Solo se han ejecutado simulaciones offline;
no hay aprobación instalada ni lectura remota nueva.

## Evidencia reutilizada y alcance real

| Canal | Acreditado | Todavía no observado |
| --- | --- | --- |
| Stock `vega-pb` | Imagen candidata instalada `dd978b8d…`, SPA153/153 y health200 según recibo de entrega. Fuente del hook -1035 y pruebas previas PB0.39.9. | Driver/rotación Docker efectivos, settings logger PB actuales, carga efectiva del hook, readers/colectores y política temporal. |
| Lumbre `lumbre-admin-pb` | Imagen candidata instalada `40df6a9b…`, SPA153/153 y health200. Consumidor nativo revisado. | Mismos metadatos; no atribuirle automáticamente la configuración stock ni el comportamiento de hooks anteriores/custom. |
| Fodaveg `fodaveg` | Imagen candidata `0e0ef563…`, SPA155/155 y health200 tras recuperación en esa misma imagen. Prueba local de hook/binario empaquetados y reinicio18/18. | Configuración productiva efectiva y canales Node/PB/wrappers: misma imagen no prueba todos los productores de stdout/stderr ni sus colectores. |
| Caddy access de los tres admins | GET autorizada única observada08:45UTC: `srv1`, `hostSkipped=true`; ninguna asociación de logger conocida. Los cinco ficheros edge quedaron iguales tras las adopciones. | Este dato no inventaría runtime/error, logger default, loggers nombrados/custom, buffers ni cambios de configuración por API. |
| Réplica SEC41 | ZIP nativo y corpus sintético; PB activity/message/data.url, access/runtime Caddy y streams medidos sin marcador. | No es inventario de sinks productivos ni política de retención. Un stream vacío no fue control positivo universal. |

Referencias canónicas locales, ya existentes:

- [Siguiente lote Contacto/logs](/Users/david/code/vegacms/.verification/release-adoption-plan-20261008/contact-logs-next-actions.md)
- [Entrega de las tres imágenes](/Users/david/code/vegacms/.verification/image-only-delivery-20261008/production-image-delivery-receipt-20261008.json)
- [Identidades de imágenes](/Users/david/code/vegacms/.verification/image-only-delivery-20261008/image-identities-20261008.json)
- [Cinco guardas edge tras Fod](/Users/david/code/vegacms/.verification/image-only-delivery-20261008/edge-hashes-after-fodaveg-20261008.json)
- [Mapeo Caddy aprobado y consumido](/Users/david/code/vegacms/.verification/caddy-approved-logger-mapping-20261008/projection.json)
- [SEC41, con sus límites](/Users/david/code/vegacms/.verification/production-security-real-20261007/receipt.json)
- [Revisión nativa consumidores](/Users/david/code/vegacms/.verification/release-adoption-plan-20261008/consumer-native-review.md)

Los paths son referencias locales de esta máquina. Este informe no sustituye
sus recibos ni crea otro gate de producto.

## Propuesta de nuevo permiso mínimo: Docker, sin logs ni Env

Primero revisar completos `project_metadata.py`, `remote_read.py`, `run_once.py`,
`capture.py`, `pins.json`, ambos tests, este informe, `receipt.json`, `checks.json`
y `manifest.json`. El proyector365ef… permanece intacto; capture d48e… se reutiliza
byte a byte de MIME. La raíz obtiene un NUEVO permiso runtime para el ejecutor
exacto antes de instalar su aprobación. No se ha ejecutado Docker ni SSH. No reutilizar
el grant de ocho configs/imports, la GET consumida ni ninguno de los lectores
Caddy whole/reduced rechazados; sus rechazos siguen vigentes.

Objetos exactos: `vega-pb`, `lumbre-admin-pb`, `fodaveg`, `edge-caddy`. Por objeto:

1. Seleccionar solo `Id` e `Image`, validar tres hashes instalados del recibo y
   fijar el container ID para las consultas posteriores; usar guard específico
   de CORS observado para el borde5f5…. `pins.json` fija los cuatro ID/image
   completos de `projection-20261008.json`; cualquier diferencia=>STOP global.
2. Pedir SOLO `HostConfig.LogConfig.Type` como scalar. Clasificar sin reflejar
   nombres desconocidos. `json-file`, `local`, `none` pueden avanzar; drivers
   externos/plugin/unknown y journald => STOP sin ninguna opción o destino.
3. Para uno de esos tres tipos, el template `DOCKER_DRIVER_TEMPLATE` devuelve
   el tipo y un booleano convertido en0/1 que indica claves ajenas al conjunto
   fijo. El template visita nombres en RAM de Docker, jamás devuelve nombres
   ajenos ni valores. Unknown => STOP sin pedir valores de opciones.
4. Solo después, y para el MISMO container ID, `DOCKER_TEMPLATE` selecciona
   exactamente `max-size`, `max-file`, `compress`, `mode`, `max-buffer-size`.
   Repite tipo y señal de unknown keys; cualquier deriva/shape ambiguo=>STOP.
   El ejecutor debe mantener ambas señales del gate iguales antes de proyectar.
5. El proyector acepta tamaños enteros finitos y counts; opciones ausentes no
   heredan defaults supuestos. Modo blocking/non-blocking y compress se vuelven
   enums públicos. Driver json-file no acepta compress. Valores inesperados,
   esquema ajeno o parcial=>STOP, sin reflejar valores ni errores privados.
6. Comprobar que los container IDs/Images siguen siendo los seleccionados; si
   una instancia cambió, no reutilizar esa observación. Salida: label fijo,
   tipo de driver de lista finita, bytes/count, flags finitos y unknowns.

NO solicitar `Config.Env`, bloques Config/LogConfig completos, opciones tag,
labels/labels-regex/env/env-regex, direcciones o credenciales de colectores,
`LogPath`, `Health.Log/Output`, logs de Docker/PB/Caddy, procesos completos ni
ficheros privados. NO escribir configuración, activar access logging, reiniciar,
inyectar marcadores productivos, instalar, construir ni modificar tareas.
El ejecutor preparado limita a20 comandos, cada uno timeout12s/8192 bytes.
Captura d48e… descarta stderr, drena bounded y no guarda errores crudos. Consulta
únicamente templates de campos seleccionados en Docker antes de Python; no hay
`docker inspect` amplio ni objetos HostConfig/LogConfig completos exportados.

Este inventario parcial es útil aunque la salida se detenga: discrimina si la
rotación Docker ya está declarada o si hace falta revisar un colector. `10m` y
`3` significan límites de tamaño/count, NO días de retención ni política de
lectura. El driver Docker recoge streams; no redacta por sí solo tokens ya
producidos. `none` tampoco prueba que no haya otros sinks.

## Fronteras que este permiso NO resuelve

- **PB activity/logger/settings:** no hay endpoint metadata público aprobado ni
  contexto autenticado vigente para settings. No leer credenciales para llamar
  `/api/settings`, ni abrir/exportar sqlite `_params`/log DB o body de settings.
  Fuente/imagen/hook hash y pruebas previas no equivalen a settings en memoria
  efectivos. STOP hasta un alcance nuevo que seleccione exclusivamente logger,
  retención y flags públicos, con prueba de fidelidad fuente/in-memory. No
  elevar automáticamente una lectura de settings persistentes a efectiva.
- **Caddy runtime/error y named/custom:** el mapeo aprobado no devuelve esa
  topología. No pedir `/config/` ni bloque completo de logging para inferirla;
  ningún lector de valores de entorno es prerrequisito. Si la raíz dispone de
  un logger concreto acreditado, puede proponer por separado scalar endpoints
  exactos de writer/encoder/rotación y acciones de filtro, con nuevos permisos,
  límites y STOP ante módulo/custom/fields que no se puedan resolver. El default
  no se hereda automáticamente y observarlo no cubre loggers nombrados. No
  descubrir nombres por una lectura amplia sin grant específico.
- **Acceso/colectores/retención temporal:** no inferir readers de docker group,
  journald/syslog o ACL; no abrir ficheros de log ni rastrear destinos por paths
  crudos. Hace falta propuesta posterior de metadata stat/ACL y política
  declarada para destinos ya conocidos, autorizada por separado. Un stdout
  saneado no certifica una copia histórica o un collector custom.
- **Persistencia y corpus por sink:** reutilizar fuente/binario/hook exactos y
  SEC41/18x tests donde sean fieles; una nueva réplica solo después de identificar
  canales/config efectivos y probar primero la frontera negativa mínima. Nada
  de fullsuite/build por rutina ni de corpus en producción.

La preparación no muta ni cierra la tarea; reutiliza los criterios originales. No se activan sinks omitidos
ni se instalan fragmentos access-log antiguos. El original de8ce exige evitar el token en logs. La raíz acredita ya el redactor
PB instalado y access hostSkipped; no se reabren esos criterios ni se impone una
auditoría nueva de readers/retención para sustituirlos. Los campos NOT_OBSERVED
registran límites de esta lectura, no añaden gates. Sigue siendo significativo
certificar el encoder/filtro real de Caddy default runtime y los canales custom
que realmente puedan conservar el token; este lector no accede a ellos.

## Ejecución posterior: raíz exclusivamente, una nueva operación

`run_once.py` exige `execution-approval.json` con exactamente los campos de
`authorize()`: status/reviewStatus APPROVED, operationId del manifest, MODE,
SCOPE idéntico, SHA del manifest y una referencia real al grant runtime.
`selectiveDockerMetadataAccessExplicitlyApproved=true`;
`environmentOrLogContentAccessApproved=false`. No hay aprobación plantilla
instalada, ni se presume la autorización del lector rechazado.

`python3 -B run_once.py --operation-id <operationId-del-manifest>`

La única conexión va al alias SSH `lumbre`, Python stdin; el wrapper snapshottea
una sola vez TODOS los artefactos, comprueba los mismos buffers y forma payload
con ellos. PINS, proyector, capture y script remoto se transmiten desde esa copia
aprobada. Cambiar las rutas después no altera el payload. Marker O_EXCL antes
de SSH: una operación consumida no reintenta. Sin aprobación=>cero conexiones
y ningún marker. Recibo/proyección0600; únicamente labels públicos fijos, enums,
counts, booleanos, exits, unknowns explícitos. El wrapper rechaza headers, Env,
HealthOutput, LogPath, errores, paths o strings desconocidos en cualquier campo.

Un cambio de ID/image invalida TODAS las observaciones parciales y retorna STOP.
Driver externo/unknown, key desconocida o valor ambiguo retornan STOP por canal
y exit1; el lector nunca amplía el alcance ni pide valores adicionales. Los
settings PB, Caddy default runtime, named/custom quedan UNRESOLVED explícitos;
no declara cierre global ni ausencia universal de tokens. Nada Contacto/SMTP.
