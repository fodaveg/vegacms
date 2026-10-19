# Review independiente del transporte y hashes de edge

Veredicto: **APTO para las etapas receive/load y la lectura hash-only nueva**, exclusivamente para los hashes siguientes. Sin must-fix. Cutover permanece DRAFT y no está certificado por este informe.

Lectura completa sin ejecución:

- remote_transport.py SHA-256 `30f33b3fa6371cb8ffdb30cd575e91d07bf3af37041df88e9611363560f5966b`.
- run_transport.py SHA-256 `e2e2b3311cee72f8cc4a9f6d6a51c957db58154c8aae23a0e6830f6d3316f54c`.
- remote_edge_hashes.py SHA-256 `931062ad17bd3c6f04fa4ee1093453e8d8ea01ad5cd1f1c12278ff46b2e12e6a`.
- run_edge_hashes.py SHA-256 `0bad333ed6f6bd6b001070bc2d2658e2d808b4c3b6ffffa869cd81fb665eac91`.

Transporte: archive fijado a 606022656 bytes y SHA `34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a`, consistente con manifest.json. Receive comprueba /srv y filesystem real de Docker antes de mkdir/escritura; crea exclusivamente con O_EXCL/O_NOFOLLOW, limita tamaño, exige hash y fsync. Load revalida archivo y presupuesto antes de Docker image load; comprueba los tres tags e IDs exactos del manifest. Wrappers fijan hash de fuente, verifican archivo local y restringen proyección JSON. No hay Compose, extracción de Config.Env, Caddy, stop ni lectura/escritura de volúmenes.

Edge: cinco rutas fijas, O_NOFOLLOW, solo ficheros regulares hasta 2 MiB, control de cambio concurrente, hashes comparados en remoto y proyección de cinco booleanos. Sin cuerpos ni variables de entorno. Es una etapa RO nueva acotada; no reutiliza la autorización de una lectura anterior ni el intento rechazado de Caddy/Config.Env completo.

Contexto: manifest y selftests pequeños leídos. No ejecuté scripts remotos ni locales, tests, Docker o SSH; no rehashé los 606 MB del archivo: los wrappers lo exigen antes de ejecutar. La garantía operativa queda supeditada a las comprobaciones vivas y aprobación del runtime de la release owner. Este dictamen no autoriza cutover ni acredita resultados de producción.
