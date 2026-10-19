# Lectura selectiva de fuente Git y red externa (candidato, 9 oct 2026)

Alcance nuevo: **solo lectura** de `/srv/edge/compose.yml`, su entrada Git conocida,
el contenedor `edge-caddy` seleccionado y la red con nombre literal `vega-edge`.
Root conserva la ejecución remota. Este lector no reutiliza la autorización runtime
del primer lector; necesita un permiso acotado propio tras revisión independiente.
No lee `.env`, `Config.Env`, Caddyfile, logs, `Health.Output`, URLs remotas ni
otros archivos del checkout. No ejecuta Docker Compose ni escribe en el servidor.

Fuentes selladas, en este directorio:

- `remote_edge_read.py` SHA-256 `cd0d9f7faab6ccc30f5ceeda7d2b962b027d23b087151aca120f04ce07e6879b` (lector base ya revisado).
- `remote_edge_phase2.py` SHA-256 `13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f`.
- `run_edge_phase2.py` SHA-256 `67b297cd445383b95ce58b4290c523c87dfc4a679bdcd1d9a9dc15b4d3085749`.
- `selftest_phase2.py` SHA-256 `2244c57cc8ed9df8c654d9ffdb98aa248b64ecbaf966b5796c88c29fb34e5c4d`.

Prueba local: `python3 -B selftest_phase2.py` → 6 tests, exit 0. Los negativos
rechazan IDs ambiguos, error Docker no reconocido, cambio de selección de red,
cambio de Git entre snapshots, campos extra y un ID sin red acreditada. Ningún
comando remoto se ha ejecutado durante esta preparación.

Para ejecutar **solo tras revisión y autorización runtime nueva**, root puede usar
desde este directorio:

```text
python3 -B run_edge_phase2.py --execute --source-sha256 13427c4798645a1fd2701b169a0cb7776166d6789f33d6090ec36e7db28f516f --out edge-phase2-20261009.json
```

El wrapper transmite al servidor exclusivamente las dos fuentes selladas como
Python en RAM y guarda una proyección JSON local de esquema cerrado. `PROJECTED`
no equivale a permiso de mutación. Para un futuro corte, exigir simultáneamente
`composeBaseMatches`, ID/imagen de Caddy, `composeSourceClass=EXACT`, `gitClass=EXACT_CLEAN`
y `networkClass` acreditada. Si la red existe, fijar su `networkId` completo en
cada frontera; si falta, `MISSING_CONFIRMED` exige dos listas sanas y el error
exacto de `inspect`. `OTHER` o `UNAVAILABLE` detienen la receta. Releer HEAD,
índice, bytes y metadatos del archivo, ID de red y Caddy antes de escribir.

La equivalencia futura de Compose puede verificarse sin leer valores privados:
delta inverso de bytes conocidos, `docker compose config --quiet` con fuentes
selladas y rechecks de IDs/atributos. Eso prueba la *fuente declarada*, no que
un Caddy recreado vaya a servir la configuración efectiva actual. El editor y
publicador de la fuente Git aún deben identificarse; HEAD limpio local no
acredita publicación. Sin recreación controlada y comprobación de proxy/sitios
no puede cerrarse el aislamiento solo por conectar la red al contenedor vivo.
