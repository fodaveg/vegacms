# Review incremental del guard de IDs OCI observados

Veredicto: **APTO** para remote_cutover.py SHA-256 `5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128` y wrapper sin cambios SHA-256 `cd2c7ada23c18db2312bf4be594a5be65cc18dcacd56e3586290bbc345d87f98`.

Comprobación independiente local exit 0: sustituidos únicamente los tres literales newId observados por sus configIds certificados originales, el hash resultante es exactamente `b0594751e8ed99ccd6396f9c8a5cfa9b8b54399497fdd68982429b847055ebdf`, candidato previamente revisado. No cambia ningún otro byte; IDs previos, selectores, argv, montajes/red/health, backup, recuperación y límites permanecen en el candidato ya revisado.

Los newId se fijan a los tres manifests OCI acreditados por la cadena local y lectura remota descritas en local-image-chain-fresh-review.md:

- Stock `sha256:dd978b8d23081d2e3c69ebf6ef8ff4599a1acdd3f38dc559ae6fa379e46449b4`.
- Lumbre `sha256:40df6a9bbcfd4edbc93680b0f45946d0be7c50c4e5c470167e33646fe499c1b7`.
- Fodaveg `sha256:0e0ef56341d677366cfc00d91e2ead83da0ebcc4372f7ba627f575be682ee51f`.

Sus configIds originales se conservan en los recibos: no se reescriben ni se declaran manifests y configs como un mismo digest. La correspondencia incluye manifest/config blobs validados, descriptor/ID, diffIDs, plataforma y revisión; no se fundamenta solo en etiquetas.

Owner comunica 12/12 tests. No ejecuté tests, Docker ni SSH, y no se repitió load. APTO acredita el delta de programa. Root debe verificar estado vivo y presupuesto y obtener aprobación runtime para check/apply; este recibo no declara cutover realizado ni versión servida.
