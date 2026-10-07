# L12 · Crear el destino de una relación

**Propuesta pendiente de enseñar y aprobar.** Tarea `3506984a-de71-4d12-95b7-23fe9103776a`; padre `d99e681e-5545-40ac-8bb0-afaa188859e3`, leídos íntegros en Lumbre el 7 de octubre de 2026. El padre exige «lámina enseñada» antes de construir. Este directorio contiene diseño y simulación local, sin Svelte de producción ni escrituras en el backend.

Baseline: `fb5ebe6e946b624d87c1cca91dafdd862c19c93a`. Se usa su CSS real, incluido el contraste de texto secundario ya aprobado. La propuesta no reabre identidad ni tokens.

Abrir [la lámina](lamina.html), o sus tres pantallas autocontenidas:

1. [Encontrar la acción](01-buscar.html).
2. [Completar y crear](02-crear.html).
3. [Volver con la etiqueta seleccionada](03-seleccionada.html).

Controles de revisión: tres temas existentes, claro/oscuro/sistema en pantallas, ES/EN, estados y viewport 390/1440 en lámina. Las pantallas aceptan `?mode=dark&lang=en&theme=aquelarre&state=duplicate`. Los controles reinician la simulación; no representan controles del producto.

## Dirección: evolución de C2

**Continua, explícita, contenida.** La creación nace junto a la búsqueda de la relación, con el botón secundario del sistema. El diálogo `AdminDialog` concentra la acción sin cambiar de página: nombre de la entidad, campos reales y una única acción principal, «Crear y seleccionar». Al terminar, el chip existente y una confirmación devuelven la atención a la relación. La marca «sin guardar» del padre permanece visible.

Esto resuelve dos interrupciones: salir a crear la etiqueta y regresar buscando el registro recién creado; y confundir la creación del destino con el guardado de la entrada. La segunda exige copy explícito antes de guardar: el registro destino tiene vida propia, aunque después se descarte la entrada.

Referencias verificadas: dirección C2 del proyecto; `Relation.svelte`, `AdminDialog.svelte`, `admin.css`, `FieldRow.svelte`, `RecordForm.svelte`, `form-model.ts`, `backend/access.ts`, `model/types.ts`. La checklist de siete ejes se aplica abajo.

## Esquema y contenido reales

El Blog de `src/lib/backend/site-seeding-blog.ts` tiene relación múltiple `posts.tags → tags`, título `tags.name`, `slugField: 'slug'` y dos campos obligatorios: `name` (80 caracteres) y `slug` (80, único). No basta con enviar un nombre. `Taller` / `taller` proceden del fixture real de `site-seeding-modules.test.ts`; el título «Migrar el blog de Hugo a Astro sin romper las URLs» procede de `session/demo-seed.ts`. Su combinación es un montaje declarado, no un registro de producción. Para texto largo se reutiliza ese título real como contenido de estrés del campo, sin presentarlo como etiqueta existente.

La interfaz traduce acciones y feedback. Nombres de colecciones, `Dirección (slug)`, su ayuda y los valores siguen el manifiesto/datos sin pasar por `t()`; por eso algunos textos siguen en castellano al elegir English. No se traducen los contenidos del usuario.

## Contrato de UX propuesto

### 1. Disponibilidad de la acción

La relación conserva selección, búsqueda con debounce, candidatos, caché de títulos y `maxSelect` existentes. Añade una acción secundaria «Crear etiqueta “Taller”…» después de los resultados. También se permite «Crear etiqueta…» con búsqueda vacía. Pulsar Enter en el buscador **no crea**; la acción siempre es explícita.

Se ofrece solo cuando el campo y el padre permiten editar la relación, el destino está resuelto y es creable, la señal de visibilidad de creación del modelo lo permite y hay capacidad para seleccionarlo. La condición se integra con el contrato técnico L13 confirmado por la sesión principal: `hideCreate: boolean` (default `false`) y la señal resuelta `canCreateManually`, sin alterar `permissions`. La señal de UI no es autorización: el backend conserva la última palabra. Se reutilizan `target.permissions.create` y la composición actual de `accessBypass`, `readonly` y reglas condicionales; no se interpreta la expresión del servidor en cliente.

