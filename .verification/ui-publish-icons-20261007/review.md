# Publicar desde formulario e iconos — revisión independiente

**Veredicto: cambios requeridos por un P2 en un campo de estado readonly.** El resto del flujo revisado no presenta hallazgos confirmados. La corrección pertenece al autor; no se editaron fuentes ni se ejecutaron pruebas desde esta revisión.

## Hallazgo

🔴 **P2 — se anuncia una transición que el payload ha eliminado.** `src/lib/form/RecordForm.svelte:1554` (nota de estado) y `:1835` (oferta de acción).

Una colección editable puede tener su campo status en solo lectura. `resolveStatusField`/`isValidStatusField` (`src/lib/model/conventions.ts:91`) siguen reconociendo ese select como statusField: no excluyen `readonly`. El nuevo control se ofrece para un id existente y statusField, y `VisualPublishControl.canEdit` comprueba permisos update/readonly de la colección, no del campo. Al delegar la transición a `save → sendRecord → toRecordInput`, `toRecordInput.ts:45` elimina el campo readonly. El backend puede aceptar el payload vacío o el contenido editable restante y devolver un registro todavía draft; pese a ello se construye la nota «pasa a Publicado» y se llama al padre con un éxito. La etiqueta confirmada puede seguir siendo Borrador, contradiciendo el aviso.

**Reproducción mínima para el autor, no ejecutada por el revisor:** en el setup de `RecordForm.publish.svelte.test.ts`, marcar únicamente `status` como `readonly:true`, manteniendo colección y permiso update editables, registro existente draft. Publicar limpio, o tras editar title. El payload de estado desaparece por el filtro; no se publica, pero el éxito afirma publicación. Los tests actuales cubren readonly de colección, no readonly del campo.

**Criterio de cierre:** no ofrecer ni ejecutar esta acción cuando el campo que debe cambiar no es escribible; conservar el guardado de otros campos editable. No declarar éxito de una transición que no se envió/confirmó. Añadir una regresión discriminante de readonly del status; comprobar el mismo filtro al limpiar publishAt cuando esa limpieza sea parte necesaria de la transición, sin ampliar comportamiento ajeno. El hallazgo se envió al autor y a la raíz con reproducción y causa, sin fixes del revisor.

## Inventario y candidato

Base `9ae8b57c3297f1c32b6f22a3d66a17a78579383b`, WT `/private/tmp/vegacms-ui-publish-icons-20261007`. Inventario staged `--stat/--name-status`, lectura completa por bloques y contabilización **10/10 archivos**, 507 inserciones y 44 eliminaciones:

1. `src/lib/form/RecordBlocks.svelte`.
2. `src/lib/form/RecordForm.publish.svelte.test.ts` (nuevo, 287 líneas, leído completo).
3. `src/lib/form/RecordForm.review.svelte.test.ts`.
4. `src/lib/form/RecordForm.schedule.svelte.test.ts`.
5. `src/lib/form/RecordForm.svelte`.
6. `src/lib/icons/Icon.svelte`.
7. `src/lib/icons/registry.ts`.
8. `src/lib/richtext/EditorToolbar.svelte`.
9. `src/lib/shell/PublishButton.svelte`.
10. `src/lib/visual/VisualPublishControl.svelte`.

Tree inicial acreditado por el autor `638461d88a223002eeeb7b18fa40ad088ef08ffa`; delta posterior leído 1/1 línea: quitar inicializador inútil de `let result: SaveOutcome` en `changePublication`, sin alterar flujo. Tree actualizado comunicado `beb7585e90d039cc23699270ee758c94b59e4502`; SHA256 del patch staged actualizado leído: `091bf92858df4cf507e5c8b19e1a22560ee606d97a62f0f8e10bcdbd094bc2d5`. No se acredita un commit aún. No hubo ediciones en esta revisión.

## Contrato y flujo comprobados

