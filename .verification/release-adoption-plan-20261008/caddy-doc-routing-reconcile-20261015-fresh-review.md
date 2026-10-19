# Revisión independiente: README Caddy y routing de logs (15 oct 2026)

**Veredicto: APTO, sin must-fix.** El cambio corrige la premisa inferida de que la fuente viva contiene un único `log default` literal y deja explícito que la cobertura del logger `default` no cierra el riesgo de otros destinos.

Rango: worktree `.verification/worktrees/caddy-doc-reconcile-20261015`, base `1b61e52a5f29c8b71c58d002a3ad2de1170b2abe`, cambio de trabajo aún sin commit. Inventario diff-first: `git diff --stat` y `git diff --name-status` muestran únicamente `infra/production/README.md` (22 inserciones, 10 borrados); se leyó todo su diff y el párrafo vecino. No hay cambio de código ni de configuración servida.

La sonda real `25beba43-4bcf-432d-94f9-ecca553d6ad4` proyectó `MULTIPLE_ROOT_LOGS`, primer bloque GLOBAL, un único bloque global, `globalImport=false`, `unnamedLogs=ZERO`, `explicitDefaultLogs=ZERO`, `otherLogs=MANY`; root, validador y fragmento coincidieron y se reprodujo el STOP. Esto descarta la premisa literal anterior, pero no revela nombres de loggers, valores Env ni routing. El nuevo texto condiciona una fusión en `default` a demostrar equivalencia mediante adaptación nativa, exige preservar writer, nivel, filtros, sampling y acceso, y manda comprobar los destinos reales de errores, acceso y DEBUG antes de declarar cobertura.

La [documentación Caddy de opciones globales](https://caddyserver.com/docs/caddyfile/options#log) define `log [name]`: sin nombre modifica `default`; los nombrados tienen configuración propia. En [Caddy v2.11.4 `shouldLogRequest`](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/caddyhttp/server.go#L740-L765), el mapping `LoggerNames` se comprueba antes que `SkipHosts`; la advertencia del README sobre no inferir exclusión solo por `skip_hosts` es correcta. El texto distingue propuesta, prueba sintética y producción, y conserva la obligación de una autorización aparte para aplicar/reload.

**Límite:** esta revisión documental no demuestra los destinos efectivos de la fuente privada ni valida un nuevo encoder; el executor/probe nativo sigue pendiente. No se ejecutaron tests de producto, SSH, Docker ni cambios activos.
