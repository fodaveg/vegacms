# Verificación offline

Desde este worktree:

```sh
python3 -B .verification/caddy-global-logs-rawquote-20261015/probe.py
```

Resultado: **34 tests OK, exit 0**, en [probe.log](probe.log).
Las cuatro regresiones nuevas cubren token raw de una línea con espacios,
`#`, comillas, backslash y llaves literales; EOF/multilínea/fronteras
inválidas; llaves quoted como datos en merge/module scan; y patch del
host que conserva los bytes exteriores. Se conservan los 30 checks
anteriores de clausura de imports, consultas individuales de valores,
CAS, scopes, adaptación restringida, fragmento exacto y wrapper sin
approval/cero conexiones.

No se ejecutó SSH, Docker, Caddy, build ni lectura de datos privados.
La evidencia real previa sólo acredita el fallo original y su forma
léxica. La validación integrada de cuatro deltas con esta corrección
todavía no se ha ejecutado.
