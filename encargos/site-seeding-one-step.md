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
scope_in:
  - 'Un sembrado en src/lib/backend/ que, desde un PocketBase LIMPIO, deje un proyecto usable:
    `pages`, `blocks`, `vega_media`, `vega_editors`, el manifiesto guardado y una primera página'
  - 'Las columnas derivadas del manifiesto de partida, REUSANDO `deriveBlockRecordFields`
    (src/lib/backend/block-schema.ts:298). NO escribas una segunda derivación en paralelo'
  - 'La regla de lectura de `vega`, acotada a `vega_editors` (ver product_decisions, ya decidido)'
  - 'La emisión de su migración, como el resto de operaciones de esquema'
  - 'Su suite, y la parte de la suite de contrato compartida que le toque'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ extensions/ ENTERO. Hay OTRO lote corriendo AHORA sobre este mismo repo
    (`vegapreview-allowlist-obligatoria`) que trabaja solo ahí. No lo toques ni para leerlo de reojo'
  - '⚠️ Que la PLANTILLA anuncie `vega_editors` en su discovery: eso es `vega-astro` y va en un lote
    POSTERIOR. Mientras este sembrado no esté publicado, ese anuncio sería mentira'
  - 'Rediseñar `ensureCollections` o el puerto. Acaba de cambiar hoy y es CREATION-ONLY a propósito:
    trabaja CON esa semántica, no contra ella'
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
  - '⚠️ DECISIÓN 1: correrlo dos veces COMPLETA lo que falte. Crea solo lo ausente y no modifica
    jamás lo que ya existe. Con test'
  - '⚠️ DECISIÓN 2: ante DIVERGENCIA, aborta SIN HABER ESCRITO UNA FILA, y PocketBase queda BYTE A
    BYTE como estaba. Con test que lo mida leyendo el servidor, no el valor de retorno'
  - 'El informe de divergencia dice QUÉ encontró CONTRA QUÉ esperaba, por nombre. Un «diverge» a
    secas obliga a un humano a adivinar en el admin'
  - 'La regla de lectura de `vega` queda acotada a `vega_editors` en una instalación NUEVA, y
    NO se toca en una que ya existía'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - '`pnpm gate` verde, salida literal'
adversaries:
  - '⚠️ El PocketBase a medio sembrar: `pages` existe, `blocks` no. Es la DECISIÓN 1, y es el caso
    real (te quedaste a medias, o añadiste un tipo de bloque nuevo)'
  - '⚠️ Una colección con el nombre esperado pero OTRA FORMA. Es la DECISIÓN 2 y es lo que separa
    este sembrado de un destructor de datos'
  - 'Un `blocks` que existe con las cuatro estructurales pero SIN las columnas derivadas
    (`image`, `images`). ¿Es «falta» o es «diverge»? Decídelo con la frontera de abajo y dilo'
  - 'Un `vega_editors` que YA EXISTE con usuarios dentro'
  - 'Una primera página que YA EXISTE (segunda pasada): no puede duplicarse ni pisarse'
  - 'Un manifiesto YA GUARDADO y distinto del de partida: es contenido de un humano'
  - 'El orden: `blocks` referencia a `pages` Y a `vega_media`. Sembrar en orden ingenuo falla'
  - 'Un campo `relation` de bloque que NO se llama `images`: por convención v1 sale SIMPLE
    (block-schema.ts:96-103). Si el manifiesto de partida trae alguno así, míralo dos veces'
preexisting_data_cases:
  - '⚠️ TODO el lote es un caso de datos preexistentes. La diferencia entre la DECISIÓN 1 y la 2 es
    la diferencia entre completar una instalación y romperla'
  - 'Una instalación existente con `vega` ya abierta a mano por el operador: creation-only garantiza
    que no se toca. VERIFÍCALO, no lo asumas'
invariants:
  - '⚠️ LA FRONTERA ENTRE «FALTA» Y «DIVERGE» ES EL FILO DE ESTA TAREA, y hay que definirla
    EXPLÍCITAMENTE en el código y en el informe: «falta» = ausente POR COMPLETO ⇒ se crea.
    «Diverge» = existe con forma distinta ⇒ aborta TODO. No hay tercer camino: nada se modifica ni
    se pisa. Si al implementar aparece un caso que no cae limpio en ninguno de los dos, PARA y
    dilo; no inventes el tercero'
  - '⚠️ INSPECCIONA EL ESTADO ENTERO ANTES DE ESCRIBIR NADA. No es un detalle de implementación: es
    lo único que hace posible «aborta sin haber escrito una fila». Un sembrado que valida sobre la
    marcha ya ha escrito cuando descubre la divergencia'
  - '⚠️ `ensureCollections` es CREATION-ONLY desde hoy (`3f8a285`): si el nombre existe, lo salta y
    NO actualiza tipo, reglas ni campos. Eso es deliberado y protege instalaciones reales. Para
    completar COLUMNAS que faltan en una colección existente, el camino es `addCollectionFields`,
    no un `ensureCollections` que pise'
  - 'La generación de `CollectionSpec` DEBE pasar por `topologicallySortCollectionSpecs`
    (src/lib/backend/migration.ts:147): `blocks` referencia a `pages` Y a `vega_media`'
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
  - 'Segunda pasada sobre un proyecto a medias: completa SOLO lo ausente'
  - 'Interrupción a mitad: lo ya creado se queda (no hay rollback implícito, igual que
    `ensureCollections`), y la siguiente pasada lo completa. Decir esto explícitamente'
  - 'Ante divergencia no hay nada que revertir, porque no se escribió nada'
