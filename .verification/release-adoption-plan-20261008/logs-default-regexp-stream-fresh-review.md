# Logger default: revisión de evidencia de stream sintético

Veredicto: **APTO para los claims locales delimitados**, sin must-fix identificado. No acredita despliegue, configuración privada real ni cierre de `8ce56224`. El revisor no ejecutó SSH, Docker, HTTP ni tests.

Inventario stat/name-status y lectura completa del driver, recibo y propuesta final; se reutilizó la revisión del fragmento y del código primario Caddy v2.11.4 sin repetirla:

- Driver `default-regexp-probe/stream_probe.py`: `bd56438b8583de79863cf0b40088a16bf068b4a27fa69b95c994580050847f09`.
- Recibo `default-regexp-probe/stream-receipt-bridge.json`: `c8c2c8cd03448f7d2da6aa550181baab77c2c580cad41351d407e0abf9f1967c`.
- Propuesta final: `5027e3f8d0d63f734f2bd618ec74f60b0661deae6b8947ec70503169a6ff34f3`.
- Fragmento aplicado en fixture: `79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.

La imagen fijada es `sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4`, Linux/arm64. El driver comprueba Id/plataforma, usa un proxy sintético hacia un puerto sin upstream, un logger global default con el fragmento, red propia y puertos efímeros únicamente loopback. Los logs sintéticos permanecen en RAM; se persisten hashes y resultados finitos. No se monta configuración ni datos productivos.

El control sin filtro produjo exactamente un registro502 con marcador en URI, Referer y registro. La variante filtrada produjo cinco registros502 para query normal, clave codificada, repetida, `%zz` y `%0A`. El driver exige correspondencia exacta de path y URI terminada en `?REDACTED`, ausencia de Referer y del marcador en todo el JSON. El recibo contiene esos resultados, y registra cleanup0 de ambos contenedores y la red. No se convierte el intento previo detenido antes de requests en evidencia positiva.

El control positivo es uno, no cinco controles negativos individuales; los cinco casos filtrados acreditan sus resultados específicos. El caso `%0A` prueba salto de línea codificado, no un salto de línea literal en un HTTP RequestURI. Los hashes de logs son trazabilidad de material sintético no persistido; la evidencia verificable reutilizada es driver+recibo y la ejecución acreditada por root, no una lectura independiente de logs crudos.

Persisten los límites: fixture502 de default, imagen local distinta de producción `5f5c…`, sin preservación acreditada de filtros/routing/writer del bloque real, sin otros loggers/statuses y sin prueba de query intacta al upstream ni bytes ZIP bajo este fragmento. La semántica de filtrado estructurado es consistente con [FilterEncoder v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L141-L234) y [RegexpFilter v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L555-L590). Los campos fundamentales msg y marcadores fuera de la query siguen fuera del alcance. El siguiente candidato productivo requerirá fuente efectiva propia, revisión de fusión y permiso runtime separado; este informe no los concede.
