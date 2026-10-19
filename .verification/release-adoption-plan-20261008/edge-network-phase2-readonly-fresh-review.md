# Edge ↔ Vega — lector fase2

Veredicto **APTO estático**, sin mustfix. No ejecución remota, permiso de mutación, publicación Git ni aislamiento servido acreditados por este informe.

Sellos revisados:

- remote_edge_phase2.py: `13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f`
- run_edge_phase2.py: `67b297cd445383b95ce58b4290c523c87dfc4a679bdcd1d9a9dc15b4d3085749`
- selftest_phase2.py: `2244c57cc8ed9df8c654d9ffdb98aa248b64ecbaf966b5796c88c29fb34e5c4d`
- phase2-handoff.md: `76a4344495a23914c94120b3f62a0693c9b6fc4771da06d9d97caaf83ec93100`
- base remote_edge_read.py: `cd0d9f7faab6ccc30f5ceeda7d2b962b027d23b087151aca120f04ce07e6879b`

Inventario stat/name-status del lector nuevo frente/dev/null; fuente160 líneas, wrapper, seis tests y handoff leídos completos; todos los ficheros del lote contabilizados. Base acreditada conservada, contexto pertinente de parentFD/leafNOFOLLOW, candidate y selected_container revisado; hashes coincidentes.

Lee exclusivamente Compose conocido C6 en RAM, con parents/leaf NOFOLLOW y regular bounded; candidate añade solo red literal vega-edge y se proyecta su SHA. Git consulta root exacto y el path Compose conocido: HEAD commit/blob, index blob, hash del buffer aprobado y estado de ese path; solo OIDs/booleanos/clases salen. --no-optional-locks y core.fsmonitor=false evitan actualizaciones opcionales/monitor. HEAD/index/worktree deben concordar para EXACT_CLEAN; no significa publicación ni identificación del publicador.

Docker ls filtra nombre y template exacto vega-edge; no exporta nombres ajenos. Red existente exige ID completo único, inspect de ese ID y atributos bridge/local/nointernal, con otra selección posterior idéntica. MISSING_CONFIRMED exige dos listas sanas vacías y error literal de ausencia reconocido. Daemon inaccesible, error desconocido, selector ambiguo o carrera son UNAVAILABLE, nunca ausencia acreditada. OTHER no acredita identidad de una red utilizable.

Recheck final de bytes/identidad completa de archivo, Git, red (incluyendo ID de EXISTING_EXPECTED) y clasificación del contenedor Caddy conocido. La clasificación de Caddy compara con el ID/imagen fijados de la base; idMatches=false no conserva una identidad desconocida y no permite un corte. OTHER/UNAVAILABLE repetidos tampoco prueban estabilidad operativa. PROJECTED significa proyección acotada, no READY.

Wrapper transmite los dos buffers sellados una sola vez; esquema cerrado3072 bytes, enums, IDs/OIDs canónicos, bool/int de tipo exacto y archivo exclusivo0600. Raw Compose, paths/labels, errores/status privados quedan RAM. Sin .env, Docker Config.Env, Caddyfile/config/routes, logs, Health.Output, Compose execution ni writes remotos.

Se reutiliza evidencia owner6/6 offline; negativos leídos para ausencia vs error, ID ambiguo, selección cambiante, Git drift y schema privado. Esta revisión no ejecutó tests, SSH, Docker, builds ni HTTP. Requiere autorización runtime propia nueva. Futuro mutador debe releer y exigir conocidos BASE/ID/imagen/sourceclass/GitEXACT_CLEAN/redacreditada, fijar ID de red en cada frontera y comprobar proxy/sitios tras recreación; este lector no certifica ese protocolo futuro.
