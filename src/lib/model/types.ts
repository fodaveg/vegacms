/**
 * Tipos satélite del modelo de contenido de Vega (Parte 2, §2 del contrato).
 *
 * Fusionan el esquema descubierto por P1 (`ContentType`/`Field`, importados y NUNCA
 * redefinidos aquí) con el manifiesto declarativo y las convenciones de P2, para producir
 * `ContentModel`: la única estructura que P3/P4/P5 consumen para saber QUÉ pintar. Módulo
 * PURO (ley L1 del contrato P2): sin Svelte, sin el puerto, sin `pocketbase`.
 */

import type { ContentType, Field, FieldSubtype } from '$lib/backend/types';
import type { FilterNode } from '$lib/backend/query';

// ————— Raíz —————

export interface ContentModel {
	site: ResolvedSite;
	/** TODOS los tipos descubiertos por P1, incluidos los ocultos. Mismo cardinal que P1 (L6). */
	types: ResolvedContentType[];
	/** Derivado de `types`: solo visibles, agrupados y ordenados. Lo que P3 pinta tal cual. */
	nav: NavModel;
	/** Vistas fusionadas declaradas en `mergedViews` (L7a), ya resueltas y filtradas a las que
	 *  tienen al menos una source válida — una vista con 0 sources válidas se descarta entera
	 *  (`merged-view-invalid`) y no aparece aquí. Cardinal <= nº de claves de `mergedViews` en el
	 *  manifiesto (nunca mayor). Desde L7c, cada vista de aquí TAMBIÉN aparece como un `NavItem`
	 *  (`kind:'view'`) en `nav` (mismo `group`/`order`/`label`/`icon`, plegados con las colecciones
	 *  vía `orderByGroups` en `buildNav`, `resolve.ts`) — esta lista sigue siendo la fuente de
	 *  verdad de las vistas en sí (sources, filtros…), `nav` solo la referencia para pintar el
	 *  enlace. */
	mergedViews: ResolvedMergedView[];
	/** Discrepancias manifiesto↔esquema y problemas de lectura. Parte del modelo, no un log. */
	warnings: ModelWarning[];
	/** Meta de procedencia del manifiesto. */
	manifest: ManifestState;
}

export type ManifestState =
	| { status: 'absent' } // modo sin manifiesto (primera clase, sin warning)
	| { status: 'loaded'; schemaVersion: number }
	| { status: 'unreadable' }; // JSON inválido → tratado como absent + warning

export interface ResolvedSite {
	name: string; // (D+M) default 'Vega'
	defaultTheme: string | null; // (M) pass-through para P7; null = default de P7
	locale: 'es' | 'en' | null; // (M) null = P3 decide por navigator.language
}

// ————— Navegación (contrato con P3) —————

export interface NavModel {
	/** Grupos en orden de render. El primer grupo puede ser el anónimo (label null). */
	groups: NavGroup[];
}

export interface NavGroup {
	label: string | null; // null = grupo anónimo (tipos sin grupo), SIEMPRE primero
	items: NavItem[]; // en orden de render
}

export interface NavItem {
	/** Discriminante (L7c): `'collection'` enruta a `/c/:type` (o resuelve singleton, §4.6);
	 *  `'view'` enruta a `/v/:id` (una vista fusionada, `mergedViews`, L7a) — siempre lista, nunca
	 *  singleton, siempre `readonly` (una vista no crea/borra registros propios). */
	kind: 'collection' | 'view';
	/** `ContentType.name` (kind:'collection') o `ResolvedMergedView.id` (kind:'view'): namespaces
	 *  en principio distintos, pero si COLISIONAN (mismo string) gana la colección — la vista en
	 *  colisión se descarta en `resolveContentModel` (`merged-view-name-collision`, L7e) antes de
	 *  llegar aquí, así que `nav` nunca contiene dos `NavItem` con el mismo `type`. */
	type: string;
	label: string;
	icon: string | null; // id del set de iconos de Vega; null = icono genérico de P3
	singleton: boolean; // true ⇒ P3 enruta directo a la edición, sin listado. SIEMPRE false en views.
	readonly: boolean; // pass-through (views/mergedViews): P4 no ofrece crear/borrar
}

// ————— Tipos resueltos —————

