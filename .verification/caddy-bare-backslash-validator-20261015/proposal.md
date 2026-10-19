# Caddy: barra invertida bare literal en lector reducido

Candidato operativo local de 15 octubre 2026, operación
`1a6c4d88-8fa3-4f13-9151-7be90dc6cbca`. No se ha ejecutado en VPS.
La observación remota anterior, en
`../caddy-backslash-context-20261009/projection.json`, terminó en
`ROOT / LEXICAL / BACKSLASH / BARE_LITERAL` antes y después de expandir.
La fuente oficial de Caddy v2.11.4
([lexer.go](https://github.com/caddyserver/caddy/blob/v2.11.4/caddyconfig/caddyfile/lexer.go#L1346-L1505))
retiene literalmente una barra invertida bare delante de un carácter
ordinario: en esa rama añade `\` y luego el carácter al token. El filtro
anterior del validador rechazaba toda barra invertida activa, de modo que
se detenía antes de llegar a adaptación y validación aisladas.

`remote_validate.py` procede del borrador de 9 octubre. El único delta
semántico frente al candidato ejecutado `caddy-comment-refresh-20261009`
está en `tokens()`: admite esa forma bare literal. Conserva el rechazo
conservador de comillas, espacios, `#`, `<`, barra final, barra doble,
backtick, heredoc y texto entre comillas con barra. `probe.py` añade
cuatro regresiones dirigidas. `run_once.py`, `projection.py` y
`patch-inputs.json` conservan los bytes del borrador anterior; los tres
patches de CSP/panel siguen inalterados. No se amplían imports,
recursos, módulos ni lecturas de entorno. Sólo se consultarán en RAM
valores cuyos nombres aparezcan en los Caddyfile autorizados. La salida
remota permanece una proyección finita sin valores ni errores brutos.

Los pines de contenedores y Compose son los OLD del candidato local.
Root debe comprobarlos y, si Fodaveg cambia tras su corte, crear un
candidato repinado y sellarlo de nuevo **antes** de ejecutar. La meta
remota continúa siendo
`VALIDATED_RESOURCE_TEST_COPY_NOT_LITERAL_PRODUCTION`; no acredita
aplicación, reload ni configuración servida. Para ejecutar hace falta
revisión de este manifiesto y grant runtime nuevo exacto. El wrapper
sin `execution-approval.json` produce cero conexiones. No se crea ese
approval durante la preparación local.