| Situación                                            | Presentación                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campo o padre readonly                               | Valores legibles; sin crear, buscar, quitar ni emitir cambios.                                                                                   |
| Destino readonly / permiso create denegado           | Seleccionar existentes sigue disponible si el padre es editable. No se ofrece crear. No se insinúa que esté denegada la lectura.                 |
| Creación oculta por configuración                    | No se ofrece crear; sin mensaje de «sin permiso» porque no es una regla de seguridad.                                                            |
| Regla create condicional o desconocida               | Se puede ofrecer según el criterio existente de P2; el servidor puede rechazar. El error conserva ambos formularios.                             |
| `maxSelect` alcanzado                                | Crear inactivo con explicación «Quita una etiqueta…». No crear un registro que no se puede incorporar.                                           |
| Destino desconocido                                  | Mantener la degradación existente. No adivinar un esquema ni crear a ciegas.                                                                     |
| Destino sin `titleField`                             | Acción genérica; formulario completo, sin prefijar un campo supuesto. Etiqueta posterior = id como hoy.                                          |
| Singleton, colección interna o destino especializado | No anunciar creación genérica hasta resolver su contrato. Medios conserva el flujo propio de subida/biblioteca; no recibe este diálogo genérico. |

Si hay coincidencias visibles, se muestran primero; una igualdad de nombre no prueba unicidad, y una búsqueda vacía no prueba que no exista un registro oculto por las reglas de lectura. Nada de fusiones silenciosas ni bypass de ListRule/ViewRule.

### 2. Abrir: preservar el origen y completar el destino

Se mantiene montado el formulario padre, incluidos texto, selección, ficheros pendientes y posición de scroll. Abrir el diálogo no guarda el padre, no cambia su baseline y no navega. El diálogo usa el esquema **resuelto** de destino y todos sus campos aplicables en orden, con sus grupos, widgets, ayudas, requeridos y errores. Readonly/unsupported se representan conforme a P5 y se excluyen de la escritura.

El término buscado puede rellenar el `titleField` escribible cuando es compatible; no rellena otro campo por heurística. El slug solo se propone mediante la capacidad declarada `slugField`, preservando la edición manual, igual que el formulario normal. En el mockup, el fixture conocido `Taller` propone `taller`; no es un slugificador alternativo de producto.

**Reuso:** `AdminDialog` ya aporta marco de 26 rem, máximo de altura, scroll, trampa de foco, Escape, busy y restitución de foco. `RecordForm` ya aporta `onSubmit` / `onSaved`, modelo, validación y widgets, pero incluye barra de página, navegación y guard de salida. No se debe incrustar el formulario entero con sus controles globales dentro de otro `<form>`: adaptar/reutilizar su cuerpo y controlador con contexto de presentación modal, IDs de campo con scope propio y submit independiente. No duplicar validación ni crear un «formulario rápido» que omita campos requeridos.

Recomendación de alcance: un solo nivel de creación modal. Las relaciones internas del destino permiten seleccionar existentes; su creación encadenada requeriría otra decisión de navegación/foco. Si falta un requerido no representable o un destino exige un editor especializado, el diálogo explica el límite y preserva ambos borradores; no envía una creación parcial. Esta limitación se debe revisar antes de implementar, no descubrirla después de guardar mal.

### 3. Guardar y seleccionar

«Crear y seleccionar» valida lo mínimo permitido por P5 y llama al puerto de creación del destino con datos escribibles. Campos y acciones quedan ocupados; cerrar/Escape y doble submit no ejecutan nada mientras la petición está en vuelo. Los botones mantienen su lugar en el recorrido de foco mediante `aria-disabled`, siguiendo `AdminDialog`.

