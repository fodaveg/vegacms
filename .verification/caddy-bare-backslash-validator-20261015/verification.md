# Verificación local del parser Caddy

Candidato `.verification/caddy-bare-backslash-validator-20261015`;
operación `1a6c4d88-8fa3-4f13-9151-7be90dc6cbca`. El origen del
validador es `caddy-comment-refresh-20261009`, que ya tenía 22 pruebas.
`remote_validate.py` cambia sólo `tokens()`. El manifiesto sella los
ocho artefactos de este directorio, incluido el log nuevo.

`python3 -B .verification/caddy-bare-backslash-validator-20261015/probe.py`
terminó **exit 0, 26 tests, OK**; [salida completa](probe.log). Las
regresiones nuevas comprueban `\` bare ante letras, dígitos y puntuación
ordinaria, el rechazo de delimitadores o texto quoted, la expansión en
un token activo antes de recorrer imports y la identidad de bytes fuera
del host parcheado. Los controles previos verifican límites de imports,
recursos y módulos, falta de lectura del entorno completo, proyección
cerrada y cero conexiones antes del grant.

La prueba local reproduce la clase léxica y demuestra el cambio del
lector reducido; no ejecuta el lexer nativo ni consulta datos privados.
La observación remota anterior acredita el contexto BARE_LITERAL, sin
exponer el byte ni la línea. Puede aparecer otra forma sintáctica después
de esta frontera; la próxima sonda remota dará una clase finita o el
resultado de validación aislada. No se hizo SSH, Docker, build ni deploy.