export interface ResolvedContentType {
	/** El ContentType de P1 INTACTO. Fuente de verdad estructural; nunca se muta. */
	schema: ContentType;
	name: string; // (D) = schema.name
	label: string; // (D+M) manifiesto > humanización (§4.8)
	labelSingular: string; // (D+M) default = label (sin heurísticas de plural)
	icon: string | null; // (M) validado contra el set si se inyecta (§4.8)
	hidden: boolean; // (D+M) `vega`/`vega_*` SIEMPRE true, no anulable (L7)
	group: string | null; // (M)
	singleton: boolean; // (M) SOLO manifiesto; jamás autodetectado (§4.6)
	readonly: boolean; // (D) = schema.readonly
	/** (D+M) nombre del campo título, o null ⇒ la UI muestra el id. Cascada §4.4. */
	titleField: string | null;
	/** (M) nombre de un campo escalar que se pinta como línea secundaria bajo el título en el
	 *  listado (mockup `aquelarre-dark.html`, `.cell-title .slug`), o null ⇒ sin línea secundaria.
	 *  SOLO manifiesto, sin autodetección por convención (mismo criterio que `orderField`): un
	 *  tipo sin `subtitleField` declarado no cambia su render. No exige que el campo esté en
	 *  `listFields` — es habitual que NO lo esté (el mockup lo usa justo para un campo, como
	 *  `slug`, que no merece columna propia). */
	subtitleField: string | null;
	/** (M) nombre del campo de texto DERIVABLE del título (un slug/permalink), o null ⇒ ninguno.
	 *  Habilita en el editor la fila `.slug-row` del mockup `aquelarre-detalle-post.html`: el
	 *  control en `--mono` más un botón "Regenerar" que lo recalcula a partir del valor ACTUAL de
	 *  `titleField` (`slugify`, módulo puro). SOLO manifiesto, sin autodetección por nombre (mismo
	 *  criterio opt-in que `subtitleField`/`orderField`: un tipo que no lo declara no cambia su
	 *  render, y Vega nunca asume que un campo llamado "slug" lo sea). Sin `titleField` resoluble
	 *  la capacidad queda inerte (no hay de dónde derivar): el campo se pinta mono, pero sin botón. */
	slugField: string | null;
	/** (D+M) campo de publicación por convención, o null ⇒ tipo sin drafts. §4.5. */
	statusField: string | null;
	/** (M) etiquetas legibles por VALOR CRUDO de `statusField` (p. ej. `{ draft: 'Borrador',
	 *  published: 'Publicado' }`), o null ⇒ la insignia de estado (`RecordTable.svelte`) pinta el
	 *  valor crudo tal cual (comportamiento histórico, GENÉRICO por defecto). SOLO manifiesto, sin
	 *  autodetección — mismo criterio opt-in que `subtitleField`. El COLOR de la insignia lo sigue
	 *  decidiendo `classifyStatusBadge` sobre el valor crudo (`cell.ts`), nunca la etiqueta: dos
	 *  claves distintas del manifiesto pueden compartir el mismo valor crudo de facto
	 *  (`draft`/`published`) sin que localizarlas cambie el color. */
	statusLabels: Record<string, string> | null;
	/** (M) campo numérico de orden manual, o null. Sin autodetección por convención (a diferencia
	 *  de `statusField`): solo existe si el manifiesto lo declara explícitamente y el campo es
	 *  `number`. Habilita el reorder por arrastre del listado y el orden por defecto. */
	orderField: string | null;
	/** (M) orden INICIAL del listado cuando la URL no trae uno explícito (mockup
	 *  `aquelarre-dark.html`, columna "Actualizado" con `↓`), o null ⇒ sin orden por defecto —
	 *  comportamiento histórico de P4 ("nunca ordena por defecto"), que esta clave reabre de forma
	 *  OPT-IN y controlada (decisión de David, lote "match 1:1 con el mockup"): un tipo que no
	 *  declara `defaultSort` no cambia su render. SOLO manifiesto, sin autodetección — mismo
	 *  criterio que `subtitleField`/`orderField`. `field` debe ser ESCALAR (mismo criterio que
	 *  `search.ts`/`cycleSort` usan para un `sort` de URL válido); un `field` inexistente o no
	 *  escalar invalida la clave entera (`default-sort-field-invalid`) y cae a `null`, nunca a un
	 *  campo distinto. `dir` usa la MISMA forma que `ViewState.sort` (`query-state.ts`) para que
	 *  `+page.svelte` pueda usarlo tal cual como fallback sin remapear nada. */
	defaultSort: { field: string; dir: 'asc' | 'desc' } | null;
	/** (M) plantilla con placeholders `{campo}`/`{id}` ya validados, o null. §4.7. */
	previewUrl: string | null;
	/** (D+M) campos en ORDEN EFECTIVO de formulario (§4.9). Mismo cardinal que schema.fields. */
	fields: ResolvedField[];
	/** (D+M) nombres de campos-columna para P4, en orden. Máx 5 por defecto (§4.10). */
	listFields: string[];
	/** (D+M) grupos de campos del formulario, en orden de render (§4.9, §4.9b, §4.9c). */
	fieldGroups: ResolvedFieldGroup[];
	/** (M) `true` ⇒ el editor de un registro de este tipo pinta a su izquierda el RAÍL de hermanos
	 *  (mockup `aquelarre-detalle-post.html`, `.rail`): la lista de la colección sigue presente
	 *  mientras editas, con el registro abierto marcado `aria-current`. `false` (el default, y el
	 *  comportamiento histórico) ⇒ el editor no pinta ningún raíl. SOLO manifiesto, opt-in — mismo
	 *  criterio que `subtitleField`/`statusLabels`: una colección que no lo declara no cambia su
	 *  DOM. Inerte en un `singleton` (no hay hermanos que listar): la UI no lo pinta, sin warning —
	 *  no es una declaración INVÁLIDA, solo una capacidad sin nada que mostrar. */
	editorRail: boolean;
	/**
	 * (M) Configuración de edición traducible. `null` conserva el formulario plano histórico.
	 * Cuando existe, la UI pinta un único selector de idioma y sustituye solo los campos físicos
	 * declarados en `fields`; el resto del formulario permanece visible y compartido.
	 */
	localization?: ResolvedLocalization | null;
	/**
	 * (M) Bloques ordenables embebidos (lote "editor", Fase A): la colección HIJA cuyos registros
	 * son "secciones" de este tipo (p. ej. una landing hecha de bloques) — PocketBase no tiene
	 * repeaters, así que esta es la única forma de modelar una secuencia dentro de un registro.
	 * `null` (default) ⇒ el editor no pinta ninguna lista de bloques, comportamiento histórico
	 * intacto. SOLO manifiesto, sin autodetección — mismo criterio opt-in que `orderField`/
	 * `slugField`: nada en el nombre de una colección o campo hace de esto una convención. Ver
	 * `ResolvedBlocksConfig` para el detalle de las tres piezas y su validación cruzada contra el
	 * esquema de la colección hija.
	 *
	 * `?:` (opcional, no solo `| null`) a propósito, MISMO criterio que `localization` arriba:
	 * `resolveContentType` SIEMPRE la escribe (nunca queda `undefined` en un `ContentModel` real),
	 * pero marcarla opcional evita que cada fixture de test que construye un `ResolvedContentType`
	 * a mano en otras partes del repo (listado, widgets…) tenga que enumerar esta clave nueva.
	 */
	blocks?: ResolvedBlocksConfig | null;
	/**
	 * (M) Vista previa de tarjeta social (SEO/OG, lote "editor", Fase B): el mapeo de qué campo de
	 * ESTE tipo alimenta el título/descripción/imagen social + la URL pública de la tarjeta. `null`
	 * (default) ⇒ el editor no pinta ninguna tarjeta, comportamiento histórico intacto. A
	 * diferencia de `blocks` (todo o nada), CADA pieza degrada de forma INDEPENDIENTE — una
	 * declaración con solo `imageField` válido sigue mostrando la tarjeta, sin descripción/con el
	 * título por convención (§4.4). Ver `ResolvedSocialCardConfig`.
	 *
	 * `?:` por el mismo motivo que `blocks`/`localization` arriba (compatibilidad de fixtures).
	 */
	social?: ResolvedSocialCardConfig | null;
}

