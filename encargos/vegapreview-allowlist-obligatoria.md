# Encargo — `vegapreview` se niega a arrancar sin allowlist de auth

## Contrato de tarea

```yaml
task_id: vegapreview-allowlist-obligatoria
prompt_hash: se_calcula_sobre_este_fichero_ya_commiteado
repos:
  - repo_id: vegacms
    base_sha: 3f8a2853695f895db743158e24ad77eda0410b85
    branch: feat/vegapreview-allowlist-obligatoria
    worktree: /private/tmp/vegacms-vegapreview-allowlist
scope_in:
  - 'extensions/vegapreview/vegapreview.go: `Config.normalized()` rechaza `AuthCollections` vacío y
    rechaza `_superusers` dentro de la lista'
  - 'extensions/vegapreview/vegapreview_test.go: los casos nuevos, incluidos los de evasión'
  - 'extensions/vegapreview/README.md: es un cambio ROMPEDOR de configuración y hay que decirlo'
  - 'Las afirmaciones del repo que tu propio cambio deja falsas: arréglalas tú, con moderación'
scope_out:
  - '⚠️ `RecordCollections`. La decisión de David cubre SOLO `AuthCollections`. Que `RecordCollections`
    vacío siga significando «cualquiera» NO se toca en este lote, aunque te parezca simétrico'
  - 'El resto de `vegapreview`: firma, cifrado del borrador, TTL, trazas, 404 del visitante, el
    `\n` en colección e id. Todo eso ya se endureció y está probado. NO lo rediseñes'
  - 'extensions/vegabuild y extensions/vegaauth, aunque `vegabuild` tenga la misma forma de
    allowlist: si comparten el defecto, DILO en el informe, no lo arregles aquí'
  - 'El sembrado de `vega_editors`: es el encargo `site-seeding-one-step`, que se despacha en
    paralelo a este sobre este mismo repo. NO toques nada bajo `src/lib/backend/`'
  - 'vega-astro, el starter y su documento de discovery'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - '`New(config)` DEVUELVE ERROR con `AuthCollections` vacío o nil, y la extensión no queda montada'
  - '`New(config)` DEVUELVE ERROR si `_superusers` está en `AuthCollections`'
  - '⚠️ LA VALIDACIÓN SOLO RECHAZA, JAMÁS REESCRIBE. Ver `invariants`: `AuthCollections` viaja
    VERBATIM a `apis.RequireAuth`, que compara por igualdad EXACTA, así que un `trim` puede pasar
    una entrada que hoy no autoriza a nadie a una que sí autoriza. La lista que sale de
    `normalized()` es byte a byte la que entró, o hay error'
  - 'El mensaje de error DICE QUÉ HACER, no solo que está mal: quien lo lea tiene que entender que
    necesita una colección de editores propia. Es el primer contacto de un operador con esto'
  - '«Válida» en este lote es una propiedad PURAMENTE SINTÁCTICA, enumerada abajo. Que la colección
    EXISTA y sea de tipo auth queda FUERA: `normalized()` no recibe `core.App` y no puede saberlo'
  - 'Una configuración sintácticamente válida sigue arrancando exactamente igual que hoy'
  - 'Los tests existentes que construyen una Config válida siguen pasando, ajustados solo en lo
    imprescindible para declarar su allowlist'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - 'El README declara el cambio como ROMPEDOR y dice qué hacer al actualizar'
adversaries:
  - '⚠️ `_superusers` con ESPACIOS alrededor (`" _superusers "`) o con OTRA CAJA (`"_Superusers"`).
    Resultado exigido: RECHAZO. La comparación para decidir el rechazo se hace sobre la entrada
    recortada y en minúsculas, pero eso es SOLO para decidir; la lista NUNCA se reescribe'
  - 'Cualquier entrada con espacios alrededor, aunque no sea `_superusers` (`" vega_editors "`).
    Resultado exigido: RECHAZO, con un mensaje que diga que sobra el espacio. NO la recortes: hoy
    esa entrada no autoriza a nadie, y recortarla la convertiría en una que SÍ autoriza'
  - 'Una lista NO vacía pero inútil: `[]string{""}` o `[]string{"   "}`. Es «no vacía» para `len()`.
    Resultado exigido: RECHAZO'
  - 'Duplicados en la lista. Resultado exigido: SE ACEPTAN tal cual. `slices.Contains` los trata
    igual y hoy funcionan; rechazarlos rompería una configuración que ya va bien, sin ganar nada'
  - 'Una lista que contiene `_superusers` JUNTO A una colección legítima: sigue siendo un bypass
    total, porque basta con que una identidad superuser pase `RequireAuth`. Rechazo'
  - 'Un operador que actualiza una instalación con la allowlist nil o vacía: hoy arranca y mañana no'
preexisting_data_cases:
  - '⚠️ Las instalaciones que DEJAN DE ARRANCAR son exactamente las que tienen `AuthCollections`
    nil, vacía, o compuesta solo por entradas que este contrato declara inválidas. NO son todas: el
    README del árbol base (línea ~35) YA declara `AuthCollections: []string{"vega_editors"}` en su
    ejemplo principal, así que quien lo siguió no se ve afectado. No escribas «todas» en la
    documentación: no es cierto y asusta de más'
  - 'El fallo tiene que ser legible y accionable: para quien lo vea, será la primera vez'
invariants:
  - '⚠️ EL AGUJERO QUE SE CIERRA, y conviene entenderlo antes de tocar nada: `vegapreview` evalúa la
    `ViewRule` del registro con la identidad de quien pide, que es correcto, PERO en PocketBase
    `CanAccessRecord` hace BYPASS TOTAL de la ViewRule si la identidad es superuser. Y
    `AuthCollections` vacío significa «acepta cualquier identidad autenticada». Resultado de hoy:
    cualquier superuser puede pedir un token de preview de cualquier registro de una colección
    permitida por `RecordCollections`; y de CUALQUIER colección solo cuando esa lista está vacía.
    `tokenHandler` llama antes a `collectionIsSupported`, así que el radio real está acotado por
    ahí. No diseñes el test contra una colección fuera de `RecordCollections`'
  - '⚠️ LA VALIDACIÓN SOLO RECHAZA, NUNCA REESCRIBE, y esta es la trampa central del lote. La puerta
    real es `apis.RequireAuth(x.config.AuthCollections...)` (vegapreview.go:157), y RequireAuth
    compara `e.Auth.Collection().Name` por IGUALDAD EXACTA (`slices.Contains`), sin `TrimSpace` ni
    `EqualFold`. Consecuencia: si `normalized()` recorta `" vega_editors "` a `"vega_editors"`,
    una configuración que HOY no autoriza a nadie pasa a autorizar. Eso es AMPLIAR permisos
    disfrazado de saneamiento. La lista que devuelve `normalized()` es byte a byte la que entró'
  - 'Si `_superusers` no está en esa lista, ninguna identidad superuser llega al handler, y por eso
    este arreglo cierra el agujero de verdad en vez de taparlo. VERIFICA que es así, no me creas'
  - 'El fichero YA FALLA CERRADO en `normalized()` con el `RoutePrefix`, el `PreviewPath`, el
    `SiteOrigin`, el secreto corto, el TTL (dos condiciones) y el `MaxDraftBytes`. Tus rechazos van
    EN EL MISMO SITIO y con la misma forma. No inventes un mecanismo nuevo, y no quites ninguno'
  - 'Una Config sintácticamente válida no cambia de comportamiento en NADA. Este lote solo añade
    rechazos, y «solo rechazos» incluye no reescribir nada'
repeat_interrupt_revert_behavior:
  - '`normalized()` es puro sobre su entrada: llamarlo dos veces da lo mismo. Como la allowlist no se
    reescribe, la segunda pasada sobre la salida de la primera es trivialmente idéntica. Si te ves
    necesitando dedup o trim para que eso se cumpla, has roto el invariante de arriba'
measurement_reference_systems:
  - 'El rechazo se mide llamando a `New(config)` y comprobando el ERROR devuelto, no leyendo la
    Config normalizada'
  - '⚠️ La eficacia se mide contra PocketBase REAL exigiendo **403 EXACTO** para el superuser real.
    `RequireAuth` devuelve 401 cuando NO hay identidad y 403 cuando hay una identidad válida cuya
    colección no está en la allowlist. Aceptar «401 o 403» dejaría pasar como verde un token
    caducado o mal construido, que no demuestra nada'
  - 'Control positivo obligatorio en el mismo test: un editor de la colección permitida obtiene 200
    y su token. Sin él, un 403 podría venir de que la extensión está rota entera'
  - 'Que la lista no se reescribe se mide comparando `AuthCollections` antes y después de
    `normalized()`, elemento a elemento'
measurement_invalidation_conditions:
  - 'Un test que solo compruebe que `New` devuelve error no mide que el agujero esté cerrado: mide
    que hay una validación. Hace falta el de PocketBase real'
  - 'Un test que acepte 401 como éxito NO mide el cierre del agujero: mide que no había sesión'
  - 'Si el test construye la Config con el mismo helper que normaliza, la comparación es tautológica'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO (29 jul): negarse a arrancar, no avisar y seguir. Coherente con el resto del fichero'
  - 'YA DECIDIDO: alcance limitado a `AuthCollections`; `RecordCollections` no se toca'
  - '⚠️ EL ORDEN DE PUBLICACIÓN ES DE DAVID: este lote NO puede publicarse hasta que esté INTEGRADA
    la entrega del encargo `site-seeding-one-step`, que es quien crea `vega_editors`. Hasta entonces
    no hay ninguna otra colección de auth a la que apuntar y esto dejaría el preview inservible. Tú
    entregas; publicar no es tuyo'
  - 'Si crees que hace falta validar que la colección EXISTE y es de tipo auth, eso exigiría
    `core.App` dentro de `normalized()` y cambia su firma. PARA y dilo: no lo decidas tú'
repo_claims_that_may_become_false:
  - file: extensions/vegapreview/vegapreview.go
    section_or_quote:
      'Líneas 63-68: "AuthCollections restricts which PocketBase auth collections may mint preview
      URLs. Empty accepts any authenticated record, mirroring extensions/vegabuild." La segunda
      frase deja de ser cierta, y la comparación con vegabuild también'
  - file: extensions/vegapreview/README.md
    section_or_quote:
      '⚠️ LA QUE DE VERDAD IMPORTA, líneas ~55-58: "AuthCollections must match the auth.collection
      advertised by that deployment discovery document. The example uses a dedicated vega_editors
      auth collection; the current Astro starter advertises _superusers instead." Tras este lote esa
      instrucción lleva al operador DERECHO a un arranque fallido: si hace coincidir su allowlist
      con lo que anuncia el starter, pone `_superusers` y la extensión se niega a arrancar. Hay que
      distinguir la migración a una colección de editores propia del estado actual del starter'
  - file: extensions/vegapreview/README.md
    section_or_quote:
      'El ejemplo principal (línea ~35) YA declara `AuthCollections: []string{"vega_editors"}`, así
      que NO es un ejemplo que haya que arreglar. No lo toques y no escribas que estaba mal'
  - file: docs/POCKETBASE-INTEGRATION.md
    section_or_quote:
      'Si describe el montaje de vegapreview con una configuración que ahora no arrancaría.
      COMPRUÉBALO; si no lo hace, no toques el fichero'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm test:go'
  - 'pnpm build'
  - 'pnpm gate'
required_behavioral_qa:
  - '⚠️ Contra PocketBase REAL: con `AuthCollections` legítima, una petición autenticada como
    SUPERUSER recibe **403 EXACTO** y no obtiene token. 401 NO vale: significa que no había
    identidad, y entonces el test no ha demostrado nada'
  - 'Contra PocketBase REAL, en el MISMO test como control positivo: un editor de la colección
    permitida obtiene 200 y su token, igual que hoy'
  - 'Los cuatro casos de evasión contra `New`: espacios alrededor de `_superusers`, otra caja de
    `_superusers`, espacios alrededor de una colección legítima, y lista de cadenas en blanco'
  - 'Que `normalized()` NO reescribe: comparar `AuthCollections` antes y después, elemento a
    elemento, para una lista con duplicados'
expected_reports:
  - /private/tmp/vega-informes/vegapreview-allowlist-obligatoria.md
known_unverifiable_items:
  - 'El gate completo no corre dentro del sandbox: PocketBase no puede abrir puerto y Playwright no
    registra su puerto Mach. Usa `GOCACHE=/private/tmp/vega-go-build-cache`, corre lo que puedas,
    y dilo. Los tests Go SÍ tienen que correr: son el corazón de este lote'
```

