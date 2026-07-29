# Encargo — El puerto aprende colecciones `auth` y reglas de acceso

## Contrato de tarea

```yaml
task_id: port-auth-collections-rules
prompt_hash: se_calcula_sobre_este_fichero_ya_commiteado
repos:
  - repo_id: vegacms
    base_sha: 1480c3be1ba3a15e7c230223c366a645409377b2
    branch: feat/port-auth-collections-rules
    worktree: /private/tmp/vegacms-port-auth-collections-rules
scope_in:
  - 'CollectionSpec: expresar el TIPO de colección (`base` / `auth`) y las REGLAS de acceso'
  - 'adapters/pocketbase/collections.ts: escribirlos al crear, y validar antes de la red'
  - 'adapters/memory/index.ts: modelarlos o rechazarlos, pero NUNCA fingir que los aplicó'
  - 'tests/contract/backend-contract.ts: cubrir lo nuevo en la suite COMPARTIDA memory + PB real'
  - 'Una capability nueva, si y solo si el puerto no puede cumplir el contrato sin declararla'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - 'CAMBIAR las reglas de VEGA_COLLECTION, VEGA_MEDIA_COLLECTION o VEGA_REVISIONS_COLLECTION.
    Decisión de David: siguen naciendo cerradas. Que el puerto SEPA declararlas no significa que
    estas las usen'
  - 'Sembrar `vega_editors` ni ninguna colección auth concreta: eso es otro lote'
  - 'El sembrado de proyecto, que sigue sin existir'
  - 'La UI de autoría (SchemaAuthoringPanel): no tiene que ofrecer nada de esto todavía'
  - 'Colecciones `view`: fuera de alcance, no las inventes'
  - 'backend/ ajeno al esquema, extensions/, vega-astro, READMEs y notas de release'
acceptance_criteria:
  - 'Una CollectionSpec puede declarar `auth` y crearse como colección auth en PocketBase real'
  - 'Una CollectionSpec puede declarar sus reglas y estas quedan escritas TAL CUAL en el servidor'
  - 'Los tres estados de una regla viajan sin pérdida: `null` (denegado), `""` (permitido) y un
    filtro (condicional)'
  - 'Omitir las reglas conserva el comportamiento de HOY: cerradas, solo superuser'
  - 'Una regla inválida se rechaza ANTES de llamar a la red, como ya se hace con las opciones de
    `select`'
  - 'ensureCollections sigue siendo idempotente, también para colecciones auth'
  - 'Una colección PREEXISTENTE no pierde sus reglas por que alguien vuelva a sembrarla'
  - 'La suite de contrato COMPARTIDA cubre lo nuevo y pasa contra memory y contra PocketBase real'
  - 'Un guardarraíl roto a propósito, con su salida'
adversaries:
  - 'Una regla con sintaxis de filtro INVÁLIDA para PocketBase'
  - 'Una colección auth cuyo nombre ya existe como colección `base`'
  - 'Reglas propias de auth (`manageRule`, `authRule` si el servidor las expone) frente a las cinco
    comunes'
  - 'Sembrar DOS VECES la misma colección auth: la segunda pasada no puede duplicar ni pisar'
  - 'Una colección auth que YA EXISTE y tiene usuarios dentro'
  - 'Una colección preexistente cuyas reglas ya fueron abiertas a mano por el operador'
  - 'Una spec que declara `auth` y a la vez campos que chocan con los de sistema de una colección
    auth (`email`, `password`, `tokenKey`, `verified`, `emailVisibility`)'
  - 'El adaptador `memory`, que no tiene reglas de verdad: qué hace y cómo lo dice'
preexisting_data_cases:
  - '⚠️ EL CORAZÓN DEL LOTE. Hoy la documentación le pide al operador que abra `vega` A MANO con
    `@request.auth.id != null` (docs/POCKETBASE-INTEGRATION.md:611-624). Si ensureCollections pasa a
    escribir reglas, una segunda pasada sobre una instalación existente podría PISAR esa regla y
    volver a cerrarla, dejando a todos los editores fuera. Di explícitamente qué hace tu
    implementación con una colección que ya existe y ya tiene reglas, y pruébalo'
  - 'Una colección auth existente con usuarios: recrearla o alterarla no puede tirarlos'
invariants:
  - 'Los tres estados de `mapRule` (schema.ts:74-95) son el vocabulario canónico: `null` = denegado,
    `""` = permitido, cualquier otra cadena = condicional'
  - '⚠️ La proyección `AccessLevel` es CON PÉRDIDA: dos filtros distintos dan ambos `conditional`.
    NO sirve para verificar que se escribió la regla correcta'
  - 'schema.ts:16-20 EXCLUYE las colecciones `auth` del esquema descubierto. Una colección auth que
    crees NO aparecerá en el descubrimiento: piensa qué significa eso para la idempotencia, porque
    una segunda pasada podría no verla y volver a intentar crearla'
  - 'Omitir una propiedad nueva conserva exactamente el comportamiento actual. Ningún consumidor de
    hoy puede cambiar de conducta por este lote'
  - 'La validación local precede a la red, como ya hace `select` con sus opciones'
repeat_interrupt_revert_behavior:
  - 'ensureCollections dos veces seguidas con la misma spec deja el mismo estado y no lanza'
  - 'Un fallo a mitad de la creación no puede dejar la colección a medias sin decirlo: PocketBase ya
    rechaza entero un campo+índice que no puede aplicar, y ese precedente se respeta'
  - 'Volver a sembrar NO revierte lo que un humano cambió a mano, salvo que la spec lo diga'
measurement_reference_systems:
  - 'Una regla se mide leyendo la colección CRUDA del servidor (`pb.collections.getOne`), comparando
    la cadena literal. NO se mide a través de `mapCollectionAccess`, que es con pérdida'
  - 'El tipo de colección se mide en `collection.type` del servidor, no por si el descubrimiento la
    muestra u oculta'
  - 'La idempotencia se mide comparando el estado del servidor antes y después de la segunda pasada,
    no por el valor de retorno de la función'
measurement_invalidation_conditions:
  - 'Un test que verifique reglas a través del esquema descubierto NO mide nada: la proyección
    colapsa todos los filtros en `conditional`'
  - 'Un test que verifique una colección auth a través del descubrimiento tampoco mide nada: se
    excluyen a propósito'
  - 'Si el test usa el mismo helper para construir la spec y para comprobar el resultado, la
    comparación es tautológica'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO: las colecciones canónicas de Vega NO cambian sus reglas en este lote'
  - 'Qué puede hacer exactamente un editor (qué reglas lleva `vega_editors`) es suyo, y va en otro
    lote'
  - 'Si al final hace falta una capability nueva, propón el nombre pero no des por buena su
    semántica: dilo en el informe'
repo_claims_that_may_become_false:
  - file: src/lib/backend/adapters/pocketbase/collections.ts
    section_or_quote:
      'Línea ~39: "Reglas de API cerradas por defecto (null = solo superuser), como todo en v1".
      Sigue siendo el DEFECTO, pero deja de ser lo único posible'
  - file: src/lib/backend/collections.ts
    section_or_quote:
      'El docblock de CollectionSpec y el bloque de líneas 7-31 que describen qué sabe expresar el
      puerto'
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote:
      'Líneas 587-660: la sección que explica que el operador crea `vega_editors` y abre `vega` a
      mano. OJO: sigue siendo VERDAD para el producto, porque este lote NO automatiza nada de eso.
      Solo cambia lo que el puerto SABRÍA hacer. No la declares falsa si no lo es'
  - file: tests/contract/pb-harness/seed.ts
    section_or_quote:
      'La cabecera que enumera lo que el vocabulario reducido no cubre, si tu cambio mueve esa
      frontera'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
  - 'pnpm gate'
required_behavioral_qa:
  - 'Contra PocketBase REAL: crear una colección auth, leerla cruda y comprobar `type` y reglas'
  - 'Contra PocketBase REAL: sembrar dos veces y comprobar que el estado no cambia en la segunda'
  - 'Contra PocketBase REAL: abrir una regla a mano, volver a sembrar y decir qué pasó con ella'
expected_reports:
  - /private/tmp/vega-informes/port-auth-collections-rules.md
known_unverifiable_items:
  - 'El gate completo no corre dentro del sandbox: PocketBase no puede abrir puerto y Playwright no
    registra su puerto Mach. Corre lo que puedas y dilo'
```

