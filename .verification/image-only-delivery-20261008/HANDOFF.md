# Handoff de la entrega por imagen

El archivo de 606022656 bytes (SHA-256 `34a1780fe31f9c1b50a5e47435fa6183cdd53d956ce00ddab82a247ae8e1ee0a`) llegó sellado. El primer wrapper `load` devolvió STOP sin recibo; no se repitió. Las lecturas posteriores comprobaron Docker 29.7.2, tres tags cargados y la correspondencia 3/3 entre el `.Id` OCI remoto y la cadena de config/manifest/capas del archivo local. La evidencia canónica es `loaded-image-correspondence-20261008.json` (SHA-256 `314631b76bf76057fb62d59c437508903f4c6fd180a577f87773e6a94c7049ec`). Los IDs config locales continúan en `manifest.json`; los tres `newId` de `remote_cutover.py` son los OCI observados en servidor.

Antes del corte, `edge-hashes-before-20261008.json` confirmó los cinco ficheros edge sin cambios. El preflight y diagnóstico remoto de binarios/volúmenes constan en `remote-projection-20261008.json` y `remote-runtime-diagnostic-20261008.json`. No hubo cutover, snapshot ni smoke público ejecutado por este autor.

Scripts congelados para la release owner:

| Etapa | Script remoto o local | SHA-256 |
| --- | --- | --- |
| check/apply por servicio | `remote_cutover.py` | `5d4131c229d7aa88918c932dd517b0d33e024a3497aa4fcc4b9f0c9940467128` |
| wrapper cutover | `run_cutover.py` | `cd2c7ada23c18db2312bf4be594a5be65cc18dcacd56e3586290bbc345d87f98` |
| smoke público baseline/after | `served_smoke.py` | `04be908ba8eae67ce42db644ad98efc9ef1c3aa2d46b5e1921e9e5d6f88e7e23` |
| hash-only edge | `remote_edge_hashes.py` | `931062ad17bd3c6f04fa4ee1093453e8d8ea01ad5cd1f1c12278ff46b2e12e6a` |
| wrapper edge | `run_edge_hashes.py` | `0bad333ed6f6bd6b001070bc2d2658e2d808b4c3b6ffffa869cd81fb665eac91` |

`remote_cutover.py` valida de nuevo selector/ID, ENTRY/CMD/argv, mounts, red, puertos, health, imagen vieja, SHA de Compose, espacio real en `/srv` y Docker. Detiene solo el servicio, conserva Compose/dotenv íntegros con modo restringido y snapshot consistente, restaura en volumen TEST y compara bytes; Fodaveg ejecuta el `serve` real sobre el clon antes de iniciar PB 0.39.9 con datos 0.39.7. El rollback antes de arrancar imagen nueva restaura solo bytes escritos por esta invocación y detiene ante drift concurrente. Una posible migración posterior al arranque exige decisión discriminada; `RECOVERY.md` no contiene restauración destructiva automática.

Verificación local: cutover 12/12, smoke 6/6, transporte 3/3, edge 3/3, identidad 4/4 y residual 4/4; AST de los 27 Python del paquete y JSON de manifest válidos. Revisión independiente estática APTO para transporte, edge, identidad, chain, cutover, smoke y el delta final de tres `newId` del SHA `5d413…`.

Operación en marcha bajo la release owner: baseline público stock y `check` stock terminaron verdes; `apply` stock está activo en el handle original. Después corresponde smoke 153/153 y hash edge; repetir con baseline fresco para Lumbre 153/153 y Fodaveg 155/155. `IMAGE_ONLY_SERVING_OK` conserva el comportamiento existente y no equivale al smoke completo de panel/CORS/login. Los comandos y condiciones de parada están en `OPERATE.md`.