/**
 * (M) Declaración ya validada de `collections.<c>.social` (lote "editor", Fase B): el mapeo de
 * campos que alimentan la vista previa de tarjeta social (SEO/Open Graph) de un registro. Cada
 * pieza se valida y degrada de forma INDEPENDIENTE (a diferencia de `ResolvedBlocksConfig`): la
 * presencia de la CLAVE `social` en el manifiesto (aunque sea `{}`) es lo único opt-in — activa la
 * tarjeta en el aside del editor — y a partir de ahí cada campo que falte o no valide simplemente
 * no se pinta (imagen sin marco roto, descripción ausente sin hueco vacío), nunca invalida el
 * resto (`resolveSocialCard`, `resolve.ts`).
 */
export interface ResolvedSocialCardConfig {
	/** (M, cascada) Campo de título social: manifiesto > `titleField` resuelto del tipo (§4.4) >
	 *  `null`. Mismo criterio "representable" (`text`/`email`/`url`) que `titleField`/`slugField`:
	 *  se EDITA/pinta como texto plano, nunca se deriva de una fecha o un número. */
	titleField: string | null;
	/** (M) Campo de descripción social: `text`/`richtext` (contenido escrito por el editor), o
	 *  `null` sin descripción — SIN fallback (a diferencia de `titleField`, no existe una
	 *  convención Vega de "el campo descripción" a la que caer). */
	descriptionField: string | null;
	/** (M) Campo `file` NO múltiple con la imagen social (una tarjeta social tiene UNA imagen, no
	 *  una galería), o `null` sin imagen — SIN fallback, mismo motivo que `descriptionField`. */
	imageField: string | null;
	/** (M, cascada) Plantilla de URL pública de la tarjeta: reusa la MISMA maquinaria de
	 *  placeholders `{campo}`/`{id}` que `previewUrl` (`preview-url.ts`, §4.7) — manifiesto propio
	 *  de `social` > `previewUrl` ya resuelto del tipo > `null`. Una tarjeta social casi siempre
	 *  enlaza al mismo sitio público que "Ver en el sitio", de ahí el fallback. */
	urlTemplate: string | null;
}