## Por qué existe

`CollectionSpec` (`src/lib/backend/collections.ts:46-52`) solo tiene `name` y `fields`. No expresa
el tipo de colección ni las reglas. El adaptador de PocketBase **hardcodea `type: 'base'`**
(`adapters/pocketbase/collections.ts:36`) y el de memoria hardcodea `readonly: false`
(`adapters/memory/index.ts:561-564`). Las reglas solo se **leen** (`schema.ts:74-95`); no existe un
solo camino que las escriba, comprobado por tres vías.

Consecuencia práctica, y no es teórica: la documentación tiene que pedirle al operador que **abra
`vega` a mano** en el admin de PocketBase para que sus editores puedan leer el manifiesto. Y
`vega_editors`, la colección de editores, no existe en código: es una instrucción manual.

Este lote **no arregla esos dos síntomas**. Construye la pieza que ambos necesitan.

## Lo que hay que construir

Que `CollectionSpec` pueda decir «esta colección es `auth`» y «estas son sus reglas», y que los dos
adaptadores lo cumplan de verdad.

**El listón está puesto por el lote de `select` + índice único que entró hoy**, y es el modelo a
seguir: tipos que expresan lo nuevo sin romper a nadie, validación local antes de la red, tests en la
suite de contrato COMPARTIDA, y comportamiento medido contra PocketBase real en vez de supuesto.

