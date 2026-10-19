# Entrega Fodaveg CORS, solo release owner

Preparado offline. La revisión y la ejecución remota corresponden a la sesión raíz.
`manifest-v2.json` congela el candidato, la cadena del archivo y las fuentes preparadas;
`archive-chain-v2.json` añade la comprobación negativa de diff IDs respecto al primer sello.
El archivo original de la raíz se conserva en `../fodaveg-image/`; no se mueve ni se exporta otra vez.

Tuple: archivo de 488653312 bytes, SHA256
`abac0eb3feb7432880c7cc2a4a3d34444507347ff82c72967a4626a38a1bad8e`;
config ID `sha256:1b6436fee8c23615d7f7826cb4f87cb1d6e7e97d2d56150ff87a90571b951c40`;
OCI ID efectivo esperado `sha256:22cf0983980e3bf9562a0a518f258e6e69cdd58cb3d23a19516f1da60a6d403e`.
El LOAD exige el último, su descriptor y las 16 capas exactas. Nunca supone que el ID remoto sea el config ID.

Desde la raíz del repo, tras revisar las fuentes y sus hashes:

```sh
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/run_transport.py --execute --stage receive --script-sha256 ad47c6a2c2ec238ef545ecbcd6f06e0bc53df838ab100dcbbcbf3f5b34a10cc5 --out .verification/cors-network-adoption-20261008/fodaveg-delivery/transport-receive.json
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/run_transport.py --execute --stage load --script-sha256 ad47c6a2c2ec238ef545ecbcd6f06e0bc53df838ab100dcbbcbf3f5b34a10cc5 --out .verification/cors-network-adoption-20261008/fodaveg-delivery/transport-load.json
```

El archivo remoto propio es `/srv/vega-image-rollout/fodaveg-cors-cc8f3b1-20261008.tar`, privado y creado sin sobrescritura.
LOAD no opera sobre contenedores, Compose, Caddy ni datos. Si hay corte después de LOAD,
usar el mismo wrapper `--stage identity` con una salida nueva para acreditar el residual;
no repetir LOAD a ciegas. Un tag preexistente hace STOP antes de cargar.

Después de los cambios CORS de stock y Lumbre, tomar un baseline público nuevo:

```sh
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/served_smoke.py --stage baseline --service fodaveg --script-sha256 6d6028c7a0e5437121d126ec22b616a1d2ccbeec2bc22c3c366bbddf8a9924af --out .verification/cors-network-adoption-20261008/fodaveg-delivery/public-baseline.json
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/run_cutover.py --execute --mode check --service fodaveg --script-sha256 de511d31f3c92c18ada597ac6de09f01112b125374eb6c1643ca0cdcce98168e --out .verification/cors-network-adoption-20261008/fodaveg-delivery/cutover-check.json
```

Revisar el check: antiguo contenedor `6bddffa88de1c2738bf9aee711425f512deac30365f6183bb3d2ad008a2ff452`,
imagen adoptada OCI `0e0ef563…`, Compose `a18777c5…`, dotenv `6c673031…`, topología,
PB argv antiguo y PB1/Node1/tini1, snapshot y clon TEST caben en ambos filesystems.
El check no exige estados antiguos de los otros dos servicios. El baseline recoge su estado público actual.

```sh
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/run_cutover.py --execute --mode apply --service fodaveg --script-sha256 de511d31f3c92c18ada597ac6de09f01112b125374eb6c1643ca0cdcce98168e --out .verification/cors-network-adoption-20261008/fodaveg-delivery/cutover-apply.json
python3 -B .verification/cors-network-adoption-20261008/fodaveg-delivery/served_smoke.py --stage after --service fodaveg --baseline .verification/cors-network-adoption-20261008/fodaveg-delivery/public-baseline.json --script-sha256 6d6028c7a0e5437121d126ec22b616a1d2ccbeec2bc22c3c366bbddf8a9924af --out .verification/cors-network-adoption-20261008/fodaveg-delivery/public-after.json
```

APPLY detiene el ID antiguo fijado, toma un snapshot quiesced nuevo, valida/restaura en
un volumen TEST propio y prueba el mismo binario PB sobre ese clon. Solo cambia la línea
`image` de Compose a OCI `22cf0983…`; SHA objetivo `eb62c0447d4cce8a8af1ceedeeabb11602770d48d6bf952618ef19e7b8a1008b`.
El entorno queda intacto. Persiste `INSTALLED` con identidad completa del archivo y `CREATED`
con ID del contenedor antes de arrancar; repite guards inmediatamente antes de cada recreate/start.
Usa no-build/pull-never y exige PB1/Node1/tini1 y el argv PB con su origen propio tras arrancar.

El forward exige 155/155 bytes y MIME, root/deep/health, CORS propio y denegación foreign/null,
sin Origin, discovery JSON real, métodos/cabeceras preflight, peers intactos y fodaveg.net 200 HTML
con política intacta. Ejecutar además el hash-only canónico del edge y el smoke global autorizado de la raíz.
La prueba local nativa 18/18 y CORS 123 aserciones/64 respuestas se reutiliza por imagen/config exactos;
esto no certifica UI autenticada ni SMTP.

En STOP no reintentar APPLY. Conservar el backup ID emitido y diagnosticar ese estado propio.
ROLLBACK permitido solo con `run_cutover.py --mode rollback --backup-id <ID emitido>`,
salida nueva y el mismo SHA revisado. Verifica fases, archivos, ID creado y selección antes de parar
o recrear; restaura únicamente el Compose propio y la imagen adoptada OCI `0e0ef563…`.
No restaura datos. Jamás seleccionar la imagen anterior a la adopción `a51b`, ni restaurar los
snapshots originales/pre-adopción. Esos snapshots y el snapshot posterior previo se conservan.
Después de rollback, ejecutar el forward `--stage rollback` contra el mismo baseline y el edge global.

Ningún wrapper exporta Env, cuerpo de Config, Compose/dotenv privados, logs o credenciales.
Un STOP o una salida desconocida se conserva como límite; no se convierte en recibo verde.

La corrección causal para Docker detenido acepta `NetworkSettings.Ports={}` únicamente
con `is_running=false`, ID fijado y selección exacta, `.Config.ExposedPorts` igual a
8090+4321 y `.HostConfig.PortBindings` vacío. Corriendo sigue exigiendo la representación
completa. No se relajan montajes, imagen, red, alias ni guard de archivos privados.
El LOAD entrega el mismo FD aprobado a Docker por stdin y verifica selección antes/después;
si la ruta deriva durante presupuesto o inspección previa, no ejecuta LOAD.

La sonda propia de la raíz `../apply/peer-canonical-index-proof-20261009.json` acredita que
Fodaveg `/index.html` devuelve 301 a su `/` propio, cuyo SHA coincide con `index.html` del
manifiesto de 155 assets. El forward mantiene NoRedirect; cuenta ese alias solo si el único
fallo es `index.html`, root mantiene su hash sellado y la sonda fresca de Location sigue
resolviendo exactamente al mismo host y `/`. No se sigue ningún redirect.
