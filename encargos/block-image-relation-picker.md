# Encargo — Una imagen dentro de un bloque: que el widget de relación pueda ofrecerla

## Contrato de tarea

```yaml
task_id: block-image-relation-picker
prompt_hash: se_calcula_sobre_este_fichero_ya_commiteado
repos:
  - repo_id: vegacms
    base_sha: 3f8a2853695f895db743158e24ad77eda0410b85
    branch: feat/block-image-relation-picker
    worktree: /private/tmp/vegacms-block-image-relation-picker
scope_in:
  - 'src/lib/form/widgets/Relation.svelte: que un campo cuyo destino es `vega_media` pueda LISTAR
    candidatos y seleccionarlos. Hoy no puede: ver `invariants`'
  - 'Su suite, y la de `BlockEditor`/`RecordBlocks` en lo que toque'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ Rediseñar `Relation.svelte` para el resto de destinos. El camino de un `relation` normal
    (con `titleField` y búsqueda) NO puede cambiar de comportamiento en NADA'
  - '⚠️ EL PULIDO VISUAL del selector: rejilla, tamaños, espaciados, estados de hover. Eso lo mira
    David en un navegador y lo ajusta él. Tu trabajo es que FUNCIONE y que sea usable, no que sea
    bonito. No inviertas turnos en afinar CSS'
  - 'El manifiesto, su esquema y `resolveBlockField`: el vocabulario ya está y no se toca'
  - 'src/lib/backend/ ENTERO. La columna ya se deriva bien (block-schema.ts:96-103) y hay otro lote
    trabajando ahí AHORA (`site-seeding-one-step`). No entres'
  - 'extensions/ ENTERO: hay un tercer lote ahí'
  - 'La subida de ficheros nuevos desde el bloque. Esta tarea SELECCIONA de lo que ya hay en
    `/media`. Si crees que hace falta subir desde aquí, PROPÓNLO en el informe; no lo construyas'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'Un campo de bloque `widget: "relation"`, `source: "record"` cuyo destino es `vega_media`
    OFRECE candidatos y permite elegir uno. Hoy no ofrece ninguno'
  - 'El caso MÚLTIPLE (`gallery.images`) permite elegir varios, en un orden estable'
  - 'La selección se guarda como columna física real y sobrevive a recargar el registro'
  - 'Quitar la selección funciona y guarda el vacío'
  - '⚠️ Un `relation` cuyo destino NO es `vega_media` se comporta EXACTAMENTE igual que hoy, tanto
    con `titleField` como en su modo degradado. Con test que lo fije'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - '`pnpm check`, `pnpm lint`, `pnpm test` y `pnpm build` verdes, con salida literal'
adversaries:
  - '⚠️ `vega_media` con CERO registros: el editor no ha subido nada todavía. Es el primer contacto
    real, porque un proyecto recién sembrado está así. Qué se ve, y que no sea una zona muerta sin
    explicación'
  - 'Muchos registros: la paginación tiene que existir, no cargar todo de golpe'
  - 'Un registro de media cuyo fichero ya no está o no es una imagen (un PDF, un vídeo)'
  - 'Un valor YA GUARDADO que apunta a un registro de media BORRADO: no puede tumbar el formulario'
  - 'El campo múltiple con el mismo asset elegido dos veces'
  - 'Un `relation` a `vega_media` fuera de un bloque, si el modelo permite declararlo'
preexisting_data_cases:
  - 'Un bloque que YA tiene una imagen guardada en su columna: al abrir el formulario tiene que
    aparecer seleccionada, no vacía. Es lo que distingue «funciona» de «parece que funciona»'
invariants:
  - '⚠️ LA CAUSA REAL, y no es la que dice el título de la tarea. El campo YA se pinta y YA se
    guarda: `BlockEditor.svelte:357-366` monta `FieldRow` para los `source: "record"`,
    `registry.ts:47` mapea `relation` a `Relation.svelte`, y `to-record-input.ts` es genérico. Lo
    que NO funciona es que el widget pueda OFRECER candidatos: resuelve su destino contra
    `ctx.model.types` (`Relation.svelte:66-68`), y `vega_media` NO ES UN TIPO DE CONTENIDO del
    manifiesto (el del starter solo declara `pages` y `blocks`). Así que `target` sale `null`,
    `degraded` sale `true`, y las dos vías de listar arrancan con `if (!target) return`
    (`Relation.svelte:174`). El control se pinta y no puede ofrecer ni una sola imagen. VERIFÍCALO
    tú antes de tocar nada: si te encuentras otra causa, PARA y dilo'
  - '⚠️ NO metas `vega_media` dentro de `ContentModel.types` para arreglar esto. Es una colección de
    sistema con su propia ruta `/media` y su propio flujo; inyectarla en el modelo la haría aparecer
    como un tipo de contenido editable en toda la aplicación, que es un cambio de producto que nadie
    ha pedido. El destino se reconoce comparando con `VEGA_MEDIA_COLLECTION`
    (src/lib/media/media-collection.ts:41), que es un dato que el widget ya tiene en `schema.target`'
  - 'La cardinalidad ya está resuelta por convención v1: un `relation` de bloque es MÚLTIPLE solo si
    el campo se llama literalmente `images` (block-schema.ts:96-103). No la reinventes'
  - 'Los componentes de media YA EXISTEN y hoy solo los usa el widget `file`: `MediaGrid.svelte` y
    `MediaPicker.svelte` bajo `src/lib/media/`, más su estado de carga. REÚSALOS. Si alguno está
    acoplado a la ruta `/media` y no se puede reusar tal cual, dilo en el informe en vez de
    duplicarlo'
  - 'El widget NUNCA conoce PocketBase: habla con `ctx.port` y con el `ContentModel` resuelto
    (D-P5.9). Eso no cambia'
repeat_interrupt_revert_behavior:
  - 'Abrir el formulario, elegir, cerrar sin guardar y volver a abrir: no queda nada pegado'
  - 'Guardar, recargar y reabrir: la selección sigue ahí'
  - 'Elegir y deshacer deja el campo como estaba, y el estado «sucio» del formulario lo refleja'
measurement_reference_systems:
  - 'Que «ofrece candidatos» se mide contando los candidatos que el usuario puede ver y pulsar, no
    comprobando que el componente se montó. Hoy el componente ya se monta y no sirve de nada'
  - 'Que «se guarda» se mide leyendo el registro del backend después de guardar, no el estado del
    formulario'
measurement_invalidation_conditions:
  - 'Un test que monte el widget con un `ContentModel` fabricado donde `vega_media` SÍ es un tipo NO
    mide nada: es exactamente la condición que no se da en producción y la causa del bug'
  - 'Un test que compruebe que existe un botón sin comprobar que al pulsarlo cambia el valor tampoco
    mide: el bug de hoy es justamente un control que existe y no ofrece nada'
product_decisions_reserved_to_david:
  - 'CÓMO SE VE el selector: es suyo y lo ajusta él en el navegador. Haz algo funcional y sobrio'
  - 'Si hace falta poder SUBIR desde el bloque: propón, no construyas'
  - 'Qué pasa con un asset que no es imagen: si tu implementación necesita decidirlo, di qué
    decidiste y por qué, y márcalo como revisable'
repo_claims_that_may_become_false:
  - file: src/lib/form/widgets/Relation.svelte
    section_or_quote:
      'El comentario de ~68-70 que llama al caso sin destino resuelto "Defensivo (no debería
      pasar — el manifiesto/esquema garantiza `target` válido, L11)". Es FALSO hoy para
      `vega_media`, y es exactamente el bug. Si tu cambio lo arregla, esa frase tiene que decir la
      verdad nueva'
  - file: src/lib/media/media-collection.ts
    section_or_quote:
      'Cualquier afirmación sobre quién consume los componentes de media, si pasas a consumirlos
      desde el formulario'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
required_behavioral_qa:
  - '⚠️ Con `vega_media` VACÍA: abrir un bloque con campo de imagen y comprobar qué se ve. No puede
    ser un hueco mudo'
  - 'Con varios assets: elegir uno, guardar, recargar y comprobar que sigue'
  - 'En `gallery.images`: elegir dos, guardar, recargar, comprobar orden'
  - 'Un `relation` a una colección normal: comprobar que su comportamiento NO cambió'
expected_reports:
  - /private/tmp/vega-informes/block-image-relation-picker.md
known_unverifiable_items:
  - 'El gate completo no corre dentro del sandbox: Playwright no registra su puerto Mach. Corre las
    suites de componente que puedas y DI cuáles no. El gate autoritativo lo paso yo'
  - 'El juicio visual es de David y no lo puedes emitir tú'
```

