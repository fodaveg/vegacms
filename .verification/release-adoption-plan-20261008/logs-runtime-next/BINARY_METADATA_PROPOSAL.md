# Versión, módulos conocidos y TTY: siguiente alcance nuevo

La ejecución real e544 del lector default devolvió writer y encoder omitidos y
ninguna regla observada. Se conserva `execution-receipt.json`, que mantiene las tres
coberturas false. No se deduce un filtro efectivo ni se consulta otra ruta de config.

`read_binary_metadata.py` propone exclusivamente cuatro comandos Docker en RAM remota:

1. `inspect --format` del nombre edge-caddy: `.Id`, `.Image` y boolean `.Config.Tty`.
2. `exec <ID fijo> caddy version`: proyectar únicamente semver estable estricta;
   hashes/build text permanecen en RAM o provocan STOP si el shape no es conocido.
3. `exec <ID fijo> caddy list-modules`: stdout acotado permanece solo en RAM;
   proyectar solo presencia booleana de los tres IDs literales filter/json/stderr.
   Puede recibir nombres custom en RAM, pero no los exporta, enumera ni resuelve.
4. `inspect --format` final `.Id`, `.Image` y `.Config.Tty`, iguales al primer pin.

Cada comando tiene timeout12s, stdout version/pins <=1024 bytes y módulos <=64KiB;
el capture d48 drena/descarta stderr. Sin SSH ejecutado por esta preparación, GET,
Config.Env, Config completo, argv, Caddyfile, logs, Health.Output, otros hosts,
config adaptada, cambios, markers remotos, reload, build, pull ni retry.

Root necesita revisión independiente del lector y `run_binary_metadata.py`, y un grant nuevo
para estos cuatro comandos y el stdout transitorio de list-modules. La autorización
e544 se consumió; no autoriza este alcance ni permite recrear su marker. Este lote
no instala grant. `OPERATE_BINARY.md` concreta la invocación que solo root puede
someter al runtime; se conservan todos los archivos de la operación e544 consumida.
Root mantiene SSH exclusivamente.

Criterio: identidad conservada + versión finita + tres booleans de módulo + TTY bool,
o STOP cerrado. `.Config.Tty` es metadata del contenedor: no se presenta como una
sonda de `isatty` del proceso ya arrancado. Tampoco list-modules prueba que un módulo
esté activo en el logger default ni que los tokens estén saneados. Las tres coberturas
siguen false y 8ce56224 no se cierra con esta lectura.

La referencia local `infra/production/README.md` exige verificar `caddy version` antes
de aplicar un encoder al destino real. Se consultó también el código público primario
de Caddy [logging.go](https://github.com/caddyserver/caddy/blob/master/logging.go) y
[filterencoder.go](https://github.com/caddyserver/caddy/blob/master/modules/logging/filterencoder.go)
para los namespaces de los IDs seleccionados. Su rama master solo orienta la receta:
no acredita la versión productiva ni sus defaults. Tras obtener semver, cualquier
inferencia de stderr/JSON requiere la fuente de esa versión exacta; no sustituirla por
documentación genérica ni por un supuesto `2.11` de la imagen. Las URLs tentativas
v2.11.0 no estuvieron accesibles y no se usan como evidencia versionada.

La preparación reutiliza las fuentes e544 selladas sin editarlas y conserva su grant,
marker y receipt reales. No incorpora políticas nuevas de rotación/retención ni
inventario de named/custom loggers.
