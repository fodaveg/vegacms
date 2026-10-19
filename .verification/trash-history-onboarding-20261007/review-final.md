# Historial y papelera A — revisión independiente

**Veredicto de código: listo para merge. Sin bugs confirmados que exijan cambios.** Candidato final revisado `e0adf41389a61c213bdd6f70f6eeae94bfdc84ca`; el gate conjunto y el navegador real corresponden a raíz/autor y se distinguen de esta revisión.

## Inventario y candidato

WT `/private/tmp/vegacms-trash-history-20261007`, rama `feat/trash-history-onboarding-20261007`, base/HEAD `4d9f891e1237504ed136573f76493b1b77497c56`. Se recibió FREEZE inicial `8b46b95ca05f5555b1d5216f7d5020fb8c510a78`, se inventarió git diff --stat/--name-status staged/unstaged y se leyó el diff completo por bloques: **22/22 paths**, 884 inserciones y 29 eliminaciones. Index coincide con el árbol; sin diff unstaged.

Paths contabilizados: app-context; Home RevisionsOnboarding, revisions-onboarding y dom test, fixture y home-page test; es/en; revisions delete-feedback y test, with-revisions y test; session backend-config y test, backend; shell ToastHost, toasts y test; rutas layout, Inicio, lista de colección y edición de registro. No se modifican BackendPort, restore, Papelera ni Ajustes.

Tras la lectura, el autor corrigió solo dos strings es/en de dismissHint. Se inventarió y leyó completo el delta **2/2** contra 8b46 hasta FREEZE `6d7cbdc670d38fde9f66fde09181fb5d95c8e71d`; index y working tree comprobados. El diff total conserva los mismos 22 paths. El patch inicial canónico tiene SHA256 `b318770d0c6d797b47dabad026c4400266957a77a31f29879233e78d0d867b0c`; no se confunde con el árbol final de dos strings corregidos.

Delta final de formato **2/2** leído e inventariado contra 6d7 hasta `e0adf41389a61c213bdd6f70f6eeae94bfdc84ca`: Prettier parte las dos strings corregidas en líneas, sin cambiar contenido. Index coincide con e0ad, working tree sin diferencias. El veredicto semántico conserva el mismo alcance.

## Contexto y contratos comprobados

Se leyó completo el contrato reconciliado `contract-proposal.md`: opción A vigente, preparación por CTA al bootstrap existente y acceso genérico «Ver en papelera» a una versión guardada acreditada; no Deshacer completo, selección de entrada ni nueva restauración. Grafo `vega-backlog-r2-20261007` primero para query/parser/convenciones/decoradores/capabilities; al representar otro checkout base, se completaron símbolos/vecinos del WT candidato. Svelte sin símbolos requirió lectura focal del checkout. No se reindexó.

Home: solo flag enabled real, schemaBootstrap y ausencia de nombre vega_revisions ofrecen tarjeta; colección presente, disabled explícito y rol editor no ofrecen. PB liga schemaBootstrap al superuser y memory usa su capability existente. No se escribe esquema/manifiesto ni se alteran retenciones cero/custom. Home sin navegación sustituye su CTA genérico mientras muestra la oferta y lo devuelve al descartar; la otra rama ofrece una sola tarjeta. El enlace usa settingsRoute y el id de título existente de RevisionsSettings. Demo comunica persistencia solo de sesión.

Identidad: se deriva en createInstance del URL efectivamente resuelto y port.manifestKey después de config/discovery, no del override aislado ni de otra fetch. Normaliza esquema/host/puerto/subpath/trailing slash y manifestKey; elimina userinfo/query/hash y compone JSON versionado para evitar colisiones de separadores. Memory tiene identidad separada por semilla. La preferencia usa localStorage best-effort, sin token/user/ticket; sin storage/identidad el descarte permanece solo mientras el componente está montado.

Ticket: WeakMap privada por wrapped.delete registra el mismo performDelete que el void público. Un spread conserva la función y su handler; un decorador que reemplaza delete se ejecuta por su camino habitual y devuelve null, sin bypass. Cada llamada recibe su revisionId propio, sin last-ticket global; tests concurrentes discriminan IDs. Snapshot best-effort, exclusiones, latch, poda y compensación del error original de delete permanecen. Fallo de snapshot o confirmación no convierte delete exitoso en fallo.

Confirmación: solo enabled y colección con permisos view/list pasan al get de revisionId. parseRevisionRecord/matches comprueban id, kind delete, collection, recordId y fecha finita no futura dentro de trashDays vigentes. Se consulta list con AND de kind/retención e id exacto, perPage1; items debe contener esa misma revisión. listRule que resuelve [] no acredita acceso. Snapshot podado, not-found, forbidden, otro ID/kind/fecha o falta de permisos/colección degradan a Borrado sin CTA. No se exige recuperabilidad completa para consultar metadatos ni se promete restaurar archivos/enlaces.