Éxito confirmado devuelve el registro real y su id. Se reasienta únicamente el baseline del hijo y se actualiza la caché de títulos del widget. La relación simple sustituye su selección; la múltiple añade una sola vez al final, conservando orden y seleccionados anteriores. La restricción de cardinalidad se vuelve a comprobar al incorporar. El padre recibe el cambio mediante su `onChange`; sigue dirty, sin guardado automático. Limpiar búsqueda, cerrar diálogo, enfocar el chip incorporado y anunciar «Etiqueta creada y seleccionada. La entrada sigue sin guardar».

Si la etiqueta se creó pero no se puede incorporar (cambio de permisos, límite o contexto), comunicar **«Etiqueta creada; no se ha añadido a la entrada»** y conservar su identificación visible. No borrar automáticamente el destino ni volver a crearlo; no afirmar selección si falló. La operación del padre y la creación del hijo no son una transacción atómica.

### 4. Cancelación, duplicados y errores

- Cancelar/Escape/cerrar sin edición adicional descarta solo el borrador hijo. Si el usuario ha cambiado el hijo, el mismo diálogo cambia a confirmación «¿Descartar esta etiqueta?», con foco inicial en «Seguir editando»; no se abre una pila de modales. El padre permanece intacto. Un prefijo inicial procedente de la búsqueda no fuerza una confirmación vacía.
- Volver del diálogo devuelve el foco al disparador; tras éxito, al nuevo chip. Si el disparador desapareció, se usa el campo de relación como fallback. No se reinicia el padre.
- `validation`: error junto al campo y foco al primer error; `''` es error de registro. Un slug duplicado conserva todos los valores, explica el conflicto y ofrece el registro existente solo si realmente es visible. «Usar existente» selecciona ese id, sin crear ni fusionar. Cambiar la dirección permite intentar una creación diferente, si el backend la acepta.
- `forbidden`, `auth-expired`, `network` y errores no de validación siguen `ctx.feedback.reportError`. Un error local contextual complementa el feedback; no crea otro sistema de avisos. Re-login tapa, no desmonta, conforme a P3/P5.
- Tras perder conexión durante el envío, el resultado puede ser incierto. Mantener el borrador y explicar la incertidumbre; buscar/reconciliar antes de ofrecer una repetición que pueda duplicar datos. La ausencia en búsqueda no acredita que el registro no exista. Sin una señal fiable del backend no se promete «no se creó» ni un retry idempotente.
- Crear un destino y luego descartar el padre deja el destino creado. La nota previa al CTA lo explica. Quitar el chip solo modifica la relación; no elimina el registro destino.

### 5. Ajustes contractuales que requiere una implementación aprobada

P5 D-P5.11 recomienda navegar a la edición tras crear. Proponer una excepción **acotada al contexto modal de relación**: devolver el registro, reasentar el hijo, seleccionar y restaurar foco sin navegación. L-P5.6 sigue intacta para el padre; no se le asigna el baseline del hijo ni se registran dos guards compitiendo por la misma salida. L-P5.9 incorpora creación opcional sin fuga del puerto; la firma del widget controlado permanece.

P2 consume `canCreateManually`, derivado también de `hideCreate` (boolean, default `false`) según el contrato L13 confirmado por la sesión principal. Los permisos permanecen intactos: lookup y selección existentes no se esconden junto con la creación. P7 no cambia: se consumen tokens existentes. La ayuda actual del módulo Blog («Aquí solo se eligen») queda obsoleta al aprobar la funcionalidad: actualizar la fuente de sembrado y resolver el tratamiento de manifiestos ya existentes por el mecanismo autorizado, sin sobreescribir customizaciones del usuario.

## Copy nueva propuesta, con paridad ES/EN

