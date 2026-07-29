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
  - 'adapters/pocketbase/collections.ts: escribirlos AL CREAR, nunca al actualizar'
  - 'adapters/memory/index.ts: MODELARLOS (rama elegida abajo, no es tu decisión)'
  - 'tests/contract/backend-contract.ts: cubrir lo nuevo en la suite COMPARTIDA memory + PB real'
  - '⚠️ src/lib/backend/migration.ts y migration.test.ts: el generador de migraciones hardcodea
    `type: "base"` (migration.ts:99-104) y su suite declara PARIDAD DELIBERADA con el payload del
    adaptador (migration.test.ts:1-11). Si amplías el adaptador y no el generador, la migración
    describe algo DISTINTO de lo que la red ejecuta'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ ACTUALIZAR una colección que YA EXISTE. Ver `invariants`: en este lote `type` y `rules` son
    CREATION-ONLY. No hay PATCH, no hay reconciliación, no hay excepción'
  - 'VALIDAR LOCALMENTE LA GRAMÁTICA de un filtro de PocketBase. No existe parser en el repo y
    reproducir la gramática es una trampa. Ver `invariants`'
  - 'CAMBIAR las reglas de VEGA_COLLECTION, VEGA_MEDIA_COLLECTION o VEGA_REVISIONS_COLLECTION.
    Decisión de David: siguen naciendo cerradas. Que el puerto SEPA declararlas no significa que
    estas las usen'
  - 'Sembrar `vega_editors` ni ninguna colección auth concreta: eso es otro lote'
  - 'El sembrado de proyecto, que sigue sin existir'
  - 'La UI de autoría (SchemaAuthoringPanel): no tiene que ofrecer nada de esto todavía'
  - 'Colecciones `view`: fuera de alcance, no las inventes'
  - 'Una capability nueva. Con la rama de `memory` ya elegida no hace falta ninguna. Si crees que sí,
    PARA y dilo en el informe en vez de inventarle semántica'
  - 'backend/ ajeno al esquema, extensions/, vega-astro, READMEs y notas de release'
acceptance_criteria:
  - 'Una CollectionSpec puede declarar `auth` y crearse como colección auth en PocketBase real,
    comprobado leyendo `collection.type` crudo del servidor'
  - 'Una CollectionSpec puede declarar sus reglas y estas quedan escritas TAL CUAL en el servidor,
    comparando la cadena literal'
  - 'Los tres estados de una regla viajan sin pérdida: `null` (denegado), `""` (permitido) y un
    filtro (condicional)'
  - 'Omitir `type` y omitir cada regla conserva el comportamiento de HOY: `base`, reglas cerradas'
  - '⚠️ CREATION-ONLY: sobre un nombre que YA EXISTE, `ensureCollections` devuelve `skipped` y NO
    toca tipo, reglas, campos ni usuarios, AUNQUE la spec declare reglas distintas. Medido leyendo
    la colección cruda antes y después'
  - 'Una regla exclusiva de auth (`authRule`, `manageRule`) sobre una spec `base` se rechaza ANTES
    de llamar a la red'
  - 'Una spec `auth` cuyo nombre existe ya como `base` (o al revés) FALLA de forma explícita, no
    muta la colección y no finge éxito. Comprobado sobre `collection.type` crudo'
  - 'Una spec `auth` que declara campos que chocan con los de sistema falla de forma explícita; la
    colección NO existe después, comprobado por nombre crudo'
  - 'Una migración generada de la MISMA spec conserva `type` y las reglas: la paridad que
    migration.test.ts declara sigue siendo cierta'
  - 'La suite de contrato COMPARTIDA cubre lo nuevo y pasa contra memory y contra PocketBase real'
  - 'Un guardarraíl roto a propósito, con su salida: el de creation-only'
