# Encargo — Arranque en un paso: sembrar colecciones, manifiesto y primera página

## Contrato de tarea

```yaml
task_id: site-seeding-one-step
prompt_hash: se_calcula_sobre_este_fichero_ya_commiteado
repos:
  - repo_id: vegacms
    base_sha: 3f8a2853695f895db743158e24ad77eda0410b85
    branch: feat/site-seeding-one-step
    worktree: /private/tmp/vegacms-site-seeding
external_inputs:
  - repo: vega-astro
    path: starters/default/vega/manifest.json
    pinned_sha: ff44f5efe5e89299ae3fe9e352e2937aae6e22cc
    size_bytes: 5294
    note: '⚠️ ENTRADA INMUTABLE. Cópialo desde ESE commit, no desde el `main` móvil de `vega-astro`.
      Verifica el tamaño antes de usarlo. Seis `blockTypes` (hero, richtext, image, gallery, cta,
      divider) y dos `collections` (pages, blocks)'
scope_in:
  - 'Un sembrado en src/lib/backend/ que, desde un PocketBase LIMPIO, deje un proyecto usable:
    `pages`, `blocks`, `vega_media`, `vega_editors`, el manifiesto guardado y una primera página'
  - 'Las columnas derivadas del manifiesto de partida, REUSANDO `deriveBlockRecordFields`
    (src/lib/backend/block-schema.ts:298). NO escribas una segunda derivación en paralelo'
  - '⚠️ `ensureMediaCollection` (src/lib/media/media-collection.ts:71-80) es por contrato el ÚNICO
    punto que puede sembrar `vega_media`, y SIEMPRE con esa colección sola, nunca junto a otras.
    Reúsalo. No metas `VEGA_MEDIA_COLLECTION` en un `ensureCollections` multi-spec'
  - '⚠️ `saveManifest` (src/lib/model/load.ts:174-239) es el escritor canónico del manifiesto:
    concentra la validación estricta, `key = default`, `manifestVersion` y `schemaSnapshot`.
    Reúsalo. Un escritor paralelo se saltaría todo eso'
  - 'Las reglas de LECTURA de `vega`, acotadas a `vega_editors` (ver product_decisions, ya decidido)'
  - 'Su suite, y la parte de la suite de contrato compartida que le toque'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ EMITIR LA MIGRACIÓN DEL SEMBRADO. Se ha sacado de este lote A PROPÓSITO y va en uno
    posterior. Motivo: `SchemaMigrationOp` (src/lib/backend/migration.ts:44-52) admite `create` O
    `add-fields`, NUNCA ambas, y está documentado como decisión deliberada. Una instalación a medias
    necesita las dos cosas a la vez, así que representarla exigiría rediseñar ese tipo. No lo hagas
    aquí, y no emitas una migración parcial que mienta'
  - '⚠️ extensions/ ENTERO. Hay OTRO lote corriendo AHORA sobre este mismo repo
    (`vegapreview-allowlist-obligatoria`) que trabaja solo ahí. No lo toques ni para leerlo de reojo'
  - '⚠️ Que la PLANTILLA anuncie `vega_editors` en su discovery: eso es `vega-astro` y va en un lote
    POSTERIOR. Mientras este sembrado no esté publicado, ese anuncio sería mentira'
  - 'Rediseñar `ensureCollections` o el puerto. Acaba de cambiar hoy y es CREATION-ONLY a propósito:
    trabaja CON esa semántica, no contra ella. Si el preflight necesita una superficie que el puerto
    NO expone, PARA y proponla en el informe; no la inventes'
  - 'La UI del sembrado (un botón, un asistente). Este lote construye la operación y su verificación.
    Si crees que hace falta una superficie, PROPÓNLA en el informe; no la construyas'
  - 'El widget de relación y el selector de imágenes: es `435499c8`, otro lote'
  - 'Cambiar las reglas de VEGA_MEDIA_COLLECTION o VEGA_REVISIONS_COLLECTION'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Desde un PocketBase LIMPIO, el sembrado deja un proyecto donde ya se puede abrir la primera
    página y editarla: `pages`, `blocks`, `vega_media` y `vega_editors` creadas, manifiesto guardado'
  - 'Las columnas derivadas del manifiesto de partida existen y son utilizables: `blocks.image`
    (relación simple a `vega_media`) y `blocks.images` (múltiple), que es lo que `@vega/astro`
    ya consume'
  - '⚠️ DECISIÓN 1: correrlo dos veces COMPLETA lo que falte. Añade solo PIEZAS ausentes y no altera
    jamás una pieza ya presente. Con test'
  - '⚠️ DECISIÓN 2: ante DIVERGENCIA, aborta SIN HABER ESCRITO NADA, y el servidor queda IGUAL que
    estaba según el comparador definido en `measurement_reference_systems`. Con test que lo mida
    leyendo el servidor, no el valor de retorno'
  - 'El informe de divergencia dice QUÉ encontró CONTRA QUÉ esperaba, por nombre de pieza. Un
    «diverge» a secas obliga a un humano a adivinar en el admin'
  - '⚠️ Las reglas de lectura de `vega` quedan acotadas a `vega_editors` en una instalación NUEVA:
    son DOS, `listRule` y `viewRule`, no una. Vega no lee el manifiesto por id sino con
    `port.list` (src/lib/model/load.ts:92-107), así que solo con `viewRule` el editor seguiría sin
    poder cargarlo y la decisión no se materializaría. En una instalación que ya existía NO se
    tocan (creation-only)'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - '`pnpm check`, `pnpm lint`, `pnpm test` y `pnpm build` verdes, con salida literal. El gate
    COMPLETO no entra aquí: ver `known_unverifiable_items`'
adversaries:
  - '⚠️ El PocketBase a medio sembrar: `pages` existe, `blocks` no. Es la DECISIÓN 1, y es el caso
    real (te quedaste a medias, o añadiste un tipo de bloque nuevo)'
  - '⚠️ Una colección con el nombre esperado pero OTRA FORMA. Es la DECISIÓN 2 y es lo que separa
    este sembrado de un destructor de datos'
  - 'Un `blocks` que existe con las cuatro estructurales pero SIN las columnas derivadas
    (`image`, `images`). Resultado exigido: las columnas son PIEZAS AUSENTES ⇒ FALTA ⇒ se añaden con
    `addCollectionFields`. La colección NO es divergente por que le falten campos'
  - 'Un `vega_editors` que YA EXISTE con usuarios dentro. Resultado exigido: se salta entera y no se
    toca, ni sus reglas ni sus campos ni sus usuarios (creation-only)'
  - 'Una primera página que YA EXISTE con la ruta canónica: se salta, no se duplica ni se pisa,
    aunque su contenido lo haya cambiado un humano'
  - 'Un `pages` con OTRAS páginas dentro pero SIN la canónica: la canónica es una pieza AUSENTE ⇒ se
    crea. Las demás no se tocan ni se cuentan'
  - 'Un manifiesto YA GUARDADO y distinto del de partida. Resultado exigido: es DIVERGENCIA ⇒ aborta.
    Es contenido de un humano y `saveManifest` lo SOBREESCRIBIRÍA (load.ts:232-237). Idéntico al de
    partida ⇒ conforme, se salta'
  - '⚠️ El orden: `blocks` referencia a `pages` Y a `vega_media`. `ensureCollectionsOnPocketBase`
    recorre los specs EN EL ORDEN QUE LE LLEGAN (adapters/pocketbase/collections.ts:46-67): no
    ordena nada. Ver `invariants`'
  - 'Un campo `relation` de bloque que NO se llama `images`: por convención v1 sale SIMPLE
    (block-schema.ts:96-103). Si el manifiesto de partida trae alguno así, míralo dos veces'
preexisting_data_cases:
  - '⚠️ TODO el lote es un caso de datos preexistentes. La diferencia entre la DECISIÓN 1 y la 2 es
    la diferencia entre completar una instalación y romperla'
  - 'Una instalación existente con `vega` ya abierta a mano por el operador: creation-only garantiza
    que no se toca. VERIFÍCALO, no lo asumas'
invariants:
  - '⚠️ LA FRONTERA ES POR PIEZA, NO POR COLECCIÓN, y hay que dejarla escrita en el código y en el
    informe. Una PIEZA es: una colección, un campo de una colección, el registro de manifiesto, o la
    página canónica. Para CADA pieza: **ausente por completo ⇒ FALTA ⇒ se añade**; **presente con
    forma incompatible ⇒ DIVERGE ⇒ aborta TODO**; **presente y compatible ⇒ se salta**. No hay
    cuarto caso. La regla «no modifica jamás lo que ya existe» significa **no altera ninguna pieza
    ya presente**; añadir un campo ausente a una colección presente SÍ está permitido y es el caso
    central de la DECISIÓN 1. Si aparece un caso que no cae limpio en los tres, PARA y dilo'
  - '⚠️ INSPECCIONA EL ESTADO ENTERO ANTES DE ESCRIBIR NADA. No es un detalle de implementación: es
    lo único que hace posible «aborta sin haber escrito nada». Un sembrado que valida sobre la
    marcha ya ha escrito cuando descubre la divergencia'
  - '⚠️ EXCEPCIÓN OBLIGATORIA AL PREFLIGHT, y es la única: `vega_editors` es una colección `auth` y
    las `auth` son INVISIBLES al esquema descubierto (schema.ts:16-20), así que el preflight NO
    puede saber si existe ni con qué forma. La protección para ella es la del propio adaptador, que
    resuelve la existencia con `pb.collections.getOne` crudo y LANZA si el tipo no coincide
    (adapters/pocketbase/collections.ts:46-67). Por eso `vega_editors` SE CREA LA PRIMERA, antes que
    ninguna otra escritura: así, si es ella la que diverge, el fallo ocurre cuando todavía no se ha
    escrito nada más. Dilo en el informe'
  - '⚠️ `ensureCollections` es CREATION-ONLY desde hoy (`3f8a285`): si el nombre existe, lo salta y
    NO actualiza tipo, reglas ni campos. Eso es deliberado y protege instalaciones reales. Para
    completar CAMPOS que faltan en una colección existente, el camino es `addCollectionFields`,
    no un `ensureCollections` que pise'
  - '⚠️ EL ORDEN DE APLICACIÓN LO FIJAS TÚ, EXPLÍCITAMENTE, y no hay ninguna función que lo haga por
    ti. `topologicallySortCollectionSpecs` (migration.ts:147) es PRIVADA y solo la llama el
    renderizador de migraciones (`migration.ts:100-101`); `ensureCollectionsOnPocketBase` recorre
    los specs en el orden recibido. Orden exigido: `vega_editors` → `pages` → `vega_media`
    (vía `ensureMediaCollection`, sola) → `blocks`, porque `blocks` referencia a las dos anteriores.
    NO intentes exportar ni reutilizar el sorter privado'
  - 'El derivador de columnas YA EXISTE: `deriveBlockRecordFields`. Reúsalo'
  - '⚠️ EL MANIFIESTO DE PARTIDA VIVE EN OTRO REPO: `vega-astro`,
    `starters/default/vega/manifest.json` (5,3 KB, seis `blockTypes`: hero, richtext, image,
    gallery, cta, divider; `collections`: pages y blocks). Copiarlo aquí crea una SEGUNDA fuente que
    diverge sola y en silencio, y este proyecto ya ha publicado tres veces documentación caducada
    por exactamente eso. Copia el contenido TAL CUAL, y propón en el informe cómo se detecta la
    divergencia entre las dos copias. NO construyas ese mecanismo sin decírmelo'
  - 'El sembrado es la REGLA DE FRONTERA hecha código: `blocks` lleva `parent` (relation), `order`
    (number) y `type` (text) como columnas de verdad, y `data` (json) para el contenido. Si al
    sembrar aparece la tentación de meter algo más dentro de `data`, es la señal de que ese algo se
    consulta y por tanto NO va ahí'
repeat_interrupt_revert_behavior:
  - 'Segunda pasada sobre un proyecto completo: no cambia nada y no lanza'
  - 'Segunda pasada sobre un proyecto a medias: completa SOLO las piezas ausentes'
  - 'Interrupción a mitad: lo ya creado se queda (no hay rollback implícito, igual que
    `ensureCollections`), y la siguiente pasada lo completa. Decir esto explícitamente'
  - 'Ante divergencia no hay nada que revertir, porque no se escribió nada'
  - '⚠️ SUPUESTO DE VALIDEZ, declarado: la promesa «aborta sin haber escrito nada» vale para un
    PocketBase SIN escritores concurrentes. No hay transacción global posible: entre el preflight y
    las escrituras, otro operador podría crear o cambiar una colección, y esa divergencia aparecería
    cuando el sembrado ya escribió otras piezas. El adaptador reconoce el mismo riesgo y relee antes
    de su PATCH (adapters/pocketbase/collections.ts:129-162). Declara esta condición en la
    documentación de la operación; no prometas atomicidad global sin ella'
measurement_reference_systems:
  - '⚠️ EL COMPARADOR, definido para que dos implementaciones no puedan discrepar. Una colección es
    CONFORME si, para cada campo que el sembrado espera, existe un campo del mismo nombre con el
    mismo `type`, el mismo `target` (relation), la misma cardinalidad (`multiple`), el mismo
    `required` y el mismo `unique`. **Los campos EXTRA que el sembrado no espera se IGNORAN**: son de
    su dueño y no hacen divergente nada. Se ignoran también ids internos, campos de sistema de
    PocketBase, el ORDEN de los campos, los defaults que pone el servidor, y las reglas de una
    colección que el sembrado no declara. Cualquier discrepancia en las propiedades enumeradas
    arriba es DIVERGENCIA'
  - 'El estado se mide leyendo el servidor CRUDO. Las reglas, con `pb.collections.getOne` y
    comparando la cadena literal: la proyección `AccessLevel` es CON PÉRDIDA y colapsa cualquier
    filtro en `conditional`'
  - 'Las colecciones `auth` NO aparecen en el esquema descubierto (schema.ts:16-20). `vega_editors`
    se mide en el servidor, nunca preguntándole al descubrimiento'
  - '⚠️ «El servidor queda igual» NO es una igualdad de bytes y no la llames así. Es esta
    INSTANTÁNEA LÓGICA, capturada antes y después del intento fallido: (a) el conjunto de nombres de
    colección; (b) para cada una de las cinco que el sembrado toca, sus campos con las propiedades
    del comparador y sus `listRule`/`viewRule` crudas; (c) el número de registros y sus ids en
    `pages`, `blocks` y `vega`. Sin (c) no detectarías que se escribió una página o el manifiesto,
    que es exactamente lo que la DECISIÓN 2 promete que no pasa'
measurement_invalidation_conditions:
  - 'Un test de idempotencia que compare valores de retorno no mide nada: hay que comparar el estado
    del servidor'
  - 'Un test de divergencia que solo compruebe que se lanzó un error no mide la promesa: la promesa
    es que NO SE ESCRIBIÓ NADA'
  - 'Si el test construye el estado esperado con el mismo helper que el sembrado, es tautológico'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO (29 jul): correrlo dos veces completa lo que falte; ante divergencia, abortar sin
    escribir; manifiesto de partida = el del starter TAL CUAL, los seis tipos'
  - '⚠️ YA DECIDIDO (29 jul, esta sesión): `listRule` Y `viewRule` de `vega` se abren ACOTADAS a
    `vega_editors`, no a cualquier autenticado. La forma de la regla la sugiere la propia
    documentación vigente (docs/POCKETBASE-INTEGRATION.md:611-624) como su variante más restringida:
    `@request.auth.collectionName == "vega_editors"`. VERIFICA la sintaxis exacta contra PocketBase
    real antes de darla por buena; el doc no es el servidor'
  - 'YA DECIDIDO: un manifiesto ya guardado y DISTINTO del de partida es DIVERGENCIA y aborta. No lo
    preserves-y-sigas: dejaría el esquema derivado de un manifiesto y el contenido de otro'
  - 'YA DECIDIDO: la página canónica se identifica por su RUTA, no por id ni por posición. Sus
    valores iniciales los eliges tú y los DECLARAS en el informe; lo que no puedes es elegir «la
    primera que devuelva PocketBase» ni crear una nueva en cada pasada'
  - 'Qué puede hacer exactamente un editor más allá de leer el manifiesto: si tu implementación
    necesita decidirlo, PARA y dilo en el informe'
  - 'Si hace falta una superficie de UI para disparar el sembrado: propón, no construyas'
repo_claims_that_may_become_false:
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote:
      'Líneas 587-660: la sección que le pide al operador crear `vega_editors` y abrir `vega` A
      MANO. Este lote la deja PARCIALMENTE falsa: para una instalación NUEVA ya no hay pasos
      manuales; para una EXISTENTE siguen siendo necesarios, porque creation-only no la toca.
      Distingue los dos casos, no borres la sección'
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote: 'Líneas ~414-417: la frase que dice que aún no existe un sembrado de proyecto'
  - file: src/lib/backend/collections.ts
    section_or_quote: 'Lo que el docblock afirme sobre quién crea las colecciones canónicas'
  - file: src/lib/media/media-collection.ts
    section_or_quote:
      'Líneas 1-4 y 71-80: `ensureMediaCollection` se declara ÚNICO punto de llamada para sembrar
      `vega_media`, y siempre con esa colección SOLA. Si tu sembrado la mete en un
      `ensureCollections` multi-spec, deja falsa esa afirmación. Reúsalo en vez de contradecirlo'
  - file: src/lib/model/load.ts
    section_or_quote:
      'Líneas 174-239: `saveManifest` como escritor canónico, con validación estricta,
      `key = default`, `manifestVersion` y `schemaSnapshot`. Un escritor paralelo lo dejaría falso'
  - file: docs/CONFIG.md
    section_or_quote: 'Si describe el arranque de un proyecto nuevo. COMPRUÉBALO antes de tocarlo'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
required_behavioral_qa:
  - 'Contra PocketBase REAL y LIMPIO: sembrar y comprobar las cuatro colecciones, el manifiesto, la
    primera página y las dos columnas derivadas'
  - 'Contra PocketBase REAL: sembrar, borrar `blocks`, volver a sembrar y comprobar que se completa'
  - 'Contra PocketBase REAL: sembrar, quitar SOLO la columna `blocks.images`, volver a sembrar y
    comprobar que se AÑADE sin tocar el resto. Es el caso central de la DECISIÓN 1'
  - '⚠️ Contra PocketBase REAL: crear `pages` con OTRA FORMA, sembrar, y comprobar que aborta y que
    la instantánea lógica quedó idéntica, incluidos los recuentos de registros'
  - 'Contra PocketBase REAL: guardar un manifiesto distinto, sembrar, comprobar que aborta y que el
    manifiesto humano sigue intacto'
  - 'Contra PocketBase REAL: `listRule` Y `viewRule` de `vega` acotadas a `vega_editors`, leídas
    crudas y comparadas como cadena literal'
expected_reports:
  - /private/tmp/vega-informes/site-seeding-one-step.md
known_unverifiable_items:
  - '⚠️ `pnpm gate` COMPLETO no es criterio de aceptación de TU entrega, y por eso no está en
    `acceptance_criteria`: dentro del sandbox PocketBase no puede abrir puerto y Playwright no
    registra su puerto Mach. Corre `check`, `lint`, `test` y `build` con
    `GOCACHE=/private/tmp/vega-go-build-cache`, corre las suites focalizadas que puedas, y DI
    literalmente cuáles no pudiste. El gate autoritativo lo paso yo sobre el árbol combinado, y es
    el que manda'
```

