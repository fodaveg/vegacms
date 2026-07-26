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
 *
 * **Añadida en el lote "aquelarre enriquecido" (M1, escaparate de la vista de LISTA)**: `blog`
 * (`BLOG_CONTENT_TYPE` más abajo), MISMO grupo "Contenido", orden 8 (tras "Catálogo") — colección
 * NUEVA a propósito (David, decisión (b): el escaparate del rediseño es una colección de demo, no
 * un préstamo de `posts`, que está clavada por sus propios e2e y no se toca). Cinco campos:
 * `title`/`slug`/`author` (texto), `status` (select `draft`/`published`/`scheduled` — tres
 * opciones, no solo las dos de la convención §4.5: la convención de publicación solo exige que
 * `draft`+`published` estén presentes, así que `status` se resuelve por nombre sin declarar nada
 * en el manifiesto, y `scheduled` cae en la insignia "other" de `classifyStatusBadge`, cell.ts)
 * y `updatedAt` (`date`). `listFields` CURADO a 4 (`title`/`status`/`author`/`updatedAt`): `slug`
 * queda FUERA de las columnas a propósito, es el campo que `subtitleField` (P2, ver
 * `DEMO_MANIFEST.collections.blog`) pinta como línea secundaria bajo el título — la razón de ser
 * de esta colección es ejercer esa capacidad nueva contra datos reales, cosa que `posts` no
 * ejercita (no declara `subtitleField`, su render no cambia). 12 registros seed, títulos/slugs
 * calcados del mockup aprobado (`aquelarre-dark.html`) más relleno propio hasta 12: mezcla de los
 * tres estados, dos autoras/es (`David`/`Marta`) y fechas de `updatedAt` que van de "hace horas" a
 * "hace semanas" (varias antes y después de la fecha de esta sesión, sin que el orden temporal
 * importe — nada en P4 ordena por defecto). `blog_6` ("Sin título") deja `slug`/`author` VACÍOS a
 * propósito (`''`, nunca `undefined`): el mismo caso límite que `describeCell` ya resuelve a
 * `{kind:'empty'}` para cualquier campo — ejercita que la línea de subtítulo simplemente NO se
 * pinta cuando el valor está vacío, sin inventar un placeholder.
 *
 * **Fase 2 del rediseño (M4)**: `DEMO_MANIFEST.collections.blog.statusLabels` localiza los tres
 * valores crudos de `status` (`draft`/`published`/`scheduled`) a las etiquetas del mockup
 * aprobado (`Borrador`/`Publicado`/`Programado`) — capacidad opt-in de P2
 * (`ResolvedContentType.statusLabels`, `RecordTable.svelte`). `posts` NO la declara: su insignia
 * sigue mostrando el valor crudo. Las fechas `updatedAt` de arriba, además de servir a M3, son
 * ahora el fixture de M5 (fechas relativas, `cell.ts`): la más reciente (`blog_1`, "hace horas"
 * relativo a esta sesión) cae en el formato `Intl.RelativeTimeFormat`, las más antiguas (más de
 * una semana) en el absoluto de siempre — sin necesidad de tocar los registros, el umbral es
 * puramente temporal.
 *
 * **Añadido en el lote "match 1:1 con el mockup" (Ola 2, decisión de David B-B)**: `SHOWCASE_SEED`
 * (al final del módulo) es una semilla NUEVA e INDEPENDIENTE de `DEMO_SEED` — mismo criterio que
 * `DEMO_SEED_WITH_MEDIA` (una copia detrás de un flag, nunca una mutación de la semilla de
 * e2e) — cuya sidebar reproduce 1:1 la del mockup aprobado (`aquelarre-dark.html`): grupos
 * "Contenido" (Entradas/Páginas/Proyectos) y "Estructura" (Autores/Etiquetas), más "Medios"
 * (reutiliza `VEGA_MEDIA_CONTENT_TYPE` de más abajo, con biblioteca propia). `DEMO_SEED` queda
 * INTACTO: `list/form/merged-view.spec` navegan por URL a `metrics`/`works`/`tracks`, que no caben
 * en una sidebar "solo lo del mockup" sin volverse `hidden` y romper esos specs. Activación vía
 * `session/backend.ts` (`__VEGA_SEED_SHOWCASE__`/`localStorage['vega.showcase.v1']`, ver su
 * cabecera) — nunca se activa por defecto ni en e2e.
 *
 * **Ampliado con el mockup del EDITOR (`aquelarre-detalle-post.html`)**: `entradas` deja de ser una
 * colección de cuatro campos pensada solo para la LISTA y pasa a modelar una entrada de blog
 * completa (extracto, cuerpo richtext, portada, fecha de publicación y los dos autodates), con las
 * capacidades de editor del mockup declaradas en `SHOWCASE_MANIFEST` (`slugField`, `editorRail`,
 * `fieldGroups` con `placement: 'aside'`). Sigue siendo una ampliación SOLO del escaparate:
 * `DEMO_SEED`/`posts` no declara ninguna de esas capacidades, así que su editor no cambia ni un
 * nodo del DOM (los e2e siguen midiendo lo mismo).
 *
 * **Biblioteca de medios del escaparate con bitmaps REALES**: desde que las tarjetas de `/media`
 * miden dimensiones y peso del fichero, el fixture de 1×1 dejaba el escaparate anunciando
 * «1×1 · 70 B». `SHOWCASE_SEED` pasa a tener sus PROPIOS ocho assets, cuatro de ellos con un
 * bitmap generado con `<canvas>` en tiempo de siembra (ver `renderShowcaseBitmap`) — medidas
 * exactas, cero peso en el bundle. `DEMO_SEED`/`DEMO_SEED_WITH_MEDIA` conservan el PNG de 1×1.
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

/** Añadidas en `#lote-shell` (reglas de acceso reflejadas en la UI): las DOS colecciones de la
 *  semilla que declaran `access` (el resto lo deja `undefined` ⇒ todo permitido, comportamiento
 *  previo INTACTO). El adaptador `memory` no tiene reglas propias, así que lo que se declara aquí
 *  es exactamente lo que la UI debe reflejar — con `capabilities.accessBypass: false`.
 *
 * - **`avisos`**: se LISTA y se VE, pero las tres escrituras están vedadas. Ejercita "sin botón
 *   Nueva", "sin acción Borrar en la fila" y "editor bloqueado con la nota de permiso" — todo ello
 *   SIN ser una colección `readonly` (que es otra cosa, y ya la cubre `pages`).
 * - **`privado`**: ni siquiera se puede listar. No aparece en la navegación y su ruta `/c/privado`
 *   pinta el estado "sin permiso" en vez de morir en un 403 sin explicación. */
