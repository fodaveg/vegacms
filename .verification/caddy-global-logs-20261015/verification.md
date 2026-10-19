# Verificación local dirigida

Ejecutar desde este worktree:

```sh
python3 -B .verification/caddy-global-logs-20261015/probe.py
```

Resultado: **30 tests OK, exit 0**; salida en [probe.log](probe.log).
Los cuatro tests nuevos prueban inserción byte exacta alrededor del bloque
realista con writer, nivel, include/exclude y sampling; paradas por
bloque ausente/duplicado, formato o import previo; duplicación desde
otro archivo importado; y la forma JSON
adaptada permitida frente a wraps, filtros y campos ajenos. El parser
rechaza opciones de logger fuera del bloque `log`. Se conservan
las 26 pruebas del candidato léxico anterior para CSP/panel, imports,
lookups acotados, proyección finita, sello y cero conexiones sin grant.

No se ejecutó Caddy, Docker, SSH, build ni prueba de logs productivos.
La [sonda e544](../../../../release-adoption-plan-20261008/logs-runtime-next/execution-receipt.json)
y las [pruebas del fragmento](../../../../release-adoption-plan-20261008/logs-runtime-next/default-runtime-encoder-regexp-proposal.md)
son antecedentes reutilizados. La validación integrada de los cuatro
deltas, la comprobación de pines vivos y la revisión independiente siguen pendientes.
