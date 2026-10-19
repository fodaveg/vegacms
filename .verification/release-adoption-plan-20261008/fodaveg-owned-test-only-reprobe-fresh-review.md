# Fodaveg: reprobe TEST-only del backup propio

Veredicto: **APTO estático del protocolo**, sin must-fix identificado en el tuple final. **Ejecución bloqueada por presupuesto actual FALSE y grant inexistente.** No se ejecutó SSH, Docker, build, HTTP ni tests por el revisor. No certifica TEST real, CORS nuevo ni adopción de producción.

## Sello

Operación `b32e0d62-7fd7-4e86-bf21-7b3c17996802`.

- Core544L: `327dc1e88e6721eb68c19a6147176e0deb87ed361e65b340108818cb0840753f`.
- Wrapper183L: `fc1777a32ebcac6a447a444e8790a4a756c5b21281bfb5bde558d6cd03b87ebc`.
- Coretests265L: `16de0bd6b22bb0651225653cb2ed858ce92856294675ba1d3ddcc77db230b332`.
- Wrappertests118L: `4ee39c92cbb4990e85c3c189aa9d367e8e2bca0a5bcff61b61637d02e6680c12`.
- Constructor20L: `209d772063412eb93056065c03068299325dcd7395640e20ef9366453304f952`.
- REPROBE_TEST: `9873a2180ad869ac3992450835a8a1f0979a79ebd614cd873c0001ae1cbb815b`.
- Manifest: `a391d4d4991e1d47766c91e5c5ea7be3d447d210110e5fb725e3151b322325d5`.

Inventario stat/name-status; lectura completa de las fuentes y pruebas provisionales, delta final de binding del record, documentación/manifiesto final y comprobación6/6 hashes. Se reutilizaron helper5d413, controlled43b68 y capture d48e4 ya revisados, junto a archive/storage/memory de igual alcance. Rutas conocidas de verificación fuera del grafo. Owner acredita9 core+5 wrapper tests/AST/whitespace; se leyeron, sin repetir gates.

## Archivo, identidad y presupuesto

Única entrada privada: `fodaveg-20261008T231304Z-3656162/data.tgz`,110406535B/SHA3a78532b, fullidentity acreditada,71files/875290525B expandidos. El presupuesto padre completo precede a lectura de contenido, Journal y asignaciones TEST. Reserva512MiB y128MiB de margen PB no se rebajan. La prueba negativa de budgetFALSE exige cero Archive/Journal/asignación. El presupuesto se repite en mountpoint real antes de extraer y con headroomPB antes de native; no se presume capacidad por tamaño ni por unlink de otro archivo.

Archive usa parentFD literal sin symlinks y regular0600/fullidentity/hash/tarheaders seguros. Conserva el mismo FD como stdin y para comparar todos los archivos del clone byte a byte. Los gates FD/leaf/parent se repiten antesSTART/después; un reemplazo ajeno se conserva. Comparación del clone por descriptores NOFOLLOW y estado/inode estable, sin exportar nombres o contenido. OLD fixedID/oldimage/healthy/running y state propio PREPARED/fullidentity se verifican antes/después.

## Recursos y recuperación

Un volumen local sin options, con nonce32hex/labels propios, intención persistida antesCREATE; se acredita Name/Driver/Options/CreatedAt/Mountpoint RAM e inode antes del restore. RootDir/Mountpoint no se exportan y su texto no queda en el journal: se conserva hash para correspondencia propia. Máximo dos contenedores: extractor y único nativePB22cf. Ambos networknone, sin host bindings, sin pull/build ni mount productivo. FixedID devuelto se persiste antes de START; el resultadoCREATE desconocido queda registrado y no permite adoptar o borrar por nombre/mtime.

Native arranca PB directamente sobre el clone ya byteverificado y sólo consulta su /api/health desde el propio TEST. No ejecuta ENTRYPOINT completo Node/tini como un cutover real: este alcance acota la frontera PB/backup y reutiliza la prueba nativa del candidato para el resto, sin declarar que el mock la sustituye.

Primaryfailure fase/clase/exitnumérico se persiste antes de cualquier cleanup. Se comprueban fixedID/image/name/labels/mounts/topología antesSTOP/RM de PB y extractor; se confirma ausencia y Removed antes de retirar el volumen propio. UnknownCREATE o deriva de identidad conserva recursos para RO del journal propio. Fallo de limpieza se mantiene separado del principal; test17 frente1 lo comprueba. No se limpia ningún TEST anterior no registrado ni se restaura dato productivo.

## Wrapper y límites

El grant NUEVO debe autorizar archive privado RAM y escrituras TEST exactas, con manifest/scope/tipos/operationId y `ownedRecordId` válido. El recordId se toma del mismo buffer aprobado, se persiste en marker local antesSSH y se transmite al core, que no inventa PID remoto. Se compara el ID de salida con el esperado; UNKNOWN conserva el recordId local y consume marker, sin retry. Hash/parse/transporte usan los mismos buffers. Salida4096B/esquema finito, errores y bodies privados descartados, JSON0600 exclusivo.

Los budgets actuales de disco y memoria continúan FALSE. El rechazo automático del retiro836 se produjo antes del proceso; el consentimiento exacto del usuario sigue pendiente y no lo concede este protocolo. Un archivo local APPROVED no sustituye autorización real. Cualquier siguiente ejecución exige presupuesto padre frescoTRUE, revisión del mismo candidato y grant runtime nuevo; no se baja reserva ni se usa memoria/tmpfs como fallback implícito. Espacio es observación instantánea, no reserva ni locking global.

Sin cobertura real todavía de clone/native/cleanup de este paquete sobre el backup productivo. No se consulta Config.Env, Health.Test/Output ni logs privados; no se toca Compose/dotenv, no stop/start productivo, no externalHTTP/SMTP/GUI. El éxito TEST sería evidencia de esa frontera, no cierre CORS ni sustituto de cutover y smoke155 posteriores.
