/**
 * `load-review-data.ts`: la carga de datos de la revisión antes de publicar. Fina a propósito: solo
 * lee con el puerto (`BackendPort.list`) lo que `reviewRecord` (`publish-review.ts`) necesita y se
 * lo entrega en la forma que espera; no decide nada. Todas las lecturas son SOLO lectura.
 *
 * **Qué lee**
 *   - bloques del registro: la misma consulta que `blocks-state.svelte.ts` (filtro por
 *     `parentField`, orden por `orderField`, 200 por página; aquí además se pagina por si acaso).
 *     Si falla, la carga RECHAZA: sin bloques no hay revisión de bloques que ofrecer y esconderlo
 *     sería mentir;
 *   - páginas: TODAS las de cada colección con `page` en el manifiesto (y la `pages` del sembrado,
 *     que no lo declara: ver `pageSources`), solo con las columnas de ruta y el `statusField`
 *     (proyección `fields`), paginando de 200 en 200;
 *   - redirecciones: la colección `redirects` completa (`from`, `to`) si el proyecto la tiene;
 *   - medios: solo las fichas (`alt`, `file`) de los ids que citan los bloques, en tandas de 100.
 *
 * **Fallo de lectura ≠ vacío.** Páginas, redirecciones y medios degradan a `null` si su lectura
 * falla (permisos, red) o, en las páginas, si el modelo no dice de dónde salen: `reviewRecord` lo trata como «no se pudo comprobar» (`skipped`) en vez de
 * fabricar enlaces rotos. «El proyecto no tiene colección `redirects`» sí es `[]`: es un dato.
 *
 * **Estado de una página**: la del `statusField` de su tipo (`published` = publicada); un tipo sin
 * `statusField` cuenta como publicado, igual que `RecordForm.svelte`.
 */

import type { BackendPort } from '$lib/backend/port';
import type { Query } from '$lib/backend/query';
import type { RecordId, VegaRecord } from '$lib/backend/types';
import { toMediaItemView, type MediaItemView } from '$lib/media/media-item';
import { REDIRECTS_COLLECTION } from '$lib/form/redirect-sync';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import {
	collectMediaIds,
	type ReviewInput,
	type ReviewPage,
	type ReviewRedirect
} from './publish-review';

/** Lo que `loadReviewData` entrega: la parte de `ReviewInput` que sale del puerto. */
export type ReviewData = Pick<ReviewInput, 'blocks' | 'pages' | 'redirects' | 'media'>;

const MEDIA_COLLECTION = 'vega_media';
const PER_PAGE = 200;
/** Tope de seguridad de páginas leídas por colección (200 × 50 = 10 000 registros). */
const MAX_PAGES = 50;
/** Ids por consulta `in` a `vega_media`. */
const MEDIA_CHUNK = 100;

/** Todos los registros de una consulta, página a página. */
async function listAll(
	port: Pick<BackendPort, 'list'>,
	collection: string,
	query: Query
): Promise<VegaRecord[]> {
	const found: VegaRecord[] = [];
	for (let page = 1; page <= MAX_PAGES; page += 1) {
		const result = await port.list(collection, { ...query, page, perPage: PER_PAGE });
		found.push(...result.items);
		if (page >= result.totalPages) break;
	}
	return found;
}

/** Columnas de ruta de un tipo de páginas: la física, o una por idioma con ruta localizada. */
export function pagePathColumns(type: ResolvedContentType): string[] {
	const page = type.page;
	if (!page) return [];
	if (page.localizedPath) return Object.values(page.localizedPath.fields);
	return [page.pathField];
}

/** Nombres que siembra `seedSiteProject` para las páginas del sitio (`site-seeding.ts`). */
const SEEDED_PAGES_COLLECTION = 'pages';
const SEEDED_PATH_COLUMN = 'path';

/**
 * De dónde salen las páginas: los tipos con `page` declarado en el manifiesto y, además, la
 * colección `pages` del sembrado si tiene su columna `path`. El segundo caso NO es un capricho: el
 * manifiesto inicial del sembrado (`site-seeding-manifest.json`) no declara `page`, así que en un
 * sitio recién sembrado ningún tipo cuenta como «de páginas» para el modelo y un loader que solo
 * mirase `page` no encontraría ninguna ruta. Vacío = no se sabe de dónde salen las páginas.
 */
