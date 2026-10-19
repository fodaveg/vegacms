# Caddy: validador de cuatro deltas con raw quote de una línea

Candidato local para revisión, operación
`9a4f3ec9-8816-46a8-b69b-9a5e9ca37dc3`. No hay approval, grant
nuevo, intento remoto ni aplicación. La operación anterior `12925dcb-…`
está consumida y se conserva sin cambios.

El [recibo anterior](../caddy-global-logs-20261015/execution-receipt.json)
terminó `STOPPED/SYNTAX_UNSUPPORTED` antes de la clausura y de `git apply`.
La [primera sonda](../caddy-root-log-syntax-20261015/projection.json)
lo aisló en un token activo del Caddyfile raíz. La
[segunda sonda](../caddy-root-marker-form-20261015/projection.json)
identificó `BACKTICK/RAW_QUOTE_SINGLE_LINE/TOKEN_INITIAL/ROOT_NESTED`,
con hashes root/validador/fragmento intactos. Eso explica el STOP: el
lector reducido rechazaba todo backtick, aunque la fuente real usa la
forma raw de una línea que el
[lexer oficial Caddy v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/lexer.go#L198-L218)
reconoce cuando el token está vacío y cierra con el siguiente backtick.

El cambio mínimo en `remote_validate.py` acepta **sólo** esa forma raw
de una línea, con cierre y frontera de token separados. Dentro conserva
literalmente espacios, `#`, comillas dobles, backslash y llaves. Un
`CaddyToken(str)` conserva si el token estaba quoted para que
`staged_patch`, la fusión global y `preadapt_modules` no cuenten llaves
raw como delimitadores. Se retira el guard textual `"{"`/`"}"` porque
también interceptaba esos datos y comentarios antes del lexer; CR y NUL
siguen rechazados. Multilínea, EOF, token raw pegado a otro, backtick
interior bare y formas especiales no cubiertas siguen en STOP. No se
implementa el lexer completo ni se modifica el parser de imports,
referencias Env o recursos. Si la cadena raw existente utiliza una
directiva/módulo fuera del allowlist, el validador seguirá deteniéndose.

El resto del candidato es idéntico al de cuatro deltas anterior:
`patch-inputs.json` SHA
`6ff2eb3a8b8ea3eb249271eec63fb10c1a1c50a1951cae2a595810182a47ad40`
para CSP/panel en Vega, Lumbre y Fodaveg, y el fragmento del logger
default SHA
`79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.
Exige las mismas cuatro fuentes, Compose, contenedores e imagen Caddy
2.11.4; pin Fod NEW `c25a7858f2692b395925d5b7f8d80512378dccbaa58ec55e432d8c5f186b73e6`.
Originales y valores `{$...}` sólo viven en RAM; la copia expandida para
adapt/validate vive en `/dev/shm` remoto, sin exportarse. La proyección
finita y la comprobación de CAS final permanecen intactas. No escribe
configuración activa ni recarga Caddy.

La [suite local](verification.md) pasa 34 pruebas, incluidas nuevas
regresiones de raw quote, límites negativos y byte fidelity de patch y
merge. Sólo una ejecución remota revisada sobre el runtime fijado
acreditará si supera esta frontera y si aparecen otras restricciones.