## Por qué existe

Salió de la revisión de seguridad de `b038dd2`. De sus cuatro puntos, **tres ya están arreglados**
(techo de una hora al TTL, trazas de servidor que distinguen causas sin tocar el 404 del visitante, y
rechazo del `\n` en colección e id antes de firmar). Queda el cuarto, que es el único de verdad
explotable: la allowlist vacía más el bypass de superuser.

## Lo que hay que construir

Unos rechazos en `Config.normalized()` (`extensions/vegapreview/vegapreview.go:81`), donde ya viven
los rechazos de arranque existentes. Nada más.

Lo pequeño del cambio es engañoso, y hay **una trampa que se lleva por delante la intuición**: aquí
sanear la entrada es PELIGROSO. `apis.RequireAuth` compara los nombres por igualdad exacta, así que
una entrada con un espacio de más hoy no autoriza a nadie. Si la «arreglas» con un `trim`, acabas de
conceder acceso a una colección que antes no lo tenía, y lo has hecho dentro de un lote cuyo objetivo
era restringir. Por eso el contrato dice: **rechaza, nunca reescribas**.

Lo demás es que un rechazo que se salta con una mayúscula no cierra nada, y que un mensaje que solo
dice «configuración inválida» convierte una actualización rutinaria en media hora a ciegas.