/**
 * (M) Declaración ya validada de `collections.<c>.blocks` (lote "editor", Fase A): la colección
 * hija de bloques + los dos campos que la anclan a ESTE tipo padre. Las tres piezas se validan
 * juntas contra el esquema REAL (nunca solo la forma JSON, ver `resolveBlocks` en `resolve.ts`):
 * `collection` debe existir en el esquema descubierto, `parentField` debe ser un campo `relation`
 * de esa colección hija que apunte de vuelta a este tipo (no-múltiple: un bloque pertenece a UN
 * padre, nunca se comparte entre varios) y `orderField` debe ser un campo `number` de la misma
 * colección hija. Cualquiera de las tres inválida invalida la capacidad ENTERA (`blocks-invalid`,
 * `null`) — no hay "bloques a medias": sin las tres piezas no hay ni colección que listar, ni
 * campo por el que filtrar, ni campo por el que ordenar.
 */
export interface ResolvedBlocksConfig {
	/** Nombre de la colección hija en el backend (= `ResolvedContentType.name` de los bloques). */
	collection: string;
	/** Campo `relation` (no-múltiple) de la colección hija que apunta de vuelta a este tipo. El
	 *  editor lo escribe al crear un bloque nuevo (`{ [parentField]: idDelPadre }`) y lo mantiene
	 *  oculto en el mini-formulario del bloque: es estructural, no contenido editorial. */
	parentField: string;
	/** Campo `number` de la colección hija que ordena los bloques dentro de ESTE padre (mismo
	 *  vocabulario que `orderField` a nivel de colección, §"orden manual"): el reorder por
	 *  arrastre/teclado de la lista embebida lo escribe, nunca lo pinta el mini-formulario. */
	orderField: string;
}

export interface ResolvedLocale {
	/** Id estable declarado por el proyecto (p. ej. `es`, `en`, `pt-BR`). */
	id: string;
	/** Etiqueta humana del tab (p. ej. `Español`). */
	label: string;
}

export interface ResolvedLocalizedField {
	/** Id lógico del campo traducible dentro del manifiesto (p. ej. `title`). */
	name: string;
	/** Etiqueta común que sustituye a sufijos físicos como `(ES)`/`(EN)`. */
	label: string;
	/** Campo físico del backend por locale. Solo contiene locales válidos y campos existentes. */
	fields: Record<string, string>;
}

export interface ResolvedLocalization {
	defaultLocale: string;
	locales: ResolvedLocale[];
	/** En orden del campo físico ancla (el del locale por defecto) dentro del formulario. */
	fields: ResolvedLocalizedField[];
}

/**
 * DÓNDE pinta el editor un grupo de campos (§4.9c, mockup `aquelarre-detalle-post.html`):
 * `'main'` = la columna central de tarjetas (el sitio de siempre), `'aside'` = la columna
 * derecha de tarjetas compactas (publicación, portada…). Genérico por construcción: Vega no
 * sabe qué es "publicar", solo mueve el grupo que el manifiesto le mande.
 */