measurement_reference_systems:
  - 'El estado se mide leyendo el servidor CRUDO. Las reglas, con `pb.collections.getOne` y
    comparando la cadena literal: la proyección `AccessLevel` es CON PÉRDIDA y colapsa cualquier
    filtro en `conditional`'
  - 'Las colecciones `auth` NO aparecen en el esquema descubierto (schema.ts:16-20). `vega_editors`
    se mide en el servidor, nunca preguntándole al descubrimiento'
  - '"Byte a byte como estaba" se mide capturando el estado ANTES y comparándolo DESPUÉS del intento
    fallido, no por el error devuelto'
  - 'La migración se aplica contra PocketBase REAL en la verificación. Que el `.js` se vea bien no
    prueba nada'
measurement_invalidation_conditions:
  - 'Un test de idempotencia que compare valores de retorno no mide nada: hay que comparar el estado
    del servidor'
  - 'Un test de divergencia que solo compruebe que se lanzó un error no mide la promesa: la promesa
    es que NO SE ESCRIBIÓ NADA'
  - 'Si el test construye el estado esperado con el mismo helper que el sembrado, es tautológico'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO (29 jul): correrlo dos veces completa lo que falte; ante divergencia, abortar sin
    escribir; manifiesto de partida = el del starter TAL CUAL, los seis tipos'
  - '⚠️ YA DECIDIDO (29 jul, esta sesión): la ViewRule de `vega` se abre ACOTADA A `vega_editors`,
    no a cualquier autenticado. Es más estrecha que lo que la documentación pide hoy a mano, y
    creation-only garantiza que solo ocurre en instalaciones nuevas'
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
  - file: docs/CONFIG.md
    section_or_quote: 'Si describe el arranque de un proyecto nuevo. COMPRUÉBALO antes de tocarlo'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
  - 'pnpm gate'
required_behavioral_qa:
  - 'Contra PocketBase REAL y LIMPIO: sembrar y comprobar las cuatro colecciones, el manifiesto, la
    primera página y las dos columnas derivadas'
  - 'Contra PocketBase REAL: sembrar, borrar `blocks`, volver a sembrar y comprobar que se completa'
  - '⚠️ Contra PocketBase REAL: crear `pages` con OTRA FORMA, sembrar, y comprobar que aborta y que
    el servidor quedó idéntico'
  - 'Contra PocketBase REAL: la ViewRule de `vega` acotada a `vega_editors`, leída cruda'
expected_reports:
  - /private/tmp/vega-informes/site-seeding-one-step.md
known_unverifiable_items:
  - 'El gate completo no corre dentro del sandbox: PocketBase no puede abrir puerto y Playwright no
    registra su puerto Mach. Usa `GOCACHE=/private/tmp/vega-go-build-cache`, corre lo que puedas y
    dilo'
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

Las tres decisiones de David se reducen a una frontera que hay que dejar escrita:

- **«Falta»** = ausente por completo ⇒ **se crea**.
- **«Diverge»** = existe con forma distinta ⇒ **se aborta todo, sin escribir una fila**.

No hay tercer camino. Un sembrado que «arregla» lo que diverge es un destructor de datos con buenas
intenciones, y un sembrado que se rinde ante lo que falta no sirve para el caso real, que es volver a
correrlo después de añadir un tipo de bloque al manifiesto.

De ahí sale la consecuencia estructural: **inspecciona el estado entero ANTES de escribir nada**. Si
validas sobre la marcha, cuando descubras la divergencia ya has escrito.

### Las tres trampas

1. **`ensureCollections` es creation-only desde hoy.** Si el nombre existe, lo salta entero: no
   actualiza tipo, ni reglas, ni campos. Eso te protege (no puedes pisar una instalación real) y te
   estorba (no puedes completar columnas con él). Para columnas ausentes en una colección existente,
   el camino es `addCollectionFields`. Trabaja CON esa semántica.

2. **El manifiesto de partida vive en OTRO REPO.** Copiarlo aquí crea una segunda fuente que diverge
   sola. Este proyecto ya publicó tres veces documentación caducada exactamente así. Copia el
   contenido tal cual y **propón** cómo detectar la divergencia; no construyas el mecanismo sin
   decírmelo.

3. **`vega_editors` es una colección `auth`, y las `auth` son invisibles al descubrimiento**
   (`schema.ts:16-20`). Si tu comprobación de «¿existe ya?» pregunta al esquema descubierto, la
   respuesta siempre será «no» y la segunda pasada intentará crearla otra vez.

## Verificación

- **Contra PocketBase real**, los cuatro QA conductuales. El tercero (crear `pages` con otra forma,
  sembrar, comprobar que el servidor quedó idéntico) es el que representa la promesa entera.
- **Rompe un guardarraíl a propósito**: haz que el sembrado escriba algo ANTES de terminar la
  inspección, y comprueba que cae el test de «byte a byte como estaba». Antes de sabotear, árbol
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
