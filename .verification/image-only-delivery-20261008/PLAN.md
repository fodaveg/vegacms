# Entrega de las tres imágenes del candidato `a51b8521` — preparación

**Estado actual: archivo entregado, tres imágenes cargadas y correspondencia OCI comprobada;
cutover aún no ejecutado.**
El preflight confirmó los tres selectores, montajes, redes y argv; el diagnóstico confirmó
PocketBase 0.39.9/0.39.9/0.39.7 y tamaños de volumen 20700/23840/913192 KiB, respectivamente.
Las tres imágenes finales y el archivo de transporte están sellados. `docker load` devolvió
error en su primer wrapper, pero la sonda residual confirmó tres tags cargados. Docker 29.7.2
proyecta como `.Id` remoto el digest OCI del manifest en los tres, distinto del digest local
del config. `loaded-image-correspondence-20261008.json` enlaza ambos con el archivo sellado y
coteja descriptor, capas, plataforma y revisión. El programa de cutover usa los IDs OCI
efectivos del servidor; `manifest.json` conserva también los IDs de config local. Este autor
no ha hecho SSH ni mutaciones remotas; la release owner
ejecuta cada fase después de cotejar hash, presupuesto y estado vivo. Los IDs están en
`manifest.json`.

## Frontera de esta vía

Se cambia únicamente la imagen de `vega-pb`, `lumbre-admin-pb` y `fodaveg`, una instancia cada vez.
Se reutiliza el Compose **activo** de cada servicio. Los Compose versionados describen el contrato,
pero copiarlos cambiaría la red stock de `edge` a `vega-edge`, y los scripts completos de Lumbre
y Fodaveg sincronizan fuentes o cambian Caddy. No se tocan Caddy, sus redes, CORS, clientes,
volúmenes ni secretos. El único posible cambio adicional es fijar en el Compose stock el `command`
anterior sin `--origins`, **solo si** el argv efectivo fresco reproduce exactamente los cuatro
argumentos históricos y ningún flag desconocido; ese diff se revisa antes de aplicar. La nueva
imagen stock trae `--origins=https://admin.vegacms.com` por defecto y seleccionarla sin conservar
el comando anterior alteraría CORS. Los orígenes reales de los clientes deben comprobarse después.

La [revisión operativa](../release-adoption-plan-20261008/image-only-delivery-review.md) exige
explicar el desvío de `infra/production/validate.sh`: el script presupone checkout/build remoto y
`vega-edge`; esta vía carga tres imágenes locales certificadas y conserva la red efectiva. Su
equivalente verificable será SHA/tag/árbol, gate/budget/review/CI, identidad del archivo e IDs
cargados, `docker compose config --quiet` del Compose efectivo, argv/red/montajes intactos,
hash de Caddy sin cambio en una etapa **separada** y acotada, y smoke global antes del
específico. La release owner ejecutó la lectura hash-only de cinco archivos edge
(`edge-hashes-before-20261008.json`), todos sin cambio y sin proyectar sus cuerpos. Una
interpretación literal del contrato
exige resolver esa excepción antes del cutover; no se declara el gate stock superado por ejecutar
un script con supuestos incompatibles.

## A. Sellar transporte local y cargar en destino (terminado con diagnóstico)

1. El recibo **final** Fodaveg ya fija commit/árbol/tag/ID, 155/155 rutas del ZIP atestado y
   binario/hook/entrypoint exactos, con pruebas nativas y de entrada 18/18 y CSP 13/13. El ZIP
   atestado no es necesariamente byteidéntico al build stock local.
2. El archivo local `../release-image-distribution-a51b-20261008/images.tar` contiene los tres
   tags finales, SHA-256 `34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a`
   y 606022656 bytes. Verificar ese hash en destino; tras `docker load`, comprobar con
   `docker image inspect` que cada tag resuelve al ID exacto antes de tocar selectores.
   El archivo baseline `.verification/local-image-delivery-20261008/images.tar` contiene imágenes
   antiguas y no sirve para esta distribución.
3. `run_transport.py` invoca el script remoto pineado `remote_transport.py` por fases
   `receive` y `load`: verifica SHA/tamaño local y remoto, presupuestos libres en `/srv` y en el
   Docker Root Dir real, y los tres tags→IDs al cargar. No sobrescribe un archivo existente;
   cada fase guarda solo un JSON filtrado. La release owner ejecutó `receive` con recibo verde.
   La primera ejecución de `load` devolvió STOP sin recibo; **no se repitió**. Las sondas de solo
   lectura comprobaron SHA/tamaño remoto, versión Docker 29.7.2, tres tags y su identidad
   frente a la cadena OCI del archivo (`local-archive-image-chain.json`), con comparación
   independiente 3/3. No se retaggeó ni se debilitó el guard por el fallo inicial.