## Por qué existe

Una imagen dentro de un bloque no puede ir en el JSON: los campos `file` de PocketBase son **por
columna**, así que la imagen es una **relación a un registro de `vega_media`**. Eso no es un rodeo,
es la regla de frontera funcionando, y encima devuelve el «¿dónde se usa este asset?» dentro de los
bloques.

El manifiesto del starter ya lo declara así (`hero.image`, `image.image`, `gallery.images`), la
columna ya se deriva, el campo ya se pinta y ya se guarda. **Y aun así hoy nadie puede poner una
imagen en un bloque**, porque el widget no puede ofrecer ni un candidato. Esa es toda la tarea.

## Lo que hay que construir

Que un campo de relación cuyo destino es `vega_media` pueda enseñar lo que hay en la mediateca y
dejar elegir. Reusando lo que ya existe en `src/lib/media/`, no construyendo un segundo visor.

**El listón:** que un editor abra un bloque `image` en un proyecto recién sembrado, vea su mediateca
(o un vacío que le diga qué hacer), elija una imagen, guarde, recargue y siga ahí.

## Verificación

- **Los cuatro QA conductuales.** El primero, `vega_media` vacía, es el que más se olvida y el que
  todo editor nuevo va a ver primero.
- **Rompe un guardarraíl a propósito**: haz que el reconocimiento del destino media falle, y
  comprueba que cae el test de «ofrece candidatos», no solo el de que el componente monta. Antes de
  sabotear, árbol limpio y tu cambio ya commiteado; la restauración se hace desde el estado
  guardado, nunca desde el índice, y después compruebas que tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `3f8a285`, rama `feat/block-image-relation-picker` y su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay DOS lotes más sobre este repo ahora mismo**: uno en `src/lib/backend/` y otro en
  `extensions/`. Tú no entras en ninguno de los dos. Si necesitas algo de ahí, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/block-image-relation-picker.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
