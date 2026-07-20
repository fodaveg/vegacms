/**
 * Semilla fija de demo/e2e para el adaptador `memory` (consumida por `backend.ts`). Enriquecida
 * en Fase 2b (P3 §3.3, §4.1, §6) para poder testear la nav LITERAL de verdad: sin esto, la
 * sidebar solo se podía probar en su estado vacío. Escenario cubierto, determinista:
 *
 * - **`posts`**: tipo normal, grupo "Contenido", icono propio (`document`), orden 1. 32
 *   registros seed (`post_1`/`post_2` originales de 2b + `post_3`..`post_32` de 4c, ver
 *   `EXTRA_POST_RECORDS`): más de `DEFAULT_PER_PAGE` (30), a propósito, para poder ejercer la
 *   paginación real de P4/4c (Anterior/Siguiente, deep-link a `?page=2`) sin datos sintéticos
 *   ad-hoc en cada e2e. **Añadido en 4d**: un cuarto campo `tags` (`select` MÚLTIPLE, sin datos
 *   seed) forzado en `listFields` vía el manifiesto (`listFields: ['title','status','body','tags']`)
 *   — el ÚNICO campo NO escalar (`isScalarField` = false) del listado de `posts`, para poder
 *   ejercer en e2e que su cabecera NO pinta control de orden (D-P4.6) mientras `title`/`status`/
 *   `body` (todos escalares) sí lo hacen. `status` (16 `draft`/16 `published`, ver
 *   `EXTRA_POST_RECORDS`) y `title` (con exactamente UN registro, "Bienvenido a Vega", que
 *   contiene la palabra "Bienvenido") también sirven de fixture determinista para la búsqueda
 *   (D-P4.3) y el filtro de estado (D-P4.4) de la Fase 4d.
 * - **`pages`**: tipo `readonly` (view), MISMO grupo "Contenido", orden 2 — cubre la insignia
 *   "Solo lectura" de `NavItem` (§4.1). SIN registros (cambiado en 4c, antes tenía uno): así el
 *   listado de `pages` cae en el estado vacío-colección de P4 SIN la CTA "Crear" (§4c,
 *   `!contentType.readonly`) — es la forma más simple de que ese caso (readonly excluye la CTA)
 *   sea observable, porque la CTA solo existe en la rama vacía.
 * - **`authors`**: tipo normal AÑADIDO en 4c, MISMO grupo "Contenido", orden 3, icono `user`.
 *   SIN registros: cubre el estado vacío-colección CON la CTA "Crear" (contraste con `pages`,
 *   arriba). Un tipo nuevo en el manifiesto aparece en la sidebar (P2: todo tipo visible está en
 *   `nav`) — `e2e/nav.spec.ts` ya reflejaba el label nuevo antes de tocar este fichero.
 * - **`metrics`**: tipo normal AÑADIDO en el fix de code-review de 4c (L-P4.15), MISMO grupo
 *   "Contenido", orden 4, icono `list`. Sus dos únicos campos (`count` number, `active` bool) NO
 *   son `text`/`email`/`url` ⇒ la cascada de campo-título (P2 §4.4) se agota a `titleField: null`
 *   — el ÚNICO tipo de la semilla sin columna `isTitle` en su listado, para ejercer que
 *   `RecordTable` sigue abriendo la fila (fallback a la primera columna) incluso sin ella. Un
 *   registro seed (`metric_1`) para tener una fila real que abrir.
 * - **`site_info`**: `singleton: true`, SIN grupo (`group` ausente del manifiesto ⇒ grupo
 *   anónimo) y SIN icono propio ⇒ cubre a la vez "grupo anónimo primero" (§4.9) y la afordancia
 *   de singleton sin icono (icono `settings`, P2 §4.8). Sin registros seed a propósito: ejercita
 *   la resolución runtime "0 registros ⇒ modo creación" (§3.3) cuando algo navega a él (el
 *   índice, al ser el primer `NavItem` del primer grupo).
 * - **`vega`** (la colección reservada, vía `VEGA_COLLECTION` de P1): SIEMPRE oculta (P2-L7), y
 *   el registro de este seed lleva el manifiesto de arriba en su campo `manifest` — así
 *   `loadContentModel` (P2 §6.2) lo lee igual que en un proyecto real, en vez de construir el
 *   `ContentModel` a mano y dejar sin cubrir esa lectura.
 *
 * **Warning sembrado (Fase 3b, §3.5.1/L10)**: `posts.icon` declara `'rocket-unknown'`, que NO está
 * en el set de `knownIcons` (`icons/registry.ts`) → `resolveContentModel` emite exactamente UN
 * `ModelWarning` (`icon-unknown`, P2 §4.8: "se usa el icono genérico"), determinista, para poder
 * testear el badge de la sidebar y `WarningsList` en `/settings` sin recurrir a un manifiesto
 * inválido. Elegido A PROPÓSITO porque `resolve.ts` resuelve el icono desconocido a `null` (nunca
 * lo deja pasar tal cual), así que NO cambia el label/orden/grupo/href de "Entradas" en la sidebar
 * — solo su icono (de `document` a `generic`) — y por tanto no arriesga los e2e existentes que
 * localizan la nav por texto/rol, no por icono.
 *
 * **Comprobado en 4c** (antes de tocar `posts`/`pages`/añadir `authors`/`metrics`): ningún test de
 * `e2e/`/`tests/` fuera de `nav.spec.ts` asume el conteo de registros de `posts`/`pages` ni la
 * ausencia de `authors`/`metrics` — solo `nav.spec.ts` localiza la sidebar por su lista LITERAL de
 * labels, ya actualizada.
 *
 * Las credenciales están duplicadas (a propósito, sin importar este módulo) en `e2e/` porque
 * Playwright corre en un runtime Node aparte que no resuelve el alias `$lib`; mantenlas en
 * sincronía si cambian.
 *
 * **Añadido en F5-b (contrato P5)**: antes de esta fase, `posts` no cubría los widgets `datetime`/
 * `url`/`email`/`json`/`textarea` — ningún campo de la semilla los ejercitaba. Se añaden cuatro
 * campos sin datos seed (`publishedAt` date, `website` url, `contactEmail` email, `meta` json) y
 * un override de manifiesto (`fields.body.widget = 'textarea'`, el ÚNICO mecanismo de override de
 * schema v1, §4.3/L9) para que `e2e/form.spec.ts` pueda crear/editar un `posts` ejercitando los 10
 * widgets escalares dedicados de una vez. `tags` (select múltiple) gana `maxSelect: 2` para poder
 * probar la afordancia de `chips` que deshabilita las opciones no seleccionadas al llegar al
 * límite.
 *
 * **Añadido en F5-d (contrato P5)**: dos campos más, sin datos seed, para el editor TipTap real —
 * `summary` (`text`/`plain` con override `widget:'markdown'`, D-P5.8) y `content` (`type:'richtext'`,
 * widget `richtext` por defecto, D-P5.6/D-P5.7). `e2e/form.spec.ts` los ejercita creando/editando
 * un `posts` con ambos editores.
 *
 * **Añadido en F5-e (contrato P5)**: tres campos `relation` en `posts` (sin datos seed, ver su
 * comentario en `POSTS_CONTENT_TYPE` para el porqué de cada target) — `relatedPost` (single→`posts`,
 * búsqueda por título de verdad), `relatedPosts` (múltiple→`posts`, `maxSelect: 2`) y
 * `relatedMetric` (single→`metrics`, modo DEGRADADO: `metrics.titleField === null`, Audit Finding 3
 * del contrato P5). `e2e/form.spec.ts` ejercita los tres.
 *
 * **Añadido en F5-f (contrato P5)**: dos campos `file` en `posts` (sin datos seed, ver su
 * comentario en `POSTS_CONTENT_TYPE`) — `coverImage` (single, `mimeTypes:['image/*']`,
 * `maxSizeBytes: 1000`, cubre el rechazo cliente `tooLarge`/`invalidType`) y `attachments`
 * (múltiple, `maxSelect: 2`, sin restricción de mime, cubre el chip genérico y la afordancia de
 * límite). `e2e/form.spec.ts` ejercita ambos: subir, previsualizar, guardar, recargar y quitar.
 *
 * **Fix de code-review de F5-f**: un tercer campo `file`, `sourceFile` (single, `readonly` a
 * nivel de SCHEMA), con dato seed SOLO en `post_1` (`'seed_archive_notes.txt'`, extensión
 * NO-imagen a propósito — se pinta como chip, sin depender del `MemoryFileStore` real). Cubre que
 * el widget `file` en modo readonly nunca acepta edición, aunque ya tenga contenido que
 * previsualizar (mismo criterio que `authors.joinedAt` para `datetime`, F5-b).
 *
 * **Añadido en 4f (pulido del listado, contrato P4 §Fase 4f)**: `listFields` de `posts` gana tres
 * columnas más (`publishedAt`/`website`/`contactEmail`, ya existían sin datos seed desde F5-b) para
 * llegar a 7 — el ÚNICO tipo de la semilla con más de 5 columnas, a propósito para poder ejercer en
 * `e2e/list.spec.ts` (§ "responsive N columnas") que la tabla scrollea horizontal CONTENIDA dentro
 * de su propio wrapper (`overflow-x: auto`) en vez de desbordar la página.
 *
 * **Añadido en L7c (roadmap `mergedViews`)**: dos colecciones MÍNIMAS nuevas, `works`/`tracks`
 * (`WORKS_CONTENT_TYPE`/`TRACKS_CONTENT_TYPE` más abajo) — NO tocan ningún tipo/registro existente
 * (ningún test previo de `posts`/`pages`/`authors`/`metrics`/`site_info` depende de este cambio).
 * Cada una lleva un `title` (texto, campo-título) y un `order` (número): el campo NUMÉRICO de orden
 * manual que la vista fusionada de demo (`mergedViews.catalogo`, ver `DEMO_MANIFEST`) declara como
 * `orderField` POR DEFECTO de la vista, así ninguna de las dos sources necesita declarar el suyo
 * propio. Dos registros por colección, con `order` INTERCALADO a propósito (work_1=1, track_1=2,
 * work_2=3, track_2=4) — así el merge de L7b produce una lista que alterna colecciones en vez de
 * concatenarlas, la prueba más simple de que `mergeViewResults` fusiona de verdad (no solo
 * concatena) sin necesitar un test unitario nuevo aquí (eso ya lo cubre `merged-merge.test.ts`).
 * `works`/`tracks` son colecciones NORMALES y visibles (grupo "Contenido", orden 5/6): aparecen en
 * la sidebar como cualquier otra, ADEMÁS de alimentar la vista — necesario para que sus registros
 * sean editables por `/c/works/:id`/`/c/tracks/:id` (una colección `hidden` no lo sería,
 * `resolveVisibleContentType`), que es justo lo que `e2e/merged-view.spec.ts` ejercita al abrir una
 * fila. `e2e/nav.spec.ts` ya refleja los labels nuevos.
 */
