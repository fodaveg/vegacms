/**
 * Revisión antes de publicar (Lote 13): qué avisos enseña Vega sobre un registro ANTES de que se
 * publique. Este módulo es el CONTRATO y la LÓGICA PURA (sin Svelte, sin puerto, sin red); la carga
 * de datos está aparte en `load-review-data.ts` y la interfaz todavía no existe (falta su lámina).
 *
 * **Qué hace.** `reviewRecord(input)` recibe el registro, su modelo de contenido y los datos YA
 * cargados (rutas de páginas, redirecciones, fichas de medios, bloques) y devuelve `ReviewResult`:
 * la lista de hallazgos —cada uno con su identificador de comprobación, su gravedad, el campo o
 * bloque al que apunta y la clave i18n de su mensaje— más las comprobaciones que NO pudieron
 * correr por falta de datos (`skipped`), para que la interfaz no calle «0 avisos» cuando en
 * realidad no se miró.
 *
 * **Gravedad.** `ReviewSeverity` distingue `'warning'` (informa, no impide publicar) de `'error'`
 * (reservado para un futuro bloqueo). POR DEFECTO TODO ES `'warning'` (`CHECK_SEVERITY`): la
 * revisión informa y no bloquea, que es lo coherente con el aviso de alt de hoy en el campo de
 * fichero, que es solo informativo (`FileInput.svelte`). Ninguna comprobación devuelve hoy
 * `'error'`; promover una es cambiar una fila de esa tabla, no la lógica.
 *
 * **Comprobaciones** (identificador estable → qué mira → de dónde saca los datos):
 *
 * | Identificador                | Avisa cuando…                                                       |
 * | ---------------------------- | ------------------------------------------------------------------- |
 * | `seo.description-empty`      | la descripción está vacía o solo tiene espacios                     |
 * | `seo.description-long`       | la descripción supera `DESCRIPTION_LONG_AT` (160) caracteres        |
 * | `seo.social-image-missing`   | no hay imagen social                                                |
 * | `seo.noindex`                | `noindex` está marcado                                              |
 * | `link.broken`                | un enlace interno no lleva a ninguna página ni redirección          |
 * | `link.draft-target`          | un enlace interno lleva a una página que sigue en borrador          |
 * | `media.alt-missing`          | una imagen de la biblioteca usada en un bloque no tiene alt         |
 * | `media.alt-missing-inline`   | una `<img>` del texto enriquecido de un bloque no declara `alt`     |
 *
 * `link.broken` lleva tres motivos (`reason`, cada uno con su mensaje): `not-found`,
 * `redirect-dead-end` y `redirect-loop`. El identificador es el mismo porque quien edita arregla
 * los tres igual (corregir el enlace o la redirección).
 *
 * **Qué campos SEO se miran.** Vega no tiene un «grupo SEO» consultable: el grupo es solo
 * presentación (`fieldGroups`). Se resuelven por campo, así que un registro sin grupo SEO, o con
 * `fieldGroups` propios, se revisa igual:
 *   - descripción: `type.social.descriptionField` si el manifiesto declara `social`; si no, el
 *     campo llamado `description` (el del sembrado de `pages`);
 *   - imagen social: `type.social.imageField`, o el campo `socialImage`;
 *   - `noindex`: el campo `noindex`, solo si es `bool`.
 * Si una pieza no existe en el tipo, SU comprobación no corre y no genera hallazgo ni `skipped`:
 * no aplica (un `posts` sin SEO no recibe avisos de SEO).
 *
 * **Enlaces internos.** Se miran los `<a href>` de los campos `richtext` y el valor de los campos
 * `url`, tanto del registro como de sus bloques. El texto enriquecido guarda la RUTA del enlace a
 * una página (`/sobre-mi`), no su id (decidido el 1 oct 2026, `form/widgets/richtext-link.ts`),
 * así que se contrasta contra `pages.path` y `redirects.from` (`review-links.ts`: `?consulta`,
 * `#ancla` y barra final no cuentan; las mayúsculas sí). Casos resueltos:
 *   - enlace a la PROPIA página: vale (su ruta está entre las páginas);
 *   - enlace a una ruta que solo existe como ORIGEN de una redirección: NO es roto, el visitante
 *     llega. Se sigue la cadena; solo avisa si acaba en una ruta propia inexistente
 *     (`redirect-dead-end`) o en bucle (`redirect-loop`). Una redirección a una URL externa vale;
 *   - ruta con página Y redirección: gana la página (como en `planRedirect`);
 *   - destino en BORRADOR: `link.draft-target` (la regla de lectura del sembrado esconde los
 *     borradores al público, así que el visitante vería un 404). Un tipo sin `statusField` cuenta
 *     como publicado;
 *   - páginas con ruta por idioma: valen las rutas de todos los idiomas.
 *
 * **Imágenes sin alt.** Un bloque llega a sus imágenes por columnas `relation` a `vega_media`
 * (en el modo heterogéneo, los campos `source: 'record'` de `blockTypes` con widget `relation`:
 * `image`, `images`; en el homogéneo, las columnas `relation` del tipo hijo cuyo `target` es
 * `vega_media`). El alt vive en la ficha del medio (`vega_media.alt`) y la regla es la de siempre
 * (`mediaMissingAlt`): imagen sin `alt` o con solo espacios. NO existe el concepto «decorativa»
 * en la biblioteca: un medio sin alt cuenta como sin alt. Sí existe dentro del texto enriquecido,
 * donde `alt=""` EXPLÍCITO es decorativa (`RichtextImageDialog.svelte`); por eso
 * `media.alt-missing-inline` solo avisa cuando la `<img>` no trae el atributo.
 *
 * **Qué NO comprueba** (a propósito, el encargo no lo nombra):
 *   - enlaces externos (`https:`, `mailto:`, `tel:`), ni que respondan;
 *   - que exista el ancla (`#equipo`) dentro de la página destino;
 *   - enlaces dentro de campos `markdown`, rutas relativas sin `/` y enlaces de otros idiomas del
 *     sitio construido; tampoco el contenido del sitio YA construido (solo lo guardado en Vega);
 *   - ortografía, longitud del título, calidad de la descripción, tamaño o peso de la imagen social;
 *   - que la imagen social exista aún en la biblioteca, ni su alt;
 *   - alt de campos `file` (no tienen dónde guardarlo: `FileInput.svelte`), de la imagen social ni
 *     de campos del registro que no son un bloque;
 *   - una imagen de bloque cuya ficha no se cargó (borrada o ilegible): sin dato, sin aviso.
 *
 * **Umbrales y su motivo.**
 *   - `DESCRIPTION_LONG_AT = 160` caracteres: DECISIÓN MÍA, no medida. Google no publica un límite
 *     en caracteres: recorta por ancho en píxeles, y 155-160 caracteres es la cifra de convención
 *     para escritorio. Se prefiere 160 a un número exacto para no dar falsos avisos; es
 *     sobreescribible con `options.descriptionLongAt`. Es menor que el `max: 300` de la columna
 *     `pages.description` (`site-seeding.ts`), que es un tope de datos, no de SEO.
 *   - `MAX_REDIRECT_HOPS = 10` (`review-links.ts`): pasados 10 saltos se trata como bucle.
 *   - Longitud contada en unidades de texto de JavaScript tras `trim()`.
 *
 * **Decisiones de producto resueltas por defecto (MÍAS, a confirmar por David):**
 *   1. Todo son avisos; nada bloquea. 2. Descripción larga = más de 160. 3. Ruta que solo es
 *   origen de redirección = válida (no rota). 4. Destino en borrador = aviso aparte. 5. `url` de
 *   campos cuenta como enlace interno si empieza por `/`. 6. `noindex` marcado se avisa siempre,
 *   también en una página que el equipo quiso excluir a propósito: la revisión no puede saber la
 *   intención y el texto del aviso lo dice sin dar la acción por mala. 7. Una imagen del texto
 *   enriquecido sin atributo `alt` se avisa; con `alt=""` se da por decorativa.
 *
 * **Entradas que el llamador debe cuidar.** `record` y `blocks` son lo que se pase: la revisión no
 * distingue lo guardado de lo que se está editando. `pages` es TODO el sitio, no solo el registro:
 * si el registro revisado cambió de ruta sin guardar, sus enlaces a sí mismo se juzgan contra la
 * ruta guardada. `blocks` llega ya ordenado (como `blocks-state`).
 */

