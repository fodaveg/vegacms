# Plan acotado de adaptación nativa y validación aislada de Caddy

Fecha: 2026-10-08. Responsable del plan: agente `caddy_native_adapt_plan`. Ejecutor autorizado para la eventual operación: sesión raíz. Este documento es diseño; no acredita ejecución, lectura del VPS ni validación de producción.

**Veredicto: alternativa materialmente menor, pero condicional. A → B → C no permite prometer cierre con la evidencia disponible.** `adapt` sin `--validate` separa la adaptación del aprovisionamiento, pero puede leer imports antes de producir JSON. Si hay expansiones `{$...}` no acotadas, no puede demostrarse el conjunto de archivos que leerá únicamente examinando los destinos de import escritos originalmente. La parada debe ocurrir antes de A. Si la configuración resulta independiente del entorno, adaptar también en el contenedor aislado es menor que ejecutar dentro del contenedor activo.

## Premisas y conflictos vigentes

- Objetivo recibido: cerrar la preparación de CSP/panel de los tres administradores Vega, manteniendo las garantías de configuración efectiva y sin extraer `Config.Env` ni `/proc/*/environ`. La publicación continúa bajo la autoridad de la raíz; este plan no cambia esa autoridad.
- El [audit de autoridad](../release-authority-audit-20261008/report.md) distingue autorización de despliegue de aptitud técnica. El [rechazo registrado](../private-runtime-metadata-read-ready-20261008/private-caddy-env-validation-ready-20261008/auto-review-rejection-20261008.json) invalidó la aprobación anterior antes de crear proceso y prohíbe un rodeo del mismo acceso. La operación aquí propuesta exige una aprobación runtime nueva y explícita del alcance concreto; su aprobación no se presume.
- La [propuesta privada anterior](../production-rollout-proposal-20261007/private-closure-proposal-20261008.md) delimitaba archivos/imports de `/srv/edge`, procesamiento remoto, logs/certificados excluidos y validación aislada. Su concesión consumida no autoriza reabrir los ocho archivos por rutina. La nueva propuesta debe enumerar las lecturas mínimas necesarias, sin repetir las ya cubiertas por evidencia vigente.
- El [script anterior](../private-runtime-metadata-read-ready-20261008/private-caddy-env-validation-ready-20261008/remote_validate.py) no es ejecutable como alternativa: `main` llama `process_environment`, `effective_closure` depende del bloque leído y `launcher` retransmite valores seleccionados. Su `isolated_test_copy` bloquea storage y sólo remapea filewriters; ampliar a storage exige una revisión concreta, no quitar el bloqueo.
- La raíz informa de un nuevo guard de Compose Vega que empieza por `bae812ef`, posterior al corte de imagen con conservación de `command`; el `812e…` anterior no sirve para una tanda futura. El propietario de la propuesta debe reconciliar el guard completo y la evidencia actual. No confundirlo con `EDGE_GUARD` de `/srv/edge/compose.yml`: son superficies distintas. Este plan no ha verificado ninguno en el servidor.

## Evidencia técnica que determina el diseño

