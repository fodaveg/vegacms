# Encargo — Una imagen dentro de un bloque: que se pueda RECONOCER cuál se está eligiendo

## Contrato de tarea

```yaml
task_id: block-image-relation-picker
prompt_hash: 8c40a88932464d1486fdcf5e58ed87f0eb5d6f7d9957659c3dc72eb93ba778c0
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
repos:
  - repo_id: vegacms
    base_sha: c0d63afec0f7dea5dac43364d02e5ae05bf109f9
    branch: feat/block-image-relation-picker
    worktree: /private/tmp/vegacms-block-image-relation-picker
external_inputs:
  - 'NINGUNO. Todo lo que necesitas está en el árbol declarado. No hace falta ningún servidor'
scope_in:
  - 'src/lib/form/widgets/Relation.svelte: que los candidatos de una relación cuyo destino es
    `vega_media` se puedan RECONOCER (miniatura + nombre), en vez de listarse por su id crudo. Ver
    la causa medida en `invariants`'
  - 'El caso `target === null` de ese mismo widget: hoy es un hueco MUDO. Ver el invariante'
  - 'Su suite `src/lib/form/widgets/Relation.svelte.test.ts` y la de `relation-search.ts` en lo que
    toque'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ `src/lib/media/MediaPicker.svelte`, `media-picker.ts`, `media-picker-state.svelte.ts`,
    `ctx.mediaPicker` (`src/lib/app-context.ts:59-66,96-103`), `src/lib/form/widgets/FileInput.svelte`
    y `src/routes/+layout.svelte:26-29,261-264,298-309`. NO los toques y NO los uses. Ver el
    invariante que explica por qué ese componente NO sirve aquí'
  - '⚠️ `src/routes/media/` ENTERO. La mediateca no cambia'
  - '⚠️ Rediseñar `Relation.svelte` para el resto de destinos. El camino de un `relation` normal, con
    `titleField` y con búsqueda, NO puede cambiar de comportamiento en NADA'
  - '⚠️ `resolveMediaGridSrc` y `mediaGridThumbOpts` (`src/lib/media/media-thumb.ts:31-45`): se USAN
    TAL CUAL, no se generalizan ni se les añade un parámetro de tamaño. Que la miniatura del
    selector pida 300x300 como la de la mediateca es DECISIÓN TOMADA: reusar una función ya probada
    vale más que ahorrar unos kilobytes'
  - 'EL PULIDO VISUAL: rejilla, tamaños, espaciados, hover. Eso lo mira David en un navegador y lo
    ajusta él. Tu trabajo es que se RECONOZCA la imagen, no que sea bonito'
  - 'La subida de ficheros nuevos desde el bloque. Esta tarea SELECCIONA de lo que ya hay. Si crees
    que hace falta subir desde aquí, PROPÓNLO en el informe; no lo construyas'
  - 'Que `ctx.model` se recargue cuando la mediateca crea la colección
    (`src/routes/media/+page.svelte:173-179`). Es un defecto REAL y ADYACENTE, con su propia tarea.
    Tú solo tienes que hacer que su síntoma deje de ser mudo. NO lo arregles'
  - 'El manifiesto, su esquema y `resolveBlockField`: el vocabulario ya está y no se toca'
  - 'src/lib/backend/ ENTERO. La columna ya se deriva bien (block-schema.ts:96-103)'
  - 'extensions/ ENTERO'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Un campo de bloque `widget: "relation"`, `source: "record"` cuyo destino es `vega_media` lista
    candidatos que se distinguen por su MINIATURA y su NOMBRE. Hoy lista sus ids crudos'
  - 'Un asset SIN `title` ni `alt` (el caso normal recién subido) se identifica por su NOMBRE DE
    FICHERO. Este es EL criterio del lote: hoy ese caso muestra un id de 15 caracteres'
  - 'Un asset que NO es una imagen (un PDF) SE MUESTRA y SE PUEDE ELEGIR, con su distintivo de tipo
    en vez de miniatura. Ver la decisión ya tomada en `invariants`'
  - 'El caso MÚLTIPLE (`images`) permite elegir varios y quitarlos, con el orden que ya define
    `toggleRelationSelection`'
  - 'La selección se guarda como columna física real y sobrevive a recargar el registro'
  - '⚠️ Un `relation` cuyo destino NO es `vega_media` se comporta EXACTAMENTE igual que hoy, tanto
    con `titleField` como en su modo degradado. Con test que lo fije'
  - '⚠️ Un `relation` a `vega_media` cuyo `target` NO se resuelve muestra un mensaje que explica qué
    pasa. Hoy no muestra NADA. Con test'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - '`pnpm check`, `pnpm lint`, `pnpm test` y `pnpm build` verdes, con salida literal'
adversaries:
  - '⚠️ `vega_media` con CERO registros: el editor no ha subido nada. Es el primer contacto real de
    un proyecto recién sembrado. Ver el estado vacío DECIDIDO en `invariants`'
  - 'Un asset con `title` puesto a mano desde la mediateca: manda el `title`, no el nombre de
    fichero. Eso ya lo decide `mediaDisplayName` y no lo reimplementas'
  - 'Un registro de `vega_media` cuyo `fileRef` es null o cuyo fichero ya no está: no puede pintar un
    `<img>` roto'
  - 'Muchos registros: la paginación tiene que existir, no cargar todo de golpe'
  - 'Un valor YA GUARDADO que apunta a un registro de media BORRADO. Ver `preexisting_data_cases`'
  - 'Un `relation` a `vega_media` declarado FUERA de un bloque, si el modelo permite declararlo:
    tiene que comportarse igual, porque la decisión se toma por DESTINO, no por contexto'
  - 'El puerto `memory` LANZA `notFound` cuando una `FileRef` sembrada no tiene fichero real detrás
    (`media-thumb.ts:53-56`). Una rejilla no se puede caer por eso'
preexisting_data_cases:
  - '⚠️ Un valor guardado que apunta a un registro de media BORRADO: el id se conserva BYTE POR BYTE.
    NO se filtra al inicializar, NO se emite `onChange` durante la carga, y NO se sobrescribe al
    guardar. Aparece marcado como no encontrado y solo desaparece por una acción EXPLÍCITA del
    usuario. Es exactamente lo que ya hace el widget para destinos resueltos
    (`Relation.svelte:203-234,276-293`) y no puede empeorar'
  - 'Un valor múltiple preexistente con el MISMO id repetido: se conserva tal cual. El selector no
    puede fabricar duplicados (`toggleRelationSelection` alterna), así que un duplicado solo puede
    venir de fuera y no es tuyo el borrarlo'
  - 'Un bloque que YA tiene una imagen guardada: al abrir el formulario aparece seleccionada y
    RECONOCIBLE, no como un id. Es lo que distingue «funciona» de «parece que funciona»'
invariants:
  - '⚠️ LA CAUSA REAL, MEDIDA HOY CONTRA LA BASE, y NO es la que dice el título de la tarea. El
    widget SÍ resuelve su destino y SÍ ofrece candidatos. `vega_media` está en `ContentModel.types`
    (`load.ts:135-163` los toma de `port.listContentTypes()`, y `schema.ts:16-39` solo excluye
    sistema/auth/`_`), y `resolve.ts:1309-1330` se limita a forzarla a `hidden: true`. Además tiene
    un campo `title`, así que `resolveTitleField` (`conventions.ts:72-73`) la da por buscable y el
    widget NI SIQUIERA está degradado. Lo que falla es la IDENTIFICACIÓN: `titleOf`
    (`relation-search.ts:106-110`) devuelve `record.id` cuando el `titleField` está vacío, y la
    subida crea el registro con el fichero Y NADA MÁS (`media-upload-state.svelte.ts:141`), así que
    `title` está vacío SIEMPRE salvo que alguien lo haya escrito a mano. Resultado: el editor ve una
    lista de ids de 15 caracteres y no puede saber cuál es cuál. VERIFÍCALO tú antes de tocar nada:
    si te encuentras otra cosa, PARA y dilo'
  - '⚠️ NO metas `vega_media` dentro de `ContentModel.types`: YA ESTÁ. Y no la quites de ahí'
  - '⚠️ `MediaPicker.svelte` NO SIRVE PARA ESTO y no es un descuido del encargo. Su contrato es
    devolver una COPIA de los bytes como `File` (`MediaPicker.svelte:11-18,147-164`), declara como
    invariante que `mediaId` NUNCA cruza al valor persistible (`media-picker.ts:8-17,33-44`), enseña
    siempre el aviso de copia (`:242-245`) y su i18n dice literalmente que se inserta una copia
    (`i18n/es.ts:759-766`, `en.ts:729-736`). Usarlo aquí guardaría un id contradiciendo su propio
    invariante y enseñaría un mensaje falso. No lo uses, no lo amplíes, no le añadas un segundo modo'
  - '⚠️ LO QUE SÍ REUSAS son las piezas NEUTRAS, que ya existen, son PURAS y están probadas:
    `toMediaItemView(record)` (`media-item.ts:61-63`, no toca el puerto), `mediaDisplayName`
    (`media-item.ts:84`), `mediaImgAlt` (`media-item.ts:94`), `resolveMediaGridSrc`
    (`media-thumb.ts:37-45`, que ya devuelve `null` cuando no es imagen o no hay `fileRef`) y
    `mediaExtensionBadge` / `classifyMediaAssetType` (`media-card.ts:52,57`). Si alguna no encaja,
    DILO en el informe en vez de duplicarla'
  - '⚠️ LA DISCRIMINACIÓN ES POR DESTINO Y EN UN SOLO SITIO: se compara `schema.target` con
    `VEGA_MEDIA_COLLECTION.name` (`src/lib/media/media-collection.ts:41`), que es un dato que el
    widget ya tiene. No la deduzcas del nombre del campo, ni de que sea múltiple, ni del bloque'
  - '⚠️ DECIDIDO, no lo reabras — UN ASSET QUE NO ES IMAGEN (PDF) SE MUESTRA Y SE PUEDE ELEGIR, con
    su distintivo de tipo en lugar de miniatura. Razón: la colección canónica acepta PDF a propósito
    (`media-collection.ts:41-50`) y un bloque que enlaza un folleto es legítimo. La mediateca ya los
    lista igual. NO los ocultes, NO los deshabilites'
  - '⚠️ DECIDIDO, no lo reabras — ESTADO VACÍO: cuando `vega_media` no tiene ni un registro, el
    selector dice que la mediateca está vacía y que los archivos se suben desde la sección Medios.
    Texto en `i18n/es.ts` y `en.ts`, como todo lo demás. NO se pinta un botón de subir (subir desde
    aquí está fuera de alcance) y NO se deja el hueco mudo'
  - '⚠️ DECIDIDO, no lo reabras — CUANDO `target` NO SE RESUELVE, el widget dice que ese destino no
    está disponible todavía, en vez de no pintar nada. Hoy las dos vías de carga arrancan con un
    guard sobre `target` (`Relation.svelte:144` y `:175`) y el control queda MUDO. Ese estado es
    alcanzable de verdad: la mediateca crea la colección y actualiza sus tipos locales sin recargar
    `ctx.model` (`src/routes/media/+page.svelte:173-179`). ARREGLAR ESA RECARGA NO ES TUYO; que el
    síntoma deje de ser mudo, SÍ'
  - 'El comentario de `Relation.svelte:69-71` llama a ese caso «defensivo (no debería pasar)». Es
    FALSO y tu cambio tiene que dejarlo diciendo la verdad'
  - 'La cardinalidad ya está resuelta por convención v1: un `relation` de bloque es MÚLTIPLE solo si
    el campo se llama literalmente `images` (block-schema.ts:96-103). No la reinventes'
  - 'El widget NUNCA conoce PocketBase: habla con `ctx.port` y con el `ContentModel` resuelto
    (D-P5.9). Eso no cambia, y `resolveMediaGridSrc` respeta esa frontera porque la URL la construye
    el puerto'
repeat_interrupt_revert_behavior:
  - 'Abrir el formulario, elegir, cerrar sin guardar y volver a abrir: no queda nada pegado'
  - 'Guardar, recargar y reabrir: la selección sigue ahí, y sigue siendo reconocible'
  - 'Elegir y volver a pulsar el mismo asset lo DESELECCIONA, que es lo que ya hace
    `toggleRelationSelection`. El estado «sucio» del formulario lo refleja'
measurement_reference_systems:
  - 'Que «se reconoce» se mide leyendo el TEXTO que ve el usuario en cada candidato y comprobando
    que NO es el id del registro. Un test que compruebe que hay N botones no mide nada: hoy ya hay N
    botones y el bug es justamente lo que ponen'
  - 'Que la miniatura está se mide sobre el `src` que el puerto devolvió para ESE registro, no sobre
    la existencia de un `<img>`'
  - 'Que «se guarda» se mide leyendo el registro del backend después de guardar, no el estado del
    formulario'
  - 'El orden del caso múltiple se mide leyendo el array guardado, no el orden de pintado'
measurement_invalidation_conditions:
  - 'Un test que fabrique registros de media CON `title` relleno no mide nada: el caso que rompe es
    el `title` VACÍO, que es el que produce la subida real'
  - 'Un test que monte el widget con un `ContentModel` donde `vega_media` NO esté no mide el bug de
    hoy: sí está, y de ahí venía el diagnóstico equivocado que este encargo corrige'
  - 'Si al sabotear el reconocimiento del destino media cae un test del camino `relation` normal, tu
    sabotaje apuntó al sitio equivocado'
product_decisions_reserved_to_david:
  - 'CÓMO SE VE el selector: es suyo y lo ajusta él en el navegador. Haz algo funcional y sobrio'
  - 'Si hace falta poder SUBIR desde el bloque: propón, no construyas'
  - 'Los assets no-imagen, el estado vacío y el destino sin resolver YA ESTÁN DECIDIDOS arriba. No
    los marques como revisables ni los reabras'
repo_claims_that_may_become_false:
  - file: src/lib/form/widgets/Relation.svelte
    section_or_quote:
      'El comentario de las líneas 69-71: «Defensivo (no debería pasar — el manifiesto/esquema
      garantiza `target` válido, L11)». Es FALSO hoy'
  - file: src/lib/form/widgets/Relation.svelte
    section_or_quote:
      'La cabecera (línea 4): «los pinta como una selección de botones-toggle» por su `titleField`.
      Deja de ser toda la verdad en cuanto haya un camino por destino'
  - file: src/lib/media/media-collection.ts
    section_or_quote:
      'El comentario sobre los thumbs declarados «de forma DEFENSIVA», que dice que 120x120 entraría
      en juego «si un día un picker/listado renderiza `vega_media`». Ese día es este, aunque este
      lote acabe pidiendo 300x300: la frase tiene que reflejar quién los consume de verdad'
  - file: src/lib/media/media-item.ts
    section_or_quote: 'Cualquier afirmación sobre quién consume estas funciones puras'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
required_behavioral_qa:
  - '⚠️ Con assets SIN `title`: abrir un bloque con campo de imagen y CITAR literalmente el texto de
    cada candidato. Es el QA que define el lote'
  - 'Con `vega_media` VACÍA: comprobar qué se ve. No puede ser un hueco mudo'
  - 'Con un PDF entre los assets: comprobar que se ve, que se puede elegir y que no hay `<img>` roto'
  - 'Con varios assets: elegir uno, guardar, recargar y comprobar que sigue y se reconoce'
  - 'En un campo `images`: elegir dos, guardar, recargar, comprobar orden'
  - 'Un `relation` a una colección normal: comprobar que su comportamiento NO cambió'
expected_reports:
  - /private/tmp/vega-informes/block-image-relation-picker.md
known_unverifiable_items:
  - 'El gate completo NO corre entero en el sandbox: PocketBase no puede abrir puerto (`EPERM
    listen`) y Playwright no registra su puerto Mach. No pelees: corre las suites de componente que
    puedas, DI cuáles no, y sigue. El gate autoritativo lo paso yo'
  - 'El juicio visual es de David y no lo puedes emitir tú'
```