import type { DictKey } from '$lib/i18n';
import type { FieldValue, JsonValue, RecordId, VegaRecord } from '$lib/backend/types';
import type {
	ContentModel,
	ResolvedBlockType,
	ResolvedBlocksConfig,
	ResolvedContentType,
	WidgetId
} from '$lib/model/types';
import { isPlainObject } from '$lib/is-plain-object';
import { mediaMissingAlt } from '$lib/media/media-card';
import type { MediaItemView } from '$lib/media/media-item';
import {
	buildLinkTargets,
	extractAnchorHrefs,
	extractImages,
	normalizeSitePath,
	resolvePath,
	type LinkTargets,
	type ReviewPage,
	type ReviewRedirect
} from './review-links';

export type { ReviewPage, ReviewRedirect } from './review-links';

// ————— Vocabulario —————

/** Identificadores estables de las comprobaciones. Viajan a la interfaz y a los tests: no se renombran. */
export type ReviewCheckId =
	| 'seo.description-empty'
	| 'seo.description-long'
	| 'seo.social-image-missing'
	| 'seo.noindex'
	| 'link.broken'
	| 'link.draft-target'
	| 'media.alt-missing'
	| 'media.alt-missing-inline';

/** `'warning'` informa; `'error'` está reservado para un bloqueo futuro (hoy ninguna comprobación lo usa). */
export type ReviewSeverity = 'warning' | 'error';

