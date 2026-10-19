# Revisión independiente de preparación de clones públicos

Candidato: freeze237 `ba54b306c32a164c663905e63c63b3083d50c935d8024487e64d9aeda5ed0f76`; receipt `a1e2e98207758e99f19d8e4890b8416cedf448cf17a2cdf9b681edf3ebccf740`. Revisión local de sólo lectura, sin GET, navegador, suites ni Docker.

## Veredicto

**Cambios requeridos antes del runtime**, exclusivamente aislamiento de salida del arnés descrito abajo. Preparación de bytes, identidad, captura y readiness aceptada. Esta revisión no certifica CSP dinámico ni producción.

## Alcance y evidencia comprobada

Inventario: 237 entradas, 218 archivos generados (109 por clon) y 19 artefactos legibles. Revisión completa de los nuevos capture.py, prepare.py, readiness.py, plan.md, preparation.json y receipt.json; proyección íntegra de identidad relevante y captura/procedencia de cada asset. Los dos spec/config/Caddy se reutilizan por igualdad de bytes con el arnés previamente revisado; sus consumidores inmediatos de fixtures y rutas externas se comprobaron ahora. Los JS generados no se volcaron ni se auditaron semánticamente.

- 237/237 hashes del sello coinciden. Ambos mapas109 son iguales en captura, frontend-manifest, archivos locales e identity.buildFilesSHA256. Ningún asset carece de fila HTTP200 y SHA correspondiente en capture-result.json. Las226 observaciones son HTTP200; discriminantes antes/después idénticos. No origen externo ni referencia rechazada registrada en el cierre literal.
- Captura limitada a tres hosts conocidos para discriminantes y dos para assets, HTTPS sin redirects/retries/cookies/credenciales/query; descarga literal dentro de /_app o favicon, 50MiB y300 archivos por clon. URL de salida se construye con host conocido+path; no hace peticiones a referencias externas/API/config/sourcemaps. El cierre dinámico no está probado y permanece explícitamente false.
- Cinco hashes de fixtures9165 coinciden con los archivos actuales. Spec `ffa215347183bd4f11c43c14b143cfadb8bdd66846220f09c9616e4cf2c5a15c`, config `1cb947ec5e2373002193abd5e0ccf58c61175ab69312a03e6e09ecf9fd96d05c` y Caddy `808ed1b170733f6407d89eb83b342a67e5987944dcf3940e0cd900147c558d48` son idénticos al arnés stock acreditado en los dos clones.
- candidate/builtTree null separan la SPA pública del fixtureCandidate9165/tree1b24. El montaje readonly de cada clon en /pb/pb_public está declarado; stockbe130 y su CMD con --origins se heredan, sin certificar CMD/CORS remoto. Compose publica sólo loopback4173–4177 y usa volúmenes propios.
- Readiness sólo preparado: cotejará109 HTTP200/SHA locales y la política real del índice. No se ejecutó aquí. Los13 casos conservan sus intenciones y el tercer negativo real es form-action self contra POST. El parent4177 es servidor real; documentos de fallback sin CSP real hacen fallar el arnés.

## Hallazgo prioritario

🟡 P2 — `/private/tmp/vegacms-backlog-r2-20261007/e2e/fixtures.ts:58`, consumidor de `vega-lumbre/current-spa-proof.spec.ts` y copia Fod. La ruta genérica permite cualquier petición no-document mediante route.continue y obtiene documentos externos mediante route.fetch. El flag memory y la intercepción del sitio synthetic cubren los caminos previstos, pero no bloquean una salida imprevista del build público. Por ello aún no se puede garantizar el requisito de raíz de que el navegador no alcance API de producción.

Arreglo sugerido: guard de red exclusivamente en el runner local, permitiendo los orígenes loopback4173–4177 y las rutas synthetic cumplidas por fixture, abortando y haciendo fallar cualquier otro origen. Mantenerlo también durante el caso ancestor, cuyo page.unroute('**/*') retira el fallback genérico. No cambiar fuentes de producto, políticas ni las13 intenciones. Revisar su delta antes del único runtime autorizado.

## Límites

Sin runtime/browser/closure dinámica, TLS/autenticación/backend/CORS reales, QA ni publicación. La procedencia del grupo vega-lumbre es admin.vegacms.com; sólo una comparación completa109 posterior permite compartir evidencia de esos bytes con Lumbre, nunca index/version solos. No se reutilizan13 anteriores sobre assets151 como certificación de estos109 públicos.
