# Encargo — Una imagen dentro de un bloque: que se pueda RECONOCER cuál se está eligiendo

## Contrato de tarea

```yaml
task_id: block-image-relation-picker
prompt_hash: PENDIENTE
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
revision: 3
revision_nota: 'La v1 declaraba una causa FALSA (que el widget no resolvía su destino) y su crítico
  la tumbó. La v2 corrigió la causa pero se cayó con otro BLOQUEANTE: un editor de `vega_editors` no
  puede ni LISTAR `vega_media`, porque el sembrado no escribe reglas de acceso, así que el lote
  habría nacido muerto contra el usuario al que va dirigido. Esta v3 se apoya en el lote
  `reglas-de-acceso-del-sitio-sembrado`, que abre esa lista a los editores, y resuelve los otros
  ocho hallazgos'
no_despachar_hasta:
  - '⚠️ ESTE LOTE NO SE DESPACHA hasta que `reglas-de-acceso-del-sitio-sembrado` esté INTEGRADO en
    `main`, y su `base_sha` tiene que ser ese merge. Sin las reglas, `ctx.port.list("vega_media")`
    devuelve 403 para un editor y todo el lote es indemostrable. Lo rellena el integrador antes de
    despachar, y recalcula el `prompt_hash`'
repos:
  - repo_id: vegacms
    base_sha: PENDIENTE_MERGE_DE_LAS_REGLAS
    branch: feat/block-image-relation-picker
    worktree: /private/tmp/vegacms-block-image-relation-picker
external_inputs:
  - 'NINGUNO. Todo lo que necesitas está en el árbol declarado. No hace falta ningún servidor'
scope_in:
  - 'src/lib/form/widgets/Relation.svelte: que los candidatos de una relación cuyo destino es
    `vega_media` se puedan RECONOCER (miniatura + nombre), en vez de listarse por su id crudo. Ver
    la causa medida en `invariants`'
  - 'src/lib/form/widgets/relation-search.ts, si tu modelo de candidato o su caché lo necesitan'
  - '⚠️ `src/lib/i18n/es.ts` y `src/lib/i18n/en.ts`: los textos nuevos van ahí, como todo lo demás.
    Estaban fuera del alcance de la v2 por descuido y eran obligatorios'
  - '⚠️ CREAR `src/lib/form/widgets/Relation.svelte.test.ts`: ese fichero NO EXISTE en el árbol. No
    es «su suite», es una suite que tienes que escribir'
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
    TAL CUAL, no se generalizan ni se les añade un parámetro de tamaño'
  - '⚠️ LAS REGLAS DE ACCESO de `vega_media` y la spec canónica `media-collection.ts`: son de otro
    lote, que va DELANTE de este. Tú las das por hechas y no las tocas'
  - '⚠️ EL DUPLICADO EN UN VALOR MÚLTIPLE. Es un defecto PREEXISTENTE y agnóstico del destino (la
    lista de seleccionados usa un bloque keyed por el propio id, `Relation.svelte:276`, y quitar una
    aparición filtra TODAS, `:255`). Tiene su propia tarea. NO lo arregles aquí; solo DILO en el
    informe si te lo cruzas'
  - 'EL PULIDO VISUAL: rejilla, tamaños, espaciados, hover. Eso lo mira David en un navegador y lo
    ajusta él. Tu trabajo es que se RECONOZCA la imagen, no que sea bonito'
  - 'La subida de ficheros nuevos desde el bloque. Esta tarea SELECCIONA de lo que ya hay. Si crees
    que hace falta subir desde aquí, PROPÓNLO en el informe; no lo construyas'
  - 'Que `ctx.model` se recargue cuando la mediateca crea la colección
    (`src/routes/media/+page.svelte:173-179`). Es un defecto REAL y ADYACENTE, con su propia tarea.
    Tú solo tienes que hacer que su síntoma deje de MENTIR. NO lo arregles'
  - 'El manifiesto, su esquema y `resolveBlockField`: el vocabulario ya está y no se toca'
  - 'src/lib/backend/ ENTERO'
  - 'extensions/ ENTERO'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Un campo de bloque `widget: "relation"`, `source: "record"` cuyo destino es `vega_media` lista
    candidatos que se distinguen por su MINIATURA y su NOMBRE. Hoy lista sus ids crudos'
  - 'Un asset SIN `title` ni `alt` (el caso normal recién subido desde Medios) se identifica por su
    NOMBRE DE FICHERO. Este es EL criterio del lote: hoy ese caso muestra un id de 15 caracteres'
  - 'Un asset que NO es una imagen (un PDF) SE MUESTRA y SE PUEDE ELEGIR, con su distintivo de tipo
    en vez de miniatura. Ver la decisión ya tomada en `invariants`'
  - '⚠️ El destino media se NAVEGA PAGINADO y NO tiene buscador. Ver la decisión y su porqué en
    `invariants`. Con test de que se puede pasar de página'
  - '⚠️ CUATRO ESTADOS DISTINGUIBLES en la lista de candidatos media: cargando, listo-y-vacío,
    listo-con-elementos, y ERROR. Con un test en el que `ctx.port.list` RECHAZA y se comprueba que
    NO aparece el mensaje de mediateca vacía. Ver el invariante'
  - 'El caso MÚLTIPLE (`images`) permite elegir varios y quitarlos, con el orden que ya define
    `toggleRelationSelection`'
  - 'La selección se guarda como columna física real y sobrevive a recargar el registro'
  - '⚠️ Un `relation` cuyo destino NO es `vega_media` se comporta EXACTAMENTE igual que hoy, tanto
    con `titleField` como en su modo degradado, INCLUIDO su mensaje cuando el destino no se resuelve.
    Con test que lo fije'
  - '⚠️ Un `relation` a `vega_media` cuyo `target` NO se resuelve muestra un mensaje ESPECÍFICO de ese
    caso. Con test. Ver el invariante: hoy no está mudo, está MINTIENDO'
  - 'Un registro de media cuyo fichero no se puede resolver degrada a su distintivo y NO tumba la
    lista. Con test en el que `fileUrl` LANZA'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - '`pnpm check`, `pnpm lint`, `pnpm test` y `pnpm build` verdes, con salida literal'
adversaries:
  - '⚠️ `vega_media` con CERO registros: el editor no ha subido nada. Es el primer contacto real de
    un proyecto recién sembrado. Ver el estado vacío DECIDIDO en `invariants`'
  - '⚠️ `ctx.port.list` RECHAZA con un error de permisos o de red. Hoy la carga asigna
    `candidates = []` ante cualquier error (`Relation.svelte:151`) y la presentación solo mira la
    longitud (`:345`), así que un fallo se ve como «no hay nada». Ese es el adversario que más
    importa de este lote: un error disfrazado de vacío hace perder una tarde'
  - 'Un asset con `title` puesto a mano desde la mediateca: manda el `title`, no el nombre de
    fichero. Eso ya lo decide `mediaDisplayName` y no lo reimplementas'
  - 'Un registro de `vega_media` cuyo `fileRef` es null o cuyo fichero ya no está: no puede pintar un
    `<img>` roto NI tumbar el render. Ojo, `resolveMediaGridSrc` llama a `port.fileUrl` SIN captura
    (`media-thumb.ts:37-45`) y el puerto `memory` LANZA `notFound` con una `FileRef` sin fichero
    detrás (`media-thumb.ts:53-56`). La captura la pones TÚ, en la frontera del widget'
  - 'Muchos registros: la paginación tiene que existir, no cargar todo de golpe'
  - 'Un valor YA GUARDADO que apunta a un registro de media BORRADO. Ver `preexisting_data_cases`'
  - 'Un `relation` a `vega_media` declarado FUERA de un bloque, si el modelo permite declararlo:
    tiene que comportarse igual, porque la decisión se toma por DESTINO, no por contexto'
preexisting_data_cases:
  - '⚠️ Un valor guardado que apunta a un registro de media BORRADO: el id se conserva BYTE POR BYTE.
    NO se filtra al inicializar, NO se emite `onChange` durante la carga, y NO se sobrescribe al
    guardar. Aparece marcado como no encontrado y solo desaparece por una acción EXPLÍCITA del
    usuario. Es exactamente lo que ya hace el widget para destinos resueltos
    (`Relation.svelte:203-234,276-293`) y no puede empeorar'
  - 'Un bloque que YA tiene una imagen guardada: al abrir el formulario aparece seleccionada y
    RECONOCIBLE, no como un id. Es lo que distingue «funciona» de «parece que funciona»'
  - 'Un valor múltiple preexistente con el MISMO id repetido: NO es de este lote (ver `scope_out`),
    pero tampoco puedes empeorarlo. Si tu cambio lo toca de refilón, dilo'
invariants:
  - '⚠️ LA CAUSA REAL, MEDIDA CONTRA EL ÁRBOL, y NO es la que dice el título de la tarea. El widget
    SÍ resuelve su destino y SÍ ofrece candidatos. `vega_media` está en `ContentModel.types`
    (`load.ts:135-163` los toma de `port.listContentTypes()`, y `schema.ts:16-39` solo excluye
    sistema/auth/`_`), y `resolve.ts:1309-1330` se limita a forzarla a `hidden: true`. Además tiene
    un campo `title`, así que `resolveTitleField` (`conventions.ts:72-73`) la da por buscable y el
    widget NI SIQUIERA está degradado. Lo que falla es la IDENTIFICACIÓN: `titleOf`
    (`relation-search.ts:106-110`) devuelve `record.id` cuando el `titleField` está vacío, y la
    subida DESDE MEDIOS crea el registro con el fichero y nada más
    (`media-upload-state.svelte.ts:141`), así que en ese camino `title` nace vacío. Resultado: el
    editor ve una lista de ids de 15 caracteres y no puede saber cuál es cuál. VERIFÍCALO tú antes
    de tocar nada: si te encuentras otra cosa, PARA y dilo'
  - 'Ojo, «`title` vacío» es cierto de la SUBIDA, no de todo asset: el importador conserva los
    campos deserializados, `title` incluido (`transfer/import-collection.ts:293`,
    `transfer/record-deserializer.ts:111`). Un asset restaurado puede traer título, y tu presentación
    tiene que respetarlo'
  - '⚠️ ESTE LOTE DEPENDE DE LAS REGLAS DE ACCESO, y por eso va detrás. Un editor de `vega_editors`
    solo puede LISTAR `vega_media` porque el lote de reglas le abre la `listRule`. Da esa base por
    hecha, pero NO la des por hecha en los TESTS: un test que liste como superusuario no prueba nada
    del usuario real'
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
    `mediaExtensionBadge` / `classifyMediaAssetType` (`media-card.ts:52,57`). VERIFICA que
    `toMediaItemView` funciona sobre un `VegaRecord` salido de `ctx.port.list` con la query que use
    el widget: si necesita algo que esa query no pide, DILO en vez de inventarlo'
  - '⚠️ LA DISCRIMINACIÓN ES POR DESTINO Y EN UN SOLO SITIO: se compara `schema.target` con
    `VEGA_MEDIA_COLLECTION.name` (`src/lib/media/media-collection.ts:41`), que es un dato que el
    widget ya tiene. No la deduzcas del nombre del campo, ni de que sea múltiple, ni del bloque'
  - '⚠️ DECIDIDO, no lo reabras — EL DESTINO MEDIA SE NAVEGA PAGINADO Y NO TIENE BUSCADOR. Hoy, como
    `vega_media` tiene `title`, `supportsTitleSearch` da `true` (`relation-search.ts:63-68`) y el
    widget ofrece búsqueda por título. Eso es una TRAMPA: el editor ve NOMBRES DE FICHERO y el
    buscador filtra por `title`, que casi siempre está vacío, así que escribir lo que ves no
    encuentra nada. Ni la propia mediateca puede buscar por nombre en el servidor: lo filtra en
    cliente (`matchesMediaNameQuery`, `media-card.ts:75`). Un buscador que no encuentra lo que se ve
    es peor que no tenerlo. Solución: para el destino media se usa el camino de LISTADO PAGINADO que
    ya existe (`buildDegradedListQuery`, `degradedItems`, `degradedPage`), sin tocar cómo lo elige
    un destino que NO es media'
  - '⚠️ DECIDIDO, no lo reabras — UN ASSET QUE NO ES IMAGEN (PDF) SE MUESTRA Y SE PUEDE ELEGIR, con
    su distintivo de tipo en lugar de miniatura. Razón: la colección canónica acepta PDF a propósito
    (`media-collection.ts:41-50`) y un bloque que enlaza un folleto es legítimo. La mediateca ya los
    lista igual. NO los ocultes, NO los deshabilites'
  - '⚠️ DECIDIDO, no lo reabras — ESTADO VACÍO: cuando `vega_media` no tiene ni un registro, el
    selector dice que la mediateca está vacía y que los archivos se suben desde la sección Medios.
    NO se pinta un botón de subir. Y ese mensaje SOLO puede salir cuando la carga TERMINÓ BIEN y
    devolvió cero: si la carga falló, sale el de error. Hoy no se distinguen y ese es el hallazgo'
  - '⚠️ DECIDIDO, no lo reabras — CUANDO `target` NO SE RESUELVE, el widget da un mensaje ESPECÍFICO
    para el destino media. Y OJO, corrijo aquí una afirmación falsa de la v2 de este encargo: ese
    caso NO está mudo. `target === null` fuerza `degraded = true` (`Relation.svelte:64,71`) y esa
    rama ya pinta una nota y «Sin resultados» (`:301`, textos en `i18n/es.ts:311`). El defecto real
    es que ese mensaje genérico MIENTE sobre lo que pasa. Tu mensaje nuevo se activa SOLO cuando
    `schema.target` es `vega_media`; para cualquier otro destino no resuelto, todo sigue igual, y eso
    va fijado con un test. Ese estado es alcanzable de verdad: la mediateca crea la colección y
    actualiza sus tipos locales sin recargar `ctx.model` (`src/routes/media/+page.svelte:173-179`).
    ARREGLAR ESA RECARGA NO ES TUYO'
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
  - 'Pasar de página, volver, y comprobar que la selección hecha en la página 1 sigue puesta'
measurement_reference_systems:
  - 'Que «se reconoce» se mide leyendo el TEXTO que ve el usuario en cada candidato y comprobando
    que NO es el id del registro. Un test que compruebe que hay N botones no mide nada: hoy ya hay N
    botones y el bug es justamente lo que ponen'
  - 'Que la miniatura está se mide sobre el `src` que el puerto devolvió para ESE registro, no sobre
    la existencia de un `<img>`'
  - 'Que los cuatro estados se distinguen se mide provocando CADA uno y comprobando que el texto
    visible es distinto. Comprobar solo el vacío no distingue el vacío del error, que es el bug'
  - 'Que «se guarda» se mide leyendo el registro del backend después de guardar, no el estado del
    formulario'
  - 'El orden del caso múltiple se mide leyendo el array guardado, no el orden de pintado'
measurement_invalidation_conditions:
  - 'Un test que fabrique registros de media CON `title` relleno no mide el caso que rompe: el que
    rompe es el `title` VACÍO que produce la subida real'
  - 'Un test que monte el widget con un `ContentModel` donde `vega_media` NO esté no mide el bug de
    hoy: sí está, y de ahí venía el diagnóstico equivocado que este encargo ya corrigió una vez'
  - 'Un test del estado vacío que no tenga su gemelo con `ctx.port.list` RECHAZANDO no mide nada:
    los dos caminos acaban hoy en la misma pantalla y esa es la razón del hallazgo'
  - 'Si al sabotear el reconocimiento del destino media cae un test del camino `relation` normal, tu
    sabotaje apuntó al sitio equivocado'
product_decisions_reserved_to_david:
  - 'CÓMO SE VE el selector: es suyo y lo ajusta él en el navegador. Haz algo funcional y sobrio'
  - 'Si hace falta poder SUBIR desde el bloque: propón, no construyas'
  - 'Los assets no-imagen, el estado vacío, el destino sin resolver y la ausencia de buscador YA
    ESTÁN DECIDIDOS arriba. No los marques como revisables ni los reabras'
repo_claims_that_may_become_false:
  - file: src/lib/form/widgets/Relation.svelte
    section_or_quote:
      'El comentario de las líneas 69-71: «Defensivo (no debería pasar — el manifiesto/esquema
      garantiza `target` válido, L11)». Es FALSO hoy'
  - file: src/lib/form/widgets/Relation.svelte
    section_or_quote:
      'La cabecera (línea 4): «los pinta como una selección de botones-toggle» por su `titleField`.
      Deja de ser toda la verdad en cuanto haya un camino por destino'
  - file: src/lib/form/widgets/relation-search.ts
    section_or_quote:
      'La cabecera (líneas 14-19) que describe el listado paginado como el modo de un destino SIN
      `titleField`. Con este cambio también lo usa un destino que SÍ lo tiene'
  - file: src/lib/media/media-collection.ts
    section_or_quote:
      'El comentario sobre los thumbs declarados «de forma DEFENSIVA», que dice que 120x120 entraría
      en juego «si un día un picker/listado renderiza `vega_media`». Ese día es este, aunque este
      lote acabe pidiendo 300x300. OJO: otro lote toca las REGLAS de este mismo fichero; tú solo
      tocas comentarios'
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
  - 'Con `vega_media` VACÍA: comprobar qué se ve'
  - '⚠️ Con `ctx.port.list` fallando: comprobar que NO se ve el mensaje de mediateca vacía'
  - 'Con un PDF entre los assets: comprobar que se ve, que se puede elegir y que no hay `<img>` roto'
  - 'Con más assets que una página: pasar de página y volver'
  - 'Con varios assets: elegir uno, guardar, recargar y comprobar que sigue y se reconoce'
  - 'En un campo `images`: elegir dos, guardar, recargar, comprobar orden'
  - 'Un `relation` a una colección normal: comprobar que su comportamiento NO cambió, incluido su
    caso de destino sin resolver'
expected_reports:
  - /private/tmp/vega-informes/block-image-relation-picker.md
known_unverifiable_items:
  - 'El gate completo NO corre entero en el sandbox: PocketBase no puede abrir puerto (`EPERM
    listen`) y Playwright no registra su puerto Mach. No pelees: corre las suites de componente que
    puedas, DI cuáles no, y sigue. El gate autoritativo lo paso yo'
  - 'Que un editor real de `vega_editors` pueda listar los medios depende de las reglas del otro
    lote y solo se comprueba contra PocketBase real. Tú lo das por hecho y lo declaras'
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

Y encima hay un buscador que promete lo que no puede dar, porque filtra por ese mismo `title`.

## Lo que hay que construir

Que una relación a `vega_media` presente a sus candidatos como lo que son: **miniatura y nombre**,
navegables por páginas, con los cuatro estados de carga bien distinguidos. Reusando las funciones
puras que ya existen en `src/lib/media/`, y **sin tocar el `MediaPicker`**, que hace otra cosa.

**El listón:** que un editor abra un bloque `image` en un proyecto recién sembrado, suba dos fotos
desde Medios sin escribirles ningún título, vuelva al bloque y sepa cuál es cuál.

## Verificación

- **Los ocho QA conductuales.** El primero es el lote entero; el tercero, el del error, es el que
  evita que un 403 se disfrace de biblioteca vacía.
- **Rompe un guardarraíl a propósito**: haz que el reconocimiento del destino media falle y comprueba
  que cae el test del TEXTO de los candidatos, no el de que el componente monta. Antes de sabotear,
  árbol limpio y tu cambio ya commiteado; la restauración se hace desde el estado guardado, nunca
  desde el índice, y después compruebas que tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre la base declarada, rama `feat/block-image-relation-picker` y su worktree.
  **Commitea pronto y ve enmendando.**
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/block-image-relation-picker.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
