# Encargo — Que el proyecto sembrado sea publicable y editable sin ser superusuario

## Contrato de tarea

```yaml
task_id: reglas-de-acceso-del-sitio-sembrado
prompt_hash: a94cb8b2b8888e8ea9bf9c0c1db898cbca6fe2ae967a46c368551e94f0282b7e
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
revision: 2
revision_nota: 'La v1 se cayó con TRES bloqueantes de su crítico, y los tres están resueltos aquí:
  (a) las reglas de `vega_media` no llegaban al servidor, porque esa colección no se crea desde una
  spec local sino con `ensureMediaCollection`, que manda siempre la spec canónica; (b) una
  `listRule` pública dejaba ENUMERAR la biblioteca entera con sus metadatos, y eso no hacía falta
  para nada, porque el sitio no lista medios: los EXPANDE, y la expansión solo mira la `viewRule`;
  (c) en una instalación PARCIAL, crear `blocks` con la regla nueva sobre unas `pages` ajenas y
  privadas publicaba por la API de bloques un contenido que su página no deja ver'
repos:
  - repo_id: vegacms
    base_sha: c0d63afec0f7dea5dac43364d02e5ae05bf109f9
    branch: feat/reglas-de-acceso-del-sitio-sembrado
    worktree: /private/tmp/vegacms-reglas-de-acceso-del-sitio-sembrado
  - repo_id: vega-astro
    base_sha: ff44f5efe5e89299ae3fe9e352e2937aae6e22cc
    branch: feat/reglas-de-acceso-del-sitio-sembrado
    worktree: /private/tmp/vega-astro-reglas-de-acceso-del-sitio-sembrado
external_inputs:
  - 'NINGUNO. Todo está en los dos árboles declarados'
scope_in:
  - 'PIEZA 1 (vegacms): `src/lib/backend/site-seeding.ts` — que el sembrado escriba las REGLAS DE
    ACCESO de las colecciones que CREA, con los valores exactos fijados en `invariants`. Su suite'
  - '⚠️ PIEZA 1 (vegacms): `src/lib/media/media-collection.ts` y su suite. Las reglas de `vega_media`
    van en la SPEC CANÓNICA, no en una copia local del sembrado. Ver el invariante que lo explica'
  - '⚠️ PIEZA 1 (vegacms): la PRECONDICIÓN de instalación mixta antes de crear `blocks`. Ver el
    invariante; es una lectura de más en el preflight, no una escritura'
  - 'PIEZA 2 (vega-astro): `starters/default/src/pages/api/vega/discovery.ts` — que el starter
    anuncie `vega_editors` en vez de `_superusers`, y la guía de migración en
    `starters/default/README.md`'
  - 'PIEZA 3 (vegacms): `docs/POCKETBASE-INTEGRATION.md` — el procedimiento MANUAL de reglas
    (secciones «3.» y «4.», alrededor de las líneas 628-652) tiene que decir qué hace ya el sembrado
    solo y para quién sigue haciendo falta hacerlo a mano'
  - 'PIEZA 3 (vegacms): `extensions/vegapreview/README.md:64-69`, SOLO la frase que afirma qué
    anuncia hoy el starter. Nada más de esa extensión'
  - 'Las afirmaciones de los dos repos que tu propio cambio deja falsas'
scope_out:
  - '⚠️ MODIFICAR LAS REGLAS DE UNA COLECCIÓN QUE YA EXISTE. Jamás, bajo ninguna condición, ni aunque
    estén vacías, ni aunque «claramente falten». Este lote solo puede ESCRIBIR reglas al CREAR, y
    LEER las ajenas para decidir si aborta'
  - '⚠️ La frontera pieza-a-pieza del sembrado, el orden de aplicación, el preflight de solo lectura
    y el aborto sin escribir. Son el contrato vigente y NO cambian. Tú añades reglas a lo que se
    crea, y una comprobación de más al preflight'
  - '⚠️ Las reglas de `vega` (el manifiesto): ya las escribe el sembrado
    (`SITE_SEED_MANIFEST_READ_RULE`, site-seeding.ts:34,94-95) y NO se tocan'
  - '⚠️ Las reglas de `vega_editors`: se quedan como están. Su `authRule` nace permitida y su
    `manageRule` nace solo-superusuario, que es lo que se quiere. NO le abras `listRule`: un editor
    no necesita listar a los demás'
  - '⚠️ El CÓDIGO de `extensions/vegapreview` y `extensions/vegabuild`. Hay otro lote en `vegabuild`.
    De `vegapreview` solo tocas la frase de su README que te dice `scope_in`'
  - '⚠️ `src/lib/form/` y el RESTO de `src/lib/media/`: hay un tercer lote ahí, que toca comentarios
    de `media-collection.ts`. Tú tocas de ese fichero SOLO la spec canónica y lo que sus reglas
    dejen falso'
  - '⚠️ El comparador de formas de campo de `site-seeding.ts` (`ComparableFieldShape`,
    `expectedFieldShape`, `actualFieldShape`, `sameShape`): es de OTRO lote en vuelo. No lo toques'
  - 'El resto del documento de discovery del starter: solo cambia `auth.collection`'
  - 'El renderizador de migraciones. Este lote NO tiene que emitir una migración'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Tras sembrar un PocketBase limpio, un cliente ANÓNIMO puede listar y leer las páginas
    `published` y sus bloques, y NO puede leer ni listar las que están en `draft`'
  - 'Tras sembrar, un registro de `vega_editors` puede listar, leer, crear, actualizar y borrar
    páginas, bloques y medios, incluidos los borradores'
  - 'Tras sembrar, un cliente anónimo NO puede crear, actualizar ni borrar nada'
  - '⚠️ Tras sembrar, un cliente anónimo NO puede LISTAR `vega_media`, y SÍ puede LEER un registro
    concreto de `vega_media` cuyo id conozca. Con test de cada mitad. Ver el porqué en `invariants`'
  - '⚠️ Un `expand` de la relación de un bloque publicado hacia `vega_media` RESUELVE para un
    anónimo. Es la mitad que hace falta para que el sitio se construya, y la que se rompería si
    alguien «arreglara» la `viewRule`'
  - '⚠️ Sembrar sobre un proyecto donde `pages` YA EXISTE no cambia ni una regla de `pages`, tenga
    las que tenga. Con test'
  - '⚠️ Sembrar sobre un proyecto donde `pages` YA EXISTE con reglas de lectura DISTINTAS de las
    nuestras y `blocks` AUSENTE aborta ANTES de crear `blocks`, sin escribir nada, y el error nombra
    la incompatibilidad. Con test. Ver el invariante de la instalación mixta'
  - 'Las reglas escritas son LITERALMENTE las fijadas en `invariants`, y el test las compara como
    cadenas, no por su efecto'
  - 'Correr el sembrado dos veces seguidas no cambia ninguna regla la segunda vez'
  - '⚠️ `ensureMediaCollection` sigue siendo el ÚNICO punto de llamada que crea `vega_media`, y su
    guardarraíl sigue en pie. Con su test existente en verde'
  - 'PIEZA 2: el documento de discovery emitido anuncia `vega_editors`, el bloque «PENDING PRODUCT
    DECISION» desaparece, y el README del starter explica qué hace un proyecto ya creado con
    `_superusers`'
  - '⚠️ PIEZA 2: la guía de migración cubre el OVERRIDE PERSISTENTE del navegador. Ver el invariante'
  - 'PIEZA 3: la documentación distingue qué hace el sembrado solo de qué sigue siendo manual'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - 'Gate verde en los dos repos hasta donde el sandbox lo permita, con salida literal'
adversaries:
  - '⚠️ Una página en `draft` con bloques: un anónimo NO puede leer esos bloques. La regla de
    `blocks` tiene que mirar el estado de su PÁGINA, no el suyo, porque un bloque no tiene estado'
  - '⚠️ INSTALACIÓN MIXTA: `pages` ya existe con reglas ajenas y privadas, y `blocks` no existe. Es
    el caso del tercer bloqueante y NO es hipotético: la suite de contrato ya borra y recrea solo
    `blocks` (`tests/contract/pocketbase.site-seeding.test.ts:99-110`)'
  - 'Un bloque HUÉRFANO, cuya página ya no está: no puede quedar legible por accidente'
  - '⚠️ Un asset de `vega_media` que NO referencia ningún bloque publicado, con `title`, `alt` y
    `tags` internos: un anónimo no puede llegar a él por enumeración'
  - 'Un editor autenticado contra OTRA colección auth que no es `vega_editors`: no puede editar nada'
  - 'Un superusuario: sigue pudiendo todo, porque PocketBase no evalúa reglas para él. Eso no lo
    decides tú, es del servidor'
  - 'Un proyecto sembrado ANTES de este lote, con las colecciones ya creadas y sin reglas: el
    sembrado NO se las va a poner nunca. Esa gente necesita el procedimiento manual, y por eso la
    pieza 3 existe'
  - '⚠️ Un navegador con un override de `authCollection` guardado en `localStorage`: sigue
    autenticando contra `_superusers` aunque el discovery nuevo anuncie `vega_editors`. Ver el
    invariante'
preexisting_data_cases:
  - '⚠️ EL CASO QUE MANDA: una colección que ya existe conserva sus reglas EXACTAMENTE como están. Da
    igual que estén vacías, que sean más abiertas o más cerradas que las nuestras. El sembrado es
    CREATION-ONLY y este lote no lo cambia. Escribir reglas sobre una colección ajena podría abrir
    al público el contenido privado de alguien o dejar fuera a sus propios editores'
  - '⚠️ PERO «no tocamos nada» NO BASTA, y esta es la corrección del tercer bloqueante: se puede
    hacer daño SIN tocar la colección ajena, creando OTRA con una política cruzada incompatible. Si
    `pages` es ajena y privada y creamos `blocks` con una regla que solo mira `parent.status`, los
    bloques de una página que nadie puede ver quedan legibles por la API de bloques. Por eso hay una
    precondición, y por eso aborta'
  - 'Un proyecto ya sembrado ANTES de este lote: sus colecciones existen sin reglas y el sembrado no
    se las pondrá. Su salida es el procedimiento manual de la documentación'
  - 'Un navegador que ya entró alguna vez: puede llevar un override guardado que gana al discovery.
    Es preexistente y del CLIENTE, no del servidor, y por eso la guía de migración lo tiene que
    nombrar'
invariants:
  - '⚠️ LAS REGLAS EXACTAS, DECIDIDAS Y NO NEGOCIABLES. Escríbelas literalmente, como constantes
    exportadas para que el test las pueda comparar por cadena:
    · `pages`      → list/view: `status = "published" || @request.auth.collectionName = "vega_editors"`
    ·              → create/update/delete: `@request.auth.collectionName = "vega_editors"`
    · `blocks`     → list/view: `<parentField>.status = "published" || @request.auth.collectionName = "vega_editors"`
    ·              → create/update/delete: `@request.auth.collectionName = "vega_editors"`
    · `vega_media` → view: CADENA VACÍA (público)
    ·              → list: `@request.auth.collectionName = "vega_editors"`
    ·              → create/update/delete: `@request.auth.collectionName = "vega_editors"`'
  - '⚠️ POR QUÉ `vega_media` LLEVA `view` PÚBLICA PERO `list` CERRADA, y es la corrección del segundo
    bloqueante. El sitio NO lista medios: lista `blocks` y pide `expand` (`vega-astro`,
    `packages/astro/src/loader.ts:102-113`), y PocketBase resuelve una expansión mirando SOLO la
    `viewRule` del registro relacionado (`apis/record_helpers.go:375-409` en 0.39.7). O sea que
    `view` pública es lo que hace falta para que el sitio se construya, y `list` pública no hace
    falta para NADA: lo único que añade es dejar que un anónimo ENUMERE la biblioteca entera con sus
    `title`, `alt` y `tags`, incluidos los assets que no ha publicado nadie. Decidido: se acepta que
    quien conozca un id vea ese registro (los ids de lo publicado ya viajan en el HTML), y NO se
    acepta la enumeración'
  - '⚠️ LAS REGLAS DE `vega_media` VAN EN LA SPEC CANÓNICA (`VEGA_MEDIA_COLLECTION`,
    `src/lib/media/media-collection.ts:40-57`), y esta es la corrección del primer bloqueante. El
    sembrado NO crea esa colección desde una spec propia: llama a `ensureMediaCollection(port)`
    (site-seeding.ts:98-103,165-168), que manda SIEMPRE la spec canónica
    (`media-collection.ts:71-80`). Si pones las reglas en una copia local, los tests pueden pasar y
    el servidor real crear la colección con las reglas en `null`. Y no te saltes el wrapper: es
    «único punto de llamada» documentado y tiene su propio guardarraíl y su test
    (`media-collection.test.ts:123-134`), que tiene que seguir en verde'
  - '⚠️ LA PRECONDICIÓN DE INSTALACIÓN MIXTA, corrección del tercer bloqueante: ANTES de crear
    `blocks`, si `pages` NO la ha creado esta misma corrida (o sea, ya existía), hay que LEER sus
    reglas de lectura y compararlas con las nuestras. Si no coinciden, ABORTA sin escribir nada y di
    por qué, nombrando las dos políticas. NO las corrijas, NO crees `blocks` con otra regla, NO
    sigas. El porqué: la regla de `blocks` delega en el estado de la página, así que solo es correcta
    si la política de `pages` es la que nosotros escribimos; contra unas `pages` privadas ajenas,
    publica por la puerta de atrás'
  - '⚠️ Esa precondición es SOLO LECTURA y vive en el preflight que ya existe (`inspectSeedPlan`,
    site-seeding.ts:185-212), que ya termina TODAS sus lecturas antes de la primera escritura
    (`:154-182`). No inventes un segundo camino de aborto'
  - '⚠️ `<parentField>` NO se escribe a mano: sale de `STARTER_BLOCKS.parentField`, que es lo que ya
    usa `BLOCKS_COLLECTION` (site-seeding.ts:76-78). El manifiesto puede llamarlo de otra forma y la
    regla tiene que seguirle'
  - '⚠️ EL OPERADOR DE IGUALDAD DE UNA REGLA DE POCKETBASE ES `=`, NUNCA `==`. Medido contra 0.39.6:
    con `==` el servidor rechaza la colección entera con `validation_invalid_rule: invalid sign
    operator "=="`. La documentación de este mismo repo llevaba la forma mala. Copia el estilo de
    `SITE_SEED_MANIFEST_READ_RULE` (site-seeding.ts:34), que es la única forma ya verificada'
  - '⚠️ LOS TRES ESTADOS DE UNA REGLA en el vocabulario de Vega son: `null` = DENEGADO, solo
    superusuario; la CADENA VACÍA = PERMITIDO A CUALQUIERA, incluido un anónimo; y un filtro =
    condicional. Y ojo, la proyección `AccessLevel` de Vega es CON PÉRDIDA (colapsa cualquier filtro
    en `conditional`), así que un test que verifique la regla A TRAVÉS del esquema descubierto NO
    está verificando la regla: hay que leer la colección CRUDA'
  - '⚠️ POR QUÉ LA LECTURA DE `pages` NO ES SIMPLEMENTE PÚBLICA: el cargador PÚBLICO del sitio lee
    ANÓNIMO (`createSiteLoader`, `starters/default/src/lib/vega.ts:46-49`, sin token) y ya filtra por
    `status = "published"` él solo. Pero ese filtro es del CLIENTE: sin la regla, un anónimo que
    pida la colección a mano se lleva los borradores. La regla es lo único que los protege. (El
    cargador de PREVIEW sí va autenticado, `vega.ts:52-65`: esa mitad no depende de esto)'
  - '⚠️ Y POR QUÉ `blocks` MIRA A SU PÁGINA: `loadBlocks` filtra SOLO por el padre, sin ningún filtro
    de estado (`packages/astro/src/loader.ts:100-113`). Si la regla de `blocks` no gatea por el
    estado de la página, los bloques de un borrador quedan legibles para cualquiera aunque la página
    no lo esté'
  - '⚠️ PIEZA 2, EL OVERRIDE PERSISTENTE: cambiar el discovery NO basta para migrar a un usuario. La
    resolución prioriza un override de runtime sobre la configuración y el discovery
    (`src/lib/session/backend-config.ts:97-119`), y ese override se guarda en `localStorage`
    (`src/lib/session/backend-override.ts:62-90`) y se escribe desde el formulario
    (`BackendUrlForm.svelte:123-131`). Un navegador que ya lo tenga seguirá entrando contra
    `_superusers` con el camino privilegiado de siempre, y el QA sobre el JSON pasaría igual. La
    guía tiene que decir cómo se detecta y cómo se quita. NO cambies la precedencia en este lote'
  - 'PIEZA 2: las precondiciones que el comentario del starter declara pendientes se cumplen ya (el
    login por colección existe, `adapters/pocketbase/index.ts:432-433`; las capacidades se derivan
    de ella, `index.ts:63-82`), y la que faltaba de verdad, las reglas de contenido, ES LA PIEZA 1 DE
    ESTE MISMO LOTE. Por eso van juntas y no se pueden separar'
  - 'PIEZA 2: `vega_editors` tiene que casar LETRA POR LETRA con el nombre que siembra Vega
    (site-seeding.ts:47)'
repeat_interrupt_revert_behavior:
  - 'Sembrar dos veces: la segunda no reescribe ninguna regla, porque las colecciones ya existen y el
    sembrado es creation-only'
  - 'Sembrar, que aborte por la precondición de instalación mixta, alinear las reglas de `pages` a
    mano y volver a sembrar: la segunda vez completa'
  - 'Un aborto no puede dejar `blocks` a medias ni ninguna regla escrita'
measurement_reference_systems:
  - '⚠️ Que «un anónimo no puede leer un borrador» se mide HACIENDO LA PETICIÓN sin credenciales,
    no leyendo la regla. Y que «la regla es la que queríamos» se mide comparando la CADENA CRUDA
    devuelta por el servidor, no la proyección `AccessLevel` de Vega, que pierde información'
  - '⚠️ Que «un anónimo no puede enumerar los medios» se mide con una petición de LISTA sin
    credenciales; y que «sí puede leer uno concreto», con una petición de VISTA por id. Son dos
    peticiones distintas y hacen falta las dos: probar solo una no distingue esta política de la
    anterior'
  - 'Que «el sitio se puede construir» se mide expandiendo la relación de un bloque publicado como
    anónimo, no listando `vega_media`'
  - 'Que «no toca una colección existente» se mide leyendo las reglas ANTES y DESPUÉS y comparándolas
    byte por byte, no contando llamadas'
  - 'Que el starter «anuncia vega_editors» se mide sobre el documento EMITIDO, no sobre el fuente'
measurement_invalidation_conditions:
  - 'Un test que compruebe el EFECTO de las reglas contra el adaptador `memory` NO mide nada de lo
    que importa: el que evalúa un filtro es PocketBase, y el adaptador en memoria no lo hace igual.
    Contra `memory` solo se puede verificar QUÉ CADENA se envía. Los efectos se verifican contra
    PocketBase real o no se verifican'
  - 'Un test que verifique la regla a través del esquema descubierto no mide: la proyección es con
    pérdida y dos filtros distintos salen iguales'
  - 'Un test de la precondición mixta que fabrique las reglas de `pages` con la MISMA constante que
    escribe el sembrado solo prueba el caso que NO aborta'
product_decisions_reserved_to_david:
  - 'Las reglas de arriba, incluida la asimetría `view` pública / `list` cerrada de `vega_media`, YA
    ESTÁN DECIDIDAS. No las reabras ni las marques como revisables'
  - 'Que el sembrado no modifique colecciones existentes, y que ABORTE ante una instalación mixta en
    vez de adaptarse, YA ESTÁ DECIDIDO'
  - 'Si al escribirlo descubres que alguna de las reglas NO es expresable en PocketBase tal cual (por
    ejemplo, si la travesía por relación no funciona en una regla de LISTA), PARA y dilo en el
    informe con la evidencia. NO la sustituyas por otra cosa por tu cuenta'
  - 'Si descubres una vía por la que un anónimo pueda enumerar medios PESE a la `listRule`, PARA y
    dilo'
repo_claims_that_may_become_false:
  - file: src/lib/media/media-collection.ts
    section_or_quote:
      'Todo lo que el módulo afirme sobre qué declara la spec canónica y sobre el wrapper como
      «único punto de llamada», si tu cambio le añade reglas'
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote:
      'Las secciones «3. Reglas de acceso al manifiesto» y «4. Reglas de acceso al contenido»
      (~628-652), que describen como MANUAL algo que pasa a ser automático en instalaciones nuevas'
  - file: extensions/vegapreview/README.md
    section_or_quote:
      'Las líneas 64-69, que afirman que el starter actual anuncia `_superusers`'
  - file: src/lib/backend/site-seeding.ts
    section_or_quote:
      'Cualquier comentario o docstring que enumere QUÉ escribe el sembrado, o que diga que solo el
      manifiesto lleva reglas, o que describa el preflight sin esta precondición nueva'
  - file: starters/default/src/pages/api/vega/discovery.ts
    section_or_quote: 'El bloque «PENDING PRODUCT DECISION» entero (líneas 9-14)'
  - file: starters/default/README.md
    section_or_quote: '«`auth.collection` (currently `_superusers` in this starter)» (línea 116)'
required_gate:
  - 'vegacms: pnpm check'
  - 'vegacms: pnpm lint'
  - 'vegacms: pnpm test'
  - 'vegacms: pnpm build'
  - 'vega-astro: pnpm gate'
required_behavioral_qa:
  - 'Sembrar un PocketBase limpio y LEER LAS REGLAS CRUDAS de las cuatro colecciones, citándolas
    literales en el informe. Si el sandbox no te deja levantar PocketBase, dilo y cita en su lugar
    las cadenas que el sembrado ENVÍA'
  - 'Anónimo: pedir la lista de páginas y comprobar que solo salen las publicadas'
  - 'Anónimo: pedir un borrador por id y comprobar que se rechaza'
  - 'Anónimo: intentar crear una página y comprobar que se rechaza'
  - 'Anónimo: pedir la LISTA de `vega_media` y comprobar que se rechaza'
  - 'Anónimo: pedir un registro de `vega_media` por id y comprobar que se obtiene'
  - 'Anónimo: listar los bloques de una página publicada con `expand` de su medio, y comprobar que
    la expansión resuelve'
  - 'Anónimo: listar los bloques de un borrador y comprobar que no sale ninguno'
  - 'Editor: leer un borrador, crearlo, editarlo y borrarlo; y listar `vega_media`'
  - 'Sembrar sobre un proyecto con `pages` ya creada con reglas propias y `blocks` ausente, y
    comprobar que ABORTA sin crear `blocks`'
expected_reports:
  - /private/tmp/vega-informes/reglas-de-acceso-del-sitio-sembrado.md
known_unverifiable_items:
  - '⚠️ EL MÁS IMPORTANTE DE ESTE LOTE: PocketBase NO puede abrir puerto en tu sandbox (`EPERM
    listen`), así que el EFECTO real de las reglas, y muy en particular si la travesía por relación
    de la regla de `blocks` funciona igual en una regla de LISTA que en una de VISTA, NO lo puedes
    comprobar. No pelees con eso. Deja los tests escritos para que corran contra PocketBase real,
    DI expresamente cuáles no has podido ejecutar, y NO afirmes que las reglas funcionan: afirma qué
    cadenas se envían. El gate autoritativo, con PocketBase de verdad, lo paso yo'
  - 'Playwright tampoco registra su puerto Mach en el sandbox'
  - 'El juicio visual y la decisión de publicar son de David'
```

