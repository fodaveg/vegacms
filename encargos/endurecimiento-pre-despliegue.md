# Encargo — Endurecimiento previo al despliegue: la allowlist de `vegabuild` y el comparador del sembrado

## Contrato de tarea

```yaml
task_id: endurecimiento-pre-despliegue
prompt_hash: 199782668f4e4697444b06004a8f5f88a0f935f6fb7340e11dde51a30acfecbe
prompt_hash_definicion: 'sha256 del fichero COMPLETO con este campo valiendo literalmente
  `PENDIENTE`. Se calcula así porque el hash no puede contenerse a sí mismo; para verificarlo,
  sustituye el valor por `PENDIENTE` y vuelve a hashear'
revision: 2
revision_nota: 'La v1 llevaba una tercera pieza (que el starter de Astro anunciase `vega_editors`).
  Su crítico la tumbó por dos bloqueantes: pertenecía a otro lote y su precondición principal era
  FALSA, porque las reglas de acceso que un editor necesita no las siembra nadie todavía. Esa pieza
  se ha movido entera a `encargos/reglas-de-acceso-del-sitio-sembrado.md`, junto con las reglas. Este
  lote se queda con las dos piezas que SÍ son independientes'
repos:
  - repo_id: vegacms
    base_sha: c0d63afec0f7dea5dac43364d02e5ae05bf109f9
    branch: feat/endurecimiento-pre-despliegue
    worktree: /private/tmp/vegacms-endurecimiento-pre-despliegue
external_inputs:
  - 'NINGUNO. Las dos piezas son autocontenidas en el árbol declarado. No descargues nada, no
    consultes ninguna API, no hace falta ningún servidor'
scope_in:
  - 'PIEZA 1 (Go): `extensions/vegabuild/vegabuild.go` — que la extensión se NIEGUE a construirse con
    una allowlist de colecciones auth insegura, igual que ya hace `vegapreview`. Su suite
    `extensions/vegabuild/*_test.go`. El comentario de `Config.AuthCollections`'
  - 'PIEZA 2 (TS): `src/lib/backend/site-seeding.ts` — que el comparador de formas de campo mire las
    OPCIONES y el LÍMITE de un `select`. Su suite `src/lib/backend/site-seeding.test.ts`'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas'
scope_out:
  - '⚠️ `extensions/vegapreview` ENTERO. Ya se endureció y está en la base; no lo toques ni para
    «unificar» con `vegabuild`. Si ves algo mal ahí, DILO en el informe, no lo cambies'
  - '⚠️ La ruta `POST /callback` de `vegabuild` y su `CallbackSecret`. Esa puerta no se autentica con
    PocketBase a propósito y su diseño no está en discusión'
  - 'El resto de `Config.normalized()` de `vegabuild`: `RoutePrefix`, `RunsCollection`,
    `StaleRunAfter`, `Clock`. Ya validan y no se tocan'
  - '⚠️ El resto del comparador del sembrado. `type`, `target`, `multiple`, `required` y `unique` ya
    se comparan y su semántica NO cambia. Solo AÑADES dimensiones, y solo para `select`'
  - 'La frontera pieza-a-pieza del sembrado, el orden de aplicación y el aborto sin escribir: son el
    contrato vigente del lote anterior y siguen tal cual'
  - '⚠️ LAS REGLAS DE ACCESO de cualquier colección. Hay OTRO lote en vuelo que es dueño de eso y
    toca este mismo fichero (`reglas-de-acceso-del-sitio-sembrado`). No las toques ni de refilón'
  - '⚠️ El starter de Astro y el repo `vega-astro` ENTERO. Ya no son de este lote'
  - '`src/lib/form/` y `src/lib/media/`: hay un tercer lote ahí'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - 'PIEZA 1: `vegabuild.New` DEVUELVE ERROR con `AuthCollections` nil, con lista vacía, con una
    entrada vacía o en blanco, y con una entrada que tenga espacios alrededor. Con test por cada
    caso y el mensaje de error citado literalmente en el informe'
  - '⚠️ PIEZA 1: el error IDENTIFICA la entrada que lo provoca (su índice o su valor entrecomillado)
    y dice que hay que QUITARLA o corregirla, no que se vaya a recortar sola. Un operador tiene que
    poder arreglar su configuración leyendo solo el mensaje. Con la salida literal en el informe'
  - 'PIEZA 1: una configuración VÁLIDA de hoy (`[]string{"vega_editors"}`, la de los dos ejemplos del
    README) sigue construyendo y sirviendo exactamente igual. Con test'
  - '⚠️ PIEZA 1, TEST POSITIVO OBLIGATORIO: `[]string{"_superusers"}` CONSTRUYE y autoriza. Es la
    asimetría deliberada con `vegapreview` y sin este test un worker puede «unificar» las dos
    políticas y seguir cumpliendo el resto del contrato'
  - '⚠️ PIEZA 1, TEST POSITIVO OBLIGATORIO: `[]string{"vega_editors", "vega_editors"}` CONSTRUYE, y
    la lista que llega a `apis.RequireAuth` sigue teniendo DOS entradas. Sin deduplicar'
  - 'PIEZA 1: `AuthCollections` NO se reasigna nunca. Lo que llega es lo que se pasa a
    `apis.RequireAuth`. Con test que lo fije: ver el invariante de la trampa central'
  - 'PIEZA 2: un `select` existente al que le FALTA una de las opciones esperadas se detecta como
    DIVERGENTE y aborta el sembrado sin escribir nada. Con test sobre el caso literal
    `pages.status` con `[draft, archived]` frente al esperado'
  - 'PIEZA 2: un `select` existente cuyas opciones son un SUPERCONJUNTO de las esperadas se sigue
    considerando COMPATIBLE y se salta. Con test'
  - '⚠️ PIEZA 2: un `select` existente con una opción REPETIDA se detecta como DIVERGENTE. Con test.
    Ver la decisión y su porqué en `invariants`'
  - '⚠️ PIEZA 2: un `select` existente cuyo `maxSelect` no es el que produciría la creación se
    detecta como DIVERGENTE. Con test'
  - 'PIEZA 2: ningún otro tipo de campo cambia de veredicto por este cambio. Con test'
  - 'Guardarraíl roto a propósito en la PIEZA 1 y en la PIEZA 2, cada uno con su salida literal'
  - '`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:go` y `pnpm build` verdes, con salida literal'
adversaries:
  - 'PIEZA 1: `AuthCollections: []string{" vega_editors "}`. HOY esa configuración construye sin
    protestar y no autoriza a NADIE, porque `RequireAuth` compara por igualdad exacta. Tiene que
    fallar en `New`, no en la primera petición de un editor'
  - 'PIEZA 1: `AuthCollections: []string{""}`. Una lista no vacía cuya única entrada no nombra
    ninguna colección'
  - '⚠️ PIEZA 1, LISTA MIXTA: `[]string{"vega_editors", " "}`. Hoy FUNCIONA de hecho, porque la
    entrada en blanco simplemente no casa con nadie y `vega_editors` sí. Tras este lote deja de
    arrancar, y es correcto que así sea, pero es una instalación que hoy sirve peticiones sin
    problema: por eso entra en `preexisting_data_cases` y por eso el mensaje de error tiene que
    señalar CUÁL es la entrada mala'
  - 'PIEZA 1: `AuthCollections: []string{"vega_editors", "vega_editors"}`. Un duplicado se ACEPTA:
    es redundante, no inseguro, y rechazarlo rompería una configuración que hoy funciona'
  - 'PIEZA 1: `AuthCollections: []string{"_superusers"}`. Se ACEPTA. Ver la asimetría deliberada en
    `invariants`; si la «arreglas», el lote se rechaza'
  - 'PIEZA 2: un `select` cuyas opciones son las mismas pero en OTRO ORDEN. Es compatible: el orden
    no impide guardar ningún valor'
  - 'PIEZA 2: un `select` del servidor con opciones REPETIDAS, p. ej. `[draft, published,
    published]`. DIVERGE'
  - 'PIEZA 2: un `select` múltiple del servidor con `maxSelect` distinto del que produce la creación.
    DIVERGE'
  - 'PIEZA 2: un campo esperado que NO es `select` pero cuyo campo actual SÍ lo es, y al revés. El
    veredicto ya lo decide `type` y no puede cambiar'
preexisting_data_cases:
  - 'PIEZA 2: una instalación real que ya tiene `pages` con un `status` de opciones distintas es
    justo el caso que motiva el lote. Lo que hoy pasa en silencio tiene que abortar, y abortar
    SIN HABER ESCRITO NADA (el sembrado ya hace su preflight de solo lectura antes de tocar nada:
    `inspectSeedPlan`, site-seeding.ts:185-212)'
  - '⚠️ PIEZA 1, Y SON TRES CASOS, NO UNO. Tras este cambio dejan de arrancar: (a) un servidor con
    `vegabuild` y allowlist VACÍA, (b) uno con una lista MIXTA que hoy autoriza correctamente a sus
    editores y arrastra una entrada en blanco o con espacios, y (c) uno con una entrada que solo
    tiene espacios. Los tres son intencionados y son el objeto del lote, pero el (b) es el que
    muerde: hoy funciona. Su operador tiene que poder leer del mensaje qué entrada quitar'
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
  - '⚠️ DECISIÓN YA TOMADA DE LA PIEZA 2, PARTE 1 — CONTENIDO: un `select` es COMPATIBLE cuando las
    opciones ESPERADAS son un SUBCONJUNTO de las actuales, y DIVERGENTE cuando falta alguna
    esperada. El ORDEN no importa. El porqué: si están todas las esperadas, el editor puede guardar
    todos los valores que el sembrado promete, y una opción de más es algo que el usuario añadió a
    propósito y que abortar castigaría sin motivo'
  - '⚠️ DECISIÓN YA TOMADA DE LA PIEZA 2, PARTE 2 — REPETICIONES: unas opciones actuales con un valor
    REPETIDO son DIVERGENTES, y esto es un cambio respecto a la primera versión de este encargo, que
    decía «sin importar repeticiones» y estaba MAL. El porqué, medido: el adaptador conserva los
    duplicados que devuelve el servidor (`adapters/pocketbase/schema.ts:182-188`) y los dos widgets
    iteran las opciones usando la propia cadena como clave (`Select.svelte:46-49`,
    `Chips.svelte:54-65`), así que Svelte lanza `each_key_duplicate` y EL FORMULARIO NO PINTA. Un
    esquema que rompe el formulario no es compatible con nada. Y no se «normaliza» quitando el
    duplicado: el sembrado no repara colecciones ajenas, aborta y lo cuenta'
  - '⚠️ DECISIÓN YA TOMADA DE LA PIEZA 2, PARTE 3 — LÍMITE: el `maxSelect` entra en la comparación de
    un `select`. El esperado se deriva EXACTAMENTE como lo hace la creación
    (`adapters/pocketbase/schema.ts:262-267`, que convierte `multiple: true` en `maxSelect: 99`), y
    el actual se lee tal cual (`schema.ts:182-188`). El porqué: hoy dos esquemas con `multiple: true`
    y límites distintos se declaran compatibles, y el formulario aplica el límite real
    (`Chips.svelte:70-84`), así que el sembrado estaría prometiendo una cardinalidad que el editor
    no puede usar. Ser más estricto aquí solo puede producir un aborto SIN ESCRIBIR, que es visible
    y reparable; ser más laxo produce un fallo silencioso'
  - '⚠️ Si al derivar el `maxSelect` esperado descubres que la regla de creación NO es la que dice
    esta cita, PARA y dilo. No inventes una derivación distinta'
  - 'PIEZA 2: los dos lados del comparador YA llevan los datos. El esperado en
    `CollectionFieldSpec` (`src/lib/backend/collections.ts:186-192`, `options: string[]`) y el real
    en `Field` (`src/lib/backend/types.ts:255-270`, con `options` y `maxSelect`). No hace falta
    ninguna lectura cruda nueva ni ampliar el puerto'
  - 'PIEZA 2: `ComparableFieldShape` es una estructura PLANA que se compara campo a campo en
    `sameShape` (site-seeding.ts:406-415). Un array no se compara con `===`. Si añades el dato tal
    cual y no tocas `sameShape`, el comparador dirá que TODO diverge, y los tests de compatibilidad
    existentes lo cazarán. Esa es exactamente la trampa'
  - 'Las dos piezas son INDEPENDIENTES entre sí. Ninguna necesita a la otra y ninguna puede cambiar
    el comportamiento observable de la otra'
repeat_interrupt_revert_behavior:
  - 'PIEZA 1: construir la extensión dos veces con la misma configuración válida da el mismo
    resultado. Un `New` que falla no deja NADA a medias: ni rutas registradas, ni colección creada'
  - 'PIEZA 2: correr el sembrado, que aborte por un `select` divergente, arreglar ese `select` a mano
    y volver a correrlo tiene que completar. El aborto no puede dejar un estado que impida reintentar'
measurement_reference_systems:
  - 'PIEZA 1: que «rechaza» se mide por el ERROR DEVUELTO POR `New`, no porque una petición acabe en
    401. Un test que pruebe la petición no distingue esta validación de la que ya hacía
    `RequireAuth`'
  - 'PIEZA 1: que «no reescribe» se mide comparando la lista que se le pasó a `apis.RequireAuth` con
    la que entró en `Config`, no leyendo el código'
  - 'PIEZA 2: que «aborta sin escribir» se mide contando las escrituras en el puerto, no por el
    mensaje de error'
  - 'PIEZA 2: que un `select` con opciones repetidas rompe el formulario se mide MONTANDO el widget,
    no razonando sobre Svelte. Si añades ese test conductual, mejor; si no puedes, dilo'
measurement_invalidation_conditions:
  - 'Un test de la PIEZA 1 que solo compruebe que existe una función de validación, sin construir la
    extensión, no mide nada'
  - 'Un test de la PIEZA 2 que fabrique el campo actual con la MISMA función que fabrica el esperado
    no mide nada: los dos lados vienen de tipos distintos y ahí está el error posible'
  - 'Si al sabotear el guardarraíl de la PIEZA 2 el test que cae es uno de `type` o de `required`, tu
    sabotaje apuntó al sitio equivocado: tiene que caer el de las OPCIONES o el del LÍMITE'
product_decisions_reserved_to_david:
  - 'La asimetría `_superusers` entre `vegabuild` y `vegapreview` YA ESTÁ DECIDIDA arriba'
  - 'El criterio subconjunto, el de repeticiones y el del `maxSelect` de la PIEZA 2 YA ESTÁN
    DECIDIDOS arriba. No los reabras ni los marques como revisables'
  - 'Si al implementar descubres que alguna de esas tres decisiones produce un aborto en un caso
    legítimo que no está enumerado aquí, PARA y dilo en el informe con el caso concreto'
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
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm test:go'
  - 'pnpm build'
required_behavioral_qa:
  - 'PIEZA 1: construir la extensión con cada configuración insegura (nil, vacía, entrada vacía,
    entrada con espacios, lista mixta) y CITAR el mensaje de error de cada una'
  - 'PIEZA 1: construir con `["_superusers"]` y con el duplicado, y comprobar que las dos arrancan'
  - 'PIEZA 1: construir con la configuración del README y comprobar que las rutas quedan registradas'
  - 'PIEZA 2: correr el sembrado contra el adaptador en memoria con un `pages.status` al que le falta
    una opción, y comprobar que aborta y que NO escribió nada'
  - 'PIEZA 2: el mismo caso con una opción DE MÁS, y comprobar que completa'
  - 'PIEZA 2: el mismo caso con una opción REPETIDA, y comprobar que aborta'
  - 'PIEZA 2: el mismo caso con un `maxSelect` distinto, y comprobar que aborta'
expected_reports:
  - /private/tmp/vega-informes/endurecimiento-pre-despliegue.md
known_unverifiable_items:
  - 'El gate completo NO corre entero en el sandbox: PocketBase no puede abrir puerto (`EPERM
    listen`) y Playwright no registra su puerto Mach. No pelees con eso: corre las suites que
    puedas, DI cuáles no, y sigue. El gate autoritativo lo paso yo'
  - 'Que un servidor real con `vegabuild` y allowlist vacía deje de arrancar solo se puede comprobar
    desplegando. Tú lo pruebas en la construcción de la extensión'
  - 'El juicio visual y la decisión de publicar son de David'
```

## Por qué existe

Dos agujeros pequeños que hay que cerrar **antes** de que esto se instale en un servidor.

**`vegabuild` arrastra el mismo agujero que `vegapreview` acaba de cerrar.** Una `AuthCollections`
vacía hace que `apis.RequireAuth` acepte a cualquier identidad autenticada de cualquier colección,
y la ruta que protege es la que **publica el sitio**. El agujero vuelve por otra puerta y hay que
cerrarlo por esa puerta también.

**El comparador del sembrado no mira las opciones de un `select`.** Lo cazó la revisión fría del lote
de siembra: un `pages.status` preexistente con `['draft', 'archived']` se da hoy por compatible y se
salta **en silencio**, y el editor se queda sin poder publicar sin que nadie le diga por qué. Al
criticar este encargo salieron dos huecos más de lo mismo: unas opciones repetidas **rompen el
formulario entero** con `each_key_duplicate`, y un `maxSelect` distinto promete una cardinalidad que
el editor no puede usar.

## Verificación

- **Rompe un guardarraíl a propósito en la pieza 1 y en la pieza 2**, y comprueba que cae el test que
  cubre ESA propiedad, no otro. Antes de sabotear: árbol limpio y tu cambio ya commiteado; la
  restauración se hace desde el estado guardado, nunca desde el índice, y después compruebas que tu
  arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- **Un solo commit** sobre `c0d63af`, rama `feat/endurecimiento-pre-despliegue` y su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay DOS lotes más sobre este repo ahora mismo.** Uno es dueño de las REGLAS DE ACCESO y toca
  `src/lib/backend/site-seeding.ts`, el mismo fichero que tú: limítate al comparador de formas y no
  reordenes ni reescribas nada más de ese fichero. El otro está en `src/lib/form/` y
  `src/lib/media/`. Si necesitas algo de ahí, PARA y dilo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/endurecimiento-pre-despliegue.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