export type FieldGroupPlacement = 'main' | 'aside';

/**
 * Un grupo de campos del formulario ya resuelto (§4.9b/§4.9c): además del nombre/orden que ya daba
 * §4.9, lleva `columns` — la rejilla responsive de N columnas que `RecordForm.svelte` pinta para
 * ESE grupo (feature genérica "editor bilingüe emparejado", pero aplicable a cualquier par/trío
 * de campos que convenga ver lado a lado: p.ej. `titleEs`|`titleEn`) — y `placement`, la columna
 * del editor donde cae. `columns: 1` + `placement: 'main'` (los defaults, y también los valores
 * SIEMPRE del grupo anónimo — no hay clave de manifiesto de la que heredarlos) son el layout de
 * siempre; P2 no cambia nada para un manifiesto que no declara la forma objeto de `fieldGroups`
 * (compatibilidad hacia atrás total).
 */
export interface ResolvedFieldGroup {
	/** Nombre del grupo, o `null` para el grupo anónimo (campos sin `group`, siempre primero). */
	name: string | null;
	/** (M) columnas de la rejilla del grupo (1-3, default 1). >1 colapsa a 1 en viewports estrechos. */
	columns: 1 | 2 | 3;
	/** (M) columna del editor donde se pinta el grupo (default `'main'`, §4.9c). */
	placement: FieldGroupPlacement;
}

export interface ResolvedField {
	/** El Field de P1 INTACTO (tipo real, config, required, readonly, presentable, hidden…). */
	schema: Field;
	name: string; // (D) = schema.name
	label: string; // (D+M) manifiesto > humanización
	help: string | null; // (M)
	placeholder: string | null; // (M)
	hidden: boolean; // (D+M) default = schema.hidden
	group: string | null; // (M) referencia a fieldGroups
	/** (D+M) QUÉ widget pinta P5. Vocabulario cerrado §4.2; override incompatible ⇒ default + warning. */
	widget: WidgetId;
	/** (D+M) subtype EFECTIVO. 'markdown' ⟺ widget 'markdown' (L9). Es lo que P5 consume, no schema.subtype. */
	subtype: FieldSubtype | null; // null para tipos sin subtype (number, bool…)
	/** (D+M) candidato a columna en P4. Defaults por tipo en §4.10. */
	listable: boolean;
}

// ————— Vistas fusionadas (mergedViews, L7a) —————

/**
 * Una source de una vista fusionada, ya resuelta (L7a): la contribución de UNA colección a la
 * vista. Genérica por construcción — nada aquí referencia una colección concreta, todo sale del
 * manifiesto + el esquema descubierto. Solo sobreviven a `resolveContentModel` las sources con
 * colección real (no huérfana, no reservada) y `orderField` numérico resuelto: sin eso, L7b no
 * podría ni consultar ni ordenar la source, así que se descarta entera (`merged-source-orphan`/
 * `merged-source-order-invalid`) en vez de colar un dato inservible.
 */
export interface ResolvedMergedSource {
	/** Nombre de la colección en el backend (= `ResolvedContentType.name` de la source). */
	collection: string;
	/** Predicado de membresía ya compilado a AST de query (`$lib/backend/query`), listo para
	 *  combinarse en el `filter` de una `Query` sin volver a pasar por texto. `null` = sin
	 *  restricción (toda la colección): `where` ausente, `{}`, o con TODAS sus condiciones
	 *  inválidas (`merged-where-invalid` por cada una descartada). */
	where: FilterNode | null;
	/** Campo NUMÉRICO de orden manual efectivo (source > vista). Nunca `null`: una source sin
	 *  orderField resoluble se descarta antes de llegar aquí (`merged-source-order-invalid`). */
	orderField: string;
	/** (D+M) proyección de título para esta source: override de la source > `titleField`
	 *  resuelto del tipo. `null` ⇒ sin campo título representable (mismo caso que P2 §4.4). */
	titleField: string | null;
	/** (D+M) rótulo de la insignia de tipo para los registros de esta source: override de la
	 *  source > `labelSingular` resuelto del tipo. */
	label: string;
}

/**
 * Una vista fusionada, ya resuelta (L7a): une registros de varias colecciones bajo un id-slug de
 * manifiesto. `sources` solo contiene las que sobrevivieron a la resolución; si quedan 0, la
 * vista ENTERA se descarta (`merged-view-invalid`) y no llega a `ContentModel.mergedViews`.
 */