## Por qué existe

El sembrado de un paso deja un proyecto que **solo puede tocar un superusuario**. Crea `pages`,
`blocks` y `vega_media` sin ninguna regla de acceso (site-seeding.ts:52-88), y en PocketBase eso
significa denegado para todo el mundo menos para el administrador. Las únicas reglas que escribe hoy
son las de lectura del manifiesto.

Eso rompe las dos mitades del producto a la vez:

- **El sitio no se puede publicar.** El build lee anónimo y sin token (`createSiteLoader`), así que
  contra un proyecto recién sembrado no leería ni una página.
- **Y no hay editores.** Un registro de `vega_editors` entra y no ve nada. Hoy la única salida está
  documentada como un procedimiento manual de seis reglas por colección en el admin de PocketBase,
  que es justo lo que el arranque en un paso venía a quitar de en medio.

No ha saltado antes porque `vegabuild` todavía no está instalado en ningún servidor y ese camino no
se ha ejercido nunca.

Y por eso el starter viaja en este lote y no en otro: anunciar `vega_editors` sin estas reglas
entregaría un editor que no puede editar.

## Verificación

- **Los diez QA conductuales**, y con honestidad sobre cuáles no has podido correr. Los dos de
  `vega_media` van en pareja a propósito: uno solo no distingue esta política de la anterior.
- **Rompe un guardarraíl a propósito**: cambia una de las reglas por otra cadena y comprueba que cae
  el test que la compara literalmente. Antes de sabotear, árbol limpio y tu cambio ya commiteado; la
  restauración se hace desde el estado guardado, nunca desde el índice, y después compruebas que tu
  arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.**

## Cómo entregas

- **Un commit por repo**, sobre las bases y ramas declaradas, cada uno en su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay DOS lotes más en vuelo sobre vegacms.** Uno es dueño del COMPARADOR de formas de campo de
  `site-seeding.ts`, tu mismo fichero: no lo toques. El otro está en `src/lib/form/` y en los
  COMENTARIOS de `src/lib/media/media-collection.ts`: tú tocas de ahí la spec canónica y solo lo que
  tus reglas dejen falso. Si necesitas algo más, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones de los dos repos deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después de los commits**: informe en
  `/private/tmp/vega-informes/reglas-de-acceso-del-sitio-sembrado.md` con commits, pruebas,
  guardarraíles ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
