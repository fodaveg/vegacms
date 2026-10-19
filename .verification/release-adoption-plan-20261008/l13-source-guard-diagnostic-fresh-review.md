# Revisión independiente del diagnóstico L13 tras SOURCE STOP

Veredicto final: **APTO en revisión estática para el diagnóstico RO**, tras cerrar la comparación del tar no acreditado. No autoriza fases mutadoras ni atribuye la causa del STOP histórico.

Candidato final: `remote_source_guard_diagnostic.py` SHA `6e15acc71ec1794027c029a953def12f9523ebfd018f1cb23f52cec3705c593b`; wrapper `run_source_guard_diagnostic.py` SHA `2905fc58aa51187c2856ec9367c09622fc40d2d85c1b8cb79a7d4de8af31f7d0`. Contrato importado SHA `2baa3e7d09f3c2c1cf6cb93d43b738e4c627b0da7e7bb391511c1f80c7e72406`. Los tres hashes fueron comprobados independientemente sobre los bytes locales finales.

Inventario: `git diff --stat` / `git diff --name-status` ordinarios no incluyen estos artefactos excluidos; se inventariaron después como adiciones mediante `git diff --no-index` contra `/dev/null`: 121 líneas del lector y 108 del wrapper inicial. Ambos leídos completos. Consulta de grafo `vegacms` limitada a esta superficie: cero resultados; fallback a los paths conocidos. Contexto adicional: funciones del contrato llamadas por cada guard y su módulo/entrada principal, ya revisado en el lote L13.

## Hallazgo inicial y cierre

**P1 cerrado — `remote_source_guard_diagnostic.py:90` del antecedente `3f9c720d…`: `stage_source_archive_exact` comparaba aunque `source_archive_sealed` fuera falso.** Los 17 guards se evaluaban de forma independiente. `contract.archive_matches()` usaba cada `member.name` como `directory / member.name`, sin validar traversal ni symlinks de ancestros, porque presupone la procedencia del tar. Una sustitución del archivo podía introducir un miembro absoluto o `../../...` y provocar lectura fuera del árbol de source autorizado, aunque el diagnóstico terminara exportando únicamente un booleano. El hash fallido previo no cortaba esa lectura.

Corrección comprobada completa en `6e15acc7…`: snapshot único de 20.044.394 bytes, tamaño/identidad y SHA validados antes de interpretar el tar en `BytesIO`; `archive_matches_snapshot()` valida todos los miembros, paths relativos sin traversal, clases regular/directorio, duplicados, modos y límites, y exige exactamente 232 archivos antes de abrir cualquier target. La comparación usa descriptores de directorio desde `/` y `O_NOFOLLOW` en cada ancestro y hoja. Si falla el sello no se interpreta el archive ni se comparan targets. No se llama a `contract.archive_matches()`.

Evidencia local del owner leída en `source-stop-diagnostic-handoff.md`: positivo del tar auténtico contra 232 archivos; negativos de SHA incorrecto con traversal, miembro traversal/symlink y ancestro staged symlink, con cero lecturas de contenido staged. Estas pruebas no se repitieron por este revisor y no acreditan el estado remoto.

## Comprobado sin nuevo finding

- El contrato se compila en RAM como módulo con nombre distinto de `__main__`; no llama a sus fases mutadoras. Los únicos consumidores elegidos ejecutan consultas de estado systemd/Docker y lecturas de archivos/árboles. No se consulta Environment, Config.Env ni el entorno de Caddy, ni se muestran errores privados.
- Los 17 resultados son booleanos, el orden y la primera falla están fijados, y las cuatro cuentas y tres estados de path se validan contra un schema cerrado. El wrapper actualizado exige `schemaVersion` entero y rechaza `True`.
- La prueba de publisher lee solo cuatro bytes de la primera línea del resultado TEST, junto con un recibo green de hashes públicos; no lee su cola ni logs del build.
- Wrapper: bytes únicos del contrato y lector se leen antes de verificar hashes; esos mismos buffers forman el payload. Salida remota privada, stderr descartado, timeout 180s, y persistencia exclusiva de JSON validado en el directorio de evidencia con modo 0600. No hay relectura posterior al sello ni import local ejecutable del contrato remoto.
- `firstCurrentFailure` expresa el estado actual y no atribuye automáticamente la causa del STOP histórico. El caso de todos los guards verdes queda explícitamente como causa no resuelta.

Límites: ninguna ejecución de SSH, Docker, tests del candidato, build o mutación de sus fuentes por este revisor. Solo se escribe este informe encargado. La aprobación y ejecución remotas pertenecen a la raíz.