| Intención          | Español                                                                                                                            | English                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Acción de búsqueda | Crear etiqueta «{name}»…                                                                                                           | Create tag “{name}”…                                                                                              |
| CTA de guardado    | Crear y seleccionar                                                                                                                | Create and select                                                                                                 |
| Persistencia       | La etiqueta se guarda ahora. La entrada se guarda después, con «Guardar». Si descartas la entrada, la etiqueta seguirá existiendo. | The tag is saved now. Save the entry afterwards using “Save”. If you discard the entry, the tag will still exist. |
| Éxito              | Etiqueta «{name}» creada y seleccionada. La entrada sigue sin guardar.                                                             | Tag “{name}” created and selected. The entry is still unsaved.                                                    |
| Guardado           | Creando…                                                                                                                           | Creating…                                                                                                         |
| Descartar          | ¿Descartar esta etiqueta?                                                                                                          | Discard this tag?                                                                                                 |
| Fallo parcial      | Etiqueta creada; no se ha añadido a la entrada.                                                                                    | Tag created; it has not been added to the entry.                                                                  |

Los ejemplos con «etiqueta» se parametrizan con el nombre singular **resuelto**, sin adivinar plurales ni géneros por el nombre de tabla. Guardar/Cancelar/Cerrar, búsqueda, vacío y quitar reutilizan claves existentes. Las nuevas claves pertenecen a `form.relation.*`; la simulación no las añade al diccionario de producto.

## Medidas, responsive y accesibilidad

Diálogo: marco existente de 26 rem máximo, padding 1,5 rem, gap 0,9 rem y radio 10 px de `admin.css`. Velo existente de `AdminDialog`. Título 1,1 rem; labels y ayudas con escalas del sistema, cuerpo base 14 px. Campos y acciones usan `--pad-field`, `--r`, `--surface`, `--ink`, `--ink-2`, `--accent-fill`, `--accent-ink` y semánticos existentes. No se introduce otro set de tokens.

A 1440, el padre conserva el rail de 236 px y el diálogo se centra. A 390, desaparece el rail y el diálogo ocupa el ancho disponible entre gutters de 1 rem; scroll interior si excede el alto, acciones apiladas y principal primero. Texto largo envuelve; chips respetan `min-width:0` y `overflow-wrap:anywhere`. No hay animaciones. Targets táctiles de al menos 44 px; labels asociados, requeridos visibles, errores descritos y foco visible. Orden: cierre → campos → acciones; primer foco en el título/nombre escribible, error mueve al campo; cancelación y éxito restauran el foco según su resultado.

## Checklist de siete ejes

| Eje                    | Estado estático       | Evidencia/límite                                                                                                                  |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tokens                 | Cubierto              | CSS real del baseline certificado; sin tokens nuevos. Medición pura de los pares consumidos en `contrast.json`.                   |
| Componentes/estados    | Cubierto en propuesta | Normal, vacío, loading, error, duplicado, readonly, denied, oculto, límite y cancelación con cambios. No es ejecución de backend. |
| Responsive             | Parcial               | Composición preparada a 390/1440; capturas coordinadas pendientes.                                                                |
| Accesibilidad          | Parcial               | Contraste puro, foco, labels y targets previstos; prueba de navegador y tecnologías de asistencia pendientes.                     |
| Contenido real/límites | Cubierto              | Esquema Blog real, dos requeridos y unicidad, fixtures citados, largo y cero seleccionados.                                       |
| Feedback               | Cubierto en propuesta | Guardado independiente, error local/global, resultado incierto y éxito parcial especificados. Integración real pendiente.         |
| Assets                 | No aplicable          | Sin identidad ni assets nuevos; controles del sistema.                                                                            |

## Reproducción y límites

Con Node 22 y dependencias existentes: `node design/mockups/2026-10-07-crear-relacion/generate.mjs`. Solo escribe este directorio. El JS simula selección, cancelación y errores para revisar interacción; no es un prototipo conectado, una implementación ni QA de Vega. No valida reglas de PocketBase, carreras reales, duración de peticiones, teclado del móvil ni lectores de pantalla.

Cierre de este encargo de diseño: lámina revisable, contrato propuesto y evidencia de mockup. Cierre de la tarea Lumbre: lámina enseñada, implementación real, estados/tamaños/temas y gate del candidato, conforme al padre. No marcarla cerrada al generar estos ficheros.