Se leyó `contract.md` canónico y la representación legible de la lámina previa (composición/estados, sin tratar el CSS generado incrustado como correspondencia demostrada con un build). La raíz aclaró el alcance: pantalla normal del formulario, cualquier **registro existente editable con statusField**, incluyendo posts; «página» no exige capacidad `type.page`. Creación y modales de alta de relación siguen sin control de publicación. No se elevó la redacción anterior a un nuevo requisito.

Grafo privado `vegacms_ui_publish_icons` primero para símbolos de envío/convenciones. Se leyeron `sendRecord`, `toRecordInput`, resolución de statusField, guards y vecinos de `RecordForm`, fases/confirmación de `VisualPublishControl`, y consumidores reales de las rutas de edición/creación. El grafo no devolvió callbacks de las rutas; se usaron rutas conocidas para verificar el parent. El onSaved de edición comunica un toast y permanece en el registro; creación conserva navegación a la edición del id recién creado.

La operación dirty guarda el contenido con status confirmado, adopta el registro/version devuelto y solo después intenta el status. Ambas escrituras usan save/sendRecord y conservan captura/sync de redirect, afterSave y capa existente de historial; no inventan un snapshot garantizado. El mutex publishing se activa antes del primer await, bloquea campos/Guardar/duplicado/bloques y cancela navegación aun si el contenido ya se reasentó limpio. El delegado se invoca antes del refoco de confirmación, cerrando el hueco entre pasos. Errores del primer paso conservan la edición y no escriben estado; el finally libera antes del foco diferido. Fallo del segundo conserva contenido ya guardado, no notifica éxito al padre y permite reintentar solo status. Éxito completo notifica una vez con notas conservadas.

La confirmación reutiliza revisión viva y títulos de bloques dirty; cancelar devuelve foco al trigger. Avisos no bloquean, los bloques no se autoguardan. «Publicar ahora» vencida pasa por la misma operación/revisión. Sin delegado, el editor visual conserva update directo, expectedVersion y feedback existente. Estado de registro y reconstrucción del sitio siguen siendo acciones distintas.

Iconos: SVG local con currentColor y trazo del set, registry actualizado; iconos decorativos conservan texto/aria-label de sus botones. EditorToolbar cambia emoji link por cadena. `PublishButton` cambia **solo** el atributo id de upload a publish (warning intacto); no incorpora ni modifica lógica del lote webhook. Subida de archivos conserva upload.

## Siete ejes de diseño y límites

| Eje | Evaluación de esta revisión |
|---|---|
| Tokens | Cubierto en fuente: reutiliza tokens y CSS existentes, sin tokens nuevos. |
| Componentes/estados | Cubierto salvo P2: control existente, mutex, confirmación y errores parciales explícitos. |
| Responsive por componente | Parcial: composición y CSS legibles revisados; no se inspeccionaron capturas ni se ejecutó navegador por el revisor. |
| Accesibilidad | Parcial: labels/SVG decorativo, foco cancelación/error y disabled/aria-disabled revisados; sin QA física ni lector de pantalla. |
| Contenido/casos límite | Cubierto en tests/fuente para contenido largo/bloques/errores/conflictos; readonly del status requiere corrección. |
| Feedback del sistema | Cubierto salvo P2: aviso tras éxito completo, error parcial, estado confirmado y notas de afterSave. |
| Assets | Cubierto: cadena/cohete SVG locales, sin dependencia ni descarga. |

El autor comunica focal de nueve archivos **209/209**, check/ESLint/formato corregidos terminal 0 (86963); esas ejecuciones son del autor, no del revisor. El navegador mínimo del autor y la evidencia final estaban en preparación durante esta revisión; no se atribuye su resultado. No se ejecutaron suite, build, Go, runtime, navegador, instalación ni reindex. No se acredita backend real, E2E, gate combinado, publicación ni deploy. Una corrección del P2 invalidará los checks afectados y deberá revisarse como delta, conservando este informe del candidato anterior.
