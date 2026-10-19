# Revisión independiente del lector CORS/red

Veredicto: **APTO para lectura selectiva**, sin autorización de aplicación de CORS o redes. No hubo SSH, builds, cambios de fuentes ni ejecución de tests por este revisor.

## Sello y alcance

Base: `.verification/cors-network-adoption-20261008/`.

| Archivo | SHA-256 |
|---|---|
| remote_probe.py | `537269fa2eddb43d7050f50c7ade571e4f10c9dabe5325ea64b3ed7655bc5f10` |
| run_once.py | `1cea039df92d906754a4013bf9053e7efe0ca996b37e038b746edfd83abe412e` |
| handoff.md | `b4fc6b3c9a8687d4392be74796bcd65f46253c15cee095dd769b6847b5477527` |
| proposal.md | `a09faa739df140006a3c01881ff82128ea30b68674fd3b2ec683249fa8091eea` |

Inventario inicial stat/name-status contra `/dev/null`: cuatro adiciones excluidas del índice. Todas leídas completas, más delta final; hashes actuales verificados. Contexto pertinente: informe `cors-network-next-actions.md`, recibo de las tres imágenes servidas, resolución de backend público de Vega y propuestas CORS/red anteriores. No se repitieron gates acreditados de las imágenes.

El lector permite cuatro hashes de Compose literales (Vega base `bae812ef…`, Lumbre `7ed9a9e2…`, Fod `a18777c5…`, edge `c6c47d48…`), cinco containers conocidos, campos Docker enumerados, argv PB seleccionado y metadatos de redes/aliases/puertos. Identidades y nombres ajenos permanecen en RAM; se exportan sus cantidades. No solicita Config.Env, entorno de proceso, `.env`, Caddyfile, logs, Health.Test/Output, IP/MAC o valores de publicación host. HTTP público sin auth únicamente a `/vega.config.json` de las tres SPA admin conocidas; no redirects ni proxies, cuerpo acotado y clasificación sin cuerpo crudo.

## Hallazgos cerrados

- P1 de utilidad de inventario, `remote_probe.py:104`: la forma real Fod `--dir /pb/pb_data` producía dos desconocidos, aunque ambos eran conocidos. Se normalizan formas separadas únicamente para flags/valores allowlist, a `flag=valor`; pares inválidos quedan contados sin revelar el valor. Igual tratamiento para publicDir/hooksDir/http/hooksWatch. El wrapper acepta solo la representación canónica mediante `args()`.
- P2 de coherencia de identidad, `remote_probe.py:222`: antes se comparaban solo nombres entre inspect y miembros de edge. Ahora cada miembro conocido exige ID exacto del container seleccionado; una recreación entre ambas lecturas provoca STOP. Se conservan checks de IDs únicos y pertenencia por nombre.
- Hoja Compose no regular: `remote_probe.py:66` usa O_NONBLOCK además de O_NOFOLLOW; FIFO se rechaza sin bloquear antes del fstat. Ancestros se abren mediante FD, la lectura regular queda acotada y se compara identidad/tamaño/mtime antes y después.

No quedan must-fix en este sello. El handoff declara negativos locales de pares privados, drift de ID, FIFO y rechazo de campos/aliases privados, además de AST y positivo Fod. Se leyó la evidencia declarada; no se reejecutaron esas pruebas ni se comprobó Docker/HTTP remoto.

## Límites de la interpretación

`PROJECTED` entrega inventario, no certifica readiness de CORS/red. Mismatch de Compose, argv PB desconocido o nulo, backend público UNKNOWN/UNAVAILABLE y peers directos sin identificar retienen la decisión concreta afectada. Los argumentos normales no reconocidos de ENTRYPOINT/CMD de preview o edge no son, por sí mismos, un bloqueo de CORS del proceso PB identificado. No hay atomicidad global entre lecturas: las guardas de una aplicación posterior deben comprobarse de nuevo.

Los únicos backendOrigin exportables son los tres admin HTTPS conocidos; whitespace, otros URLs, paths, credenciales/query/fragment o una respuesta HTML SPA pueden resultar UNKNOWN de forma conservadora. No se afirma que el backend esté roto ni que sea el destino efectivo de cada navegador. `overrideUninspected=true` conserva el límite de overrides locales. Esta proyección no contiene HTTPstatus/MIME ni prueba que otros browsers nunca usen otro origen.

La retirada de edge sigue requiriendo identificar referencias de peers directos y preparar redes/aliases durables; los contadores de miembros ajenos no prueban ausencia de consumidores. El lote CORS exige pruebas reales de orígenes legítimo/ajeno/null, preflight y llamadas sin Origin, conservar listeners/argv custom y nueva configuración servida. Nada depende de desbloquear valores privados de Caddy, ni amplía el rechazo vigente de su lectura.