En Caddy v2.11.4, `cmdAdaptConfig` ejecuta `cfgAdapter.Adapt` y sólo llama `caddy.Validate` dentro de `if validateFlag`; `cmdValidateConfig` sí lo llama. Por tanto no se debe añadir `--validate` a A. El uso de `--envfile` también queda excluido. Esta comprobación corresponde al código v2.11.4 citado por el script anterior; falta acreditar que la imagen/binario efectivos corresponden a esa versión. [Fuente CLI fijada](https://github.com/caddyserver/caddy/blob/v2.11.4/cmd/commandfuncs.go#L514-L635).

La garantía anterior es ausencia del ciclo de aprovisionamiento de la configuración, no pureza universal del adaptador: `Adapt` llama `Parse` y `ServerType.Setup`; los unmarshallers de módulos pueden ejecutar código. Los módulos/directivas admitidos deben corresponder a la imagen comprobada y tener lectura conocida antes de ejecutar en el contenedor activo. Un adaptador o módulo desconocido impide A. [Adaptador fijado](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/adapter.go#L28-L59).

`replaceEnvVars` precede a tokenización e imports y permite sustituir varias líneas. Una referencia escrita en otro argumento, incluso en una línea comentada, puede cambiar la estructura posterior. El valor por defecto de `{$NAME:default}` no demuestra el valor efectivo. El JSON llega después de esas lecturas: rechazar allí un import prohibido sería demasiado tarde. [Parser fijado](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/parse.go#L27-L103), [semántica de import](https://caddyserver.com/docs/caddyfile/directives/import).

`docker exec` hereda el entorno de creación del contenedor, no los cambios hechos por un wrapper al arrancar el proceso principal. Por ello hay que acreditar un arranque directo y conocido, sin scripts ni envfiles. No se deduce de que el proceso se llame `caddy`. [Contrato de Docker](https://docs.docker.com/reference/cli/docker/container/exec/#set-environment-variables-for-the-exec-process---env--e).

El provisioning de filewriters puede abrir/crear archivos y cambiar sus permisos; conservar los destinos reales durante `validate` no es lectura inocua. El storage por defecto también depende del entorno. El remapeo y el aislamiento son requisitos, no mejoras opcionales. [FileWriter fijado](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filewriter.go#L147-L229), [storage por defecto](https://github.com/caddyserver/caddy/blob/v2.11.4/caddy.go#L65-L77).

## Secuencia propuesta y aceptación

### 1. Fijar el candidato y aprobar una clasificación que no lee valores de entorno

Preparar un nuevo operationId y propuesta con hashes completos del candidato/diffs, guard actualizado, cuatro archivos Caddy conocidos e imports físicos expresamente comprendidos. Preservar bytes ajenos a los tres bloques objetivo. Solicitar al runtime la operación de clasificación y, sólo si supera sus condiciones, las fases posteriores enumeradas. No ampliar automáticamente tras un STOP.

Los datos privados se procesan exclusivamente en el servidor. El recibo exporta estados finitos, contadores, imagen y guards ya autorizados; no exporta configuración, argumentos arbitrarios, nombres/valores de variables, JSON compilado, errores crudos ni hashes de datos derivados de secretos.

**Aceptación:** revisión del nuevo filtro y aprobación real; identidad del candidato comprobable. Pendiente: implementar/revisar el filtro, actualizar propuesta ajena por su propietario y obtener la aprobación. No requiere volver a pedir autorización genérica de deploy.

### 2. Cerrar el alcance antes de adaptar

Usar aperturas sin seguir enlaces, límites de bytes/archivos y comprobación de tipo para los archivos autorizados. Resolver imports estáticos de forma recursiva dentro del árbol permitido, registrando sólo en RAM su manifiesto exacto. No leer un destino para averiguar después si estaba permitido. Globs, rutas absolutas y relativas deben tener semántica de la versión fijada; ciclos, escapes, enlaces, sintaxis no soportada o resolución ambigua producen STOP.

No equiparar `shlex` al lexer de Caddy: el script anterior emplea una aproximación. El mínimo seguro admite un subconjunto estático comprobado y rechaza fuera de él; snippets con argumentos/bloques, heredocs o tokens que generen destinos requieren soporte demostrado o parada. Si se restringe a imports simples, registrar esa limitación; no declararlo parser general.

Escanear los bytes originales de **toda** la closure por referencias parse-time antes de llamar a Caddy. Para esta alternativa sin acceso a valores, cualquier `{$` no resuelto con evidencia suficiente implica `STOP_ENV_EXPANSION_SCOPE_UNKNOWN`. No basta excluir variables del argumento `import`: cualquier expansión puede introducir otro import. No usar `getenv`, `printenv`, `env`, `environ`, inspect completo ni una consulta booleana sobre valores como sustituto encubierto del acceso rechazado. Tampoco existe aquí un comando nativo de `adapt` que liste la closure segura antes de abrir sus imports.

Rechazar además `{env.*}`, referencias a ficheros privados y módulos cuyo parseo pueda leer recursos fuera de la closure. Los placeholders ordinarios de petición no equivalen a lectura de entorno; sólo se admiten en módulos/posiciones revisados. La comprobación posterior del JSON será una segunda defensa, no el cierre inicial.

**Aceptación:** closure finita cerrada y candidata exacta, sin expansiones desconocidas ni lecturas externas de adaptación. **Bloqueo real si falla:** no se puede ejecutar A con estas premisas. Una lectura específica de valores o un aislamiento filesystem adicional cambiarían la operación y necesitarían otra propuesta y aprobación; no están implementados ni autorizados por este plan.

### 3. Elegir el ejecutor mínimo y, si se conserva A, acreditar su procedencia

Si el paso 2 y la revisión de los módulos demuestran independencia del entorno, preferir `adapt` en el contenedor aislado de la misma imagen, sin transferencia de variables. Evita staging dentro del runtime activo.

Para A nativo, la propuesta debe permitir únicamente campos seleccionados de identidad de imagen/contenedor, `Entrypoint`, `Cmd`, directorio de trabajo y mounts relevantes; nunca `.Config` completo ni `.Config.Env`. Comparar en RAM con una forma estricta de arranque directo `caddy run --config … --adapter caddyfile`; wrappers, `--envfile`, `--resume`, flags desconocidos o ejecución sustituida dan STOP. Acreditar correspondencia de imagen/binario, ausencia de mounts que tapen ejecutable y fuente revisada del arranque. Si el runtime real necesita inspección de proceso para resolver ambigüedad, esa lectura debe aparecer en la propuesta; no reutilizar la concesión anterior. La selección de metadata no acredita por sí sola cambios internos arbitrarios del proceso; limitar la afirmación al binario/arranque documentados.

**Aceptación:** procedencia pública suficiente para la herencia nativa y versión fijada; ninguna lectura de bloque de entorno. Pendiente: evidencia viva filtrada. Ante desconocido, STOP y conservar el resultado parcial.

### 4. Adaptar una copia privada, con imports cerrados

Si se usa A, crear scratch exclusivo dentro de una ubicación no observada por el servicio y ajena a sus montajes de configuración/datos. Documentar que habrá escrituras de scratch dentro del contenedor, aunque no de configuración activa. Rechazarlo si sólo puede alojarse en un lugar observado o si no puede acreditarse su retirada.

La copia debe incluir únicamente la closure. Un import absoluto no puede conservar un destino activo: remapear sólo sus tokens de ruta al snapshot, con tabla reversible de paths y correspondencia uno a uno; los relativos conservan su resolución. Probar esa correspondencia antes de ejecutar, sin cambiar directivas ni valores. Si no puede hacerse con fidelidad en el subconjunto admitido, STOP. Mantener snapshot inmutable durante la operación y comprobar sus guards al terminar.

Ejecutar exclusivamente el binario conocido con `adapt`, configuración explícita y adaptador Caddyfile, sin `--validate`, envfile ni shell que imprima/expanda variables. Capturar stdout/stderr por canal privado remoto, con límites y timeout. JSON y errores permanecen en RAM/scratch privado del servidor; nunca viajan al Mac ni a logs persistentes del orquestador. Contar warnings sin revelar texto. No usar un fallo posterior como prueba de que no se hicieron lecturas previas.

**Aceptación:** exit terminal 0 y JSON parseable del candidato exacto; no acredita provisioning ni servicio efectivo. La fuente del adaptador y las condiciones previas sustentan ausencia de provisioning; una prueba sintética del mismo binario puede respaldarla, sin certificar configuración viva.

### 5. Remapear recursos del JSON con inventario exacto

Recorrer módulos y campos según schemas y versión revisados, no sólo una lista negra de nombres. Sólo admitir recursos identificados. Detectar y parar ante `{env.*}`, `{file.*}` que pueda leer archivos, loaders TLS, archivos de claves/certificados, trust pools de archivos, proveedores o módulos desconocidos, sockets, sinks de red y cualquier recurso no clasificable. No montar datos para hacer pasar estos casos.

Permitir remapeo únicamente de `logging.logs.*.writer.filename` para writers `file` y de storage filesystem de semántica conocida. Preservar opciones, aliases y compartición de destinos; cambiar sólo destinos. Mantener stderr/stdout/discard como tales, capturados privadamente. Para storage explícito, mover sólo su raíz; no convertir otro backend en filesystem. Para storage por defecto, hacer explícito un filesystem vacío en scratch como sustitución de prueba y registrar la ausencia original. Revisar la estructura exacta contra la versión antes de permitir esta ampliación.

Guardar el original exclusivamente en RAM del servidor. Restaurar los cambios sobre una copia y exigir igualdad profunda del JSON completo, incluida la ausencia original de storage. Este reverse es una prueba local de no alteración de política, no un mecanismo de rollback de producción. El candidato original nunca se sustituye por el JSON de prueba.

**Aceptación:** inventario exhaustivo, mapa de sustituciones y restauración exacta. Pendiente: módulos reales y schema de storage; el remapeador anterior sólo acredita su alcance previo. Que los secretos ya estén contenidos en el JSON no autoriza imprimirlos; su tratamiento sigue siendo privado remoto.

### 6. Validar el JSON en contenedor aislado y retirar residuos propios

Usar el ID/digest exacto ya disponible, sin pull ni build, con red `none`, rootfs read-only, sin socket Docker ni mounts activos, y límites de CPU/memoria/pids/tiempo. Entrypoint directo al binario para `validate` del JSON; no adaptar otra vez, no transferir envblock ni lanzar el antiguo `launcher`. El único input de configuración es el JSON privado RO; logs/storage/config temporal usan scratch nuevo RW estrictamente necesario. Cualquier directorio implícito de datos/configuración debe resolverse a scratch vacío, nunca a `/data` o `/config` activos. No persistir stdout/stderr del contenedor.

Revalidar ausencia de drift de las fuentes/candidato y registrar resultado terminal. Al terminar o fallar, retirar sólo el contenedor y scratch de esta operación, confirmar ausencia y dar por inconcluso el cierre si la limpieza falla. Antes/después registrar espacio libre del servidor y, si A escribió en el activo, verificar también la retirada de ese scratch.

**Aceptación:** `VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION`, exit 0 y limpieza acreditada. No demuestra permisos de destinos reales, acceso a certificados existentes, ACME/DNS/upstreams, igualdad con una configuración activa modificada por API, ni CSP/panel servidos. El rollout conserva los smokes/validaciones de consumidor pendientes; este resultado sólo cubre provisioning aislado de una copia con recursos sustituidos.

## Verificación e incertidumbre restante

Separar desarrollo del filtro y verificación independiente. Antes de cualquier VPS, usar fixtures sintéticos para probar las paradas que protegen la frontera: expansión que introduce import fuera de alcance, referencia dentro de comentario, import absoluto/symlink, sintaxis no soportada, wrapper/envfile, placeholder de archivo/entorno, módulo desconocido y restauración de remapeos. Demostrar que ninguno ejecuta el adaptador o abre un recurso prohibido antes de STOP. Reutilizar esos checks del mismo candidato; no crear una suite general ni una build dedicada para este plan.

Orden de restante: propuesta/guards → filtro acotado y prueba negativa → revisión y aprobación runtime → clasificación remota → adaptación/remapeo/validación si aplica → recibo → verificaciones del rollout y consumidores. La presencia efectiva de expansiones o recursos excluidos determina el camino crítico; sin esa clasificación no hay base para dar un plazo de cierre.

La decisión pendiente no es si se autoriza desplegar Vega. Si la clasificación encuentra variables no acotables, el alcance actual queda bloqueado antes de A y la raíz debe presentar el acceso adicional concreto que necesita al mecanismo de aprobación. El rechazo original sigue vigente para la lectura completa del entorno; este documento no lo revoca ni garantiza aprobación de una alternativa.

Lecturas realizadas para este plan: únicamente los cuatro artefactos locales indicados en el encargo y fuentes primarias enlazadas. El grafo se consultó primero para `remote_validate.py` y no devolvió resultados; se leyó entonces el archivo conocido bajo `.verification`. No se ejecutó SSH, Docker, adaptación, validación, build ni limpieza del VPS. No se generaron residuos de build; sólo se añadió este documento.

## Addendum: `docker exec` con `chroot` previo a `adapt`

**Veredicto actual: STOP para cerrar la validación efectiva.** Esta variante sí introduce una frontera de resolución de archivos antes del adaptador, pero `chroot` por sí solo no es una sandbox suficiente, y aun reforzado no demuestra que los imports vean los mismos archivos que en producción. No se propone instrumentación ni build nueva para salvar estos pendientes.

`chroot` cambia la raíz del proceso invocante y sus descendientes; no cambia la del Caddy principal ni exige modificar su mount namespace. Sin embargo, mantiene el directorio actual y los descriptores abiertos, y un proceso privilegiado puede escapar. Por tanto un simple `docker exec … chroot … caddy adapt` no cumple el criterio. [Contrato Linux](https://man7.org/linux/man-pages/man2/chroot.2.html).

Para considerar **APTO el confinamiento de lecturas** haría falta acreditar, antes del adaptador, todo lo siguiente:

- Launcher exacto y revisado, sin interpretación de shell ni dependencias desconocidas. Que Caddy sea estático no demuestra que `chroot`/BusyBox lo sea: un launcher dinámico se inicia fuera del jail y su cargador puede consultar variables y bibliotecas. La existencia, procedencia y comportamiento de ese launcher no están acreditados aquí.
- Capacidad efectiva para entrar en el jail y, después, directorio actual dentro de él, cierre de todos los descriptores salvo pipes privados conocidos de stdin/stdout/stderr, abandono irreversible de UID/GID privilegiados y grupos suplementarios, capabilities efectivas/permitidas/heredables/ambientales vacías y prevención de adquirir nuevos privilegios. Acreditar las capacidades necesarias para realizar esas transiciones; `SYS_CHROOT` por sí sola no prueba todo el flujo. No usar `--privileged` ni modificar el contenedor activo para obtenerlas. [Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html), [descriptores a través de exec](https://man7.org/linux/man-pages/man2/execve.2.html).
- Jail nuevo y privado, sin mounts activos, enlaces, sockets, dispositivos, `/proc`, `/dev`, ficheros con setuid/filecaps ni directorios que puedan moverse fuera mientras se usa. Binario estático exacto sin ejecutables auxiliares; closure copiada con bytes y paths acreditados. Caddy sin permiso de modificar su propio árbol de entrada. Los pipes deben llegar sólo al capturador remoto privado; limitar core dumps y conservar JSON/errores exclusivamente en RAM/scratch del servidor.
- Sólo adaptación con módulos cuya fase de parseo esté revisada. Un jail no aísla red ni PID namespace: permanece necesario descartar módulos/launchers que puedan usar esas superficies. No montar recursos para hacer pasar un fallo del jail.
- Aprobación runtime nueva que incluya metadata pública filtrada de arranque/capacidades, staging y retirada. Docker exec sigue usando entorno de creación: conservar la prueba de arranque directo sin wrappers/envfiles; `chroot` no resuelve esa diferencia.

Para considerar **APTO el resultado como candidato efectivo**, además, los paths lógicos absolutos deben existir dentro del jail exactamente donde los vería Caddy, y los relativos conservar directorio de origen y trabajo. Esto permite resolver los imports conocidos sin reescribirlos, pero no demuestra completitud ante expansiones desconocidas.

El contraejemplo es concreto: una expansión produce `import /etc/caddy/conf.d/*.caddy`. El jail contiene un archivo copiado; el directorio real contiene ese archivo y otro omitido. La adaptación puede salir 0 sin warning, con configuración incompleta. El glob totalmente vacío sí produce warning en v2.11.4, pero rechazar warnings no cubre este caso parcial. Tampoco lo cubre registrar únicamente los archivos abiertos. [Parser: resolución y globs](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/parse.go#L387-L440).

**Criterio operativo:** si falta cualquiera de las pruebas de confinamiento, STOP antes de ejecutar. Si se acreditaran todas pero no la fidelidad de los patrones/listados efectivos, el resultado sólo serviría como experimento aislado; no autoriza declarar cerrado Caddy. El alcance actual no incluye un mecanismo probado que resuelva esa última condición, así que se conserva el bloqueo y no se ejecuta la alternativa.

El consentimiento sensible mínimo que la raíz puede concretar al cerrar los demás frentes es: «Autorizar la lectura, sólo en RAM del VPS, de los valores de las variables referenciadas por los Caddyfiles comprendidos en el alcance aprobado, para resolver y validar sus imports; sin consultar el bloque completo `Config.Env` ni `/proc/*/environ`, sin sacar nombres/valores/JSON del servidor y deteniéndose ante rutas o referencias nuevas fuera del alcance». Debe acompañarse del lector exacto revisado y una aprobación runtime nueva; no es una autorización ya concedida ni garantiza que baste si el arranque tiene procedencia desconocida. No reintentar el lector anterior.

La raíz ha indicado mantener el bloqueo de Caddy y continuar los despliegues/estados independientes ya autorizados. Este addendum no ha ejecutado SSH, leído configuración privada ni instalado/buildado herramientas.
