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
  - 'El sembrado de `vega_editors`: va en su propio lote (`fc6f2773`), que corre EN PARALELO a este
    sobre este mismo repo. NO toques nada bajo `src/lib/backend/`'
  - 'vega-astro, el starter y su documento de discovery'
  - 'Notas de release y CHANGELOG: los escribo yo al publicar'
acceptance_criteria:
  - '`New(config)` DEVUELVE ERROR con `AuthCollections` vacío o nil, y la extensión no queda montada'
  - '`New(config)` DEVUELVE ERROR si `_superusers` está en `AuthCollections`'
  - 'El mensaje de error DICE QUÉ HACER, no solo que está mal: quien lo lea tiene que entender que
    necesita una colección de editores propia. Es el primer contacto de un operador con esto'
  - 'Una configuración válida (una o más colecciones auth de verdad, sin `_superusers`) sigue
    arrancando exactamente igual que hoy'
  - 'Los tests existentes que construyen una Config válida siguen pasando, ajustados solo en lo
    imprescindible para declarar su allowlist'
  - 'Guardarraíl roto a propósito, con su salida literal'
  - 'El README declara el cambio como ROMPEDOR y dice qué hacer al actualizar'
adversaries:
  - '⚠️ `_superusers` colado con ESPACIOS alrededor (`" _superusers "`), que hoy pasaría la
    comparación ingenua pero PocketBase podría seguir aceptando'
  - '⚠️ `_superusers` con OTRA CAJA (`"_Superusers"`, `"_SUPERUSERS"`). Averigua si PocketBase trata
    los nombres de colección como sensibles a mayúsculas y decide en consecuencia; si no lo puedes
    determinar con certeza, elige el lado SEGURO (rechazar) y dilo'
  - 'Una lista NO vacía pero inútil: `[]string{""}` o `[]string{"   "}`. Es «no vacía» para `len()` y
    no nombra ninguna colección real'
  - 'Duplicados en la lista'
  - 'Una lista que contiene `_superusers` JUNTO A una colección legítima: sigue siendo un bypass
    total, porque basta con que una identidad superuser pase `RequireAuth`'
  - 'Un operador que actualiza una instalación existente: hoy arranca y mañana no. Es el caso que
    hay que documentar, no esconder'
preexisting_data_cases:
  - '⚠️ TODA instalación actual de `vegapreview` está configurada SIN allowlist (es el defecto y es
    lo que la documentación enseña). Este cambio las tumba a todas al arrancar, A PROPÓSITO. El
    fallo tiene que ser legible y accionable, porque va a ser la primera vez que alguien lo vea'
invariants:
  - '⚠️ EL AGUJERO QUE SE CIERRA, y conviene entenderlo antes de tocar nada: `vegapreview` evalúa la
    `ViewRule` del registro con la identidad de quien pide, que es correcto, PERO en PocketBase
    `CanAccessRecord` hace BYPASS TOTAL de la ViewRule si la identidad es superuser. Y
    `AuthCollections` vacío significa «acepta cualquier identidad autenticada». Resultado de hoy:
    cualquier superuser puede pedir un token de preview de cualquier registro de cualquier
    colección'
  - 'La puerta real es `apis.RequireAuth(x.config.AuthCollections...)` (vegapreview.go:157). Si
    `_superusers` no está en esa lista, ninguna identidad superuser llega al handler, y por eso este
    arreglo cierra el agujero de verdad en vez de taparlo. VERIFICA que es así en vez de creerme'
  - 'El fichero YA FALLA CERRADO en `normalized()` con el secreto corto, el TTL fuera de rango y el
    `MaxDraftBytes`. Este rechazo va EN EL MISMO SITIO y con la misma forma. No inventes un
    mecanismo nuevo'
  - 'Una Config válida no cambia de comportamiento en NADA. Este lote solo añade rechazos'
repeat_interrupt_revert_behavior:
  - '`normalized()` es puro sobre su entrada: llamarlo dos veces da lo mismo. Si normalizas la lista
    (trim, dedup), la segunda pasada sobre la salida de la primera tiene que dar idéntico resultado'
measurement_reference_systems:
  - 'El rechazo se mide llamando a `New(config)` y comprobando el ERROR devuelto, no leyendo la
    Config normalizada'
  - 'La eficacia se mide contra PocketBase REAL: con la allowlist puesta, una petición autenticada
    como superuser NO debe pasar `RequireAuth`. Ese es el test que demuestra que el agujero se
    cerró; el resto solo demuestra que la validación existe'
measurement_invalidation_conditions:
  - 'Un test que solo compruebe que `New` devuelve error no mide que el agujero esté cerrado: mide
    que hay una validación. Hace falta el de PocketBase real'
  - 'Si el test construye la Config con el mismo helper que normaliza, la comparación es tautológica'
product_decisions_reserved_to_david:
  - 'YA DECIDIDO (29 jul): negarse a arrancar, no avisar y seguir. Coherente con el resto del fichero'
  - 'YA DECIDIDO: alcance limitado a `AuthCollections`; `RecordCollections` no se toca'
  - '⚠️ EL ORDEN DE PUBLICACIÓN ES DE DAVID: este lote NO puede publicarse antes que el sembrado
    (`fc6f2773`), que es quien crea `vega_editors`. Hasta entonces no hay ninguna otra colección de
    auth a la que apuntar y esto dejaría el preview inservible. Tú entregas; publicar no es tuyo'
repo_claims_that_may_become_false:
  - file: extensions/vegapreview/vegapreview.go
    section_or_quote:
      'Líneas 63-68: "AuthCollections restricts which PocketBase auth collections may mint preview
      URLs. Empty accepts any authenticated record, mirroring extensions/vegabuild." La segunda
      frase deja de ser cierta, y la comparación con vegabuild también'
  - file: extensions/vegapreview/README.md
    section_or_quote:
      'Cualquier ejemplo de configuración que omita `AuthCollections`, y cualquier frase que
      describa el defecto vacío como aceptable'
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
  - 'Contra PocketBase REAL: con `AuthCollections` legítima, una petición autenticada como SUPERUSER
    recibe 401/403 y no obtiene token'
  - 'Contra PocketBase REAL: con esa misma allowlist, un editor de la colección permitida sigue
    obteniendo su token igual que hoy'
  - 'Los tres casos de evasión (espacios, caja, lista de cadenas vacías) contra `New`'
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

Dos rechazos en `Config.normalized()` (`extensions/vegapreview/vegapreview.go:81`), donde ya viven
los otros cuatro rechazos de arranque. Nada más.

Lo pequeño del cambio es engañoso: **lo que se juzga aquí no es el `if`, son los caminos que lo
rodean**. Un rechazo que se salta con un espacio o con una mayúscula no cierra nada, y un mensaje de
error que solo dice «configuración inválida» convierte una actualización rutinaria en media hora de
alguien buscando a ciegas.

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
- ⚠️ **Hay OTRO lote corriendo sobre este mismo repo en paralelo** (`fc6f2773`, el sembrado), que
  trabaja bajo `src/lib/backend/`. Tú no sales de `extensions/vegapreview/`. Si necesitas tocar algo
  fuera de ahí, PARA y dilo en el informe en vez de hacerlo.
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/vegapreview-allowlist-obligatoria.md` con commits, pruebas,
  guardarraíles ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha. Si
  `vegabuild` comparte el defecto, dilo ahí.