/** Gravedad de cada comprobación. POR DEFECTO TODO SON AVISOS (ver la cabecera). */
export const CHECK_SEVERITY: Readonly<Record<ReviewCheckId, ReviewSeverity>> = {
	'seo.description-empty': 'warning',
	'seo.description-long': 'warning',
	'seo.social-image-missing': 'warning',
	'seo.noindex': 'warning',
	'link.broken': 'warning',
	'link.draft-target': 'warning',
	'media.alt-missing': 'warning',
	'media.alt-missing-inline': 'warning'
};

/** Descripción «larga»: más de esto avisa (ver «Umbrales» en la cabecera). */
export const DESCRIPTION_LONG_AT = 160;

/** Dónde está lo que se avisa. Las etiquetas ya van resueltas para que la interfaz no necesite el modelo. */
export type ReviewTarget =
	| { kind: 'field'; field: string; label: string }
	| {
			kind: 'block';
			blockId: RecordId;
			/** Nombre del tipo de bloque (`hero`…), o `null` en un bloque homogéneo. */
			blockType: string | null;
			/** Etiqueta legible del tipo de bloque (o del tipo hijo en modo homogéneo). */
			blockLabel: string;
			/** Posición 1-based en la lista de bloques. */
			position: number;
			field: string;
			label: string;
	  };

export interface ReviewFinding {
	/** Único dentro de un resultado: `<check>:<destino>:<n>`. Sirve de clave de lista. */
	id: string;
	check: ReviewCheckId;
	severity: ReviewSeverity;
	target: ReviewTarget;
	/** Clave i18n del mensaje (es/en en `$lib/i18n`). */
	messageKey: DictKey;
	/** Valores de `{param}` del mensaje. */
	params: Record<string, string | number>;
	/** Solo en `link.broken`: por qué. */
	reason?: 'not-found' | 'redirect-dead-end' | 'redirect-loop';
}

export interface ReviewResult {
	findings: ReviewFinding[];
	/**
	 * Comprobaciones que APLICABAN pero no pudieron correr por falta de datos (la carga de páginas,
	 * redirecciones o medios falló o no estaba permitida). La interfaz lo dice en vez de enseñar
	 * un «todo bien» que no se midió.
	 */
	skipped: ReviewCheckId[];
}

/** Datos ya cargados; `null` = «no se pudo cargar», que NO es lo mismo que «no hay». */
export interface ReviewInput {
	/** Tipo del registro revisado. */
	type: ResolvedContentType;
	record: VegaRecord;
	/** Lo que la revisión necesita del modelo: todos los tipos y el vocabulario de bloques. */
	model: Pick<ContentModel, 'types' | 'blockTypes'>;
	/** Bloques del registro, en orden. `[]` si el tipo no tiene bloques. */
	blocks: readonly VegaRecord[];
	/** Todas las páginas del sitio (con su ruta y su estado), o `null` si no se pudieron leer. */
	pages: readonly ReviewPage[] | null;
	/** Redirecciones: `[]` si el proyecto no tiene la colección, `null` si existe y no se pudo leer. */
	redirects: readonly ReviewRedirect[] | null;
	/** Fichas de `vega_media` por id (`toMediaItemView`), o `null` si no se pudieron leer. */
	media: ReadonlyMap<RecordId, MediaItemView> | null;
	options?: { descriptionLongAt?: number };
}