const AVISOS_CONTENT_TYPE: ContentType = {
	name: 'avisos',
	readonly: false,
	access: {
		list: 'allowed',
		view: 'allowed',
		create: 'denied',
		update: 'denied',
		delete: 'denied'
	},
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

const PRIVADO_CONTENT_TYPE: ContentType = {
	name: 'privado',
	readonly: false,
	access: { list: 'denied', view: 'denied', create: 'denied', update: 'denied', delete: 'denied' },
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

/** Añadida en M1 (ver cabecera del módulo): colección de demo del escaparate de la vista de
 *  LISTA. `slug` es el campo que `DEMO_MANIFEST.collections.blog.subtitleField` (P2) proyecta
 *  como línea secundaria bajo el título — fuera de `listFields`, no es una columna. */
const BLOG_CONTENT_TYPE: ContentType = {
	name: 'blog',
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
			name: 'slug',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Tres opciones (no solo `draft`/`published`, ver cabecera del módulo): la convención de
		// publicación (§4.5) solo exige que esas dos estén presentes, así que `scheduled` convive
		// sin declarar nada en el manifiesto y cae en la insignia "other" (`classifyStatusBadge`).
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published', 'scheduled'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'author',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'updatedAt',
			type: 'date',
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

// `defaultSort` (Ola 2, capacidad nueva de `ResolvedContentType`): NINGUNA colección de aquí lo
// declara — mismo criterio opt-in que `orderField`/`subtitleField` (ausencia de la clave = `null`,
// nunca se escribe un `defaultSort: null` explícito: a diferencia de `statusLabels`, el schema del
// manifiesto (`manifest-schema.json`) exige que la clave, SI está presente, sea un objeto `{
// field, dir }` — un `null` literal fallaría `validateDefaultSort`/produciría
// `manifest-invalid-key`, así que "sin orden por defecto" se expresa omitiendo la clave, igual que
// el resto de este manifiesto ya hacía). Solo `SHOWCASE_SEED.entradas` (al final del módulo) la
// declara.
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
		// `#lote-shell` (ver `AVISOS_CONTENT_TYPE`): `avisos` se pinta en nav como una colección
		// normal —la restricción se nota en las ACCIONES, no en el enlace—; `privado` declara su
		// label igual, pero nunca llega a nav porque no se puede listar.
		avisos: {
			label: 'Avisos',
			labelSingular: 'Aviso',
			icon: 'document',
			group: 'Contenido',
			order: 9
		},
		privado: {
			label: 'Privado',
			labelSingular: 'Privado',
			group: 'Contenido',
			order: 10
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
		// Añadida en M1 (ver cabecera del módulo): escaparate de la vista de LISTA. Orden 8 (tras
		// "Catálogo", order 7 más abajo en `mergedViews`) — comparten el mismo espacio de orden de
		// nav (`buildNav` pliega colecciones y vistas en una sola pasada, L7c).
		blog: {
			label: 'Blog',
			labelSingular: 'Entrada de blog',
			icon: 'document',
			group: 'Contenido',
			order: 8,
			listFields: ['title', 'status', 'author', 'updatedAt'],
			// Añadido en M3 (P2, `ResolvedContentType.subtitleField`): `slug` pinta como línea
			// secundaria bajo el título (mockup `.cell-title .slug`), FUERA de `listFields` — no es
			// una columna. `posts` NO declara esta clave: su render no cambia (opt-in, ley
			// genérica).
			subtitleField: 'slug',
			// Añadido en M4 (P2, `ResolvedContentType.statusLabels`, mockup `.status`): localiza
			// los tres valores crudos del `select` de `blog.status` (ver `BLOG_CONTENT_TYPE`) a las
			// etiquetas del mockup aprobado. `posts` NO declara esta clave: su insignia sigue
			// pintando el valor crudo (`draft`/`published`), opt-in igual que `subtitleField`.
			statusLabels: {
				draft: 'Borrador',
				published: 'Publicado',
				scheduled: 'Programado'
			}
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
		AVISOS_CONTENT_TYPE,
		PRIVADO_CONTENT_TYPE,
		WORKS_CONTENT_TYPE,
		TRACKS_CONTENT_TYPE,
		BLOG_CONTENT_TYPE,
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
		// `#lote-shell`: un registro en cada colección con reglas, para que el editor de una
		// colección "solo lectura por regla" sea alcanzable de verdad en los e2e.
		avisos: [{ id: 'aviso_1', values: { title: 'Aviso que no se puede editar' } }],
		privado: [{ id: 'privado_1', values: { title: 'Contenido reservado' } }],
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
		],
		// Añadidos en M1 (ver cabecera del módulo): 12 registros, títulos/slugs calcados del
		// mockup aprobado más relleno propio. `blog_6` deja `slug`/`author` vacíos a propósito
		// (caso límite: la línea de subtítulo de M3 no se pinta con un valor vacío).
		blog: [
			{
				id: 'blog_1',
				values: {
					title: 'Migrar el blog de Hugo a Astro sin romper las URLs',
					slug: 'migrar-blog-hugo-astro-sin-romper-urls',
					status: 'published',
					author: 'David',
					updatedAt: '2026-07-23T10:00:00.000Z'
				}
			},
			{
				id: 'blog_2',
				values: {
					title:
						'Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega',
					slug: 'temas-claro-oscuro-vocabulario-tokens-motor-paletas',
					status: 'draft',
					author: 'David',
					updatedAt: '2026-07-23T08:00:00.000Z'
				}
			},
			{
				id: 'blog_3',
				values: {
					title: 'PocketBase como backend de un CMS editor-first',
					slug: 'pocketbase-backend-cms-editor-first',
					status: 'published',
					author: 'David',
					updatedAt: '2026-07-18T09:00:00.000Z'
				}
			},
			{
				id: 'blog_4',
				values: {
					title: 'Notas del huerto: julio',
					slug: 'notas-del-huerto-julio',
					status: 'scheduled',
					author: 'Marta',
					updatedAt: '2026-07-15T07:30:00.000Z'
				}
			},
			{
				id: 'blog_5',
				values: {
					title: 'Passkeys en un backend Go: TOTP, WebAuthn y tres factores',
					slug: 'passkeys-backend-go-totp-webauthn',
					status: 'published',
					author: 'David',
					updatedAt: '2026-07-11T12:00:00.000Z'
				}
			},
			{
				id: 'blog_6',
				values: {
					title: 'Sin título',
					slug: '',
					status: 'draft',
					author: '',
					updatedAt: '2026-07-02T16:00:00.000Z'
				}
			},
			{
				id: 'blog_7',
				values: {
					title: 'Reseña: teclados de perfil bajo para escribir mucho',
					slug: 'resena-teclados-perfil-bajo',
					status: 'published',
					author: 'Marta',
					updatedAt: '2026-06-28T11:00:00.000Z'
				}
			},
			{
				id: 'blog_8',
				values: {
					title: 'Autoalojar sin dolor: mi checklist de higiene de servidor',
					slug: 'autoalojar-checklist-higiene-servidor',
					status: 'published',
					author: 'David',
					updatedAt: '2026-06-20T09:00:00.000Z'
				}
			},
			{
				id: 'blog_9',
				values: {
					title: 'Por qué elegimos Svelte 5 runes para el admin',
					slug: 'por-que-svelte-5-runes-admin',
					status: 'draft',
					author: 'David',
					updatedAt: '2026-06-14T15:00:00.000Z'
				}
			},
			{
				id: 'blog_10',
				values: {
					title: 'Accesibilidad AA de verdad: contraste medido, no adivinado',
					slug: 'accesibilidad-aa-contraste-medido',
					status: 'published',
					author: 'Marta',
					updatedAt: '2026-06-05T10:00:00.000Z'
				}
			},
			{
				id: 'blog_11',
				values: {
					title: 'Backups 3-2-1 para un self-host de un solo servidor',
					slug: 'backups-3-2-1-selfhost',
					status: 'scheduled',
					author: 'David',
					updatedAt: '2026-08-01T09:00:00.000Z'
				}
			},
			{
				id: 'blog_12',
				values: {
					title: 'Diario de un rediseño: del wireframe al pixel',
					slug: 'diario-rediseno-wireframe-pixel',
					status: 'draft',
					author: 'Marta',
					updatedAt: '2026-05-30T18:00:00.000Z'
				}
			}
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

// ————— `SHOWCASE_SEED` (Ola 2, "match 1:1 con el mockup" — ver cabecera del módulo) —————
//
// Semilla INDEPENDIENTE de `DEMO_SEED` (nunca se deriva de ella): reproduce la sidebar exacta del
// mockup aprobado (`aquelarre-dark.html`) — dos grupos de nav ("Contenido"/"Estructura") con las
// cinco colecciones del mockup, más "Medios" (fijo en `Sidebar.svelte`, alimentado aquí por
// `VEGA_MEDIA_CONTENT_TYPE`/`MEDIA_SEED_RECORDS`, ya definidos arriba) y "Ajustes" (fijo, no
// depende de ninguna colección de esta semilla). Solo tras el flag de `session/backend.ts`
// (`__VEGA_SEED_SHOWCASE__`/`vega.showcase.v1`) — nunca en `DEMO_SEED`/e2e.

/**
 * `entradas` (mockup: título de página "Entradas", primera de "Contenido"). Arrancó como copia de
 * `BLOG_CONTENT_TYPE` (título/slug/estado en tres valores/autor/fecha) para la vista de LISTA; el
 * mockup del EDITOR (`aquelarre-detalle-post.html`) pide además el cuerpo de la entrada, y de ahí
 * los campos nuevos:
 * - `excerpt` (texto, `widget: 'textarea'` por manifiesto) y `content` (richtext): el documento en
 *   sí — sin ellos el editor del escaparate se quedaba en cuatro controles sueltos.
 * - `cover` (file, imagen): alimenta la tarjeta "Portada" del aside. Se siembra VACÍO a propósito
 *   (el mockup enseña justo el estado vacío, "Elegir de Medios").
 * - `publishedAt` (date): la "Fecha de publicación" del aside, distinta de los autodates.
 * - `created`/`updated` (date READONLY): los dos autodates que PocketBase hornea en toda colección
 *   — alimentan la tarjeta "Registro" del aside (`record-meta.ts` exige `date` + `readonly`, no el
 *   nombre a secas) y la hora de "último guardado" de la barra. `updated` SUSTITUYE al antiguo
 *   `updatedAt` de esta semilla: era el mismo dato con otro nombre y sin la marca de autodate, así
 *   que duplicarlos habría dejado dos columnas "Actualizado" que dicen lo mismo. Sigue siendo la
 *   columna de `listFields` y el campo de `defaultSort` (el listado arranca "Actualizado ↓", como
 *   el mockup), solo que ahora además es honesto sobre quién lo escribe.
 *
 * `slug` hace doble papel: `subtitleField` (línea secundaria bajo el título en la lista) y
 * `slugField` (fila mono + botón "Regenerar" en el editor).
 */
const ENTRADAS_CONTENT_TYPE: ContentType = {
	name: 'entradas',
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
			name: 'slug',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'excerpt',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false,
			maxLength: 200
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
		{
			name: 'cover',
			type: 'file',
			multiple: false,
			mimeTypes: ['image/*'],
			protected: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published', 'scheduled'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
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
			name: 'author',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		// Los dos autodates (ver cabecera): `readonly` como los hornea PocketBase.
		{
			name: 'created',
			type: 'date',
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'updated',
			type: 'date',
			required: false,
			readonly: true,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** `paginas` (mockup: icono `document`): a diferencia de `pages` de `DEMO_SEED` (SIN registros a
 *  propósito, cubre el vacío-colección), esta lleva registros — la sidebar del mockup no necesita
 *  ese caso límite, y una colección de escaparate sin filas se ve vacía de más. NO es `readonly`:
 *  el mockup NO pinta la insignia "Solo lectura" en Páginas, y ese badge truncaba el label a
 *  «Págin…» (match 1:1). */
const PAGINAS_CONTENT_TYPE: ContentType = {
	name: 'paginas',
	readonly: false,
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

/** `proyectos` (mockup: icono `box`, añadido por la Ola 1 al registro de iconos). Título solo,
 *  igual que `paginas` — el mockup solo pinta su fila de nav, ninguna vista de lista curada la
 *  ejercita todavía. */
const PROYECTOS_CONTENT_TYPE: ContentType = {
	name: 'proyectos',
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
		}
	]
};

/** `autores` (mockup: grupo "Estructura", icono `user`). A diferencia de `authors` de `DEMO_SEED`
 *  (SIN registros a propósito, cubre el vacío-colección CON CTA), esta lleva registros. */
const AUTORES_CONTENT_TYPE: ContentType = {
	name: 'autores',
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
		}
	]
};

/** `etiquetas` (mockup: grupo "Estructura", icono `tag`, añadido por la Ola 1 al registro). */
const ETIQUETAS_CONTENT_TYPE: ContentType = {
	name: 'etiquetas',
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
		}
	]
};

const SHOWCASE_MANIFEST: JsonValue = {
	schemaVersion: 1,
	// Nombre evocador (decisión de David: "site.name pon algo evocador, ej. fodaveg.net"): el
	// wordmark de `Topbar.svelte` pinta "Vega" (fijo) + este nombre (tenue), como el mockup
	// (`.brand .site`).
	site: { name: 'fodaveg.net', locale: 'es' },
	nav: { groups: ['Contenido', 'Estructura'] },
	collections: {
		entradas: {
			label: 'Entradas',
			labelSingular: 'Entrada',
			icon: 'list',
			group: 'Contenido',
			order: 1,
			listFields: ['title', 'status', 'author', 'updated'],
			subtitleField: 'slug',
			// Capacidades del EDITOR (mockup `aquelarre-detalle-post.html`), todas opt-in:
			// `slugField` enciende la fila mono + "Regenerar"; `editorRail` el índice de hermanos a
			// la izquierda; los dos grupos con `placement: 'aside'` mudan sus campos a la columna
			// derecha. `posts` (la colección de los e2e) no declara ninguna: su editor no cambia.
			slugField: 'slug',
			editorRail: true,
			// `social`: tarjeta de compartir en el aside, alimentada por campos que la colección YA
			// tenía (el extracto dice literalmente «se usa en las tarjetas de compartir», así que
			// ahora se ve mientras se escribe). `cover` va vacío en las 12 entradas sembradas a
			// propósito: enseña la degradación de la tarjeta sin imagen, que es el estado real de
			// un borrador recién creado.
			social: {
				titleField: 'title',
				descriptionField: 'excerpt',
				imageField: 'cover',
				urlTemplate: 'https://fodaveg.net/blog/{slug}'
			},
			fieldGroups: [
				{ name: 'Publicación', placement: 'aside' },
				{ name: 'Portada', placement: 'aside' }
			],
			statusLabels: { draft: 'Borrador', published: 'Publicado', scheduled: 'Programado' },
			defaultSort: { field: 'updated', dir: 'desc' },
			// Labels ES por campo (mockup: columnas "Título"/"Estado"/"Autor"/"Actualizado ↓" y los
			// rótulos del editor): `posts` sigue con headers EN por defecto (humanización de
			// `field.name`), esto es opt-in.
			fields: {
				title: { label: 'Título' },
				slug: { label: 'Slug' },
				excerpt: {
					label: 'Extracto',
					widget: 'textarea',
					help: 'Se usa en la portada del blog y en las tarjetas de compartir. Máx. 200 caracteres.'
				},
				content: { label: 'Contenido' },
				// Rótulo «Imagen», NO «Portada»: el grupo ya se llama «Portada» y lo pinta la cabecera
				// de la tarjeta del aside, así que repetirlo en el label del campo daba un
				// «PORTADA / Portada» redundante que el mockup no tiene (allí el control de portada
				// va SIN label visible, es un botón suelto bajo el `h2`).
				cover: { label: 'Imagen', group: 'Portada' },
				status: { label: 'Estado', group: 'Publicación' },
				publishedAt: {
					label: 'Fecha de publicación',
					group: 'Publicación',
					help: 'Vacía = se fija al publicar.'
				},
				author: { label: 'Autor', group: 'Publicación' },
				// Los autodates NO se editan: `hidden` los saca del FORMULARIO (donde solo serían dos
				// controles inertes) sin sacarlos del modelo — la tarjeta "Registro" del aside lee su
				// valor igualmente, y `updated` sigue siendo columna del listado porque `listFields`
				// lo declara explícitamente (esa lista manda sobre el default de `listable`).
				created: { label: 'Creado', hidden: true },
				updated: { label: 'Actualizado', hidden: true }
			}
		},
		paginas: {
			label: 'Páginas',
			labelSingular: 'Página',
			icon: 'document',
			group: 'Contenido',
			order: 2,
			// `blocks`: la página se compone de secciones ordenables, editadas EN LÍNEA dentro de su
			// propio formulario. Abre «Inicio» para verlo; el resto de páginas enseñan el estado
			// vacío de la lista embebida.
			blocks: { collection: 'secciones', parentField: 'pagina', orderField: 'orden' },
			fields: { title: { label: 'Título' } }
		},
		// La colección hija NO aparece en la nav: se edita dentro de su página, y sacarla también
		// como lista suelta duplicaría el mismo contenido en dos sitios con dos modelos mentales
		// distintos. `hidden` es justo para esto.
		// `labelSingular` NO es decorativo aquí: el botón de la lista embebida es
		// «Añadir {labelSingular}», y sin él saldría «Añadir Secciones».
		secciones: { label: 'Secciones', labelSingular: 'Sección', hidden: true },
		proyectos: {
			label: 'Proyectos',
			labelSingular: 'Proyecto',
			icon: 'box',
			group: 'Contenido',
			order: 3
		},
		autores: {
			label: 'Autores',
			labelSingular: 'Autor',
			icon: 'user',
			group: 'Estructura',
			order: 4
		},
		etiquetas: {
			label: 'Etiquetas',
			labelSingular: 'Etiqueta',
			icon: 'tag',
			group: 'Estructura',
			order: 5
		}
	}
};

/**
 * 12 registros: MISMOS títulos/slugs/estados/autores/fechas que `blog` (ver su cabecera, calcados
 * del mockup aprobado) — el escaparate reutiliza el dataset ya validado en vez de inventar uno
 * paralelo. `entrada_6` ("Sin título") conserva el mismo caso límite (`slug`/`author` vacíos).
 *
 * Campos del EDITOR (ver `ENTRADAS_CONTENT_TYPE`): `excerpt` en todas menos la del caso límite;
 * `content` SOLO en las tres primeras — el mockup enseña una entrada abierta, y sembrar un cuerpo
 * largo en las doce no añadiría nada salvo peso al bundle de la demo. `entrada_2` es la del
 * mockup: extracto y cuerpo calcados de él, incluidos el `<h2>`, el `<code>` y el enlace, que son
 * justo lo que ejercita el estilo nuevo del richtext. `cover` va vacío en todas (el mockup enseña
 * el estado vacío de la tarjeta "Portada").
 */
const ENTRADAS_RECORDS = [
	{
		id: 'entrada_1',
		values: {
			title: 'Migrar el blog de Hugo a Astro sin romper las URLs',
			slug: 'migrar-blog-hugo-astro-sin-romper-urls',
			excerpt:
				'Redirecciones 301, rutas heredadas y un plan de corte en tres pasos para cambiar de generador sin perder el tráfico de años.',
			content:
				'<p>Cambiar de generador es fácil; lo difícil es que ninguna URL antigua devuelva un 404. Este es el plan que seguí.</p>',
			status: 'published',
			publishedAt: '2026-07-23T10:00:00.000Z',
			author: 'David',
			created: '2026-07-20T09:12:00.000Z',
			updated: '2026-07-23T10:00:00.000Z'
		}
	},
	{
		id: 'entrada_2',
		values: {
			title:
				'Temas claro/oscuro con un solo vocabulario de tokens: lo que aprendí construyendo el motor de paletas de Lumbre y por qué acabó viviendo también en Vega',
			slug: 'temas-claro-oscuro-vocabulario-tokens-motor-paletas',
			excerpt:
				'Un vocabulario cerrado de tokens de rol, dos ejes independientes (modo y paleta) y una barrera anti-parches: así se mantiene un tema coherente sin volverse loco.',
			content:
				'<h2>El problema: dos modos, veintiuna paletas</h2>' +
				// El mockup cita aquí un hex crudo repetido a mano; en el seed se nombra el TOKEN
				// (`--paper`) en su lugar: `scripts/check-theme-coverage.mjs` escanea todo `src/**` a
				// texto plano y un `#rrggbb` dentro de un string de datos le habría parecido pintura
				// cruda de la app (falso positivo que rompe el gate).
				'<p>Cuando el blog estrenó modo oscuro, cada componente traía sus propios colores. El resultado era el de siempre: <strong>un claro decente y un oscuro lleno de parches</strong> — grises que no venían de ninguna parte, acentos que perdían contraste, y el mismo tono de <code>--paper</code> copiado a mano en catorce sitios.</p>' +
				'<p>La salida fue cerrar el vocabulario: papel, tinta, línea y marca como <a href="https://fodaveg.net/blog/tokens-de-rol">tokens de rol</a>, y que ningún componente pueda pintar fuera de esa lista. El modo y la paleta se volvieron ejes independientes, y de repente añadir una paleta nueva costaba un JSON, no una tarde.</p>',
			status: 'draft',
			publishedAt: '',
			author: 'David',
			created: '2026-07-19T18:42:00.000Z',
			updated: '2026-07-23T08:00:00.000Z'
		}
	},
	{
		id: 'entrada_3',
		values: {
			title: 'PocketBase como backend de un CMS editor-first',
			slug: 'pocketbase-backend-cms-editor-first',
			excerpt:
				'Un solo binario, SQLite y reglas de acceso declarativas: por qué es suficiente para un sitio personal y dónde empieza a apretar.',
			content:
				'<p>La pregunta no es si PocketBase aguanta, es cuánto código propio te ahorra el primer año.</p>',
			status: 'published',
			publishedAt: '2026-07-18T09:00:00.000Z',
			author: 'David',
			created: '2026-07-14T11:05:00.000Z',
			updated: '2026-07-18T09:00:00.000Z'
		}
	},
	{
		id: 'entrada_4',
		values: {
			title: 'Notas del huerto: julio',
			slug: 'notas-del-huerto-julio',
			excerpt: 'Tomateras a media asta, riego por goteo y la eterna guerra contra el pulgón.',
			status: 'scheduled',
			publishedAt: '2026-07-28T07:00:00.000Z',
			author: 'Marta',
			created: '2026-07-13T19:20:00.000Z',
			updated: '2026-07-15T07:30:00.000Z'
		}
	},
	{
		id: 'entrada_5',
		values: {
			title: 'Passkeys en un backend Go: TOTP, WebAuthn y tres factores',
			slug: 'passkeys-backend-go-totp-webauthn',
			excerpt:
				'Del formulario de siempre a tres factores reales, sin dependencias exóticas y sin dejar a nadie fuera.',
			status: 'published',
			publishedAt: '2026-07-11T12:00:00.000Z',
			author: 'David',
			created: '2026-07-08T08:30:00.000Z',
			updated: '2026-07-11T12:00:00.000Z'
		}
	},
	{
		id: 'entrada_6',
		values: {
			title: 'Sin título',
			slug: '',
			excerpt: '',
			status: 'draft',
			publishedAt: '',
			author: '',
			created: '2026-07-02T16:00:00.000Z',
			updated: '2026-07-02T16:00:00.000Z'
		}
	},
	{
		id: 'entrada_7',
		values: {
			title: 'Reseña: teclados de perfil bajo para escribir mucho',
			slug: 'resena-teclados-perfil-bajo',
			excerpt: 'Tres teclados, seis meses de uso y una conclusión incómoda sobre el recorrido.',
			status: 'published',
			publishedAt: '2026-06-28T11:00:00.000Z',
			author: 'Marta',
			created: '2026-06-24T10:00:00.000Z',
			updated: '2026-06-28T11:00:00.000Z'
		}
	},
	{
		id: 'entrada_8',
		values: {
			title: 'Autoalojar sin dolor: mi checklist de higiene de servidor',
			slug: 'autoalojar-checklist-higiene-servidor',
			excerpt:
				'Actualizaciones desatendidas, backups verificados y un cortafuegos que no dependa de mi memoria.',
			status: 'published',
			publishedAt: '2026-06-20T09:00:00.000Z',
			author: 'David',
			created: '2026-06-17T07:45:00.000Z',
			updated: '2026-06-20T09:00:00.000Z'
		}
	},
	{
		id: 'entrada_9',
		values: {
			title: 'Por qué elegimos Svelte 5 runes para el admin',
			slug: 'por-que-svelte-5-runes-admin',
			excerpt: 'Menos ceremonia, reactividad explícita y un modelo mental que cabe en la cabeza.',
			status: 'draft',
			publishedAt: '',
			author: 'David',
			created: '2026-06-11T16:10:00.000Z',
			updated: '2026-06-14T15:00:00.000Z'
		}
	},
	{
		id: 'entrada_10',
		values: {
			title: 'Accesibilidad AA de verdad: contraste medido, no adivinado',
			slug: 'accesibilidad-aa-contraste-medido',
			excerpt:
				'Un script que mide cada par de tokens y falla el build: la única forma de que el contraste no se degrade sola.',
			status: 'published',
			publishedAt: '2026-06-05T10:00:00.000Z',
			author: 'Marta',
			created: '2026-06-01T12:00:00.000Z',
			updated: '2026-06-05T10:00:00.000Z'
		}
	},
	{
		id: 'entrada_11',
		values: {
			title: 'Backups 3-2-1 para un self-host de un solo servidor',
			slug: 'backups-3-2-1-selfhost',
			excerpt: 'Tres copias, dos medios, una fuera de casa — y una restauración de prueba al mes.',
			status: 'scheduled',
			publishedAt: '2026-08-05T09:00:00.000Z',
			author: 'David',
			created: '2026-07-28T09:00:00.000Z',
			updated: '2026-08-01T09:00:00.000Z'
		}
	},
	{
		id: 'entrada_12',
		values: {
			title: 'Diario de un rediseño: del wireframe al pixel',
			slug: 'diario-rediseno-wireframe-pixel',
			excerpt: 'Seis semanas, cuatro mockups descartados y la lección de comparar render a render.',
			status: 'draft',
			publishedAt: '',
			author: 'Marta',
			created: '2026-05-26T14:00:00.000Z',
			updated: '2026-05-30T18:00:00.000Z'
		}
	}
];

const PAGINAS_RECORDS = [
	{ id: 'pagina_1', values: { title: 'Inicio' } },
	{ id: 'pagina_2', values: { title: 'Sobre mí' } },
	{ id: 'pagina_3', values: { title: 'Contacto' } },
	{ id: 'pagina_4', values: { title: 'Ahora' } },
	{ id: 'pagina_5', values: { title: 'Colofón' } }
];

/**
 * Bloques de las páginas: la colección HIJA que ejercita la capacidad `blocks` del manifiesto
 * (lista embebida y ordenable dentro del editor del padre). Es contenido compuesto — una landing
 * hecha de secciones —, que es justo el caso que un CMS sobre PocketBase no podía modelar sin
 * repeaters.
 *
 * Los tres campos son deliberadamente los mínimos que exige la capacidad más uno de contenido:
 * `pagina` (la relación de vuelta al padre, NO múltiple), `orden` (numérico, el que reescribe el
 * arrastre) y `heading`/`texto`. El escaparate no necesita más para enseñar el gesto.
 */
const SECCIONES_CONTENT_TYPE: ContentType = {
	name: 'secciones',
	readonly: false,
	fields: [
		{
			name: 'pagina',
			type: 'relation',
			target: 'paginas',
			multiple: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'orden',
			type: 'number',
			integer: true,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		},
		{
			name: 'heading',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'texto',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

/** Solo `pagina_1` («Inicio») trae secciones sembradas: es la que se abre para ver la capacidad, y
 *  dejar el resto vacías enseña además el estado vacío de la lista embebida (un CMS de verdad
 *  arranca así, no con todo relleno). */
const SECCIONES_RECORDS = [
	{
		id: 'seccion_1',
		values: {
			pagina: 'pagina_1',
			orden: 0,
			heading: 'Escribe. Publica. Olvídate del resto.',
			texto: 'Un CMS que se pone encima de tu PocketBase y no te pide cambiar de sitio nada.'
		}
	},
	{
		id: 'seccion_2',
		values: {
			pagina: 'pagina_1',
			orden: 1,
			heading: 'Tu contenido, en tu servidor',
			texto: 'Sin cuentas de terceros ni exportaciones a medianoche: los datos ya son tuyos.'
		}
	},
	{
		id: 'seccion_3',
		values: {
			pagina: 'pagina_1',
			orden: 2,
			heading: 'Se adapta a tu modelo',
			texto: 'El manifiesto describe lo que ya tienes; Vega no te obliga a rehacer el esquema.'
		}
	}
];

/** Títulos en eco de los temas ya cubiertos por `entradas`/`blog` (Astro, PocketBase, passkeys,
 *  self-host, teclados, huerto) — mismo mundo ficticio, sin inventar uno nuevo. */
const PROYECTOS_RECORDS = [
	{ id: 'proyecto_1', values: { title: 'Blog en Astro' } },
	{ id: 'proyecto_2', values: { title: 'CMS sobre PocketBase' } },
	{ id: 'proyecto_3', values: { title: 'Backend Go con passkeys' } },
	{ id: 'proyecto_4', values: { title: 'Servidor autoalojado' } },
	{ id: 'proyecto_5', values: { title: 'Teclado mecánico casero' } },
	{ id: 'proyecto_6', values: { title: 'Huerto urbano' } }
];

const AUTORES_RECORDS = [
	{ id: 'autor_1', values: { name: 'David' } },
	{ id: 'autor_2', values: { name: 'Marta' } },
	{ id: 'autor_3', values: { name: 'Diego' } }
];

// ————— Biblioteca de medios del ESCAPARATE (bitmaps generados en tiempo de siembra) —————
//
// El problema que resuelve: desde que las tarjetas de `/media` miden las dimensiones REALES (del
// `<img>` que ya cargan) y el tamaño REAL (la longitud del data-URI, en `memory`), sembrar los
// PNG con el fixture 1×1 de los e2e hacía que el escaparate leyera «1×1 · 70 B» — un dato honesto
// que en una demo se lee como un bug. Se generan aquí bitmaps de verdad con `<canvas>` +
// `toDataURL`, así que las medidas que enseña la tarjeta son EXACTAS para el fichero que hay
// detrás (que es justo el sentido de medirlas) y el bundle no engorda ni un byte.
//
// **SOLO el escaparate.** `DEMO_SEED`/`DEMO_SEED_WITH_MEDIA` (las fixtures de los e2e) siguen con
// el PNG de 1×1 de arriba, intactas: son deterministas, baratas y ningún spec debe depender de que
// un canvas exista en el entorno donde corren.

/** Receta de un bitmap del escaparate: bandas planas + un disco + una barra. */
interface ShowcaseBitmapSpec {
	width: number;
	height: number;
	/** Bandas horizontales, de arriba abajo. Colores por NOMBRE CSS a propósito: la barrera de
	 *  tokens (`scripts/check-theme-coverage.mjs`) escanea TODO `src/**` a texto plano y un
	 *  `#rrggbb` aquí le parecería pintura cruda de la UI — cuando son PÍXELES de un fichero de
	 *  demo, no una superficie del tema. Los nombres, además, se leen mejor. */
	bands: readonly string[];
	/** Disco y barra superpuestos: rompen las bandas para que la miniatura no parezca un patrón. */
	disc: string;
	bar: string;
}

/**
 * Pinta `spec` y lo devuelve como data-URI PNG, o `null` si este entorno no puede
 * (`document`/`canvas` ausentes — Node/vitest —, `getContext` que devuelve `null` — jsdom sin el
 * paquete `canvas` —, o cualquier excepción). NUNCA lanza: la siembra tiene que sobrevivir a
 * cualquier entorno, y el llamador ya sabe caer al fixture de 1×1.
 *
 * **Por qué BANDAS PLANAS y no un degradado suave** (medido en Chromium antes de elegirlo): un
 * degradado de 24 bits cambia de color en casi cada píxel, así que PNG apenas lo comprime — a
 * 2880×1800 salían 6,8 MB de data-URI y 79 ms de codificación, y la tarjeta habría anunciado un
 * «6,8 MB» que ninguna imagen web real pesa. Con bandas planas el mismo lienzo da ~126 KB en
 * ~12 ms: números plausibles para una imagen optimizada y coste de arranque despreciable (las
 * cuatro imágenes juntas: ~35 ms y ~500 KB de cadenas, y solo si alguien abre el escaparate).
 * Determinista por construcción (sin `Math.random`): la misma semilla produce siempre los mismos
 * bytes, así que el tamaño que enseña la tarjeta no baila entre recargas.
 */
function renderShowcaseBitmap(spec: ShowcaseBitmapSpec): string | null {
	if (typeof document === 'undefined') return null;
	try {
		const canvas = document.createElement('canvas');
		canvas.width = spec.width;
		canvas.height = spec.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;

		const bandHeight = spec.height / spec.bands.length;
		spec.bands.forEach((color, index) => {
			ctx.fillStyle = color;
			// `+1` de alto: evita la hairline transparente que dejaría el redondeo entre bandas.
			ctx.fillRect(0, Math.round(index * bandHeight), spec.width, Math.ceil(bandHeight) + 1);
		});

		ctx.fillStyle = spec.disc;
		ctx.beginPath();
		ctx.arc(
			spec.width * 0.68,
			spec.height * 0.34,
			Math.min(spec.width, spec.height) * 0.22,
			0,
			Math.PI * 2
		);
		ctx.fill();

		ctx.fillStyle = spec.bar;
		ctx.fillRect(
			Math.round(spec.width * 0.08),
			Math.round(spec.height * 0.74),
			Math.round(spec.width * 0.34),
			Math.round(spec.height * 0.05)
		);

		const url = canvas.toDataURL('image/png');
		// jsdom sin `canvas` devuelve `data:,` sin lanzar: se comprueba la forma, no solo el tipo.
		return url.startsWith('data:image/png;base64,') ? url : null;
	} catch {
		return null;
	}
}

/** Los cuatro assets del escaparate que SÍ tienen bitmap (los demás son documentos/vídeos: su
 *  miniatura es el placeholder de rol del mockup, que es justo lo que hay que enseñar para ellos).
 *  La `FileRef` es el propio nombre de fichero, igual que en el resto de semillas. */
const SHOWCASE_MEDIA_BITMAPS: { ref: string; spec: ShowcaseBitmapSpec }[] = [
	{
		ref: 'portada-tokens.png',
		spec: {
			width: 2880,
			height: 1800,
			bands: ['darkorange', 'orangered', 'rebeccapurple', 'mediumpurple', 'mediumseagreen'],
			disc: 'midnightblue',
			bar: 'whitesmoke'
		}
	},
	{
		ref: 'banner-home.jpg',
		spec: {
			width: 1920,
			height: 1080,
			bands: ['mediumseagreen', 'yellowgreen', 'darkorange', 'orangered'],
			disc: 'darkslateblue',
			bar: 'whitesmoke'
		}
	},
	{
		ref: 'retrato-estudio.jpg',
		spec: {
			width: 1600,
			height: 2000,
			bands: ['rebeccapurple', 'mediumpurple', 'orangered', 'darkorange', 'goldenrod'],
			disc: 'midnightblue',
			bar: 'whitesmoke'
		}
	},
	{
		ref: 'isotipo-vega.svg',
		spec: {
			width: 512,
			height: 512,
			bands: ['midnightblue', 'rebeccapurple', 'darkorange'],
			disc: 'goldenrod',
			bar: 'whitesmoke'
		}
	}
];

/**
 * Ocho assets con la variedad de tipos del mockup (`aquelarre-medios.html`): cuatro imágenes con
 * bitmap real y cuatro sin fichero — un PDF, un DOCX y dos vídeos — que ejercitan la badge de
 * extensión y los CUATRO degradados de rol del placeholder. Los ids no son decorativos:
 * `mediaThumbTone` (`$lib/media/media-card`) reparte el matiz por hash del id, y
 * `showcase_media_1..4` caen justo en `a`/`b`/`c`/`d`, así que los cuatro se ven a la vez.
 *
 * REGLA que hay que respetar al tocar esta lista: un asset con extensión de IMAGEN necesita
 * SIEMPRE su entrada en `files` — la rejilla llama a `fileUrl` para él y una `FileRef` sin
 * fichero lanzaría `not-found`. Las extensiones no-imagen (pdf/docx/mp4/mov) nunca pasan por ahí.
 * `created` escalonado para que el orden (desc) intercale imágenes y documentos, como una
 * biblioteca real.
 */
const SHOWCASE_MEDIA_RECORDS = [
	{
		id: 'showcase_media_1',
		values: {
			file: 'informe-anual.pdf',
			alt: '',
			title: 'Informe anual 2025',
			tags: ['informe', 'pdf'],
			created: '2026-07-11T09:00:00.000Z'
		}
	},
	{
		id: 'showcase_media_2',
		values: {
			file: 'presentacion-producto.mp4',
			alt: '',
			title: 'Presentación de producto',
			tags: ['vídeo', 'producto'],
			created: '2026-07-02T11:30:00.000Z'
		}
	},
	{
		id: 'showcase_media_3',
		values: {
			file: 'notas-de-prensa.docx',
			alt: '',
			title: 'Notas de prensa',
			tags: ['prensa'],
			created: '2026-06-14T08:15:00.000Z'
		}
	},
	{
		id: 'showcase_media_4',
		values: {
			file: 'teaser-huerto.mov',
			alt: '',
			title: 'Teaser del huerto',
			tags: ['vídeo', 'huerto'],
			created: '2026-07-18T17:45:00.000Z'
		}
	},
	{
		id: 'showcase_media_5',
		values: {
			file: 'isotipo-vega.svg',
			alt: 'Isotipo de Vega sobre fondo oscuro',
			title: 'Isotipo',
			tags: ['marca'],
			created: '2026-06-28T10:00:00.000Z'
		}
	},
	{
		id: 'showcase_media_6',
		values: {
			file: 'retrato-estudio.jpg',
			alt: 'Retrato de estudio a contraluz',
			title: 'Retrato de estudio',
			tags: ['foto', 'retrato'],
			created: '2026-07-09T12:20:00.000Z'
		}
	},
	{
		id: 'showcase_media_7',
		values: {
			file: 'banner-home.jpg',
			alt: 'Banner de portada con bandas de color',
			title: 'Banner de la home',
			tags: ['banner', 'web'],
			created: '2026-07-16T16:05:00.000Z'
		}
	},
	{
		id: 'showcase_media_8',
		values: {
			file: 'portada-tokens.png',
			// Sin `alt` a propósito: cubre el fallback de nombre (`mediaImgAlt`) también aquí.
			alt: '',
			title: '',
			tags: [],
			created: '2026-07-22T19:40:00.000Z'
		}
	}
];

/** Memoria del mapa de ficheros ya generado (ver el getter `files` de `SHOWCASE_SEED`). */
let showcaseMediaFilesCache: NonNullable<MemorySeed['files']> | null = null;

/**
 * Los ficheros del escaparate, generados la PRIMERA vez que alguien los pide (ver el getter de
 * `SHOWCASE_SEED.files`). El `mime` es `image/png` para los cuatro aunque el NOMBRE diga `.jpg` o
 * `.svg`: el bitmap es un PNG de verdad y es el mime lo que decide cómo lo decodifica el navegador
 * — la extensión del nombre solo alimenta la clasificación/badge de la UI, que es justo la
 * variedad que se quiere enseñar. Si el entorno no puede pintar (`renderShowcaseBitmap` devuelve
 * `null`), cae al PNG de 1×1 de siempre: la semilla sigue siendo válida, solo se ve pequeña.
 */
function showcaseMediaFiles(): NonNullable<MemorySeed['files']> {
	if (showcaseMediaFilesCache) return showcaseMediaFilesCache;
	const files: NonNullable<MemorySeed['files']> = {};
	for (const asset of SHOWCASE_MEDIA_BITMAPS) {
		files[asset.ref] = {
			name: asset.ref,
			mime: 'image/png',
			dataUri: renderShowcaseBitmap(asset.spec) ?? `data:image/png;base64,${TINY_PNG_BASE64}`
		};
	}
	showcaseMediaFilesCache = files;
	return files;
}

const ETIQUETAS_RECORDS = [
	{ id: 'etiqueta_1', values: { name: 'astro' } },
	{ id: 'etiqueta_2', values: { name: 'hugo' } },
	{ id: 'etiqueta_3', values: { name: 'pocketbase' } },
	{ id: 'etiqueta_4', values: { name: 'svelte' } },
	{ id: 'etiqueta_5', values: { name: 'accesibilidad' } },
	{ id: 'etiqueta_6', values: { name: 'autoalojamiento' } },
	{ id: 'etiqueta_7', values: { name: 'backups' } },
	{ id: 'etiqueta_8', values: { name: 'passkeys' } },
	{ id: 'etiqueta_9', values: { name: 'teclados' } },
	{ id: 'etiqueta_10', values: { name: 'huerto' } },
	{ id: 'etiqueta_11', values: { name: 'temas' } },
	{ id: 'etiqueta_12', values: { name: 'self-host' } }
];

export const SHOWCASE_SEED: MemorySeed = {
	users: [DEMO_CREDENTIALS],
	contentTypes: [
		VEGA_CONTENT_TYPE,
		ENTRADAS_CONTENT_TYPE,
		PAGINAS_CONTENT_TYPE,
		SECCIONES_CONTENT_TYPE,
		PROYECTOS_CONTENT_TYPE,
		AUTORES_CONTENT_TYPE,
		ETIQUETAS_CONTENT_TYPE,
		VEGA_MEDIA_CONTENT_TYPE
	],
	records: {
		[VEGA_COLLECTION.name]: [{ id: 'vega_manifest', values: { manifest: SHOWCASE_MANIFEST } }],
		entradas: ENTRADAS_RECORDS,
		paginas: PAGINAS_RECORDS,
		secciones: SECCIONES_RECORDS,
		proyectos: PROYECTOS_RECORDS,
		autores: AUTORES_RECORDS,
		etiquetas: ETIQUETAS_RECORDS,
		// Biblioteca PROPIA del escaparate (ya no los 3 assets de `DEMO_SEED_WITH_MEDIA`): ocho
		// ficheros con la variedad de tipos del mockup, cuatro de ellos con bitmap real generado en
		// tiempo de siembra — ver `SHOWCASE_MEDIA_RECORDS`/`renderShowcaseBitmap`.
		vega_media: SHOWCASE_MEDIA_RECORDS
	},
	// Getter, no un objeto literal: así los cuatro bitmaps se pintan SOLO si alguien abre de verdad
	// el escaparate (este módulo lo importa `session/backend.ts`, que carga en TODOS los arranques
	// de la app, también contra PocketBase — generar ahí ~35 ms y ~500 KB de cadenas que nadie va a
	// mirar sería un peaje para todo el mundo). `showcaseMediaFiles()` memoiza, así que leer la
	// propiedad dos veces no vuelve a pintar nada.
	get files() {
		return showcaseMediaFiles();
	}
};
