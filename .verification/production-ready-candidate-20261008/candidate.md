El candidato local de las tres imágenes está verificado; la aplicación productiva sigue condicionada a datos efectivos, dry-run privado y autorización de publicación. Este paquete consolida evidencia existente, sin repetir gates, leer producción ni modificar fuentes.

| Consumidor | Imagen local exacta | Fuente y alcance acreditado |
|---|---|---|
| Vega stock | `be13075b` | App9165/tree1b24; 151 assets, presupuesto150.82/79.93/647.59 KB, native18 y CSP13. CMD contiene `--origins=https://admin.vegacms.com`. |
| Lumbre admin | `c883afc9` | Runtimeb48/tree96bbc, binario custom54caa y hookc11; 151 assets byteidénticos a be130/app9165; native18 y CSP13. ENTRYPOINT `/pb/lumbre-admin`, CMD literal **sin** `--origins`. |
| Fodaveg | `0095df74` | Runtimef657/tree943096; native18 con entrypoint PB explícito y prueba separada17 del entrypoint original tini/Node/PB y reapertura. Node404 acredita servicio, no página funcional. PB0.39.7 se conserva. |

Los hashes completos, fuentes, CMD y referencias selladas están en `candidate-inputs.json`. Estos imageIDs son locales: no son referencias de distribución publicadas ni prueba de imagen servida en producción. La referencia final de distribución y la integración en cada repo siguen pendientes de la release owner.

La adopción Astro L13 es otra integración: commitba361/treeac37, upstream4469/e012 y tar0.2.0, 25 casos consumidor. Es frontend del sitio/preview de Lumbre, no la SPA admin stock9165 ni el runtimeb48. No se presume un árbol combinado ya integrado. Fod conserva su procedencia Astro existente; no se le atribuye la adopción L13.

Fod0095 conserva el entrypoint original y el loopback Node→PB. El recibo no registra un Docker CMD ni el argv completo del hijo PB: se declaran desconocidos, no se deducen de los18 casos que usan override de entrypoint PB. L15 no añadió origins. Tampoco está acreditado aquí el montaje efectivo que sirve la SPA admin de Fod en producción; el sitio SSR empaquetado no demuestra identidad con los151 assets stock.

La proyección aprobada de Caddy acredita `hostSkipped=true` para los tres admins. Se conserva esa exclusión. Los tres fragmentos access-log anteriores se archivan como referencia **EXCLUIDA**; no se activan ni se inventa un logger/writer/rotación. El redactor nativo PB de las imágenes está probado con datos sintéticos; los canales runtime/error de Caddy y sus colectores/retención requieren evidencia distinta.

De los diez parches anteriores, siete conservan su delta exacto de forma condicional (tres headers/panel y cuatro redes). Dos comandos CORS y el encoder default se retienen hasta resolver datos efectivos. Ninguno es apply-ready: los ocho guards son históricos, y falta el staging privado que compruebe las anclas y preserve los bloques/loggers ajenos. No se añade un patch de pin de imagen sobre una base Compose privada que no se posee.

Los defaults de preview/builder y loopback inventariados son fuente durable, no topología servida. La nueva proyección de metadata que prepara el otro carril podrá resolver parte de esos datos; no autoriza automáticamente estrechar origins, retirar peers, validar configs privadas ni publicar. No se ha hecho otra GET/SSH, build, instalación o prueba.