### Las tres trampas de este lote

1. **La proyección de reglas es con pérdida.** `mapRule` colapsa cualquier filtro en `conditional`.
   Si verificas tus reglas a través del esquema descubierto, tu test pasa con la regla equivocada.
   Lee la colección cruda del servidor.

2. **Las colecciones `auth` no aparecen en el descubrimiento.** `schema.ts:16-20` las excluye a
   propósito. Crea una y el esquema descubierto seguirá sin verla. Piensa qué significa para la
   idempotencia: si `ensureCollections` decide «existe o no» mirando el descubrimiento, una segunda
   pasada intentará crearla otra vez. Puede que ya no sea así; compruébalo, no lo supongas.

3. **Pisar la regla que abrió un humano.** Es el caso que puede dejar a todos los editores fuera de
   una instalación en producción. Hoy no puede pasar porque nadie escribe reglas; en cuanto tú
   escribas, sí. Decide qué hace tu implementación con una colección que YA existe y YA tiene reglas,
   **dilo en el informe**, y pruébalo contra PocketBase real.

### El adaptador `memory`

No tiene reglas de verdad. Tienes dos salidas honestas: modelarlas lo justo para que la suite
compartida tenga sentido, o rechazar lo que no puede cumplir. Lo que **no** puedes hacer es aceptar
la spec en silencio y no aplicar nada: eso es exactamente el bug que el proyecto ya ha cometido
—declarar algo que no se hace— y el que más caro sale. `memory` ya reproduce deliberadamente el
comportamiento hostil de PocketBase en otros sitios; ese es el criterio.

## Verificación

- **Suite de contrato compartida** (`tests/contract/backend-contract.ts`), que corre contra `memory`
  y contra PocketBase real. Es donde vive la verdad del puerto.
- **Contra PocketBase real**, los tres QA conductuales del contrato. El tercero —abrir una regla a
  mano, volver a sembrar, ver qué pasó— es el que más importa.
- **Rompe un guardarraíl a propósito**: haz que la segunda pasada de `ensureCollections` pise las
  reglas de una colección existente, y comprueba que ESE test cae. Antes de sabotear, árbol limpio y
  tu cambio ya commiteado; la restauración se hace desde el estado guardado, nunca desde el índice, y
  después compruebas que tu arreglo SIGUE AHÍ.
- `pnpm gate` completo. Si dentro del sandbox falla por `EPERM listen`,
  `bootstrap_check_in … Permission denied` o la caché de Go, **no pelees**: usa
  `GOCACHE=/private/tmp/vega-go-build-cache`, corre la suite focalizada, sigue y dilo. El gate del
  árbol combinado lo paso yo y es el que manda.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `1480c3b`, rama `feat/port-auth-collections-rules` y su worktree.
  **Commitea pronto y ve enmendando.**
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase. Las que
  estén en ficheros que ya tocas, arréglalas; las demás, enuméralas. Y **no declares falso lo que
  sigue siendo verdad**: este lote no automatiza `vega_editors` ni abre `vega`, así que la
  documentación que describe esos pasos manuales sigue vigente.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/port-auth-collections-rules.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
