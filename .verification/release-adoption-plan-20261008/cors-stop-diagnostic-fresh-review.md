# Delta final APTO RO

Par final leído completo y hash verificado: remote_diagnose.py d25e7a10dda9c251f4c63ab644eb2d2840b37f23d227afb46c58394da925df05 / run_diagnose.py 402011762917d4ffa5ab3aa41f9a7a3b95ceb52d6d68d7b0d89263d18b35fe59. Sustituye lector antecedente abajo. Añade metadata selectiva ExposedPorts/HostConfig.PortBindings (ningún Env), splits mounts/network/aliases/ports en enum/bools, ownership BASE contra rollbackComposeIdentity y recheck final state/Compose/env/selected-ID. Wrapper permite exactamente el nuevo esquema cerrado. snapshotStable=false no es prueba de recuperación; guard mutador posterior debe acreditar su propio estado fresco. No mutaciones ni ejecución del revisor. APTO comunicado a root para lectura únicamente.

---

# Revisión RO del STOP CORS stock

APTO de alcance exclusivamente lectura: remote_diagnose.py b1a52e17bdae1a4a32cc85daf414aafaf2d78e90122cd1239115b90b080a4038 y run_diagnose.py 8182eab5f43d740d597a6229e59acd613aabfc9c8d32075a31bd755a4484d5e4. Dos archivos inventariados stat/name-status contra /dev/null y leídos enteros (118+107 líneas); importación RAM sellada del apply c5e0 y helper5d413 sin ejecutar sus main. Lectura de backup fijo, Compose/env servidor RAM y Docker metadata selectiva; labels únicamente project/service. No SSH, builds, Docker ni tests por revisor.

Salida schema cerrado ≤2048 bytes, backupId literal, IDs hex, categorías/booleanos/phase; errores crudos descartados. Sin Config.Env, Health.Test/Output, logs, valores privados, Caddy ni writes remotos.

Límites: composeOwned solo acredita TARGET/installedComposeIdentity. No acredita BASE tras restauración; topologyMatch combina estructura y campos dependientes del estado detenido. Lecturas sucesivas no son snapshot transaccional y requieren revalidación en cualquier receta mutadora posterior. No inferir drift o autorizar recuperación solo por esos booleanos.

Root comunica diagnóstico real INSTALLED/OLD detenido, Compose TARGET propio/env true/imagen+labels true/command BEFORE/topology false/ningún volume writer/sin nuevo ID. Eso discrimina STOP antes de create; no demuestra todavía qué campo de topología falló. Stock 502 según root hasta recuperación. Se necesita lector estructural reducido y recuperación nueva revisada; no repetir apply.
