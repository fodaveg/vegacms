# Fodaveg: sonda de memoria RO

Veredicto: **APTO estático**, sin must-fix identificado. No autoriza tmpfs, asignación RAM, TEST ni reintento de cutover. Sin SSH, Docker ni ejecución de tests por el revisor.

Inventario stat/name-status y lectura completa de cinco archivos nuevos:

- Reader `d5fde6c51873ec245f586e046fa0e740af95b64f69e5ab2c3f6483fae8000088`.
- Wrapper `c6c0dd0bf99e4c933aa2a59fcf68bcb948d7e11621dbfa77fbc44ec88999e0c9`.
- Selftest `e2333f4cae11f0e4683da5dcddedb5892e9995eeac14646ae437bf60d12b4b2c`.
- REPROBE_MEMORY `86c867f1c58c06b5d72bef5e1b81c9c037109c471684baeb99121996fac8fe06`.
- Manifest `babdb4c4729fb3c533e6a195b986052f770123cc94623ae58be5f002237f5e3d`.

Imports fijados: helper image-only `5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128`, controlled cutover `43b68aba0c937deef45ff3a9e2e33f6d3933fb06949605fdc3b0d9448d31c7b4`. Se reutilizó su revisión anterior; el import no ejecuta main ni control Docker. Rutas conocidas de verificación fuera del índice del grafo.

El reader abre /proc/meminfo NOFOLLOW/NONBLOCK, exige archivo regular y limita lectura a 8192 bytes y líneas de 512. Selecciona exclusivamente MemTotal/MemAvailable en kB; los demás renglones no se proyectan. Rechaza formas desconocidas, duplicados encontrados, ausencia de counters, available mayor que total y deriva de total entre ambas lecturas. Utiliza el menor available. OLD fixedID/image/running/Health.Status y state PREPARED del backup propio3656162 se verifican antes/después; la identidad completa y bytes del state deben permanecer iguales. No consulta Env, Health.Test/Output, logs, configuración amplia ni datos del volumen.

El wrapper envía los mismos buffers sellados, descarta stderr/salida desconocida y exige campos/tipos/números exactos antes de persistir JSON exclusivo0600. Los seis casos dirigidos del owner cubren capacidad, falta de memoria, deriva total, estado ajeno con cero Docker, formato/privacy y sello ajeno con cero SSH; se leyeron sin repetirlos.

El umbral2621440KiB suma cap TEST propuesto1536MiB y reserva host1024MiB. Un resultado true sólo permite diseñar la siguiente operación: no reserva memoria ni acredita cgroup/tmpfs. Ambos flags `testCgroupAndTmpfsControlsProved` y `remoteAllocationPerformed` deben permanecer false. El budget de disco false continúa bloqueando extracción en disco. La futura receta deberá acreditar controles del contenedor propio, capacidad real del tmpfs, archive/FD propio y memoria fresca antes de asignar/restaurar; requerirá revisión y aprobación runtime nuevas. Esta revisión no valida esa implementación todavía inexistente.