## Por qué existe

Desde un PocketBase limpio, hoy hay que crear las colecciones **a mano, una por una** en
`SchemaAuthoringPanel` y escribir el manifiesto a mano. No hay «instalación limpia a web en marcha»:
hay una lista de instrucciones. Esta es la tarea que convierte Vega en algo que un tercero puede
instalar.

Estaba bloqueada por dos cosas y **ya no lo está**: el puente manifiesto→esquema aterrizó (`d66c2ed`)
y el puerto aprendió colecciones `auth` y reglas esta misma tarde (`3f8a285`). `vega_editors` era
literalmente inexpresable hasta hoy.

## Lo que hay que construir

Una operación que, desde un PocketBase limpio, deje un proyecto **editable**. No «las colecciones
creadas»: editable, con su primera página abriéndose en el editor.

### El filo, y es lo único que juzgo de verdad

Las decisiones de David se reducen a una frontera que hay que dejar escrita, y que es **por PIEZA,
no por colección**. Pieza = una colección, un campo, el registro de manifiesto, o la página canónica.

- **«Falta»** = la pieza está ausente por completo ⇒ **se añade**.
- **«Diverge»** = la pieza está presente con forma incompatible ⇒ **se aborta todo, sin escribir**.
- **«Conforme»** = presente y compatible ⇒ **se salta**.

