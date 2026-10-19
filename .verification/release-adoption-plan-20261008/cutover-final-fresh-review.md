# Review incremental final de cutover y smoke

Veredicto: **APTO** en las fuentes fijadas abajo. Este informe sustituye el veredicto bloqueante del candidato provisional en cutover-draft-fresh-review.md; el informe anterior se conserva como evidencia del hallazgo.

- remote_cutover.py SHA-256 `b0594751e8ed99ccd6396f9c8a5cfa9b8b54399497fdd68982429b847055ebdf`.
- run_cutover.py SHA-256 `cd2c7ada23c18db2312bf4be594a5be65cc18dcacd56e3586290bbc345d87f98` (sin cambios).
- served_smoke.py SHA-256 `04be908ba8eae67ce42db644ad98efc9ef1c3aa2d46b5e1921e9e5d6f88e7e23`.

Hallazgo must-fix cerrado: restore_file_if_owned reconoce únicamente bytes/mode originales o bytes instalados por un intento propio. Los cambios ajenos detectados se conservan y devuelven STOP_RESTORE_NEEDS_OPERATOR sin reiniciar. La recuperación evita el overwrite incondicional del snapshot que motivó el bloqueo. No se afirma locking contra escritores concurrentes.

La mejora del smoke también quedó aplicada: raíz/deep exigen text/html; los assets HTML/JS/CSS/JSON requieren su MIME; missing y panel deben conservar status/policy del baseline, sin fingir reglas nuevas de edge. Cada baseline exige ahora --service y solo se acepta para ese mismo servicio. Capturar uno fresco antes de cada corte.

Leído el delta de funciones afectadas y fixtures pequeños nuevos; owner reportó cutover 12/12 y smoke 6/6. No ejecuté tests, SSH, Docker ni escrituras de producción. Se mantiene el contexto y los límites de la review completa provisional: IDs/argv/montajes/red/health exactos, presupuesto real, backup detenido y restauración TEST, bloqueo de downgrade tras posible migración, manifiestos propios 153/155, ningún Config.Env completo ni Caddy body.

APTO acredita el programa revisado. La release owner debe obtener permiso del runtime y verificar estado vivo para cada etapa. Un fallo o identidad residual incierta del transporte bloquea apply aunque esta review esté verde. No acredita versión servida, login, acciones autenticadas ni fullSmokeContractPassed.