// ————— Campos que se revisan —————

/** Colección de la biblioteca de medios: destino de las relaciones de imagen de un bloque. */
const MEDIA_COLLECTION = 'vega_media';

/** Un campo con su valor, ya localizado (en el registro o dentro de un bloque). */
interface FieldSite {
	name: string;
	label: string;
	widget: WidgetId;
	value: FieldValue | JsonValue | undefined;
	/** `true` si el campo es una relación a la biblioteca de medios. */
	isMediaRelation: boolean;
}

/** Un bloque con los campos que se pueden revisar. */
interface BlockSites {
	record: VegaRecord;
	blockType: string | null;
	blockLabel: string;
	position: number;
	sites: FieldSite[];
}

function recordSites(type: ResolvedContentType, record: VegaRecord): FieldSite[] {
	return type.fields
		.filter((field) => !field.hidden)
		.map((field) => ({
			name: field.name,
			label: field.label,
			widget: field.widget,
			value: record.values[field.name],
			isMediaRelation: false
		}));
}

/**
 * Campos de un bloque. Modo heterogéneo (`typeField` + `dataField`): los del tipo de bloque que
 * nombra el registro, leyendo `data` o la columna según `source`. Homogéneo: los campos del tipo
 * hijo. Un bloque de un tipo que el vocabulario no conoce no aporta campos (no hay forma de saber
 * qué son).
 */
function blockSites(
	block: VegaRecord,
	position: number,
	config: ResolvedBlocksConfig,
	childType: ResolvedContentType | undefined,
	blockTypes: readonly ResolvedBlockType[]
): BlockSites {
	if (config.typeField !== null && config.dataField !== null) {
		const rawType = block.values[config.typeField];
		const typeName = typeof rawType === 'string' ? rawType : null;
		const blockType = blockTypes.find((candidate) => candidate.name === typeName);
		const data: Record<string, unknown> = isPlainObject(block.values[config.dataField])
			? (block.values[config.dataField] as Record<string, unknown>)
			: {};
		return {
			record: block,
			blockType: typeName,
			blockLabel: blockType?.label ?? typeName ?? block.id,
			position,
			sites: (blockType?.fields ?? []).map((field) => ({
				name: field.name,
				label: field.label,
				widget: field.widget,
				value: (field.source === 'record' ? block.values[field.name] : data[field.name]) as
					FieldValue | JsonValue | undefined,
				isMediaRelation: field.source === 'record' && field.widget === 'relation'
			}))
		};
	}
	return {
		record: block,
		blockType: null,
		blockLabel: childType?.labelSingular ?? config.collection,
		position,
		sites: (childType?.fields ?? [])
			.filter((field) => !field.hidden)
			.map((field) => ({
				name: field.name,
				label: field.label,
				widget: field.widget,
				value: block.values[field.name],
				isMediaRelation:
					field.schema.type === 'relation' && field.schema.target === MEDIA_COLLECTION
			}))
	};
}

function collectBlockSites(input: Pick<ReviewInput, 'type' | 'model' | 'blocks'>): BlockSites[] {
	const config = input.type.blocks;
	if (!config) return [];
	const childType = input.model.types.find((candidate) => candidate.name === config.collection);
	return input.blocks.map((block, index) =>
		blockSites(block, index + 1, config, childType, input.model.blockTypes)
	);
}

/** Ids de medios que referencian los bloques: lo que la carga necesita pedir a `vega_media`. */
export function collectMediaIds(input: Pick<ReviewInput, 'type' | 'model' | 'blocks'>): RecordId[] {
	const ids = new Set<RecordId>();
	for (const block of collectBlockSites(input)) {
		for (const site of block.sites) {
			if (site.isMediaRelation) for (const id of idsOf(site.value)) ids.add(id);
		}
	}
	return [...ids];
}

/** Ids de un valor de relación: `'abc'` o `['abc', 'def']`; vacío = ninguno. */
function idsOf(value: unknown): string[] {
	if (typeof value === 'string') return value === '' ? [] : [value];
	if (Array.isArray(value))
		return value.filter((v): v is string => typeof v === 'string' && v !== '');
	return [];
}

