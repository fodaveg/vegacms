# c459: metadatos binarios de Caddy, candidato local

**Preparación pendiente de revisión independiente y grant runtime nuevo.**
No se ha conectado al servidor ni creado `binary-execution-approval.json`,
`binary-request-started.json` o `binary-execution-receipt.json`.
La operación e544 consumida conserva intactos su grant, marker, receipt y
fuentes; su permiso no sirve para c459.

Manifiesto ejecutable sellado: `binary-metadata-manifest-v2.json` SHA-256
`aaa38d4c4f4bd2e8b5fb80a1eed5126ff5507c1859b30e2a969ca6b1b01be6a0`.
Fija cinco archivos y el scope exacto. Sellos principales:

- lector `read_binary_metadata.py`: `41a433f09cb20b9501e2c9e72108c6fbc0126e6ea7360566d91da546423e3f45`;
- wrapper `run_binary_metadata.py`: `673d8a7289b8e7884088c938712f06b26bfdbdc41b4fe586bd74ab4a89cf9fa9`;
- tests `test_binary_metadata.py`: `1a73b562c050cd09defabef4bceaffe4f06344c6b729ffa6acb01a04adfeffa0`;
- capture reutilizado: `d48e4a2705ebaac2d32720b38ebab1040fde26b3348a2aeeeb906702af4e9b01`.

El lector ejecutaría solo cuatro comandos Docker: inspect selectivo
Id/Image/Config.Tty antes y después; `caddy version` y `caddy list-modules`
en el ID fijo. Proyecta semver estricto, TTY boolean y presencia boolean de
filter/json/stderr. La salida de módulos custom existe únicamente en RAM
remota y no se exporta. El postpin exige `type(tty) is bool`: `0` no puede
pasar como `False`. No se leen Env, configuración ni logs.

`python3 -B test_binary_metadata.py`: **6 tests, exit 0**. Incluye cinco
variantes de grant/fuente inválidos con cero `Popen`, marker consumido,
reutilización de los mismos buffers, shape cerrado, versión inválida, drift
de TTY y TTY final entero. Comprobación adicional: manifiesto 5/5, capture
exacto y ausencia de grant/marker/receipt c459. Ejecutar el wrapper real sin
grant produjo `NOT_AUTHORIZED_OR_SEAL_DRIFT_ZERO_CONNECTIONS`, exit 1 y
ningún marker.

`OPERATE_BINARY.md` contiene la invocación preparada para root con placeholders
de SHA revisado y referencia APTO real. Solo root solicita el nuevo grant
gestionado y ejecuta SSH; este handoff y un archivo local no son aprobación.
La lectura tampoco acredita la configuración efectiva del logger ni cierra
la tarea de seguridad de logs.