export interface ResolvedMergedView {
	/** Clave de `mergedViews` en el manifiesto (id-slug). */
	id: string;
	label: string; // (D+M) manifiesto > humanización del id, misma convención que collections (§4.8)
	icon: string | null; // (M) validado contra el MISMO set de iconos que collections
	group: string | null; // (M) grupo de nav; misma mecánica que collections.group (integración en L7b)
	/** (M) orden en nav; default 0 si el manifiesto no lo declara (integración en L7b). */
	order: number;
	/** (D+M) sources con colección/orderField/where ya resueltos, en el orden declarado. */
	sources: ResolvedMergedSource[];
}

// ————— Widgets (vocabulario CERRADO v1, §4.2/L8) —————

export type WidgetId =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'richtext'
	| 'number'
	| 'switch'
	| 'email'
	| 'url'
	| 'datetime'
	| 'select'
	| 'chips'
	| 'relation'
	| 'file'
	| 'json'
	| 'unsupported';

/** Vocabulario cerrado como valor runtime (L8): base de la aserción global "ningún WidgetId
 *  fuera de esta lista" en los tests, y utilizable por P5 para iterar sus implementaciones. */
export const WIDGET_IDS: readonly WidgetId[] = [
	'text',
	'textarea',
	'markdown',
	'richtext',
	'number',
	'switch',
	'email',
	'url',
	'datetime',
	'select',
	'chips',
	'relation',
	'file',
	'json',
	'unsupported'
];

// ————— Warnings —————

export type WarningCode =
	| 'manifest-unreadable' // JSON no parseable o raíz no-objeto
	| 'manifest-version-newer' // schemaVersion > soportada; se leyó lo conocido
	| 'manifest-invalid-key' // clave conocida con tipo/valor inválido → ignorada
	| 'orphan-collection' // colección del manifiesto que no existe en el esquema
	| 'orphan-field' // campo del manifiesto que no existe en el tipo
	| 'widget-incompatible' // override imposible para el tipo real → default
	| 'title-field-invalid' // titleField inexistente o no representable → cascada
	| 'status-field-invalid' // statusField que no cumple la convención → null
	| 'order-field-invalid' // orderField inexistente o no numérico → null
	| 'subtitle-field-invalid' // subtitleField inexistente o no escalar → null
	| 'slug-field-invalid' // slugField inexistente o no representable como texto → null
	| 'default-sort-field-invalid' // defaultSort.field inexistente o no escalar → null
	| 'status-labels-unknown-value' // clave de statusLabels que no es opción del statusField → se conserva igualmente, solo aviso
	| 'preview-url-invalid' // placeholder desconocido o no escalar → null
	| 'list-field-unknown' // listFields con campo inexistente → se omite
	| 'icon-unknown' // icono fuera del set → null
	| 'singleton-invalid' // singleton sobre un tipo readonly (view) → ignorado
	| 'blocks-invalid' // blocks con colección/parentField/orderField inválido → capacidad ignorada
	| 'social-title-field-invalid' // social.titleField inexistente o no representable → cascada a titleField
	| 'social-description-field-invalid' // social.descriptionField inexistente o no texto/richtext → null
	| 'social-image-field-invalid' // social.imageField inexistente o no file no-múltiple → null
	| 'social-url-invalid' // social.urlTemplate con placeholder desconocido o no escalar → cascada a previewUrl
	| 'multiple-vega-records' // la colección vega tiene >1 registros (lo emite load, §6.2)
	// ————— mergedViews (L7a) —————
	| 'merged-view-invalid' // 0 sources válidas → la vista fusionada entera se descarta
	| 'merged-source-orphan' // source con colección inexistente o reservada → se descarta
	| 'merged-source-order-invalid' // orderField ausente/no numérico para la source → se descarta
	| 'merged-where-invalid' // condición de where con prop inexistente o "eq" no permitido → se ignora
	| 'merged-view-name-collision'; // id de mergedViews == name de una colección → gana la colección, la vista se descarta (L7e)

export interface ModelWarning {
	code: WarningCode;
	/** Mensaje humano en español, accionable ("el campo X del manifiesto no existe en 'posts'"). */
	message: string;
	collection?: string;
	field?: string;
	/** Id de la vista fusionada afectada (`mergedViews.<id>`), solo en warnings `merged-*` (L7a). */
	mergedView?: string;
	/** JSON Pointer a la clave del manifiesto que lo causó, si aplica (p.ej. '/collections/posts/fields/body/widget'). */
	path?: string;
}
