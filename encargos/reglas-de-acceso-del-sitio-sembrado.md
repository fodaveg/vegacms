# Encargo — Que el proyecto sembrado sea publicable y editable sin ser superusuario

## Contrato de tarea

```yaml
task_id: reglas-de-acceso-del-sitio-sembrado
prompt_hash: e5f8a1f42c0729a5b771da7480b3b590c70fcab6a904c286d5941a32d44c7dc5
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
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
  - 'PIEZA 2 (vega-astro): `starters/default/src/pages/api/vega/discovery.ts` — que el starter
    anuncie `vega_editors` en vez de `_superusers`, y la guía de migración en
    `starters/default/README.md`'
  - 'PIEZA 3 (vegacms): `docs/POCKETBASE-INTEGRATION.md` — el procedimiento MANUAL de reglas
    (secciones «3.» y «4.», alrededor de las líneas 628-652) tiene que decir qué hace ya el sembrado
    solo y para quién sigue haciendo falta hacerlo a mano'
  - 'Las afirmaciones de los dos repos que tu propio cambio deja falsas'
scope_out:
  - '⚠️ TOCAR LAS REGLAS DE UNA COLECCIÓN QUE YA EXISTE. Jamás, bajo ninguna condición, ni aunque
    estén vacías, ni aunque «claramente falten». Ver el invariante de la frontera'
  - '⚠️ La frontera pieza-a-pieza del sembrado, el orden de aplicación, el preflight de solo lectura
    y el aborto sin escribir. Son el contrato vigente y NO cambian. Tú solo añades reglas a las
    colecciones que ese contrato ya decide crear'
  - '⚠️ Las reglas de `vega` (el manifiesto): ya las escribe el sembrado
    (`SITE_SEED_MANIFEST_READ_RULE`, site-seeding.ts:34,94-95) y NO se tocan'
  - '⚠️ Las reglas de `vega_editors`: se quedan como están. Su `authRule` nace permitida y su
    `manageRule` nace solo-superusuario, que es lo que se quiere (a los editores los da de alta un
    superusuario). NO le abras `listRule`: un editor no necesita listar a los demás'
  - '`extensions/` ENTERO en vegacms: `vegapreview` y `vegabuild` no se tocan. Hay otro lote ahí'
  - '`src/lib/form/` y `src/lib/media/` en vegacms: hay un tercer lote ahí'
  - 'El resto del documento de discovery del starter: solo cambia `auth.collection`'
  - 'El renderizador de migraciones. Este lote NO tiene que emitir una migración'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Tras sembrar un PocketBase limpio, un cliente ANÓNIMO puede listar y leer las páginas
    `published` y sus bloques, y NO puede leer las que están en `draft`'
  - 'Tras sembrar, un registro de `vega_editors` puede listar, leer, crear, actualizar y borrar
    páginas, bloques y medios, incluidos los borradores'
  - 'Tras sembrar, un cliente anónimo NO puede crear, actualizar ni borrar nada'
  - '⚠️ Sembrar sobre un proyecto donde `pages` YA EXISTE no cambia ni una regla de `pages`, tenga
    las que tenga. Con test'
  - 'Las reglas escritas son LITERALMENTE las fijadas en `invariants`, y el test las compara como
    cadenas, no por su efecto'
  - 'Correr el sembrado dos veces seguidas no cambia ninguna regla la segunda vez'
  - 'PIEZA 2: el documento de discovery emitido anuncia `vega_editors`, el bloque «PENDING PRODUCT
    DECISION» desaparece, y el README del starter explica qué hace un proyecto ya creado con
    `_superusers`'
  - 'PIEZA 3: la documentación distingue qué hace el sembrado solo de qué sigue siendo manual'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - 'Gate verde en los dos repos hasta donde el sandbox lo permita, con salida literal'
adversaries:
  - '⚠️ Una página en `draft` con bloques: un anónimo NO puede leer esos bloques. La regla de
    `blocks` tiene que mirar el estado de su PÁGINA, no el suyo, porque un bloque no tiene estado'
  - 'Un bloque HUÉRFANO, cuya página ya no está: no puede quedar legible por accidente'
  - 'Un editor autenticado contra OTRA colección auth que no es `vega_editors`: no puede editar nada'
  - 'Un superusuario: sigue pudiendo todo, porque PocketBase no evalúa reglas para él. Eso no lo
    decides tú, es del servidor'
  - 'Un proyecto sembrado ANTES de este lote, con las colecciones ya creadas y sin reglas: el
    sembrado NO se las va a poner nunca. Esa gente necesita el procedimiento manual, y por eso la
    pieza 3 existe'
preexisting_data_cases:
  - '⚠️ EL CASO QUE MANDA: una colección que ya existe conserva sus reglas EXACTAMENTE como están.
    Da igual que estén vacías, que sean más abiertas o más cerradas que las nuestras. El sembrado es
    CREATION-ONLY y este lote no lo cambia. Escribir reglas sobre una colección ajena podría abrir
    al público el contenido privado de alguien o dejar fuera a sus propios editores'
  - 'Una página ya existente en `draft` deja de ser legible por anónimos en cuanto la colección se
    cree con estas reglas. Eso solo puede pasar en una instalación nueva, porque en una existente no
    tocamos nada'
invariants:
  - '⚠️ LAS REGLAS EXACTAS, DECIDIDAS Y NO NEGOCIABLES. Escríbelas literalmente, como constantes
    exportadas para que el test las pueda comparar por cadena:
    · `pages`   → list/view: `status = "published" || @request.auth.collectionName = "vega_editors"`
    ·            → create/update/delete: `@request.auth.collectionName = "vega_editors"`
    · `blocks`  → list/view: `<parentField>.status = "published" || @request.auth.collectionName = "vega_editors"`
    ·            → create/update/delete: `@request.auth.collectionName = "vega_editors"`
    · `vega_media` → list/view: cadena VACÍA (público)
    ·            → create/update/delete: `@request.auth.collectionName = "vega_editors"`'
  - '⚠️ `<parentField>` NO se escribe a mano: sale de `STARTER_BLOCKS.parentField`, que es lo que ya
    usa `BLOCKS_COLLECTION` (site-seeding.ts:76-78). El manifiesto puede llamarlo de otra forma y la
    regla tiene que seguirle'
  - '⚠️ EL OPERADOR DE IGUALDAD DE UNA REGLA DE POCKETBASE ES `=`, NUNCA `==`. Medido contra 0.39.6:
    con `==` el servidor rechaza la colección entera con `validation_invalid_rule: invalid sign
    operator "=="`. La documentación de este mismo repo llevaba la forma mala. Copia el estilo de
    `SITE_SEED_MANIFEST_READ_RULE` (site-seeding.ts:34), que es la única forma ya verificada'
  - '⚠️ LOS TRES ESTADOS DE UNA REGLA en el vocabulario de Vega son: `null` = DENEGADO, solo
    superusuario; la CADENA VACÍA = PERMITIDO A CUALQUIERA, incluido un anónimo; y un filtro =
    condicional. Los confunde todo el mundo: `vega_media` en lectura lleva CADENA VACÍA, que es
    pública, no `null`. Y ojo, la proyección `AccessLevel` de Vega es CON PÉRDIDA (colapsa cualquier
    filtro en `conditional`), así que un test que verifique la regla A TRAVÉS del esquema descubierto
    NO está verificando la regla'
  - '⚠️ POR QUÉ `vega_media` ES DE LECTURA PÚBLICA y no de editores: el sitio publicado sirve esas
    imágenes desde sus URLs de fichero, que ya son públicas, y el cargador de Astro expande la
    relación del bloque para resolverlas (`packages/astro/src/loader.ts:104-113`). Cerrar el
    registro mientras los bytes son públicos no protege nada y rompe el build. Decidido; no lo
    reabras'
  - '⚠️ POR QUÉ LA LECTURA DE `pages` NO ES SIMPLEMENTE PÚBLICA: el build del sitio lee ANÓNIMO
    (`createSiteLoader`, `starters/default/src/lib/vega.ts:46-49`, sin token) y ya filtra por
    `status = "published"` él solo. Pero ese filtro es del CLIENTE: sin la regla, un anónimo que
    pida la colección a mano se lleva los borradores. La regla es lo único que los protege'
  - '⚠️ Y POR QUÉ `blocks` MIRA A SU PÁGINA: `loadBlocks` filtra SOLO por el padre, sin ningún filtro
    de estado (`packages/astro/src/loader.ts:100-113`). Si la regla de `blocks` no gatea por el
    estado de la página, los bloques de un borrador quedan legibles para cualquiera aunque la página
    no lo esté'
  - 'PIEZA 2: las tres precondiciones que el comentario del starter declara pendientes se cumplen ya
    (la colección y sus reglas las siembra Vega; el login por colección existe,
    `adapters/pocketbase/index.ts:432-433`; las capacidades ya se derivan de ella,
    `index.ts:63-82`), y la que faltaba de verdad, las reglas de contenido, ES LA PIEZA 1 DE ESTE
    MISMO LOTE. Por eso van juntas y no se pueden separar'
  - 'PIEZA 2: `vega_editors` tiene que casar LETRA POR LETRA con el nombre que siembra Vega
    (site-seeding.ts:47)'
repeat_interrupt_revert_behavior:
  - 'Sembrar dos veces: la segunda no reescribe ninguna regla, porque las colecciones ya existen y el
    sembrado es creation-only'
  - 'Sembrar, que aborte a mitad por divergencia de otra pieza, arreglar y volver a sembrar: las
    colecciones ya creadas conservan las reglas que se les pusieron al crearlas'
measurement_reference_systems:
  - '⚠️ Que «un anónimo no puede leer un borrador» se mide HACIENDO LA PETICIÓN sin credenciales,
    no leyendo la regla. Y que «la regla es la que queríamos» se mide comparando la CADENA CRUDA
    devuelta por el servidor, no la proyección `AccessLevel` de Vega, que pierde información'
  - 'Que «no toca una colección existente» se mide leyendo las reglas ANTES y DESPUÉS y comparándolas
    byte por byte, no contando llamadas'
  - 'Que el starter «anuncia vega_editors» se mide sobre el documento EMITIDO, no sobre el fuente'
measurement_invalidation_conditions:
  - 'Un test que compruebe el efecto de las reglas contra el adaptador `memory` NO mide nada de lo
    que importa: el que evalúa un filtro es PocketBase, y el adaptador en memoria no lo hace igual.
    Contra `memory` solo se puede verificar QUÉ CADENA se envía. Los efectos se verifican contra
    PocketBase real o no se verifican'
  - 'Un test que verifique la regla a través del esquema descubierto no mide: la proyección es con
    pérdida y dos filtros distintos salen iguales'
product_decisions_reserved_to_david:
  - 'Las seis reglas de arriba YA ESTÁN DECIDIDAS. No las reabras ni las marques como revisables'
  - 'Que el sembrado no toque colecciones existentes YA ESTÁ DECIDIDO'
  - 'Si al escribirlo descubres que alguna de las seis reglas NO es expresable en PocketBase tal cual
    (por ejemplo, si la travesía por relación no funciona en una regla de lista), PARA y dilo en el
    informe con la evidencia. NO la sustituyas por otra cosa por tu cuenta'
repo_claims_that_may_become_false:
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote:
      'Las secciones «3. Reglas de acceso al manifiesto» y «4. Reglas de acceso al contenido»
      (~628-652), que describen como MANUAL algo que pasa a ser automático en instalaciones nuevas'
  - file: src/lib/backend/site-seeding.ts
    section_or_quote:
      'Cualquier comentario o docstring que enumere QUÉ escribe el sembrado, o que diga que solo el
      manifiesto lleva reglas'
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
  - 'Con un cliente anónimo: pedir la lista de páginas y comprobar que solo salen las publicadas'
  - 'Con un cliente anónimo: intentar crear una página y comprobar que se rechaza'
  - 'Con un editor: leer un borrador, crearlo, editarlo y borrarlo'
  - 'Sembrar sobre un proyecto con `pages` ya creada con reglas propias y comprobar que siguen igual'
expected_reports:
  - /private/tmp/vega-informes/reglas-de-acceso-del-sitio-sembrado.md
known_unverifiable_items:
  - '⚠️ EL MÁS IMPORTANTE DE ESTE LOTE: PocketBase NO puede abrir puerto en tu sandbox (`EPERM
    listen`), así que el EFECTO real de las reglas, y muy en particular si la travesía por relación
    de la regla de `blocks` funciona tal cual, NO lo puedes comprobar. No pelees con eso. Deja los
    tests escritos para que corran contra PocketBase real, DI expresamente cuáles no has podido
    ejecutar, y NO afirmes que las reglas funcionan: afirma qué cadenas se envían. El gate
    autoritativo, con PocketBase de verdad, lo paso yo'
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

- **Los cinco QA conductuales**, y con honestidad sobre cuáles no has podido correr.
- **Rompe un guardarraíl a propósito**: cambia una de las seis reglas por otra cadena y comprueba que
  cae el test que la compara literalmente. Antes de sabotear, árbol limpio y tu cambio ya
  commiteado; la restauración se hace desde el estado guardado, nunca desde el índice, y después
  compruebas que tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.**

## Cómo entregas

- **Un commit por repo**, sobre las bases y ramas declaradas, cada uno en su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay más lotes en vuelo sobre vegacms**: uno en `extensions/` y `src/lib/backend/site-seeding.ts`
  (el comparador de `select`), y otro en `src/lib/form/` y `src/lib/media/`. Tú tocas
  `site-seeding.ts` también, así que **limítate a las reglas** y no reordenes ni reescribas nada más
  de ese fichero. Si necesitas tocar otra cosa, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones de los dos repos deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después de los commits**: informe en
  `/private/tmp/vega-informes/reglas-de-acceso-del-sitio-sembrado.md` con commits, pruebas,
  guardarraíles ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
