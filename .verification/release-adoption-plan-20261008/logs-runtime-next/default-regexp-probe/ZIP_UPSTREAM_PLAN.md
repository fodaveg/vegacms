# Sonda local preparada: query y ZIP tras proxy

Estado: **ejecutada localmente, EXIT 0**. Resultado finito en
[`zip-upstream-receipt.json`](zip-upstream-receipt.json). Propiedad: solo
artefactos de este directorio. Se reutilizó
la imagen local Caddy `sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4`
(Linux/arm64, versión 2.11.4 acreditada en `receipt-arm64.json`) y el fragmento
`79cb9a1…`, ya probado en errores 502 por `stream-receipt-bridge.json`.

Comando ejecutado una vez tras revisión y cesión de franja de root:

```sh
python3 -B .verification/release-adoption-plan-20261008/logs-runtime-next/default-regexp-probe/zip_upstream_probe.py
```

`zip_upstream_probe.py` crea una red bridge y un contenedor Caddy propios, sin
`pull` ni build. Publica solo `127.0.0.1:puerto_efímero`. Dentro del mismo
contenedor, `:8080` actúa como proxy hacia `127.0.0.1:8081`; el segundo
listener sirve un ZIP sintético de un directorio temporal y registra el URI
de la petición entrante en un access log sintético. El `log default` global
usa exactamente el fragmento candidato. Dos GET comprueban token normal y
query con `%zz`, clave codificada y repetida. El runner exige status 200,
SHA-256 de respuesta idéntico al ZIP original y `request.uri` del listener
interno idéntico byte a byte a la ruta enviada. El token se genera en RAM;
el ZIP y los logs crudos son temporales y no se guardan en el recibo. El
recibo solo contiene hashes, conteos, casos y limpieza. Al acabar retira
contenedor y red propios.

Presupuesto incremental ≤0,1 GiB; `df` registró 122800000 KiB libres antes y
después. El socket Docker requirió permiso de runtime. No
instala herramientas, usa archivos de producto, contacta producción ni abre
puertos públicos. El check de sintaxis/fixture `STATIC_FIXTURE_OK` terminó
exit 0 sin Docker. La ejecución `c6af73` terminó exit 0: dos respuestas 200,
175 bytes cada una, SHA del ZIP idéntico y URI íntegro en dos registros del
listener interno. La retirada del contenedor y red propios terminó exit 0 y
los filtros Docker por etiqueta quedaron vacíos. El resultado no acredita producción, otros
upstreams, autenticación ni descargas reales; solo prueba que el fragmento
no altera esos dos GET y que Caddy preserva query/bytes en este fixture.
