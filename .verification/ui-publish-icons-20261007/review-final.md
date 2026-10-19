# Publicar desde formulario e iconos — revisión del candidato final

**Veredicto de código: listo para merge. P2 anterior cerrado; sin nuevos hallazgos confirmados.** La certificación del candidato conjunto y la integración corresponden a la raíz.

## Candidato e inventario

Worktree `/private/tmp/vegacms-ui-publish-icons-20261007`; base/HEAD `9ae8b57c3297f1c32b6f22a3d66a17a78579383b`. FREEZE del autor e index comprobado: árbol `ed22ce2b5c13371ab02157ad9a96151d33b44533`, sin diferencias unstaged. `candidate-final.patch` SHA256 `98e99e1b4b5f7a9bc954a33e9cbc27af8025997a1b05952b12b736c0c4891305`.

Inventario `git diff --stat/--name-status` staged: **10/10 archivos**, 613 inserciones y 52 eliminaciones. Se reutiliza la lectura completa acreditada en `review.md` del árbol `beb7585e90d039cc23699270ee758c94b59e4502`. Se recuperó ese árbol del object store y se inventarió y leyó completo el delta hasta FREEZE: **2/2 archivos**, 113 inserciones y 15 eliminaciones, `RecordForm.svelte` y `RecordForm.publish.svelte.test.ts`. Los otros ocho archivos coinciden con el candidato previamente revisado: RecordBlocks, RecordForm.review/schedule tests, Icon, registry, EditorToolbar, PublishButton y VisualPublishControl.

## Cierre del P2 y contexto comprobado

`RecordForm.svelte:778` deriva `publicationWritable` desde el statusField resuelto y la propiedad readonly del schema. Protege tanto la oferta del control/acción vencida como el callback de transición; los campos editables restantes conservan Guardar. La regresión comprueba registros limpios y sucios, ninguna publicación ni aviso de éxito y guardado permitido del título manteniendo draft.

`RecordForm.svelte:1576` contrasta el status devuelto por el backend con el solicitado antes de llamar a onSaved. Una respuesta que continúa draft se reporta como error y devuelve null al control; no produce aviso de publicación exitosa. Los tests comprueban limpio y sucio, y conservación del contenido previamente guardado. Se releyó save/sendRecord/commitSaved: se adopta la versión y valores reales devueltos; la nota no se emite al padre durante los pasos internos; el lock y el foco diferido se liberan con el mismo finally.

Grafo privado `vegacms_ui_publish_icons` primero para `toRecordInput` y `resolvePublishAtField`; snippets del checkout cuando Svelte no expone símbolos. `toRecordInput` filtra schema.readonly. `resolvePublishAtField` ya descarta fechas readonly: no representa una capacidad de programación y no hay motivo para borrar una fecha arbitraria. El test final demuestra publishAtField null, ausencia de acción vencida, payload exclusivamente status y fecha conservada respecto al registro inicial normalizado. El fallo previo Z/.000Z era una expectativa de fixture, no un bug de producto.

También se comprobó el reinicio de publicationNotice al cambiar de registro. El delta no modifica el contrato de creación, los modales de relación, las dos escrituras ordenadas/versiones, revisión de bloques ni la separación de publicación del registro y reconstrucción del sitio, acreditados en review.md. No exige type.page: incluye cualquier registro existente editable con statusField escribible.

## Evidencia y límites

No se ejecutaron tests, navegador, build, instalación ni reindex desde esta revisión. El focal previo 209/209 y las capturas de browser-attempt1 corresponden al candidato anterior; no certifican el FREEZE corregido. El log readonly-red contiene dos fallos discriminantes de readonly status y uno de estado devuelto; la expectativa antigua sobre readonly publishAt se descartó por contradecir el resolver existente. readonly-green-final conserva el intento previo con 54/55 y el único fallo de normalización de fecha; no se presenta como verde final.

Evidencia final del autor leída en `recovery-results.json`: árbol `ed22ce2b5c13371ab02157ad9a96151d33b44533`, cwd del worktree, argv y marcas de inicio/fin explícitos, terminal 0 para Prettier/ESLint sobre los diez paths, pnpm check y focal de nueve suites **229/229**. Las suites son publish/schedule/review de RecordForm, VisualPublishControl, RecordBlocks, tests/shell/icons, with-revisions, richtext-link y markdown-commands. Se verificaron también sus logs finales; pnpm check informa 0 errores y 0 warnings. No se atribuye esta identidad al antiguo focal 209.

El navegador repetido del autor terminó con exit 0 (session 72369). Se leyó `browser-attempt2/browser-results.json`: cuatro combinaciones desktop/mobile y claro/oscuro, todas passed; validación que impide publicar y lleva foco, contenido publicado, persistencia al reabrir en SPA, cadena SVG accesible, publicación dentro del viewport y objetivo móvil de 128.90625×44 px. pageErrors vacío. `browser-cleanup.json` acredita cierre del navegador y del Vite propio con SIGTERM (143). Es Vite dev con memory sembrado, no build/distribución ni PocketBase real. El revisor no abrió navegador ni inspeccionó capturas; la inspección visual corresponde al autor.

No se acredita backend real, E2E remoto, gate conjunto, integración, push, deploy ni QA física/accesibilidad con lector de pantalla. Los siete ejes de diseño y el contexto restante conservan los límites declarados en review.md, con responsive y flujo de foco ahora cubiertos por la prueba dev del autor.
