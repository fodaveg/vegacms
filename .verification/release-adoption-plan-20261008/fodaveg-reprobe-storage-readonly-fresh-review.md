# Fodaveg: revisión independiente del lector de almacenamiento

Veredicto: **APTO estático**, limitado al lector RO. Sin SSH, Docker, builds ni ejecución de tests por este revisor.

## Sello revisado

- `reprobe-storage-read.py`: `31e2dd7c4ac01b231a858668106517cdbe7bdf7918c876b5f921f5161af01fba`.
- `reprobe-storage-run.py`: `42ba508f03b35d1e740d74ad24a7003279abd39213fd5de0ebaf62c0175900ba`.
- `reprobe-storage-selftest.py`: `a3bfe88752fd0a8278ef9bddabad226945a8485b4b17ac4af7bf72b5a3a3db6d`.
- `reprobe-storage-manifest.json`: `f36cc7a47f52e53f0da8429a405c846274887e8ed190c0d189d04185d13deb04`.
- `REPROBE_STORAGE.md`: `e2debf531dd2c9a7a91df11542f0ca87320a06a5f5d49ec2f0252e6771155210`.
- Constructor puro `reprobe-local-volume.py`: `209d772063412eb93056065c03068299325dcd7395640e20ef9366453304f952`.

Inventario y lectura completa de los seis archivos; revisión de esquema, comandos, guards y seis casos dirigidos aportados por el owner. No se repitieron sus pruebas.

## Alcance y resultado

Sin must-fix identificado. El lector consulta exclusivamente el escalar DockerRootDir en RAM dos veces; valida su forma absoluta y usa metadata de directorios/statvfs. No proyecta rutas, configuración, variables, logs ni inventario de volúmenes. Revalida estado propio, identidad de directorios y pins de OLD antes de emitir el esquema cerrado. El wrapper sella los mismos buffers enviados y rechaza tipos, números o campos ajenos al esquema; los fallos se reducen a enums finitos.

El backup fijo es `fodaveg-20261008T231304Z-3656162`, PREPARED y OLD acreditado. El presupuesto utiliza 875290525 bytes expandidos de la observación previa; exige 1510136 KiB en el allocator y 1511160 KiB en /srv si comparten filesystem, o 525312 KiB en /srv si son distintos. El resultado FALSE anterior para el padre literal conserva su validez histórica. Este lector atribuye un cálculo nuevo al padre actual del daemon, sin reinterpretar aquel resultado.

## Límites

APTO no constituye autorización runtime ni prueba de un TEST creado. El constructor sólo produce argv con driver local explícito y sin options; antes de extraer, el protocolo TEST deberá acreditar sus Driver/Options/Mountpoint reales, filesystem, identidad propia, tuple del archive y espacio fresco. El presupuesto es una observación instantánea, no una reserva. Las referencias Moby master de la documentación no prueban el comportamiento de la versión instalada. No se leyó el contenido del volumen productivo ni se ejecutó acción de control.