Que la frontera sea por pieza es lo que hace posible el caso central: un `blocks` que existe pero al
que le falta `images` **no es divergente**, le falta una pieza, y esa pieza se añade con
`addCollectionFields`. Leer la frontera por colección abortaría exactamente el escenario que la
DECISIÓN 1 quiere resolver.

Un sembrado que «arregla» lo que diverge es un destructor de datos con buenas intenciones, y uno que
se rinde ante lo que falta no sirve para el caso real, que es volver a correrlo después de añadir un
tipo de bloque al manifiesto.

De ahí sale la consecuencia estructural: **inspecciona el estado entero ANTES de escribir nada**. Si
validas sobre la marcha, cuando descubras la divergencia ya has escrito.

### Las cuatro trampas

1. **`ensureCollections` es creation-only desde hoy.** Si el nombre existe, lo salta entero: no
   actualiza tipo, ni reglas, ni campos. Eso te protege (no puedes pisar una instalación real) y te
   estorba (no puedes completar columnas con él). Para columnas ausentes en una colección existente,
   el camino es `addCollectionFields`. Trabaja CON esa semántica.

2. **Nadie ordena los specs por ti.** `topologicallySortCollectionSpecs` existe, pero es **privada**
   y solo la usa el renderizador de migraciones; `ensureCollectionsOnPocketBase` crea en el orden
   que le llegan. El orden lo fijas tú, y está en `invariants`.