## B. Preflight remoto selectivo (ejecutado)

`remote_preflight.py` se envió por stdin a `python3 -B -` en el VPS tras revisión
de su hash exacto. Solo consulta los tres contenedores, hashes de sus tres Compose efectivos y los
campos `VEGA_IMAGE_TAG`/`VEGA_GIT_SHA`, `LUMBRE_ADMIN_IMAGE` y `FODAVEG_IMAGE` de sus respectivos
dotenv. El selector se devuelve solo si coincide con la forma pública esperada. `docker inspect`
usa plantilla de campos: ID/ref, ENTRY/CMD, etiquetas Compose, montajes (nombre, destino, modo y
fingerprint de origen), redes/alias. Un `docker exec <contenedor> /bin/sh -c` recorre solo los
`/proc/*/comm` para seleccionar `pocketbase|lumbre-admin|fodaveg-pb` y lee únicamente su
`cmdline`; la base64 temporal se decodifica y filtra en RAM, sin guardarla ni consultar
`/proc/environ`. Esta ruta sustituye `docker top -eo comm,args`, que falló con exit 1 en los tres
contenedores en la sonda histórica. El CMD nulo de la imagen Fodaveg es explícitamente válido
solo para ese servicio: su ENTRYPOINT ejecuta el script que arranca PB. No solicita `Config.Env`,
ni serializa cuerpos de Compose/dotenv, Caddy,
logs u otros contenedores. El escaneo de dotenv lee transitoriamente sus líneas en RAM para reconocer
**solo** las claves de imagen; descarta inmediatamente las demás. `docker compose ... config
--quiet` puede interpolar secretos en RAM y captura/descarta toda salida de error sin emitirlos:
solo informa éxito/fracaso. Si falta algún campo, hay bandera, red o montaje desconocido, selector
duplicado, Compose cambiante o PB ambiguo, devuelve `STOP`. Una salida `READY_FOR_REVIEW` exige
comparación humana/automatizada posterior; nunca dispara escritura.

`run_preflight.py` transporta ese archivo solo con `--execute --script-sha256 <SHA256 revisado>
--out <fichero JSON nuevo de este directorio>`. Comprueba el hash antes de abrir SSH, exige host
conocido, descarta stderr remoto y valida la proyección antes de guardar un JSON modo `0600`.
La release owner ejecutó el wrapper: `remote-projection-20261008.json` registró los tres
servicios `READY_FOR_REVIEW` con selectores y runtime exactos. La lectura posterior de
`remote_stage_metadata.py` acertó en stock pero no obtuvo versión de los dos binarios Go propios;
`remote_runtime_diagnostic.py` obtuvo buildinfo real y tamaños de los tres volúmenes en
`remote-runtime-diagnostic-20261008.json`. La lectura de Caddy en esta fase sigue ausente.

La proyección histórica dejó sin resolver el montaje de migraciones Lumbre y dos argumentos PB de
Fodaveg. El programa exige el volumen de datos de cada servicio por nombre, `pb_migrations` como
bind de solo lectura desde `/srv/lumbre-admin/pb_migrations`, el puente de publicación Lumbre como
bind escribible y la red `edge` con los alias esperados. Para stock exige el CMD y argv previos
sin `--origins`, condición del override mínimo. Sus SHA de Compose son guards para detectar
cambios entre lectura y preparación; se vuelven a calcular inmediatamente antes de cualquier
escritura. No se reutiliza la concesión ya consumida para ocho configuraciones ni se lee el
entorno completo de Caddy, rechazado por auto-review. El preflight tampoco pretende acreditar
clientes CORS ni el inventario de logs.

## C. Datos y reversión (programa preparado; ejecución pendiente)

