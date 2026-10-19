# Verificación local

`python3 -B .verification/caddy-root-global-log-shape-20261015/probe.py` → 12 tests OK, exit 0. Log: [probe.log](probe.log). Casos: default implícito/explicito, ausencia o duplicado de global/log, otro nombre, import global, log de sitio no contado, llaves rawquote como datos, reproducción STOP con sellos sintéticos, proyección cerrada y bloqueo sin approval/cero conexiones. No se leyó Caddyfile privado ni hubo SSH/Docker. El runtime real queda pendiente de review y ejecución exclusiva de la raíz.
