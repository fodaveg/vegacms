# Segunda sonda mínima: forma del marcador léxico activo

La [primera proyección](../caddy-root-log-syntax-20261015/projection.json)
acreditó `stage=TOKEN`, `category=TOKEN_FORBIDDEN_MARKER`,
`context=ROOT_NESTED`, con root/validador/fragmento idénticos y sin los
cuatro guardas blanket. La categoría reunía backtick y BOM. Nueva
operación `fcbaf292-d28f-4a15-bcd2-84fd047123bb` para distinguirlos
**sin relajar aún** `tokens` ni repetir la validación completa.

El [lexer oficial Caddy v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/lexer.go)
descarta BOM sólo al principio del archivo (líneas 71–89); abre una cadena
raw con backtick sólo cuando el token está vacío, y la cierra con el
siguiente backtick, incluso tras saltos de línea (líneas 198–218 y
254–264). Un backtick que llega después de caracteres bare no abre esa
cadena. La sonda discrimina precisamente estas formas: backtick inicial
raw cerrado en la misma línea, después o no cerrado; backtick interior
bare, bare escapado o dentro de comillas dobles; BOM al inicio de archivo,
al inicio/interior de token bare o dentro de comillas. Si ambos aparecen
en el primer token rechazado, devuelve `BOTH` sin escoger causa.

`remote_probe.py` lee únicamente `/srv/edge/Caddyfile` con `read_source`
del validador sellado SHA
`d980095b44a9d5c53940fea86dc4863619273bafed8c64798247516c5e37503f`.
Exige su SHA root
`ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b`
y el fragmento SHA
`79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.
Reproduce el `merge_default_log` original en RAM, localiza el **primer**
rechazo de `tokens`, y proyecta sólo enums `kind/form/position/context`.
Los comentarios que Caddy ignora al inicio de token no se interpretan
como marcador activo; esto tiene regresión local. No se proyectan bytes,
tokens, fragmentos de línea, números de línea, nombres de variables,
hashes derivados de datos, errores brutos ni contenido privado. No hay
Docker, Env, imports, logs o escritura remota.

La release owner revisa fuente, tests y `manifest.json`; bajo la misma
autoridad de lectura root RAM, crea un `execution-approval.json` exacto con
el `SCOPE` de `run_once.py` y SHA del manifest. Sólo después ejecuta una
vez `python3 -B .verification/caddy-root-marker-form-20261015/run_once.py
--operation-id fcbaf292-d28f-4a15-bcd2-84fd047123bb`. Sin approval,
el wrapper termina antes de conexión o marker. Un intento consumido no
se repite. Los candidatos previos permanecen congelados.

Un resultado `RAW_QUOTE_*` permitiría preparar un soporte mínimo y
probado del token raw conforme al lexer oficial, sin alterar bytes fuera
del bloque `log default` ni ampliar imports/recursos. Un BOM fuera de
posición inicial o una forma mixta requiere otra valoración; ninguna
clasificación por sí sola autoriza modificar producción.
