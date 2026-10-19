# Caddy ↔ Vega: fase A, candidato de corte parcial

**No ejecutar aún.** Este es código local para revisión; root conserva autoridad
de SSH y un grant runtime nuevo y concreto para cualquier mutación. El
resultado positivo es `CADDY_ATTACHED_PARTIAL`: red `vega-edge` propia, Compose
con ambos networks y Caddy vivo conectado por ID. **No** se recrea Caddy, no
se modifica su Env/Caddyfile, no se hace Git commit/push y no se mueve Vega.

Preimagen acreditada por `edge-phase2-20261009.json`: Compose SHA-256
`c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2`,
HEAD `2c3034b82efc070d5b747de8322936e3dbcc7459` y blob
`03bae62b20f3c9b7bba8661091b688fb4afbb2cf` iguales en HEAD/índice/worktree,
red `MISSING_CONFIRMED`, Caddy ID
`ae97fc0c57fbe4c3a97f5dce15dfc9da92f33f527b60d95c3f74de9d2a160a7a`
en `edge` solamente. El candidato Compose calculado en RAM es
`6c527267ca840d9889b20766ff272cef477834045ccbf29387beab19ae70a977`.
Todo se revalida fresco en el mutador; este recibo histórico no es un guard.

El script crea solo `vega-edge` con driver bridge y etiqueta de dueño
aleatoria, acredita ID/atributos/miembros vacíos y guarda copia privada de
Compose en `/srv/vega-edge-network-cutover/edge-<nonce>`; reemplaza únicamente
el archivo conocido por CAS de bytes, metadatos completos e inode propio;
después conecta el Caddy exacto por ID, conserva `edge` y verifica que la red
nueva solo contiene ese contenedor. Escribe fases antes de create/install/connect
para que un fallo ambiguo produzca `STOP_NEEDS_OPERATOR` con backup ID. El modo
rollback exige red etiquetada propia, identidad de archivo y Caddy exactos,
ningún otro miembro en la red; restaura fuente, desconecta solo el attach
propio y retira solo la red propia vacía. Ante drift detiene la recuperación.

Fuentes actuales: `remote_edge_apply_candidate.py` SHA-256
`04bc97dddc7528e0f831d0d8ccea086c2149b838a915892bc2f10e61d16ba841`;
`run_edge_apply_candidate.py` SHA-256
`f4983773fc6be141df52c5b515d90b13a2e251e37405ee7eda002de2fff09114`;
`selftest_apply_candidate.py` SHA-256
`a1dc15a5c8e1b7fdb93fd79eb91c8c9bb114960f4ca24723699af5fdc525db71`.
`python3 -B selftest_apply_candidate.py` → 11 tests, exit 0, sin SSH/Docker.

La fuente Git quedaría con el archivo conocido modificado en el working tree.
HEAD/índice permanecen intactos y el script los revalida antes de conectar;
**no equivale a fuente publicada o duradera**. Root debe identificar quién
publica `/srv/edge`, integrar únicamente este delta en esa fuente y acreditar
su próxima recreación. El límite de lectura de Env/config de Caddy sigue
vigente; `docker compose config --quiet` que pudiera cargar dotenv privado
no forma parte de esta fase. Sin prueba de recreación controlada y smoke del
proxy/sitios no se cierra la tarea de red.

La fase B stock es otro candidato: Compose
`11593d1da51e580f988058bfac8288194eaeb7697ac7db2f6926815f8d14dcde`
→ `50b1d28af027fc64e48788fbdc3b6e7703ea6d5420e8d2f94a0b3409dd86c08a`,
con quiesce de `vega_data`, backup y restauración aislada antes de recrear solo
`vega-pb`, más prueba de 153 assets, CORS/API, peers y reachability. El helper
CORS ya revisado fija topología `edge`; no puede reutilizarse sin un nuevo
guard `vega-edge` revisado. **Esta fase B aún no está implementada ni revisada.**