## Por qué existe

Una imagen dentro de un bloque no puede ir en el JSON: los campos `file` de PocketBase son **por
columna**, así que la imagen es una **relación a un registro de `vega_media`**. Eso no es un rodeo,
es la regla de frontera funcionando, y encima devuelve el «¿dónde se usa este asset?» dentro de los
bloques.

El manifiesto lo declara así, la columna ya se deriva, el campo ya se pinta, ya se guarda **y el
widget ya ofrece candidatos**. El problema es que los ofrece **por su id**: una lista de cadenas de
15 caracteres, sin miniatura y sin nombre de fichero, porque la subida deja el `title` vacío y ese
es el único dato con el que el widget sabe nombrar a un registro. Elegir una imagen ahí es adivinar.

Este encargo corrige un diagnóstico anterior que era falso: decía que el widget no resolvía su
destino. Sí lo resuelve. Lo que no hace es dejar reconocer lo que ofrece.

## Lo que hay que construir

Que una relación a `vega_media` presente a sus candidatos como lo que son: **miniatura y nombre**.
Reusando las funciones puras que ya existen en `src/lib/media/`, y **sin tocar el `MediaPicker`**,
que hace otra cosa.

**El listón:** que un editor abra un bloque `image` en un proyecto recién sembrado, suba dos fotos
desde Medios sin escribirles ningún título, vuelva al bloque y sepa cuál es cuál.

## Verificación

- **Los seis QA conductuales.** El primero es el lote entero: si los candidatos siguen enseñando
  ids, no has arreglado nada aunque todo esté verde.
- **Rompe un guardarraíl a propósito**: haz que el reconocimiento del destino media falle y comprueba
  que cae el test del TEXTO de los candidatos, no el de que el componente monta. Antes de sabotear,
  árbol limpio y tu cambio ya commiteado; la restauración se hace desde el estado guardado, nunca
  desde el índice, y después compruebas que tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `c0d63af`, rama `feat/block-image-relation-picker` y su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay otro lote sobre este mismo repo ahora mismo** (`endurecimiento-pre-despliegue`), que toca
  `extensions/vegabuild/` y `src/lib/backend/site-seeding.ts`. Tú no entras ahí. Si necesitas algo de
  esos ficheros, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/block-image-relation-picker.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