3. **`vega_editors` es una colección `auth`, y las `auth` son invisibles al descubrimiento**
   (`schema.ts:16-20`). Tu preflight NO puede verla. Por eso va primera: si es ella la que diverge,
   el adaptador lanza cuando todavía no se ha escrito nada más.

4. **El manifiesto de partida vive en OTRO REPO**, y va fijado por SHA en `external_inputs`. Cópialo
   desde ese commit, no del `main` móvil. Copiarlo crea una segunda fuente que diverge sola: este
   proyecto ya publicó tres veces documentación caducada exactamente así. **Propón** cómo detectar
   esa divergencia; no construyas el mecanismo sin decírmelo.

## Verificación

- **Contra PocketBase real**, los seis QA conductuales. El de `pages` con otra forma y el del
  manifiesto humano son los que representan la promesa entera.
- **Rompe un guardarraíl a propósito**: haz que el sembrado escriba algo ANTES de terminar la
  inspección, y comprueba que cae el test de la instantánea lógica. Antes de sabotear, árbol
  limpio y tu cambio ya commiteado; la restauración se hace desde el estado guardado, nunca desde el
  índice, y después compruebas que tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `3f8a285`, rama `feat/site-seeding-one-step` y su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay OTRO lote corriendo sobre este mismo repo en paralelo**, en `extensions/vegapreview/`.
  Tú no entras en `extensions/`. Si necesitas algo de ahí, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase. Ojo con
  `docs/POCKETBASE-INTEGRATION.md`: queda falsa para instalaciones NUEVAS y sigue siendo cierta para
  las EXISTENTES. Distingue los dos casos en vez de borrar la sección.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/site-seeding-one-step.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