Contexto: deleteRecordWithFeedback captura port/user.id/token en closure RAM. Tras delete, tras cada await de confirmación y antes del toast/acción comprueba el mismo contexto. Cambio/renovación de token, usuario o puerto suprime feedback anterior; acción ya visible tampoco navega. Layout retira toasts accionables al cambiar ese contexto o logout. El guard es de confirmación/feedback/acción y conserva el delete best-effort ya existente; no se añade cancelación/transacción a BackendPort.

Consumo: las dos rutas de borrado unitario usan el helper; lista conserva reload y confirmación, edición conserva navegación al listado de la colección capturada. Se leyó el callback vecino de RecordForm y su guard discarding, sin duplicar delete ni alterar su mutex. Medios/múltiples no cambiaron. invokeAction consume el toast antes de invocar, comprueba isCurrent y la closure vuelve a comprobarlo; solo ctx.nav.toTrash(), sin query/restore. Éxitos/info normales siguen 4s; acciones son persistentes con cierre y targets44 en región aria-live polite.

## Mejora menor corregida

🟡 `src/lib/i18n/es.ts:39`, `en.ts:33`: el hint original prometía que el aviso nunca volvería aunque storage fallara. Se propuso aclarar persistencia best-effort; el autor cambió ambos strings para condicionar el guardado a disponibilidad del almacenamiento. Delta leído y cerrado, sin añadir un sistema de preferencias ni prometer un guardado que no pudo hacerse.

## Evidencia y límites

Receipt inicial del autor vincula 8b46, cwd/rama/base, argv, logs con SHA256 y exit0: **7 suites/119 tests** (with-revisions, delete-feedback, backend-config, revisions-onboarding.dom, home-page, toasts, shell/i18n), sync, check, ESLint/Prettier22paths y diffcheck. Se leyeron focal/check logs terminales: 119/119 y check0 errores/0warnings. El delta final solo cambia copy es/en; el autor informa ESLint/Prettier de ambos paths exit0. No se sobredeclara una suite repetida ni se usa evidencia de un cambio semántico distinto.

Receipt final leído sobre e0ad: check0 errores/0warnings, ESLint/Prettier22paths y diffcheck0, focal final **119/119** en siete suites (session18488), navegador terminal0 (session90236). Es evidencia nueva vinculada al árbol final exacto, no solo reutilización del 8b46.

Lámina canónica tiene evidencia estática de 16 capturas y cuatro combinaciones; no se acredita con ella el navegador del código. Se leyeron `browser-attempt4/browser-results.json` y cleanup del árbol e0ad: cuatro casos etiquetados1440/390 claro/oscuro, todospassed, pageErrors vacío y cerooverflow. Comprueban tarjeta única, bootstrap explícito, descarte tras reload, ausencia de CTA sin snapshot, CTA tras snapshot confirmado, acción persistente/teclado y targets44. Vite propio termina143 por SIGTERM y navegador cerrado. Doce capturas del autor, sin inspección visual por este revisor. Es Vite dev + memory sembrado; no build ni PocketBase real.

**Precisión runtime corregida:** la raíz detectó tema claro en la captura nominal oscura de attempt4; su cobertura de oscuro y la de attempt3 quedan retiradas. Receipt final y `browser-attempt5/browser-results.json` acreditan ahora el mismo árbol e0ad, session64315 terminal0, cuatro casos1440/390 claro/oscuro, cero pageErrors/overflow y doce capturas. Usa preferencias reales persistidas P3/P7 y mide atributos, colorScheme y colores computados antes de cada escena Home/borrado/Papelera. Paper RGBA claro227/222/237 frente a oscuro23/18/31, e ink47/44/43 frente a223/220/235, en ambos anchos; lightDarkDistinct=true. Se leyó cleanup: Vite propio143 por SIGTERM y browserClosed=true. El autor inspeccionó la captura móvil oscura. No inspeccioné visualmente las capturas ni ejecuté navegador; la evidencia funcional y de tema efectivo procede del mismo candidato dev+memory. Fuente sin cambios; commitfa03bf15 tiene árbole0ad, WT limpio según recibo.

Diseño siete ejes: tokens/componentes/casos límite/feedback/assets cubiertos en diff y pruebas; responsive/foco/targets cubiertos en la prueba runtime dev del autor; accesibilidad parcial hasta QA física/lector de pantalla. No se ejecutaron suites, navegador, build, instalación, reindex ni cambios de fuente desde esta revisión. Sin PocketBase real, QA física/lector de pantalla, gate conjunto, push o deploy acreditados por este informe.