import type { ContentType, JsonValue } from '$lib/backend/types';
import { VEGA_COLLECTION } from '$lib/backend/collections';
import type { MemorySeed } from '$lib/backend/adapters/memory';

export const DEMO_CREDENTIALS = { email: 'demo@vega.dev', password: 'vega-demo' };

// ————— Esquema (vocabulario Vega, §7 del contrato P1 — NO es un formato PB) —————

const VEGA_CONTENT_TYPE: ContentType = {
	name: VEGA_COLLECTION.name,
	readonly: false,
	fields: [
		{
			name: 'manifest',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// L6b: espejo del campo añadido a `VEGA_COLLECTION` (`backend/collections.ts`) — sin él,
		// `saveManifest` (que en modo superuser SIEMPRE escribe `schemaSnapshot` junto al
		// manifiesto) rechazaría con "campo desconocido" contra este seed estático de demo.
		{
			name: 'schemaSnapshot',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const POSTS_CONTENT_TYPE: ContentType = {
	name: 'posts',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false,
			maxLength: 120
		},
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'body',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// `select` MÚLTIPLE (ver cabecera del módulo): añadido en 4d como el único campo NO escalar
		// del listado de "posts", forzado a `listFields` vía el manifiesto para ejercer que su
		// cabecera de columna no ofrece orden (D-P4.6). Sin datos seed: ningún test necesita valores,
		// solo que la columna exista. `maxSelect: 2` (añadido en F5-b): para ejercer en e2e la
		// afordancia del widget `chips` que deshabilita las opciones no seleccionadas al alcanzar el
		// límite (ver cabecera de `widgets/Chips.svelte`).
		{
			name: 'tags',
			type: 'select',
			options: ['vega', 'demo', 'news'],
			multiple: true,
			maxSelect: 2,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Cuatro campos añadidos en F5-b (contrato P5, sustitución de los widgets escalares
		// placeholder): ninguno estaba cubierto por el seed hasta ahora. Sin datos seed (ningún test
		// existente los necesita) — solo para poder crear/editar un `posts` ejercitando `datetime`,
		// `url`, `email` y `json` de verdad en `e2e/form.spec.ts`.
		{
			name: 'publishedAt',
			type: 'date',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'website',
			type: 'url',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'contactEmail',
			type: 'email',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'meta',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Dos campos añadidos en F5-d (contrato P5, editor TipTap real): `summary` es un `text`/
		// `plain` promovido a widget `markdown` por override de manifiesto (§4.3/L9, el ÚNICO
		// mecanismo — ver `DEMO_MANIFEST` más abajo); `content` es un `type:'richtext'` de verdad
		// (widget `richtext` por defecto, sin override). Sin datos seed: ningún test existente los
		// necesita; sirven para que `e2e/form.spec.ts` ejercite ambos editores de verdad.
		{
			name: 'summary',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'content',
			type: 'richtext',
			subtype: 'html',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Tres campos `relation` añadidos en F5-e (contrato P5, widget `relation` real, L-P5.9): sin
		// datos seed (ningún test existente los necesita), para que `e2e/form.spec.ts` ejercite la
		// búsqueda por título, el degradado sin `titleField` (Audit Finding 3) y `maxSelect`.
		//
		// `relatedPost` (single, target `posts`): AUTO-relación deliberada — `posts` ya tiene
		// `titleField: 'title'` y de sobra registros de sobra (`post_1`.."Bienvenido a Vega" es el
		// ÚNICO con esa palabra, ver cabecera del módulo) para buscar/seleccionar de verdad. Se
		// prefiere sobre `authors` (que el contrato menciona como ejemplo) porque `authors` está a
		// propósito SIN registros (cubre el vacío-colección de 4c, ver más arriba) — apuntar ahí
		// dejaría el buscador sin NADA que encontrar.
		{
			name: 'relatedPost',
			type: 'relation',
			target: 'posts',
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// `relatedPosts` (múltiple, target `posts`, `maxSelect: 2`): mismo destino que arriba, para
		// ejercer la afordancia de F5-e que deshabilita los candidatos no seleccionados al alcanzar
		// el límite (mismo criterio que `chips`/`tags`) — buscando "Entrada" hay de sobra (30
		// registros `post_3`..`post_32`) para seleccionar 2 y ver un tercero deshabilitado en el
		// MISMO resultado de búsqueda.
		{
			name: 'relatedPosts',
			type: 'relation',
			target: 'posts',
			multiple: true,
			maxSelect: 2,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// `relatedMetric` (single, target `metrics`): `metrics` es el ÚNICO tipo de la semilla con
		// `titleField: null` (cascada de P2 agotada, ver cabecera del módulo) — el destino exacto
		// que ejercita el modo DEGRADADO (Audit Finding 3, sin buscador, listado paginado por id).
		// `metrics` tiene exactamente un registro (`metric_1`, ver más abajo): suficiente para
		// seleccionar de verdad sin arriesgar `list.spec.ts` (que localiza esa fila por su ÚNICO
		// enlace "(sin título)" — un segundo registro rompería ese `getByRole` en modo estricto).
		{
			name: 'relatedMetric',
			type: 'relation',
			target: 'metrics',
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Dos campos `file` añadidos en F5-f (contrato P5, widget `file` real, Audit Finding 4): sin
		// datos seed (ningún test existente los necesita), para que `e2e/form.spec.ts` ejercite
		// subida directa + drag&drop, preview, `maxSizeBytes`/`mimeTypes` (solo UX) y `maxSelect`.
		//
		// `coverImage` (single): restringido a `image/*` y un `maxSizeBytes` pequeño (1000 bytes) —
		// suficiente para disparar `tooLarge` con un fichero de prueba trivial en el e2e sin
		// depender de un fixture binario real de varios KB.
		{
			name: 'coverImage',
			type: 'file',
			multiple: false,
			maxSizeBytes: 1000,
			mimeTypes: ['image/*'],
			protected: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// `attachments` (múltiple, `maxSelect: 2`, sin restricción de mime): mismo criterio que
		// `tags`/`relatedPosts` (afordancia de límite alcanzado) y el destino para ejercer el chip
		// genérico (no-imagen) del widget, sin las restricciones de `coverImage`.
		{
			name: 'attachments',
			type: 'file',
			multiple: true,
			maxSelect: 2,
			protected: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// `sourceFile` (fix de code-review de F5-f): campo `file` `readonly` a nivel de SCHEMA —
		// mismo criterio que `authors.joinedAt` (widgets escalares, F5-b) pero para `file`: cubre
		// que el widget NUNCA acepta edición (ni diálogo, ni drop, ni "Quitar") aunque el registro
		// YA tenga un fichero (su preview SÍ se ve). Un campo readonly nunca puede recibir un
		// `File` por el formulario (el adaptador ignora `data[field.name]` para campos readonly,
		// `defaultReadonlyValue`), así que su ÚNICO valor posible viene sembrado aquí, en
		// `post_1` — con una extensión NO-imagen a propósito: se pinta como chip (nombre/tipo,
		// nunca `<img>`), así que no necesita una entrada real en el `MemoryFileStore` (el chip
		// solo pinta la `FileRef` tal cual, sin llamar a `ctx.port.fileUrl`).
		{
			name: 'sourceFile',
			type: 'file',
			multiple: false,
			protected: false,
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const PAGES_CONTENT_TYPE: ContentType = {
	name: 'pages',
	readonly: true, // view: cubre la insignia "Solo lectura" de NavItem (§4.1)
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

/** Añadido en 4c: tipo normal, SIN registros — cubre el estado vacío-colección CON CTA "Crear"
 *  (ver cabecera del módulo, contraste con `pages`, que cubre el caso SIN CTA).
 *
 *  `joinedAt` (F5-b): campo `readonly` a nivel de SCHEMA (autodate, `field.schema.readonly`, no
 *  `contentType.readonly` como `pages`) — el ÚNICO de la semilla. Reutiliza el tipo `date` (widget
 *  `datetime`) para cubrir a la vez "un widget dedicado en modo readonly nunca acepta edición" sin
 *  añadir un campo solo para eso. */
const AUTHORS_CONTENT_TYPE: ContentType = {
	name: 'authors',
	readonly: false,
	fields: [
		{
			name: 'name',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false,
			maxLength: 120
		},
		{
			name: 'joinedAt',
			type: 'date',
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** Añadido en el fix de code-review de 4c (L-P4.15, ver cabecera del módulo): tipo SIN campo
 *  título resoluble (cero campos `text`/`email`/`url`). */
const METRICS_CONTENT_TYPE: ContentType = {
	name: 'metrics',
	readonly: false,
	fields: [
		{
			name: 'count',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'active',
			type: 'bool',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** Añadido en L7c (ver cabecera del módulo): fuente 1/2 de `mergedViews.catalogo`. `order` es el
 *  campo NUMÉRICO de orden manual (§ mergedViews) — la vista lo declara como `orderField` por
 *  defecto, así esta source no necesita el suyo propio. */
const WORKS_CONTENT_TYPE: ContentType = {
	name: 'works',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false,
			maxLength: 120
		},
		{
			name: 'order',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** Añadido en L7c (ver cabecera del módulo): fuente 2/2 de `mergedViews.catalogo` — MISMA forma
 *  que `works` (mismo `order` numérico, mismo `orderField` heredado de la vista); solo el nombre y
 *  los registros cambian, para que el merge intercale filas de las DOS colecciones por `order`. */
const TRACKS_CONTENT_TYPE: ContentType = {
	name: 'tracks',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false,
			maxLength: 120
		},
		{
			name: 'order',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

const SITE_INFO_CONTENT_TYPE: ContentType = {
	name: 'site_info',
	readonly: false,
	fields: [
		{
			name: 'tagline',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

// ————— Manifiesto (§6 del contrato P2), leído por `loadContentModel` desde el registro `vega` —————

const DEMO_MANIFEST: JsonValue = {
	schemaVersion: 1,
	site: { name: 'Vega Demo', locale: 'es' },
	nav: { groups: ['Contenido'] },
	collections: {
		posts: {
			label: 'Entradas',
			labelSingular: 'Entrada',
			// Icono deliberadamente fuera de `knownIcons` (ver cabecera): siembra el warning
			// `icon-unknown` para poder testear el badge/lista de L10 de forma determinista.
			icon: 'rocket-unknown',
			group: 'Contenido',
			order: 1,
			// `tags` (select múltiple) NO es `listable` por defecto (§4.10): forzado aquí para tener,
			// en la Fase 4d, una columna NO escalar de verdad que ejercer contra la cabecera SIN
			// control de orden (ver cabecera del módulo). `publishedAt`/`website`/`contactEmail`
			// (Fase 4f, pulido P4): tres columnas MÁS forzadas para superar las 5 por defecto de
			// §4.10 — el ÚNICO manifiesto de la semilla con más de 5 columnas, para poder ejercer en
			// e2e (`e2e/list.spec.ts`, "responsive N columnas") que la tabla scrollea horizontal
			// CONTENIDA dentro de su propio wrapper en vez de desbordar la página. Los tres campos ya
			// existían sin datos seed (F5-b); ningún test previo dependía de que quedaran fuera de
			// `listFields`.
			listFields: ['title', 'status', 'body', 'tags', 'publishedAt', 'website', 'contactEmail'],
			// Override de widget (F5-b/F5-d, §4.3/L9 — el ÚNICO mecanismo de override de schema v1):
			// `body` pinta `textarea`; `summary` (mismo `type:'text', subtype:'plain'`) pinta
			// `markdown` — el editor TipTap con `contentType:'markdown'` (D-P5.8).
			fields: {
				body: { widget: 'textarea' },
				summary: { widget: 'markdown' }
			}
		},
		pages: {
			label: 'Páginas',
			labelSingular: 'Página',
			icon: 'document',
			group: 'Contenido',
			order: 2
		},
		authors: {
			label: 'Autores',
			labelSingular: 'Autor',
			icon: 'user',
			group: 'Contenido',
			order: 3
		},
		metrics: {
			label: 'Métricas',
			labelSingular: 'Métrica',
			icon: 'list',
			group: 'Contenido',
			order: 4
		},
		// Añadidas en L7c (ver cabecera del módulo): fuentes de `mergedViews.catalogo` más abajo,
		// también colecciones normales por derecho propio (mismo grupo "Contenido", orden 5/6).
		works: {
			label: 'Obras',
			labelSingular: 'Obra',
			group: 'Contenido',
			order: 5
		},
		tracks: {
			label: 'Pistas',
			labelSingular: 'Pista',
			group: 'Contenido',
			order: 6
		},
		// Sin `group` (⇒ grupo anónimo, siempre primero, §4.9) ni `icon` (⇒ afordancia de
		// singleton sin icono propio, P2 §4.8).
		site_info: {
			label: 'Información del sitio',
			singleton: true
		}
	},
	// Añadido en L7c (roadmap `mergedViews`, P2 §mergedViews): vista fusionada de demo que mezcla
	// `works`/`tracks` — fixture de `e2e/merged-view.spec.ts` (nav → tabla con filas de las dos
	// colecciones intercaladas por `order` → abrir una fila en su editor real). MISMO grupo/orden
	// que las colecciones normales (orden 7, justo tras "Pistas"): `nav` (L7c) las pliega todas con
	// el mismo `orderByGroups`. Sin `label`/`icon` overrides en las sources (confía en los defaults
	// de L7a: `titleField`/`label` resueltos de cada tipo) — cubre el camino sin overrides, ya
	// testeado como función pura en `tests/model/resolve.test.ts` §12.
	mergedViews: {
		catalogo: {
			label: 'Catálogo',
			icon: 'list',
			group: 'Contenido',
			order: 7,
			orderField: 'order',
			sources: [{ collection: 'works' }, { collection: 'tracks' }]
		}
	}
};

/** Ver cabecera del módulo: 30 entradas más allá de `post_1`/`post_2`, para que `posts` supere
 *  `DEFAULT_PER_PAGE` (30) y la paginación de 4c tenga una segunda página real que ejercer. Ids
 *  deterministas `post_3`..`post_32`, sin `body` (ningún test lo necesita), estado alternado. */
const EXTRA_POST_RECORDS = Array.from({ length: 30 }, (_, i) => {
	const n = i + 3;
	return {
		id: `post_${n}`,
		values: {
			title: `Entrada ${n}`,
			status: n % 2 === 0 ? 'published' : 'draft',
			body: ''
		}
	};
});

export const DEMO_SEED: MemorySeed = {
	users: [DEMO_CREDENTIALS],
	contentTypes: [
		VEGA_CONTENT_TYPE,
		POSTS_CONTENT_TYPE,
		PAGES_CONTENT_TYPE,
		AUTHORS_CONTENT_TYPE,
		METRICS_CONTENT_TYPE,
		WORKS_CONTENT_TYPE,
		TRACKS_CONTENT_TYPE,
		SITE_INFO_CONTENT_TYPE
	],
	records: {
		[VEGA_COLLECTION.name]: [{ id: 'vega_manifest', values: { manifest: DEMO_MANIFEST } }],
		posts: [
			{
				id: 'post_1',
				values: {
					title: 'Bienvenido a Vega',
					status: 'published',
					body: 'Primer texto de ejemplo.',
					// F5-d: `summary` (markdown) con encabezado+negrita para comprobar que el widget
					// `markdown` parsea MD crudo de verdad al montar (no lo trata como texto plano).
					summary: '# Resumen\n\nAlgo de **texto**.',
					// F5-d: `content` (richtext) con un `<script>` incrustado A PROPÓSITO — fixture
					// determinista de L-P5.8 (`e2e/form.spec.ts`, "richtext saneado al leer"): el
					// widget debe sanear ESTE HTML al montarlo en el editor (D-P5.6), nunca ejecutarlo
					// ni mostrarlo tal cual, incluso viniendo ya guardado con contenido hostil.
					content: '<p>Hola <strong>mundo</strong></p><script>window.__vegaXssRan = true;</script>',
					// Fix de code-review de F5-f: valor sembrado de un `file` `readonly` (ver su
					// comentario en `POSTS_CONTENT_TYPE`) — extensión NO-imagen a propósito, así el
					// widget lo pinta como chip sin necesitar una entrada real en el `MemoryFileStore`.
					sourceFile: 'seed_archive_notes.txt'
				}
			},
			{ id: 'post_2', values: { title: 'Borrador en curso', status: 'draft', body: '' } },
			...EXTRA_POST_RECORDS
		],
		// SIN registros (ver cabecera, cambiado en 4c): cubre el vacío-colección SIN CTA "Crear"
		// (readonly).
		pages: [],
		metrics: [{ id: 'metric_1', values: { count: 42, active: true } }],
		// Añadidos en L7c (ver cabecera del módulo): `order` INTERCALADO a propósito entre las dos
		// colecciones (work_1=1, track_1=2, work_2=3, track_2=4) — el merge de `mergedViews.catalogo`
		// debe alternar `works`/`tracks`, nunca concatenar una colección entera antes que la otra.
		works: [
			{ id: 'work_1', values: { title: 'Sinfonía nº1', order: 1 } },
			{ id: 'work_2', values: { title: 'Concierto en Re', order: 3 } }
		],
		tracks: [
			{ id: 'track_1', values: { title: 'Pista A', order: 2 } },
			{ id: 'track_2', values: { title: 'Pista B', order: 4 } }
		]
		// authors/site_info sin registros a propósito (ver cabecera): authors cubre el
		// vacío-colección CON CTA; site_info ejercita el modo creación (0 → new, §3.3).
	}
};

// ————— Semilla de `vega_media` (Fase P6·6b, SOLO para `e2e/media.spec.ts`) —————
//
// Deliberadamente NO forma parte de `DEMO_SEED` (ver la cabecera de `e2e/media.spec.ts` de la
// Fase 6a: la ausencia de `vega_media` en `DEMO_SEED` es justo lo que fuerza el estado
// `'creatable'` que esa suite ejercita) — mezclarla ahí rompería esos tests. En vez de eso,
// `DEMO_SEED_WITH_MEDIA` es una copia AUMENTADA de `DEMO_SEED` que solo activa el gancho de e2e
// `window.__VEGA_SEED_MEDIA__` (ver `session/backend.ts`), consumida por `loginAsDemo(page,
// { seedMedia: true })` (`e2e/fixtures.ts`).
//
// Forma del `ContentType`: réplica manual (mismo criterio que el resto de este fichero, ninguno
// de los tipos de la semilla se deriva programáticamente de otro sitio) de lo que produce
// `ensureMediaCollection`/`VEGA_MEDIA_COLLECTION` (`$lib/media/media-collection.ts`) al compilar
// su `CollectionSpec` a `Field` — así el escenario "colección YA creada, con datos" es
// indistinguible en forma de un `ensureCollections` real.
const VEGA_MEDIA_CONTENT_TYPE: ContentType = {
	name: 'vega_media',
	readonly: false,
	fields: [
		{
			name: 'file',
			type: 'file',
			multiple: false,
			protected: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false,
			// Constraints REALES de `VEGA_MEDIA_COLLECTION` (Fase P6·6c, D-P6.3): la semilla replica el
			// esquema que produciría `ensureMediaCollection` de verdad, para que la zona de subida de
			// `e2e/media.spec.ts` pre-valide contra el MISMO esquema descubierto que vería un backend
			// real (nunca una constante propia de la semilla, distinta de la que compila
			// `media-collection.ts`).
			maxSizeBytes: 10 * 1024 * 1024,
			mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
		},
		{
			name: 'alt',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'tags',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// autodate (D-P6.1/P6 §9): readonly, nunca required — mismo criterio que `joinedAt`/
		// `sourceFile` (F5-b/F5-f), el ÚNICO valor posible viene sembrado a mano más abajo.
		{
			name: 'created',
			type: 'date',
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** PNG de 1×1 transparente (el fixture de imagen MÁS PEQUEÑO posible): el contenido no importa
 *  para 6b (solo se comprueba que degrada a `<img>`, nunca el píxel en sí), así que el mismo
 *  data-URI sirve para los dos assets de imagen de la semilla — lo que los distingue es la
 *  `FileRef` (nombre) de cada uno, no el contenido. */
const TINY_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** Tres registros, `created` deliberadamente escalonado (más antiguo→más reciente) para que el
 *  grid de 6b (ordenado `created` desc) tenga un orden determinista que comprobar en e2e:
 * - `media_1` (más antiguo): un PDF — `FileRef` SIN entrada en `files` de abajo (nunca se
 *   clasifica como imagen, así que el grid nunca llama a `fileUrl` para él, mismo criterio que
 *   `posts.sourceFile` de F5-f) — cubre el icono por-tipo (no-imagen).
 * - `media_2` (medio): una imagen CON metadatos ya rellenos — cubre editar unos valores
 *   EXISTENTES en `MediaDetail` (no crearlos desde vacío).
 * - `media_3` (más reciente): una imagen SIN `alt`/`title`/`tags` — cubre el fallback de nombre
 *   (`mediaDisplayName`/`mediaImgAlt`, `$lib/media/media-item.ts`) y rellenar metadatos desde
 *   cero.
 */
const MEDIA_SEED_RECORDS = [
	{
		id: 'media_1',
		values: {
			file: 'seed_media_manual.pdf',
			alt: '',
			title: 'Manual de usuario',
			tags: ['manual', 'pdf'],
			created: '2024-01-01T00:00:00.000Z'
		}
	},
	{
		id: 'media_2',
		values: {
			file: 'seed_media_photo1.png',
			alt: 'Atardecer en la playa',
			title: 'Foto de portada',
			tags: ['foto', 'playa'],
			created: '2024-01-02T00:00:00.000Z'
		}
	},
	{
		id: 'media_3',
		values: {
			file: 'seed_media_photo2.png',
			alt: '',
			title: '',
			tags: [],
			created: '2024-01-03T00:00:00.000Z'
		}
	}
];

export const DEMO_SEED_WITH_MEDIA: MemorySeed = {
	...DEMO_SEED,
	contentTypes: [...DEMO_SEED.contentTypes, VEGA_MEDIA_CONTENT_TYPE],
	records: { ...DEMO_SEED.records, vega_media: MEDIA_SEED_RECORDS },
	files: {
		'seed_media_photo1.png': {
			name: 'seed_media_photo1.png',
			mime: 'image/png',
			dataUri: `data:image/png;base64,${TINY_PNG_BASE64}`
		},
		'seed_media_photo2.png': {
			name: 'seed_media_photo2.png',
			mime: 'image/png',
			dataUri: `data:image/png;base64,${TINY_PNG_BASE64}`
		}
	}
};
