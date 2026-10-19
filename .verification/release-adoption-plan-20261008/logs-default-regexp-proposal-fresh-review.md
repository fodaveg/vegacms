# Logger default: revisión independiente del candidato regexp

Veredicto: **APTO como propuesta local**, sin must-fix identificado. No acredita aplicación runtime, logs productivos ni cierre de `8ce56224`. Sin SSH, Docker, builds ni ejecución de pruebas por este revisor.

## Material revisado

Inventario diff/stat y name-status contra /dev/null, lectura completa de los tres artefactos originales y contexto adicional de la sonda/recibo aportados durante la revisión:

- `default-runtime-encoder-regexp.proposed.caddy`: `79cb9a1ac82ef4dda07c822794a8ca3e9091f3a0cab1a854ea8a20941492c441`.
- `default-runtime-encoder-regexp-proposal.md` final: `85d1814ac2eb4e41823491a79816dcbca7a964bd7bf7f7d0d9d9901917598c07`; sustituye el borrador `5c51b45d...`.
- `test_default_uri_regex_model.py`: `df1e750273ad5848cefbaccd8947039dded75cede6e5535f5b7c405484db2c92`.
- `default-regexp-probe/probe.py`: `8faffdaf90c0716eefb055d1ffbb1d3a6ee69d397e3a7fdbb88d24adae594050`.
- `default-regexp-probe/receipt-arm64.json`: `eb70d78cacbaccb409b499fff122e63eda837217c5d69e2fc07034f0a2073339`.

Se contrastó el contrato local `infra/production/README.md:179–216` y el código primario exacto del tag v2.11.4. El descubrimiento usa rutas conocidas de verificación, excluidas del índice del grafo en la exploración anterior.

## Correctitud y compatibilidad

El formato flat de campos, el separador `>` y los dos argumentos de regexp están soportados. La operación usa el regexp de Go directamente y descarta el sufijo desde el primer `?`, incluidos saltos de línea; no depende de que el parser URL acepte `%zz`. Delete elimina el campo Referer completo. [Filtros v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filters.go#L534-L588).

Omitir wrap mantiene el predicado de elección JSON/console del encoder predeterminado: writer estándar y stderr terminal. No demuestra identidad byte a byte del formato. Los campos fundamentales como msg quedan fuera del filtrado. [FilterEncoder v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/modules/logging/filterencoder.go#L73-L125), [encoder predeterminado v2.11.4](https://github.com/caddyserver/caddy/blob/v2.11.4/logging.go#L682-L695).

La sonda aportada acredita adapt/validate con resultado 0, modelo default esperado y rechazo de regexp inválida con resultado 1 en imagen arm64 `sha256:6b08c1b9858ca9a7d99c1da13c3695081e0e604c6cf214ca26a7ce0e2c4fd9b4`. Sus cuatro contenedores son efímeros, sin red, puertos o host mounts. El recibo fija el SHA del fragmento revisado. El modelo Python es evidencia semántica limitada; el fixture Caddy aporta evidencia de sintaxis/provisioning, sin ejecución de streams. No se reaprovecha el preflight amd64 fallido como verde.

## Pendiente real y límites del veredicto

La imagen de la sonda es distinta de la seleccionada en producción (`5f5c…`). La fusión con la fuente efectiva debe conservar writer, nivel, routing, sampling, otros filtros y consumidores; el fixture mínimo no tenía esos elementos y no acredita su preservación. Debe detenerse ante una fusión ambigua. La propuesta no añade un destino alternativo ni concede lectura de configuración privada.

Falta una señal dirigida de logs reales sintéticos que contraste marcador visible sin filtro y ausente con este filtro, con Referer y caso malformado; la ejecución corresponde al owner con slot/presupuesto y autorización de root. No es necesario repetir la suite global para decidir la sintaxis. Un marcador en el path antes de `?`, en msg, en otro campo o en un logger nombrado queda fuera de este fragmento. No se declara cobertura de colectores, logs históricos ni retención desconocida. Aplicación, permiso runtime y comprobación servida siguen separados.
