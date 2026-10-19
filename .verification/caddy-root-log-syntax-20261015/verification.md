# Verificación local

Ejecutar desde este worktree:

```sh
python3 -B .verification/caddy-root-log-syntax-20261015/probe.py
```

La suite cubre tres fronteras reproductoras de
`SYNTAX_UNSUPPORTED`, la aceptación del backslash bare ordinario, la
proyección cerrada y el rechazo sin approval antes de crear marker o abrir
SSH. Incluye sello positivo y negativo en fixture aislado. Resultado:
**8 tests OK, exit 0**, en [probe.log](probe.log).
No ejecuta Caddy, Docker, SSH ni lee la fuente privada. El
resultado real del root y la corrección mínima dependen de una sola
sonda remota revisada.
