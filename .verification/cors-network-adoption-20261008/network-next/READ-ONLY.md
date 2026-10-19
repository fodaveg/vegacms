# Lectura selectiva edge ↔ Vega (root-only)

`remote_edge_read.py` proyecta en RAM únicamente `/srv/edge/compose.yml`
(SHA base conocido `c6c47d…`), el ID e imagen ya acreditados de `edge-caddy`,
dos labels Docker Compose de procedencia (`config_files`, `working_dir`),
membresía de `edge`/`vega-edge`, y si `vega-edge` tiene driver bridge,
scope local e `internal=false`. Calcula el SHA del candidato Caddy que añade
solo `vega-edge`; no exporta el Compose. Repite selección y lectura de archivo
antes de emitir. Una discrepancia produce `STOP_READ_UNAVAILABLE`.

`run_edge_read.py` verifica el hash de fuente que pasa root, transmite solo
ese lector a Python remoto en RAM y guarda únicamente JSON de esquema cerrado
en archivo local nuevo con modo 0600. Todo stdout/stderr no conforme se
descarta. No lee ni exporta `.env`, `Config.Env`, Caddyfile, logs, Health.Output,
mount sources, nombres de redes ajenas ni miembros desconocidos. No modifica
archivos ni contenedores remotos.

Comando reservado a root, **después de revisión independiente del SHA final**:

```sh
python3 -B .verification/cors-network-adoption-20261008/network-next/run_edge_read.py \
  --execute --source-sha256 cd0d9f7faab6ccc30f5ceeda7d2b962b027d23b087151aca120f04ce07e6879b \
  --out .verification/cors-network-adoption-20261008/network-next/edge-read-20261009.json
```

`composeSourceClass=EXACT` acredita que los dos labels de Docker apuntan a
`/srv/edge/compose.yml` y `/srv/edge`; `gitSourceClass=TRACKED` es una prueba
adicional de versionado local, no concede por sí sola autoridad para editarlo.
`OTHER`/`UNKNOWN` exige reconciliar el owner antes de instalar el candidato.
La lectura no acredita que Caddy use ya `vega-edge`, ni permite aplicar el
patch sin backup, CAS y preflight fresco del contenedor y los otros sitios.
