# Review del cutover congelado provisionalmente

Veredicto: **CAMBIOS REQUERIDOS**, no ejecutar apply con este candidato.

Fuentes completas revisadas: remote_cutover.py SHA `0e21836b1d97a79e4eb9825fa5d7d1de8fdab28f6069d866a1792499e87f2658`, run_cutover.py SHA `cd2c7ada23c18db2312bf4be594a5be65cc18dcacd56e3586290bbc345d87f98`, served_smoke.py SHA `fd06d617f65fe96b46cbb52f4e5205a451ff67f843836f4e0b77ab3a466af4e2`. Tests pequeños leídos; resultados comunicados por owner, no ejecutados por este revisor.

🔴 Must-fix — remote_cutover.py:642–645. Tras detectar FilesChangedWhileBackingUp, la rama de recuperación escribe oldCompose/oldEnv si los bytes actuales difieren del snapshot. Esa diferencia puede ser precisamente una edición concurrente ajena; el programa entonces la destruye, aunque nunca hubiera escrito el fichero. La misma pérdida es posible tras una escritura parcial seguida de una edición externa. Registrar las sustituciones realizadas por este intento, restaurar solo ficheros cuyos bytes actuales sigan siendo los instalados por este intento y detenerse ante cualquier drift ajeno. La recuperación no debe arrancar con configuración desconocida ni afirmar restauración completada. Añadir fixture negativo de drift antes de toda sustitución y después de sustitución propia.

🟡 Mejora relevante — served_smoke.py:174–184. El green de root/deep exige status y hash pero no text/html. Tampoco exige estabilidad de panel/missing frente al baseline: un cambio de 404 a 200 podría seguir dando IMAGE_ONLY_SERVING_OK. Mantener el contrato completo separado, pero rechazar una regresión respecto a la política basal y exigir MIME HTML en ambas rutas.

Operativa: capturar baseline fresco antes de cada servicio; reutilizar el basal original en el segundo servicio provoca un STOP por el peer ya actualizado legítimamente.

Contexto comprobado: guardas de identidad/argv/mounts/red/health, preservación de bytes y permisos, backup de volumen detenido, validación de tar antes de restaurar, comparación de bytes en TEST, prueba Fod de serve aislada, bloqueo de downgrade tras posible migración, manifiestos servidos 153/155, PLAN y RECOVERY. No se solicitaron Config.Env ni cuerpos Caddy y no se ejecutó SSH, Docker, backup, suites ni smoke servido. El fix invalidará los hashes indicados y requiere una revisión incremental nueva.