Para cada servicio, conservar en el servidor con modo restringido el Compose activo **íntegro** y
dotenv **íntegro**, su SHA-256 y el selector/ID anterior. La copia queda allí; no se vuelca en
recibos ni se trae al equipo. Antes de detener nada, verificar que la utilidad de backup ya está
disponible y que la imagen vieja continúa cargada. Detener **solo** el servicio afectado, hacer
snapshot consistente del volumen PB real con montaje de solo lectura y sin red, comprobar el
archivo con `tar -tzf`, SHA-256 y validación de rutas/links antes de extraer. Restaurar cada
snapshot en un volumen TEST único y comparar todos los archivos regulares byte a byte. Para
Fodaveg, arrancar el `serve` real de la nueva imagen en ese clon, sin red externa, para probar
la migración. La imagen vieja y el snapshot se conservan; no hay restauración destructiva
automática del volumen activo. Para Fodaveg, subir PB
0.39.7→0.39.9 puede migrar el esquema: volver solo a la imagen vieja sobre datos nuevos no es
un rollback acreditado. El plan de reversión debe discriminar si hubo escrituras/migración; la
restauración de datos desde snapshot requiere decidir sobre cambios posteriores y su prueba
aislada, y **no** queda automatizada aquí. Nunca `down --volumes`.

## D. Cutover secuencial (programa preparado; ejecución pendiente)

1. Releer hashes de los tres Compose; si cualquiera difiere del preflight, parar. Revalidar tag→ID
   del servicio y todos sus montajes/redes/alias. Conservar backup íntegro restringido **antes** de
   editar. En RAM, reemplazar solo la clave de imagen correspondiente (stock: también
   `VEGA_GIT_SHA`) una sola vez, exigiendo una ocurrencia de cada clave y diff limitado; escribir
   un temporal `0600` en el mismo directorio, `fsync`, renombrar atómicamente. No imprimir `.env`
   ni errores privados. El Compose stock recibe únicamente el `command` anterior verificado,
   preservando todos sus otros bytes; exige diff acotado y revisión de la release owner.
2. Ejecutar `docker compose --env-file ... --file ... config --quiet`, capturando stderr en RAM
   sin volcarlo. Si falla, restaurar los **archivos íntegros** previos desde el backup local. Luego
   `docker compose ... up --detach --wait --no-build <servicio>`; jamás `build`, `down` ni red Caddy.
3. Verificar el contenedor nuevo por ID, argv, redes, alias, montajes, volumen de datos, puertos,
   salud y la igualdad esperada con el preflight salvo imagen/selector y el `command` stock
   revisado. Un fallo anterior al arranque nuevo restaura Compose/dotenv y espera de nuevo el
   runtime viejo saludable. Si el nuevo proceso pudo arrancar, se detiene y se conserva el
   snapshot y la configuración para decisión de recuperación; **no** se arranca binario viejo
   sobre datos posiblemente migrados. Consultar `RECOVERY.md`.
4. Hacer smoke global de edge, luego el específico del host y acciones representativas: raíz y
   deep link HTML real, Content-Type, asset inexistente 404, salud, login/discovery, medios,
   preview/build, GET/OPTIONS CORS permitido y denegado. Comparar los **153** ficheros públicos
   de stock y Lumbre, y los **155** de Fodaveg, con el manifiesto de **su imagen** (Fodaveg:
   ZIP oficial). Tomar un baseline público **nuevo inmediatamente antes de cada servicio**;
   el baseline anterior ya no representa a los otros dos hosts después del primer corte.
   El script exige que su recibo baseline tenga el mismo `--service` que el `after`.
   Comprobar MIME HTML/JS/CSS/JSON además de bytes; conservar el comportamiento previo del
   panel y del asset ausente aunque aún no cumplan el contrato completo. Un 200 de fallback
   a `index.html` no acredita el asset, ni un 404 de Node acredita Astro funcional. Registrar
   resultado y rollback por host. `served_smoke.py` separa la equivalencia de la política actual
   del smoke completo: mide raíz/deep link/salud/panel/asset ausente, GET/OPTIONS CORS, headers,
   los 153/155 SHA servidos del manifiesto propio y estabilidad de los otros dos hosts. No
   certifica login ni acciones autenticadas; `infra/production/smoke.sh` exige reglas de panel
   404 y CORS denegado que aún no están desplegadas, por lo que no se marca ese contrato verde.
   Repetir el hash-only de los cinco ficheros edge tras cada servicio y pasar al siguiente solo
   tras revisar el resultado del anterior.

Las tres imágenes seleccionadas localmente y la release pública no demuestran producción. Esta
preparación no afirma que la política Caddy/logs esté validada: ese frente sigue independiente y
su lectura de entorno completo permanece rechazada.
