# Encargo — Endurecimiento previo al despliegue: `vegabuild`, el comparador del sembrado y el editor del starter

## Contrato de tarea

```yaml
task_id: endurecimiento-pre-despliegue
prompt_hash: 166ff529f3b134d86b84dbb0b05f93a612602cc84ae23f496eb9839c7869b29c
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
repos:
  - repo_id: vegacms
    base_sha: c0d63afec0f7dea5dac43364d02e5ae05bf109f9
    branch: feat/endurecimiento-pre-despliegue
    worktree: /private/tmp/vegacms-endurecimiento-pre-despliegue
  - repo_id: vega-astro
    base_sha: ff44f5efe5e89299ae3fe9e352e2937aae6e22cc
    branch: feat/endurecimiento-pre-despliegue
    worktree: /private/tmp/vega-astro-endurecimiento-pre-despliegue
external_inputs:
  - 'NINGUNO. Las tres piezas son autocontenidas en los dos árboles declarados. No descargues nada,
    no consultes ninguna API, no hace falta ningún servidor'
scope_in:
  - 'PIEZA 1 (vegacms, Go): `extensions/vegabuild/vegabuild.go` — que la extensión se NIEGUE a
    construirse con una allowlist de colecciones auth insegura, igual que ya hace `vegapreview`.
    Su suite `extensions/vegabuild/*_test.go`. El comentario de `Config.AuthCollections`'
  - 'PIEZA 2 (vegacms, TS): `src/lib/backend/site-seeding.ts` — que el comparador de formas de campo
    mire las OPCIONES de un `select`. Su suite `src/lib/backend/site-seeding.test.ts`'
  - 'PIEZA 3 (vega-astro): `starters/default/src/pages/api/vega/discovery.ts` — que el starter
    anuncie `vega_editors` en vez de `_superusers`, y la guía de migración que eso obliga a escribir
    en `starters/default/README.md`'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas, en los DOS repos'
scope_out:
  - '⚠️ `extensions/vegapreview` ENTERO. Ya se endureció y está en la base; no lo toques ni para
    «unificar» con `vegabuild`. Si ves algo mal ahí, DILO en el informe, no lo cambies'
  - '⚠️ La ruta `POST /callback` de `vegabuild` y su `CallbackSecret`. Esa puerta no se autentica con
    PocketBase a propósito y su diseño no está en discusión'
  - 'El resto de `Config.normalized()` de `vegabuild`: `RoutePrefix`, `RunsCollection`,
    `StaleRunAfter`, `Clock`. Ya validan y no se tocan'
  - '⚠️ El resto del comparador del sembrado. `type`, `target`, `multiple`, `required` y `unique` ya
    se comparan y su semántica NO cambia. Solo AÑADES una dimensión, y solo para `select`'
  - 'La frontera pieza-a-pieza del sembrado, el orden de aplicación y el aborto sin escribir: son el
    contrato vigente del lote anterior y siguen tal cual'
  - 'El resto del documento de discovery del starter: `protocolVersion`, `project`, `manifest`,
    `siteSettings`, `preview`, `blockTypes`. Solo cambia `auth.collection`'
  - 'Crear la colección `vega_editors` desde el starter o desde `vegabuild`. La siembra Vega y solo
    Vega (`src/lib/backend/site-seeding.ts`)'
  - 'Notas de release y CHANGELOG en cualquiera de los dos repos: los escribo yo al publicar'
acceptance_criteria:
  - 'PIEZA 1: `vegabuild.New` DEVUELVE ERROR con `AuthCollections` nil, con lista vacía, con una
    entrada vacía o en blanco, y con una entrada que tenga espacios alrededor. Con test por cada
    caso y el mensaje de error citado literalmente en el informe'
  - 'PIEZA 1: una configuración VÁLIDA de hoy (`[]string{"vega_editors"}`, la de los dos ejemplos del
    README) sigue construyendo y sirviendo exactamente igual. Con test'
  - 'PIEZA 1: `AuthCollections` NO se reasigna nunca. Lo que llega es lo que se pasa a
    `apis.RequireAuth`. Con test que lo fije: ver el invariante de la trampa central'
  - 'PIEZA 2: un `select` existente al que le FALTA una de las opciones esperadas se detecta como
    DIVERGENTE y aborta el sembrado sin escribir nada. Con test sobre el caso literal
    `pages.status` con `[draft, archived]` frente al esperado'
  - 'PIEZA 2: un `select` existente cuyas opciones son un SUPERCONJUNTO de las esperadas se sigue
    considerando COMPATIBLE y se salta. Con test. Ver la decisión ya tomada en `invariants`'
  - 'PIEZA 2: ningún otro tipo de campo cambia de veredicto por este cambio. Con test'
  - 'PIEZA 3: el documento de discovery del starter anuncia `vega_editors`, el bloque «PENDING
    PRODUCT DECISION» desaparece del comentario de cabecera, y el README del starter explica QUÉ
    tiene que hacer un proyecto ya creado con `_superusers`'
  - 'Guardarraíl roto a propósito en la PIEZA 1 y en la PIEZA 2, cada uno con su salida literal'
  - 'Gate verde en los dos repos, hasta donde el sandbox lo permita, con salida literal'
adversaries:
  - 'PIEZA 1: `AuthCollections: []string{" vega_editors "}`. HOY esa configuración construye sin
    protestar y no autoriza a NADIE, porque `RequireAuth` compara por igualdad exacta. Tiene que
    fallar en `New`, no en la primera petición de un editor'
  - 'PIEZA 1: `AuthCollections: []string{""}`. Una lista no vacía cuya única entrada no nombra
    ninguna colección'
  - 'PIEZA 1: `AuthCollections: []string{"vega_editors", "vega_editors"}`. Un duplicado se ACEPTA:
    es redundante, no inseguro, y rechazarlo rompería una configuración que hoy funciona'
  - 'PIEZA 1: `AuthCollections: []string{"_superusers"}`. Se ACEPTA. Ver la asimetría deliberada en
    `invariants`; si la «arreglas», el lote se rechaza'
  - 'PIEZA 2: un `select` cuyas opciones son las mismas pero en OTRO ORDEN. Es compatible: el orden
    de las opciones no impide guardar ningún valor'
  - 'PIEZA 2: un `select` con opciones duplicadas en el servidor'
  - 'PIEZA 2: un campo esperado que NO es `select` pero cuyo campo actual SÍ lo es, y al revés. El
    veredicto ya lo decide `type` y no puede cambiar'
  - 'PIEZA 3: un proyecto YA DESPLEGADO cuyos editores entran hoy como superusuario. Al cambiar el
    anuncio, su sesión deja de casar con la colección anunciada. Eso NO se puede callar'
preexisting_data_cases:
  - 'PIEZA 2: una instalación real que ya tiene `pages` con un `status` de opciones distintas es
    justo el caso que motiva el lote. Lo que hoy pasa en silencio tiene que abortar, y abortar
    SIN HABER ESCRITO NADA (el sembrado ya hace su preflight de solo lectura antes de tocar nada:
    `inspectSeedPlan`, site-seeding.ts:185-212)'
  - 'PIEZA 1: un servidor con `vegabuild` ya instalado y una allowlist vacía. Tras este cambio ese
    servidor NO ARRANCA. Es intencionado y es el objeto del lote, pero el operador tiene que poder
    leer del mensaje de error qué escribir para arreglarlo'
  - 'PIEZA 3: un proyecto creado con el starter antes de este cambio, con `_superusers` cableado.
    La guía de migración es PARA él'
invariants:
  - '⚠️ TRAMPA CENTRAL DE LA PIEZA 1, y es la misma que casi se cuela en `vegapreview`: LA
    VALIDACIÓN SOLO RECHAZA, NUNCA REESCRIBE. La puerta real es
    `apis.RequireAuth(x.config.AuthCollections...)` (vegabuild.go:229-230), y `RequireAuth` compara
    `e.Auth.Collection().Name` por IGUALDAD EXACTA (`slices.Contains`), sin `TrimSpace` ni
    `EqualFold`. Consecuencia: si «normalizas» `" vega_editors "` recortándolo, una configuración
    que HOY no autoriza a NADIE pasa a autorizar. Eso es AMPLIAR permisos dentro de un lote cuyo
    objeto es restringirlos. Se rechaza en `New`; no se arregla por detrás'
  - '⚠️ ASIMETRÍA DELIBERADA CON `vegapreview`, DECIDIDA Y NO NEGOCIABLE: `vegabuild` SÍ ACEPTA
    `_superusers` en su allowlist; `vegapreview` NO. No es un descuido ni una inconsistencia que
    debas unificar. La razón: en `vegapreview` el rechazo existe porque un superusuario hace BYPASS
    de la ViewRule (`CanAccessRecord` ni la evalúa) y el enlace firmado filtraría borradores; en
    `vegabuild` la ruta protegida solo DISPARA una publicación, no lee contenido con reglas, y que
    un administrador pueda publicar su propio sitio es legítimo. Si tu diff rechaza `_superusers`
    en `vegabuild`, el lote se rechaza entero'
  - '⚠️ `Config.normalized()` (vegabuild.go:150) recibe `c` POR VALOR y devuelve una copia. Es donde
    viven las demás validaciones y es el sitio natural para estas, PERO comprueba tú dónde se llama
    y que el error llegue de verdad hasta `New`. No des por hecho el cableado: verifícalo'
  - '⚠️ DECISIÓN YA TOMADA DE LA PIEZA 2, no la reabras: un `select` es COMPATIBLE cuando las
    opciones ESPERADAS son un SUBCONJUNTO de las actuales, y DIVERGENTE cuando falta alguna
    esperada. Comparación como CONJUNTO, sin importar orden ni repeticiones. El porqué: si están
    todas las esperadas, el editor puede guardar todos los valores que el sembrado promete, y una
    opción de más es algo que el usuario añadió a propósito y que abortar castigaría sin motivo'
  - 'PIEZA 2: los dos lados del comparador YA llevan el dato. El esperado en
    `CollectionFieldSpec` (`src/lib/backend/collections.ts:186-192`, `options: string[]`) y el real
    en `Field` (`src/lib/backend/types.ts:270`, `options: string[]`). No hace falta ninguna lectura
    cruda nueva ni ampliar el puerto'
  - 'PIEZA 2: `ComparableFieldShape` es una estructura PLANA que se compara campo a campo en
    `sameShape` (site-seeding.ts:406-415). Un array no se compara con `===`. Si añades el dato tal
    cual y no tocas `sameShape`, el comparador dirá que TODO diverge, y los tests de compatibilidad
    existentes lo cazarán. Esa es exactamente la trampa'
  - '⚠️ PIEZA 3: las TRES precondiciones que el propio comentario del starter declaraba pendientes
    YA SE CUMPLEN en las bases declaradas, y por eso este lote existe. (a) la colección y sus reglas
    las siembra Vega: `VEGA_EDITORS_COLLECTION`, site-seeding.ts:46-47,162. (b) el login por
    colección existe: el adaptador entra con `pb.collection(authCollection).authWithPassword`
    (adapters/pocketbase/index.ts:432-433) y `authCollection` es un parámetro, no una constante.
    (c) las capacidades ya se derivan de ella: `computeCapabilities` (index.ts:63-82) distingue el
    superusuario del editor sujeto a reglas. VERIFÍCALO tú antes de tocar nada: si alguna de las
    tres no se cumpliera, PARA y dilo'
  - 'PIEZA 3: el valor `vega_editors` tiene que casar LETRA POR LETRA con el que siembra Vega
    (site-seeding.ts:47). No es un nombre libre'
  - 'Las tres piezas son INDEPENDIENTES entre sí. Ninguna necesita a las otras dos para funcionar, y
    ninguna puede cambiar el comportamiento observable de las otras'
repeat_interrupt_revert_behavior:
  - 'PIEZA 1: construir la extensión dos veces con la misma configuración válida da el mismo
    resultado. Un `New` que falla no deja NADA a medias: ni rutas registradas, ni colección creada'
  - 'PIEZA 2: correr el sembrado, que aborte por opciones divergentes, arreglar el `select` a mano y
    volver a correrlo tiene que completar. El aborto no puede dejar un estado que impida reintentar'
  - 'PIEZA 3: el documento de discovery es prerenderizado (`export const prerender = true`); dos
    builds seguidos emiten el mismo documento'
measurement_reference_systems:
  - 'PIEZA 1: que «rechaza» se mide por el ERROR DEVUELTO POR `New`, no porque una petición acabe en
    401. Un test que pruebe la petición no distingue esta validación de la que ya hacía
    `RequireAuth`'
  - 'PIEZA 1: que «no reescribe» se mide comparando la lista que se le pasó a `apis.RequireAuth` con
    la que entró en `Config`, no leyendo el código'
  - 'PIEZA 2: que «aborta sin escribir» se mide contando las escrituras en el puerto, no por el
    mensaje de error'
  - 'PIEZA 3: que el starter «anuncia vega_editors» se mide sobre el documento EMITIDO por la ruta,
    no sobre el literal del fuente'
measurement_invalidation_conditions:
  - 'Un test de la PIEZA 1 que solo compruebe que existe una función de validación, sin construir la
    extensión, no mide nada'
  - 'Un test de la PIEZA 2 que fabrique el campo actual con la MISMA función que fabrica el esperado
    no mide nada: los dos lados vienen de tipos distintos y ahí está el error posible'
  - 'Si al sabotear el guardarraíl de la PIEZA 2 el test que cae es uno de `type` o de `required`, tu
    sabotaje apuntó al sitio equivocado: tiene que caer el de las OPCIONES'
product_decisions_reserved_to_david:
  - 'La asimetría `_superusers` entre `vegabuild` y `vegapreview` YA ESTÁ DECIDIDA arriba. No la
    reabras ni la marques como revisable'
  - 'El criterio subconjunto/superconjunto de la PIEZA 2 YA ESTÁ DECIDIDO arriba. Igual'
  - 'Si al escribir la guía de migración de la PIEZA 3 descubres que un proyecto existente NO PUEDE
    migrar sin perder algo, PARA y dilo en el informe. No inventes una vía de migración con pérdida'
repo_claims_that_may_become_false:
  - file: extensions/vegabuild/vegabuild.go
    section_or_quote:
      'El comentario de `Config.AuthCollections` (líneas 125-127): «Empty means any authenticated
      record, of any auth collection, is accepted». Tu cambio lo deja FALSO, porque vacía deja de
      ser un estado alcanzable'
  - file: extensions/vegabuild/README.md
    section_or_quote:
      'Cualquier frase que presente `AuthCollections` como opcional. Los dos ejemplos (líneas 61 y
      113) ya declaran `[]string{"vega_editors"}` y NO hay que cambiarlos'
  - file: src/lib/backend/site-seeding.ts
    section_or_quote:
      'Cualquier comentario o docstring que enumere QUÉ compara el comparador de formas'
  - file: starters/default/src/pages/api/vega/discovery.ts
    section_or_quote:
      'El bloque «PENDING PRODUCT DECISION» entero del comentario de cabecera (líneas 9-14): deja de
      ser verdad en el momento en que cambies el valor'
  - file: starters/default/README.md
    section_or_quote:
      '«`auth.collection` (currently `_superusers` in this starter)» (línea 116) y su contexto'
required_gate:
  - 'vegacms: pnpm check'
  - 'vegacms: pnpm lint'
  - 'vegacms: pnpm test'
  - 'vegacms: pnpm test:go'
  - 'vegacms: pnpm build'
  - 'vega-astro: pnpm gate'
required_behavioral_qa:
  - 'PIEZA 1: construir la extensión con cada una de las cuatro configuraciones inseguras y CITAR el
    mensaje de error de cada una'
  - 'PIEZA 1: construir con la configuración del README y comprobar que las rutas quedan registradas'
  - 'PIEZA 2: correr el sembrado contra el adaptador en memoria con un `pages.status` al que le falta
    una opción, y comprobar que aborta y que NO escribió nada'
  - 'PIEZA 2: el mismo caso con una opción DE MÁS, y comprobar que completa'
  - 'PIEZA 3: emitir el documento de discovery y leer el valor de `auth.collection`'
expected_reports:
  - /private/tmp/vega-informes/endurecimiento-pre-despliegue.md
known_unverifiable_items:
  - 'El gate completo de vegacms NO corre entero en el sandbox: PocketBase no puede abrir puerto
    (`EPERM listen`) y Playwright no registra su puerto Mach. No pelees con eso: corre las suites
    que puedas, DI cuáles no, y sigue. El gate autoritativo lo paso yo'
  - 'Que un servidor real con `vegabuild` y allowlist vacía deje de arrancar solo se puede comprobar
    desplegando. Tú lo pruebas en la construcción de la extensión'
  - 'El juicio visual y la decisión de publicar son de David'
```

## Por qué existe

Tres agujeros pequeños que quedaron abiertos y que hay que cerrar **antes** de que esto se instale en
un servidor. Los tres se han verificado contra las bases declaradas hoy, 29 jul 2026.

**`vegabuild` arrastra el mismo agujero que `vegapreview` acaba de cerrar.** Una `AuthCollections`
vacía hace que `apis.RequireAuth` acepte a cualquier identidad autenticada de cualquier colección,
y la ruta que protege es la que **publica el sitio**. El agujero vuelve por otra puerta y hay que
cerrarlo por esa puerta también.

**El comparador del sembrado no mira las opciones de un `select`.** Lo cazó la revisión fría del lote
de siembra: un `pages.status` preexistente con `['draft', 'archived']` se da hoy por compatible y se
salta **en silencio**, y el editor se queda sin poder publicar sin que nadie le diga por qué.

**Y el starter de Astro sigue anunciando `_superusers`**, que es lo que hace que un editor entre con
los máximos privilegios de PocketBase. Su propio comentario declaraba tres precondiciones para poder
cambiarlo; las tres se cumplen ya, y una está en la base de este mismo encargo.

## Verificación

- **Rompe un guardarraíl a propósito en la pieza 1 y en la pieza 2**, y comprueba que cae el test que
  cubre ESA propiedad, no otro. Antes de sabotear: árbol limpio y tu cambio ya commiteado; la
  restauración se hace desde el estado guardado, nunca desde el índice, y después compruebas que tu
  arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.
- En `vega-astro` el gate es `pnpm gate` y su `lint` es Prettier sobre todo el árbol.

## Cómo entregas

- **Un commit por repo**, sobre las bases y ramas declaradas, cada uno en su worktree.
  **Commitea pronto y ve enmendando.**
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones de los dos repos deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después de los commits**: informe en
  `/private/tmp/vega-informes/endurecimiento-pre-despliegue.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