function isEmptyValue(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

// ————— Comprobaciones —————

class Collector {
	readonly findings: ReviewFinding[] = [];
	private readonly counters = new Map<string, number>();

	add(
		check: ReviewCheckId,
		target: ReviewTarget,
		messageKey: DictKey,
		params: Record<string, string | number> = {},
		reason?: ReviewFinding['reason']
	): void {
		const where =
			target.kind === 'field' ? `f.${target.field}` : `b.${target.blockId}.${target.field}`;
		const slot = `${check}:${where}`;
		const n = (this.counters.get(slot) ?? 0) + 1;
		this.counters.set(slot, n);
		this.findings.push({
			id: `${slot}:${n}`,
			check,
			severity: CHECK_SEVERITY[check],
			target,
			messageKey,
			params,
			...(reason ? { reason } : {})
		});
	}
}

/** Piezas SEO que el tipo tiene (ver «Qué campos SEO se miran»). `null` = no aplica. */
function seoFields(type: ResolvedContentType): {
	description: string | null;
	image: string | null;
	noindex: string | null;
} {
	const has = (name: string) => type.fields.some((field) => field.name === name);
	const description = type.social?.descriptionField ?? (has('description') ? 'description' : null);
	const image = type.social?.imageField ?? (has('socialImage') ? 'socialImage' : null);
	const noindexField = type.fields.find((field) => field.name === 'noindex');
	return {
		description,
		image,
		noindex: noindexField?.schema.type === 'bool' ? 'noindex' : null
	};
}

function fieldTarget(type: ResolvedContentType, name: string): ReviewTarget {
	const field = type.fields.find((candidate) => candidate.name === name);
	return { kind: 'field', field: name, label: field?.label ?? name };
}

/** Quita las etiquetas HTML y decodifica `&nbsp;` y compañía lo justo para contar caracteres. */
function stripHtml(value: string): string {
	if (!value.includes('<')) return value;
	return value
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'");
}

function checkSeo(input: ReviewInput, out: Collector): void {
	const { type, record } = input;
	const fields = seoFields(type);
	const max = input.options?.descriptionLongAt ?? DESCRIPTION_LONG_AT;

	if (fields.description !== null) {
		const target = fieldTarget(type, fields.description);
		const raw = record.values[fields.description];
		// Texto enriquecido: la longitud (y el «vacío») se cuentan sin etiquetas HTML.
		const text = typeof raw === 'string' ? stripHtml(raw).trim() : '';
		if (text === '') {
			out.add('seo.description-empty', target, 'review.seo.descriptionEmpty');
		} else if (text.length > max) {
			out.add('seo.description-long', target, 'review.seo.descriptionLong', {
				length: text.length,
				max
			});
		}
	}
	if (fields.image !== null && isEmptyValue(record.values[fields.image])) {
		out.add(
			'seo.social-image-missing',
			fieldTarget(type, fields.image),
			'review.seo.socialImageMissing'
		);
	}
	if (fields.noindex !== null && record.values[fields.noindex] === true) {
		out.add('seo.noindex', fieldTarget(type, fields.noindex), 'review.seo.noindex');
	}
}

/** Enlaces internos (`href`) que lleva un campo: `<a>` de un richtext, o el valor de un `url`. */
function internalHrefs(site: FieldSite): string[] {
	if (typeof site.value !== 'string' || site.value === '') return [];
	const raw =
		site.widget === 'richtext'
			? extractAnchorHrefs(site.value)
			: site.widget === 'url'
				? [site.value]
				: [];
	return raw.filter((href) => normalizeSitePath(href) !== null);
}

function checkLinks(
	site: FieldSite,
	target: ReviewTarget,
	targets: LinkTargets,
	out: Collector
): void {
	for (const href of internalHrefs(site)) {
		const path = normalizeSitePath(href);
		if (path === null) continue;
		const result = resolvePath(path, targets);
		switch (result.status) {
			case 'ok':
				break;
			case 'draft':
				out.add('link.draft-target', target, 'review.link.draftTarget', { href });
				break;
			case 'not-found':
				out.add('link.broken', target, 'review.link.notFound', { href }, 'not-found');
				break;
			case 'redirect-dead-end':
				out.add(
					'link.broken',
					target,
					'review.link.redirectDeadEnd',
					{ href, to: result.to },
					'redirect-dead-end'
				);
				break;
			case 'redirect-loop':
				out.add('link.broken', target, 'review.link.redirectLoop', { href }, 'redirect-loop');
				break;
		}
	}
}

function checkAlt(
	site: FieldSite,
	target: ReviewTarget,
	media: ReadonlyMap<RecordId, MediaItemView>,
	out: Collector
): void {
	if (site.isMediaRelation) {
		for (const id of idsOf(site.value)) {
			const item = media.get(id);
			if (item && mediaMissingAlt(item)) {
				out.add('media.alt-missing', target, 'review.media.altMissing', { file: item.fileName });
			}
		}
	}
	if (site.widget === 'richtext' && typeof site.value === 'string') {
		for (const image of extractImages(site.value)) {
			if (image.alt === null) {
				out.add('media.alt-missing-inline', target, 'review.media.altMissingInline', {
					file: image.src.split('/').pop()?.split('?')[0] ?? ''
				});
			}
		}
	}
}

/**
 * Las páginas del sitio tal como quedarán al publicar ESTE registro: si el registro revisado es una
 * de ellas (mismo tipo e id), cuenta como publicada y con la ruta que trae `record` (puede estar
 * sin guardar), no con la guardada. Sin esto, un borrador que enlaza a sí mismo (`/mi-pagina#arriba`)
 * saldría como «enlace a un borrador».
 */
function pagesAsPublished(input: ReviewInput): readonly ReviewPage[] | null {
	const { pages, type, record } = input;
	if (pages === null) return null;
	const own = (page: ReviewPage): boolean => page.type === type.name && page.id === record.id;
	if (!pages.some(own)) return pages;
	const columns = type.page
		? type.page.localizedPath
			? Object.values(type.page.localizedPath.fields)
			: [type.page.pathField]
		: ['path'];
	const mine: ReviewPage[] = [];
	for (const column of columns) {
		const path = record.values[column];
		if (typeof path === 'string' && path.trim() !== '') {
			mine.push({ type: type.name, id: record.id, path, published: true });
		}
	}
	return [...pages.filter((page) => !own(page)), ...mine];
}

/**
 * Revisa un registro (ver la cabecera). Puro y determinista: mismos datos, mismo resultado y mismo
 * orden (SEO; enlaces del registro y de sus bloques en orden de lectura; imágenes de los bloques).
 */
export function reviewRecord(input: ReviewInput): ReviewResult {
	const out = new Collector();
	const skipped: ReviewCheckId[] = [];
	const blocks = collectBlockSites(input);

	checkSeo(input, out);

	// Enlaces: sin páginas, o con redirecciones ilegibles, no se puede decir «rota» sin mentir.
	const linkSites: Array<{ site: FieldSite; target: ReviewTarget }> = [
		...recordSites(input.type, input.record).map((site) => ({
			site,
			target: { kind: 'field', field: site.name, label: site.label } as ReviewTarget
		})),
		...blocks.flatMap((block) =>
			block.sites.map((site) => ({ site, target: blockTarget(block, site) }))
		)
	];
	const hasLinks = linkSites.some(({ site }) => internalHrefs(site).length > 0);
	const pages = pagesAsPublished(input);
	const targets =
		pages !== null && input.redirects !== null ? buildLinkTargets(pages, input.redirects) : null;
	if (hasLinks && targets === null) skipped.push('link.broken', 'link.draft-target');

	const mediaSites = blocks.some((block) =>
		block.sites.some((site) => site.isMediaRelation && idsOf(site.value).length > 0)
	);
	if (mediaSites && input.media === null) skipped.push('media.alt-missing');

	// Se recorre en el orden de lectura de la página: registro y luego cada bloque.
	for (const { site, target } of linkSites) {
		if (targets !== null) checkLinks(site, target, targets, out);
	}
	for (const block of blocks) {
		for (const site of block.sites) {
			checkAlt(site, blockTarget(block, site), input.media ?? new Map(), out);
		}
	}
	return { findings: out.findings, skipped };
}

function blockTarget(block: BlockSites, site: FieldSite): ReviewTarget {
	return {
		kind: 'block',
		blockId: block.record.id,
		blockType: block.blockType,
		blockLabel: block.blockLabel,
		position: block.position,
		field: site.name,
		label: site.label
	};
}
