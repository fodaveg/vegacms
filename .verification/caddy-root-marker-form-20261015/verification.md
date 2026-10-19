# Pruebas locales de la segunda sonda

Desde el worktree:

```sh
python3 -B .verification/caddy-root-marker-form-20261015/probe.py
```

Se prueban formas raw de una y varias líneas, backtick bare y quoted,
BOM de prefijo e interior, marcador sólo en comentario, proyección
cerrada, rechazo sin approval/cero conexiones y sello exacto en fixture
aislado. Resultado: **8 tests OK, exit 0**, en el [log](probe.log).
Ninguna prueba lee
el Caddyfile privado ni abre SSH, Docker o Env.
