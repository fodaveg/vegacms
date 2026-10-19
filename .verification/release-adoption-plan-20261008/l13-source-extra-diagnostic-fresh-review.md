# Revisión independiente del inventario RO de extras L13

**APTO estático para el diagnóstico de categorías**, sin autorizar reparación, traslado o borrado.

Hash final lector: `48307b2fa66aa3a2c2f696242e45119edb765445c5a1dc6f4536d0df9dddd73b`; wrapper: `47b4e010789492b205e629a9d744445149fa7dd5ce2e8c1024bfe5b58e60d98a`. Ambos cotejados sobre bytes locales. Dependencias fijadas: contrato `2baa3e7d09f3c2c1cf6cb93d43b738e4c627b0da7e7bb391511c1f80c7e72406`, guard endurecido `6e15acc71ec1794027c029a953def12f9523ebfd018f1cb23f52cec3705c593b`.

Inventario por `git diff --no-index --stat` y `--name-status` contra `/dev/null`: dos adiciones, 103 y 107 líneas. Fuentes completas y handoff leídos. El grafo ya devolvió cero nodos de esta superficie excluida; se usaron los paths conocidos del encargo. Las dependencias fueron revisadas en el diagnóstico anterior y se reutiliza esa revisión para sus hashes exactos.

El lector autentica el snapshot del tar antes de interpretarlo y verifica los 232 archivos del manifest antes de clasificar. Los extras se enumeran solo mediante metadata; ninguno se abre para leer contenido. El traversal de directorios usa descriptores relativos con `O_NOFOLLOW` en cada ancestro, incluyendo la raíz del stage, y cuenta symlinks sin seguirlos. Los nombres desconocidos permanecen en RAM y solo incrementan categorías fijas u `other`; se conservan separadas las cuentas de symlinks, otros tipos y los tres directorios generados excluidos por el contrato.

El wrapper envía los mismos buffers cuyo SHA verifica. Importa contrato y guard en RAM sin ejecutar sus `main`; solo ejecuta el lector RO. La salida aceptada tiene schema cerrado, tipos enteros estrictos, manifestFiles=232, categorías exactas y suma coherente. Descarta stderr, no persiste errores crudos y escribe exclusivamente un JSON validado nuevo con modo 0600. No consulta Environment, Config.Env, Caddy ni logs.

No hay must-fix confirmado para este diagnóstico del árbol conocido. Mejora opcional, `remote_source_extra_diagnostic.py:37`: el límite de 100.000 entradas suma archivos/symlinks/tipos/directorios omitidos, pero no directorios normales vacíos ni profundidad. Un contador de directorios visitados y un límite de profundidad evitarían una exploración excesiva de un árbol patológico. El límite de transporte de 180s permanece; esta mejora no amplía lecturas ni autoriza reparación.

Evidencia local del owner leída en `source-extras-diagnostic-handoff.md`: tar auténtico y 232 archivos; cuatro extras sintéticos clasificados, symlink sin seguir, dist omitido y proyección privada rechazada. No repetida por este revisor. Sin SSH, Docker, builds, tests ejecutados o edición de fuentes por este revisor. El resultado remoto deberá distinguir rutas regenerables acreditadas de extras no identificados; una categoría por sí sola no demuestra propiedad ni permite borrarlos. Cualquier reparación requiere candidato independiente y guards frescos.