adversaries:
  - 'Una colección preexistente cuyas reglas ya fueron abiertas a mano por el operador'
  - 'Una colección auth cuyo nombre ya existe como colección `base`, y el caso simétrico'
  - 'Sembrar DOS VECES la misma colección auth: la segunda pasada no puede duplicar ni pisar'
  - 'Una colección auth que YA EXISTE y tiene usuarios dentro'
  - 'Una spec que declara `auth` y a la vez campos que chocan con los de sistema de una colección
    auth (`email`, `password`, `tokenKey`, `verified`, `emailVisibility`)'
  - 'Una regla exclusiva de auth colocada sobre una colección `base`'
  - 'Un lote de VARIAS specs donde la segunda falla: qué pasa con la primera, ya creada'
  - 'Una regla con sintaxis de filtro inválida: la rechaza el SERVIDOR, no tú. Ver `invariants`'
  - 'El adaptador `memory`, que no tiene motor de reglas: modela y guarda, nunca finge'
preexisting_data_cases:
  - '⚠️ EL CORAZÓN DEL LOTE. Hoy la documentación le pide al operador que abra `vega` A MANO con
    `@request.auth.id != null` (docs/POCKETBASE-INTEGRATION.md:611-624). Si ensureCollections
    pasara a escribir reglas sobre colecciones existentes, una segunda pasada sobre una instalación
    real PISARÍA esa regla y volvería a cerrarla, dejando a todos los editores fuera. Por eso el
    contrato de este lote es CREATION-ONLY, y por eso ese es el guardarraíl que hay que romper'
  - 'Una colección auth existente con usuarios: creation-only implica que no se toca. Pruébalo'
invariants:
  - '⚠️ CREATION-ONLY, y no admite lectura alternativa. `ensureCollections` decide por NOMBRE: si
    existe, `skipped`, punto. No actualiza tipo, reglas, campos ni nada más, aunque la spec declare
    otra cosa. Es el contrato VIGENTE del árbol base (collections.ts:19-25, port.ts:140-148,
    adapters/pocketbase/collections.ts:27-32, adapters/memory/index.ts:548-553) y este lote NO lo
    cambia. La reconciliación de reglas, si algún día se quiere, es otro contrato y lo decide David'
  - '⚠️ NO valides la gramática de los filtros. El repo no tiene parser, `mapRule` (schema.ts:74-77)
    solo distingue `null`/vacío/no vacío, `pb.filter()` interpola pero no valida, y el proyecto
    soporta servidor `>=0.26.0` probando 0.26.0 y 0.39.6: no hay una sola gramática a la que
    validar. Las reglas viajan VERBATIM y quien las rechaza es el servidor. Tu validación local
    cubre solo lo que puedes decidir sin gramática: qué CLAVES admite cada tipo de colección'
  - 'VOCABULARIO EXACTO, no lo negocies. Cinco reglas comunes a `base` y `auth`: `listRule`,
    `viewRule`, `createRule`, `updateRule`, `deleteRule`. Dos EXCLUSIVAS de `auth`: `authRule` y
    `manageRule` (el SDK fijado, pocketbase@0.27.0, las tipa en `AuthCollectionModel`). Clave
    omitida = no se envía = defecto de PocketBase, que es el cerrado de hoy. Clave exclusiva de
    auth sobre una spec `base` = error local antes de la red'
  - 'Los tres estados de `mapRule` (schema.ts:74-95) son el vocabulario canónico: `null` = denegado,
    `""` = permitido, cualquier otra cadena = condicional'
  - '⚠️ La proyección `AccessLevel` es CON PÉRDIDA: dos filtros distintos dan ambos `conditional`.
    NO sirve para verificar que se escribió la regla correcta'
  - 'schema.ts:16-20 EXCLUYE las colecciones `auth` del esquema descubierto, y eso NO cambia en este
    lote: una colección auth que crees seguirá sin aparecer. No afecta a la idempotencia porque
    `ensureCollections` mira `pb.collections.getOne(name)` crudo, no el descubrimiento. Compruébalo
    en vez de suponerlo, y en `memory` haz lo mismo: auth invisible en `listContentTypes`, e
    idempotencia por estado interno, NUNCA derivada de `ContentType[]`'
  - 'Omitir una propiedad nueva conserva exactamente el comportamiento actual. Ningún consumidor de
    hoy puede cambiar de conducta por este lote'
  - 'Nunca se descarta ni se renombra un campo en silencio. Si una spec pide algo que choca con los
    campos de sistema de auth, el resultado es un fallo explícito y la colección NO queda creada'