function pageSources(
	model: Pick<ContentModel, 'types'>
): Array<{ type: ResolvedContentType; columns: string[] }> {
	const sources = model.types
		.map((type) => ({ type, columns: pagePathColumns(type) }))
		.filter((source) => source.columns.length > 0);
	const seeded = model.types.find(
		(type) =>
			type.name === SEEDED_PAGES_COLLECTION &&
			!sources.some((source) => source.type.name === type.name) &&
			type.schema.fields.some((field) => field.name === SEEDED_PATH_COLUMN && field.type === 'text')
	);
	if (seeded) sources.push({ type: seeded, columns: [SEEDED_PATH_COLUMN] });
	return sources;
}

async function loadPages(
	port: Pick<BackendPort, 'list'>,
	model: Pick<ContentModel, 'types'>
): Promise<ReviewPage[] | null> {
	const sources = pageSources(model);
	if (sources.length === 0) return null;
	const pages: ReviewPage[] = [];
	try {
		for (const { type, columns } of sources) {
			const fields = type.statusField === null ? columns : [...columns, type.statusField];
			const records = await listAll(port, type.name, { fields });
			for (const record of records) {
				const published =
					type.statusField === null ? true : record.values[type.statusField] === 'published';
				for (const column of columns) {
					const path = record.values[column];
					if (typeof path === 'string' && path.trim() !== '') {
						pages.push({ type: type.name, id: record.id, path, published });
					}
				}
			}
		}
	} catch {
		return null;
	}
	return pages;
}

async function loadRedirects(
	port: Pick<BackendPort, 'list'>,
	model: Pick<ContentModel, 'types'>
): Promise<ReviewRedirect[] | null> {
	const type = model.types.find((candidate) => candidate.name === REDIRECTS_COLLECTION);
	const names = new Set(type?.schema.fields.map((field) => field.name));
	if (type === undefined || !names.has('from') || !names.has('to')) return [];
	try {
		const records = await listAll(port, REDIRECTS_COLLECTION, { fields: ['from', 'to'] });
		return records.flatMap((record) => {
			const { from, to } = record.values;
			return typeof from === 'string' && typeof to === 'string' ? [{ from, to }] : [];
		});
	} catch {
		return null;
	}
}

async function loadMedia(
	port: Pick<BackendPort, 'list'>,
	ids: readonly RecordId[]
): Promise<Map<RecordId, MediaItemView> | null> {
	const media = new Map<RecordId, MediaItemView>();
	try {
		for (let start = 0; start < ids.length; start += MEDIA_CHUNK) {
			const chunk = ids.slice(start, start + MEDIA_CHUNK);
			const records = await listAll(port, MEDIA_COLLECTION, {
				filter: { kind: 'cond', field: 'id', op: 'in', value: chunk },
				fields: ['file', 'alt']
			});
			for (const record of records) media.set(record.id, toMediaItemView(record));
		}
	} catch {
		return null;
	}
	return media;
}

/**
 * Carga los datos para revisar `record` (de `type`). Ver la cabecera para qué lee y cómo degrada.
 * Rechaza solo si falla la lectura de los bloques del registro.
 */
export async function loadReviewData(
	port: Pick<BackendPort, 'list'>,
	model: Pick<ContentModel, 'types' | 'blockTypes'>,
	type: ResolvedContentType,
	record: VegaRecord
): Promise<ReviewData> {
	const config = type.blocks;
	const blocks = config
		? await listAll(port, config.collection, {
				filter: { kind: 'cond', field: config.parentField, op: 'eq', value: record.id },
				sort: [{ field: config.orderField, dir: 'asc' }]
			})
		: [];
	const mediaIds = collectMediaIds({ type, model, blocks });
	const [pages, redirects, media] = await Promise.all([
		loadPages(port, model),
		loadRedirects(port, model),
		loadMedia(port, mediaIds)
	]);
	return { blocks, pages, redirects, media };
}
