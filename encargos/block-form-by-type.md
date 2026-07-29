# Encargo — El formulario de un bloque lo dirige su TIPO

## Contrato de tarea

```yaml
task_id: block-form-by-type
prompt_hash: se_calcula_sobre_este_fichero_ya_commiteado
repos:
  - repo_id: vegacms
    base_sha: e596154db27191c286baef54ef28e0603bab247a
    branch: feat/block-form-by-type
    worktree: /private/tmp/vegacms-block-form-by-type
scope_in:
  - 'BlockEditor.svelte: pintar los campos del TIPO del bloque en vez de las columnas crudas'
  - 'RecordBlocks.svelte: pasarle el ResolvedBlockType de cada fila'
  - 'Sus claves i18n en es.ts y en.ts, si hacen falta'
  - 'Tests de componente'
  - 'La cabecera de BlockEditor.svelte, que HOY afirma algo falso sobre el colapso'
scope_out:
  - 'src/lib/model/block-data-form.ts y block-field-schema.ts: SE REUSAN, no se reescriben'
  - 'Bloques ANIDADOS: fuera de v1 a propósito'
  - 'El menú de añadir bloque y la insignia de tipo: ya existen, no se rehacen'
  - 'backend/, extensions/, vega-astro, READMEs y notas de release'
acceptance_criteria:
  - 'Un bloque de tipo conocido pinta los campos que su tipo declara, en el orden del manifiesto'
  - 'La columna `data` deja de ofrecerse como JSON crudo cuando el tipo dirige el formulario'
  - 'Guardar escribe dentro de `data` SOLO las claves que el tipo reclama, y NO destruye el resto'
  - 'Un bloque cuyo tipo ya no está en el vocabulario NO pierde datos ni deja al usuario sin salida'
  - 'Un `data` que no es un objeto BLOQUEA el guardado con su motivo dicho, y enseña el valor crudo'
  - 'Un campo `source: record` sin columna se pinta INHABILITADO, con motivo y enlace a Ajustes'
  - 'Un guardarraíl roto a propósito, con su salida'
adversaries:
  - 'Bloque cuyo `type` ya no existe en el manifiesto, con `data` lleno'
  - 'Bloque con la columna de tipo VACÍA (creado antes del vocabulario)'
  - '`data` con claves SHADOWED: existe un campo homónimo que hoy es `source: record`'
  - '`data` con claves ORPHANED: ningún campo del tipo declara esa clave'
  - 'Un campo del tipo con `source: record`, que vive en COLUMNA y no en `data`'
  - 'Un campo `source: record` cuya columna todavía NO existe en el esquema'
  - '`data` que no es un objeto (null, array, string) por escritura externa'
  - 'Guardado que FALLA en el puerto: el borrador tiene que sobrevivir y poder reintentarse'
preexisting_data_cases:
  - 'Las claves SHADOWED y ORPHANED de `data` SE CONSERVAN en cada guardado, y por separado: son el
    único sitio donde vive ese valor'
  - 'Un campo que pasa de `source: data` a `source: record` tiene su valor SOLO en el JSON hasta que
    se migre la columna'
  - 'Un `data` no-objeto preexistente NO se pisa: hoy `writeBlockData` lo sustituye por `{}` y el
    valor desaparece al guardar. Decisión de David: bloquear el guardado, no destruirlo'
invariants:
  - 'readBlockData/writeBlockData ya existen, están probados y son el ÚNICO camino de
    lectura/escritura de `data`'
  - 'resolveBlockDataFields cubre SOLO los campos `source: data`; excluye a propósito los
    `source: record` (block-data-form.ts:26). NO es el formulario completo del tipo'
  - 'Los Field que produce son SINTÉTICOS por widget: NO son columnas descubiertas y NO pueden
    entrar en toRecordInput'
  - 'block-schema reconcilia la FORMA de las columnas, nunca su CONTENIDO'
  - 'La preview sigue publicando el borrador en forma FÍSICA: los valores de `data` viajan dentro de
    `dataField`, nunca como columnas de primer nivel de PreviewDraftRecord'
  - 'Un guardado FALLIDO conserva borrador y baseline sucio: el baseline solo se reasienta después
    de que `port.update` confirme (BlockEditor.svelte:149)'
  - 'Cada BlockEditor vive SIEMPRE montado (`hidden`, no `{#if}`): plegar una fila no destruye el
    borrador, y eso es deliberado'
repeat_interrupt_revert_behavior:
  - 'Guardar dos veces seguidas sin cambios no puede alterar `data`'
  - 'Colapsar una fila con cambios sin guardar los CONSERVA, como hoy. La cabecera de
    BlockEditor.svelte dice lo contrario y es falsa: arréglala'
  - 'Un guardado interrumpido por error del puerto se puede reintentar sin perder lo escrito'
measurement_reference_systems:
  - 'El ORDEN de los campos se mide contra el orden de declaración en el manifiesto resuelto
    (ResolvedBlockType.fields), no contra el orden de las columnas descubiertas ni el de `data`'
  - 'La conservación de datos se mide comparando el objeto `data` ANTES y DESPUÉS del guardado, por
    clave. No se mide por "¿se guardó el campo que edité?"'
  - 'La clasificación claimed/shadowed/orphaned se toma de block-data-diagnostics.ts, que es el
    vocabulario canónico; no inventes sinónimos'
measurement_invalidation_conditions:
  - 'Si el manifiesto se reordena entre la lectura y la comprobación, la medida del orden no vale'
  - 'Si el test construye `data` con el mismo helper que el código bajo prueba, la comparación
    antes/después no prueba conservación: usa un objeto literal escrito a mano'
  - 'Un test que solo monta el componente y no GUARDA no mide nada sobre pérdida de datos'
product_decisions_reserved_to_david:
  - 'Qué hacer con un bloque huérfano de tipo más allá de no romperlo: borrarlo, reasignarlo o
    migrarlo es decisión suya'
  - 'YA DECIDIDO: `data` no-objeto bloquea el guardado y se enseña el valor crudo'
  - 'YA DECIDIDO: campo `source: record` sin columna se pinta inhabilitado, con motivo y salida a
    Ajustes'
repo_claims_that_may_become_false:
  - file: src/lib/form/BlockEditor.svelte
    section_or_quote:
      'Líneas 18-19: "hasta que se guarda con su propio botón o se descarta colapsando la fila". Ya
      es FALSO hoy: RecordBlocks monta cada editor con `hidden`, no `{#if}`, justo para que
      colapsar NO descarte'
  - file: src/lib/form/BlockEditor.svelte
    section_or_quote:
      'Su cabecera describe un mini-formulario que pinta las columnas físicas de la colección hija;
      este lote lo sustituye por uno dirigido por el tipo'
  - file: docs/CONFIG.md
    section_or_quote:
      'La sección que describe cómo se editan hoy los campos de un bloque, y cualquier frase que
      diga que el usuario ve `data` como JSON crudo'
required_gate:
  - 'pnpm check'
  - 'pnpm lint'
  - 'pnpm test'
  - 'pnpm build'
  - 'pnpm gate'
required_behavioral_qa:
  - 'Guardar un bloque, RECARGAR y comprobar que lo guardado persiste y que las claves shadowed y
    orphaned siguen ahí'
  - 'Plegar una fila con cambios sin guardar, desplegarla y comprobar que el borrador sigue'
  - 'Provocar un fallo del puerto al guardar y comprobar que se puede reintentar'
expected_reports:
  - /private/tmp/vega-informes/feat-block-form-by-type.md
known_unverifiable_items:
  - 'El gate completo no corre dentro del sandbox: PocketBase no puede abrir puerto y Playwright no
    registra su puerto Mach'
  - 'El QA conductual con navegador real y lector de pantalla lo hace David; tú entregas el montaje
    real bajo jsdom'
```

## Por qué existe

Hoy **nadie puede editar un bloque como bloque**. `BlockEditor` pinta las columnas físicas de la
colección hija, así que el usuario ve un `data` en JSON crudo y ningún campo del tipo. El vocabulario
existe, el menú para elegir tipo existe, la insignia existe, y el adaptador puro que traduce un tipo
a campos de formulario **también existe y está probado**. Falta el componente que los junte.

Esta es la última pieza de la p1 del editor. Con ella, añadir un bloque «Portada» y rellenar su
título deja de ser imposible.

## Lo que hay que construir

`RecordBlocks` ya sabe de qué tipo es cada fila (`blockTypeOf`, lo usa para la insignia). Pásaselo a
`BlockEditor`, y que este pinte el formulario del TIPO.

**Reusa, no reescribas.** Todo esto ya existe en `src/lib/model/`:

- `resolveBlockDataFields(blockType)` → los `ResolvedField` del tipo **que viven en `data`**, en el
  orden del manifiesto. ⚠️ **Excluye a propósito los `source: record`** (`block-data-form.ts:26`):
  no es el formulario completo, es solo su mitad.
- `readBlockData(blockType, data)` → los valores iniciales, tolerante a basura **al leer**.
- `writeBlockData(...)` → el `data` resultante.
- `block-data-diagnostics.ts` → clasifica cada clave de `data` en `claimed` / `shadowed` /
  `orphaned`. Ese es el vocabulario canónico y significan cosas distintas: `shadowed` es «existe un
  campo homónimo, pero hoy es `source: record`»; `orphaned` es «ningún campo declara esa clave».

⚠️ **El filo del lote, que ya costó un bug de pérdida de datos:** los `Field` que produce
`resolveBlockDataFields` son **SINTÉTICOS por widget**, no columnas descubiertas. Colarlos en
`toRecordInput` escribiría columnas que no existen. Y `writeBlockData` llegó a borrar de `data` todo
campo `source: "record"` en cada guardado, lo que destruía la única copia del valor de un campo que
estaba en plena transición de `data` a columna. Las dos trampas están cerradas en los módulos que
reusas: **no las reabras escribiendo tu propia versión.**

### La otra mitad del formulario: los campos `source: record`

Viven en COLUMNAS de la colección hija, no en `data`, y `resolveBlockDataFields` no te los da. Los
resuelves desde las columnas descubiertas del `childType`, casando por nombre.

**Si la columna no existe todavía** en el esquema: el campo se pinta **inhabilitado**, diciendo que
su columna no existe y enlazando a Ajustes. Ahí hay un panel de reconciliación que genera justo la
migración que la crea. Lo que NO puedes hacer es tragarte el guardado en silencio ni ocultar el
campo: el usuario tiene que enterarse de que su tipo declara algo que el esquema no soporta, y ver
la salida. Decisión de David, no la reabras.

### Los tres estados del tipo

1. **Tipo conocido**: se pintan sus campos, los de `data` y los de columna.
2. **Tipo huérfano** (el `type` guardado ya no está en el manifiesto): **no se pierde nada y el
   usuario no se queda sin salida**. Enséñale que el tipo no existe, y qué hay dentro. Lo que NO
   puedes hacer es pintar un formulario vacío que al guardar vacíe `data`.
3. **Sin tipo** (columna vacía, bloque anterior al vocabulario): mismo criterio, no romper.

### `data` que no es un objeto

Puede llegar `null`, un array o una cadena por escritura externa. Hoy `writeBlockData` lo sustituye
por `{}` y **ese valor desaparece al guardar**; hay un test que consagra esa destrucción
(`block-data-form.test.ts:211`).

**Decisión de David: se bloquea el guardado.** El bloque se pinta en modo solo lectura, se dice que
`data` no es un objeto y que guardar destruiría lo que hay, y se enseña el valor crudo para que el
usuario pueda rescatarlo. No toques `writeBlockData` para conseguirlo: la puerta se cierra en el
componente, antes de llamarlo.

### Las claves shadowed y orphaned, que es el caso que pierde datos

`data` puede contener claves que ya no reclama ningún campo del tipo. **Se conservan las dos
clases, y por separado.** Es el único sitio donde vive ese valor, y un guardado que las tire es una
pérdida silenciosa que ningún test de «¿se guarda el título?» detecta. Usa
`block-data-diagnostics.ts` si te sirve para decírselo al usuario, pero **la conservación no es
opcional aunque no la enseñes**.

## Verificación

- Tests de componente con los OCHO adversarios del contrato. El que no puede faltar: **guardar un
  bloque con claves shadowed Y orphaned y comprobar que siguen ahí después.** No compruebes «se
  guardó el campo»: compara el objeto `data` antes y después, clave a clave, y escribe el `data` de
  partida como literal a mano.
- **Rompe un guardarraíl a propósito**: haz que el guardado escriba `data` solo con las claves
  reclamadas, descartando shadowed y orphaned, y comprueba que ESE test cae. Antes de sabotear,
  árbol limpio y tu cambio ya commiteado; la restauración se hace desde el estado guardado, nunca
  desde el índice, y después compruebas que tu arreglo SIGUE AHÍ.
- `pnpm gate` completo. Si dentro del sandbox falla por `EPERM listen`,
  `bootstrap_check_in … Permission denied` o la caché de Go, **no pelees**: usa
  `GOCACHE=/private/tmp/vega-go-build-cache`, corre la suite focalizada, sigue y dilo. El gate del
  árbol combinado lo paso yo y es el que manda.
- **`pnpm lint`, no solo `pnpm check`.** `check` no ejecuta Prettier ni ESLint, y en este repo eso ha
  dejado el gate en rojo más de una vez.

## Cómo entregas

- Un solo commit sobre `e596154`, rama `feat/block-form-by-type` y su worktree.
  **Commitea pronto y ve enmendando.**
- **Ni merge, ni push, ni release, ni tag.** Integro yo.
- Mensajes de commit **en castellano**.
- **Enumera qué afirmaciones del repo deja falsas tu propio cambio**, con fichero y frase, aunque no
  puedas editarlas.
- **Último paso, después del commit**: informe en
  `/private/tmp/vega-informes/feat-block-form-by-type.md` con commits, pruebas, guardarraíles
  ejercidos, **omisiones**, decisiones no tomadas y documentación contradicha.