repeat_interrupt_revert_behavior:
  - 'ensureCollections dos veces seguidas con la misma spec deja el mismo estado y no lanza'
  - 'ALCANCE TRANSACCIONAL, fijado: cada colección es atómica; el LOTE no lo es. Si `ensureCollections
    ([a, b, c])` falla en `b`, `a` queda creada y así se queda: NO hay rollback implícito, no lo
    inventes. El error debe identificar QUÉ spec falló, y repetir la llamada salta lo ya creado y
    reintenta el resto. Test obligatorio: fallo en la segunda spec y reanudación'
  - 'Volver a sembrar NUNCA revierte lo que un humano cambió a mano. Sin excepciones: es la
    consecuencia directa de creation-only'
measurement_reference_systems:
  - 'Una regla se mide leyendo la colección CRUDA del servidor (`pb.collections.getOne`), comparando
    la cadena literal. NO se mide a través de `mapCollectionAccess`, que es con pérdida'
  - 'El tipo de colección se mide en `collection.type` del servidor, no por si el descubrimiento la
    muestra u oculta'
  - 'La idempotencia y el creation-only se miden comparando el estado CRUDO del servidor antes y
    después de la segunda pasada, no por el valor de retorno de la función'
  - 'La paridad de la migración se mide comparando el payload que emite `generateSchemaMigration`
    con el que envía el adaptador para la MISMA spec, que es como ya lo mide migration.test.ts'
measurement_invalidation_conditions:
  - 'Un test que verifique reglas a través del esquema descubierto NO mide nada: la proyección
    colapsa todos los filtros en `conditional`'
  - 'Un test que verifique una colección auth a través del descubrimiento tampoco mide nada: se
    excluyen a propósito'
  - 'Un test de creation-only que solo compruebe el valor de retorno `skipped` no mide nada: hay que
    leer las reglas crudas del servidor y ver que siguen siendo las de antes'
  - 'Si el test usa el mismo helper para construir la spec y para comprobar el resultado, la
    comparación es tautológica'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO: las colecciones canónicas de Vega NO cambian sus reglas en este lote'
  - 'YA DECIDIDO: creation-only. La reconciliación de reglas de una colección existente es otro
    contrato y no se despacha por interpretación'
  - 'Qué puede hacer exactamente un editor (qué reglas lleva `vega_editors`) es suyo, y va en otro
    lote'
repo_claims_that_may_become_false:
  - file: src/lib/backend/adapters/pocketbase/collections.ts
    section_or_quote:
      'Línea ~39: "Reglas de API cerradas por defecto (null = solo superuser), como todo en v1".
      Sigue siendo el DEFECTO, pero deja de ser lo único posible'
  - file: src/lib/backend/collections.ts
    section_or_quote:
      'El docblock de CollectionSpec y el bloque de líneas 7-31 que describen qué sabe expresar el
      puerto'
  - file: src/lib/backend/migration.ts
    section_or_quote:
      'Líneas 19-25: la promesa de que la migración describe las mismas operaciones que el adaptador
      por red. Es exactamente la afirmación que tu cambio puede dejar falsa'
  - file: src/lib/backend/migration.test.ts
    section_or_quote:
      'Líneas 1-11: la paridad DELIBERADA con `collectionFieldSpecToPbField`, y el test de ~35-54
      que exige `"type": "base"`'
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
  - 'Contra PocketBase REAL: crear una colección auth, leerla cruda y comprobar `type` y las siete
    reglas'
  - 'Contra PocketBase REAL: sembrar dos veces y comprobar que el estado CRUDO no cambia'
  - '⚠️ Contra PocketBase REAL: crear una colección, ABRIR una regla a mano por el SDK, volver a
    sembrar con una spec que declara reglas DISTINTAS, y comprobar que la regla abierta a mano
    SIGUE AHÍ intacta. Es el QA que representa la instalación de producción'
  - 'Contra PocketBase REAL: un lote de tres specs donde la segunda falla, y la reanudación'
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
adaptadores **y el generador de migraciones** lo cumplan de verdad.

**El listón está puesto por el lote de `select` + índice único que entró hoy**, y es el modelo a
seguir: tipos que expresan lo nuevo sin romper a nadie, validación local antes de la red, tests en la
suite de contrato COMPARTIDA, y comportamiento medido contra PocketBase real en vez de supuesto.

### Las cuatro trampas de este lote

1. **Creation-only no es negociable, y es el corazón.** Hay una lectura tentadora: «la spec trae
   reglas, luego hay que aplicarlas». Esa lectura, sobre una instalación real, sustituye el
   `@request.auth.id != null` que el operador abrió a mano por lo que diga la spec, y deja a todos
   sus editores fuera. Si el nombre existe, `skipped` y nada más. Lee `invariants`.

2. **La proyección de reglas es con pérdida.** `mapRule` colapsa cualquier filtro en `conditional`.
   Si verificas tus reglas a través del esquema descubierto, tu test pasa con la regla equivocada.
   Lee la colección cruda del servidor.

3. **El generador de migraciones es un consumidor directo que no se ve.** `migration.ts:99-104`
   hardcodea `type: 'base'` y no emite reglas, y `migration.test.ts:1-11` declara paridad
   **deliberada** con el payload del adaptador. Amplía uno sin el otro y la migración documentará
   algo distinto de lo que la red ejecutó: un artefacto de rollback que miente.

4. **No hay gramática de filtros que validar.** Tres implementadores razonables escribirían tres
   validadores incompatibles, y los tres podrían enseñar un ejemplo en rojo. Las reglas viajan
   verbatim y las rechaza el servidor. Tu validación local es solo de CLAVES: qué reglas admite
   `base` y cuáles son exclusivas de `auth`.

### El adaptador `memory`

**La rama ya está elegida, no la decidas tú: MODELA.** Guarda `type` y las reglas literalmente en su
estado interno, y hazlas legibles para que la suite compartida pueda comprobarlas igual en los dos
adaptadores. Dos condiciones que vienen de imitar a PocketBase, no de comodidad: las colecciones
`auth` siguen **invisibles** en `listContentTypes`, y la idempotencia se resuelve con estado interno,
**nunca** derivándola de `ContentType[]` (si la derivas de ahí, una colección auth parece no existir
y la segunda pasada intenta crearla otra vez).

Lo que **no** puedes hacer es aceptar la spec en silencio y no aplicar nada: eso es exactamente el
bug que el proyecto ya ha cometido —declarar algo que no se hace— y el que más caro sale.

## Verificación

- **Suite de contrato compartida** (`tests/contract/backend-contract.ts`), que corre contra `memory`
  y contra PocketBase real. Es donde vive la verdad del puerto.
- **Contra PocketBase real**, los cuatro QA conductuales del contrato. El tercero —abrir una regla a
  mano, volver a sembrar con reglas distintas, comprobar que sigue intacta— es el que representa la
  instalación de producción y el que más importa.
- **Rompe un guardarraíl a propósito**: haz que `ensureCollections` escriba las reglas de la spec
  sobre una colección que ya existe, y comprueba que **cae el test de creation-only**. Antes de
  sabotear, árbol limpio y tu cambio ya commiteado; la restauración se hace desde el estado
  guardado, nunca desde el índice, y después compruebas que tu arreglo SIGUE AHÍ.
- `pnpm gate` completo. Si dentro del sandbox falla por `EPERM listen`,
  `bootstrap_check_in … Permission denied` o la caché de Go, **no pelees**: usa
  `GOCACHE=/private/tmp/vega-go-build-cache`, corre la suite focalizada, sigue y dilo. El gate del
  árbol combinado lo paso yo y es el que manda.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre la base **deliberada** `1480c3be1ba3a15e7c230223c366a645409377b2`, rama
  `feat/port-auth-collections-rules` y su worktree. **No derives la base de `main`**: `main` ya ha
  avanzado con el commit de este propio contrato, y ese commit no es parte de tu base.
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