## Verificación

- **Los tests Go son el corazón**, no un extra: `pnpm test:go`, y contra PocketBase real donde el
  contrato lo pide. Que la validación devuelva error se prueba en un test unitario; que el agujero
  esté cerrado solo se prueba con una identidad superuser real chocando contra `RequireAuth`.
- **Rompe un guardarraíl a propósito**: quita el rechazo de `_superusers` y comprueba que cae el test
  de PocketBase real, no solo el unitario. Antes de sabotear, árbol limpio y tu cambio ya commiteado;
  la restauración se hace desde el estado guardado, nunca desde el índice, y después compruebas que
  tu arreglo SIGUE AHÍ.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `3f8a285`, rama `feat/vegapreview-allowlist-obligatoria` y su worktree.
  **Commitea pronto y ve enmendando.**
- ⚠️ **Hay OTRO lote sobre este mismo repo en paralelo** (`site-seeding-one-step`, el sembrado), que
  trabaja bajo `src/lib/backend/`. Tú no sales de `extensions/vegapreview/`. Si necesitas tocar algo
  fuera de ahí, PARA y dilo en el informe en vez de hacerlo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/vegapreview-allowlist-obligatoria.md` con commits, pruebas,
  guardarraíles ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha. Si
  `vegabuild` comparte el defecto, dilo ahí.
