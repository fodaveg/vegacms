/** Miniaturas con propietario real y resolución de Medios acotada a cada consumidor. */
import type { BackendPort } from '$lib/backend/port';
import type { Field, FileRef, RecordId, ThumbSpec, VegaRecord } from '$lib/backend/types';
import { selectThumbSpec } from '$lib/backend/thumb-select';
import type { RelationThumbSource } from '$lib/model/relation-thumb';
import { chunkIds, fetchRecordsByIds, thumbRefOf } from '$lib/form/widgets/relation-search';
import { toMediaItemView } from './media-item';
import { isRasterMediaImage } from './media-image';

export interface RecordThumbnail {
	owner: Pick<VegaRecord, 'type' | 'id'>;
	field: string;
	ref: FileRef;
	thumbs?: readonly string[];
	alt: string;
}

/** Conserva el dueño de `file`; PDF y formatos que no sean raster nunca se renderizan como imagen. */
export function mediaRecordThumbnail(
	record: VegaRecord,
	file: Extract<Field, { type: 'file' }>
): RecordThumbnail | null {
	const item = toMediaItemView(record);
	if (record.type !== 'vega_media' || !isRasterMediaImage(item.fileRef)) return null;
	return {
		owner: { type: record.type, id: record.id },
		field: file.name,
		ref: item.fileRef!,
		thumbs: file.thumbs,
		alt: item.alt || item.title || item.fileName
	};
}

/** Una instancia por selector/tabla: deduplica en vuelo y limita la caché, sin retener errores. */
export class MediaThumbnailRecords {
	#cache = new Map<RecordId, VegaRecord>();
	#pending = new Map<RecordId, Promise<VegaRecord | undefined>>();
	#generation = 0;
	constructor(
		private port: Pick<BackendPort, 'list' | 'get'>,
		private limit = 200
	) {}

	/** Una recarga de filas invalida también peticiones anteriores y ficheros reemplazados. */
	clear(): void {
		this.#generation += 1;
		this.#cache.clear();
		this.#pending.clear();
	}

	/** Nueva página/búsqueda: relee ficheros ya resueltos y comparte los que siguen en vuelo. */
	refresh(): void {
		this.#cache.clear();
	}

	/** Los registros ya obtenidos (p. ej. el picker directo) no provocan una segunda consulta. */
	seed(records: readonly VegaRecord[]): void {
		for (const record of records) {
			if (record.type !== 'vega_media') continue;
			this.#cache.delete(record.id);
			this.#cache.set(record.id, record);
		}
		while (this.#cache.size > this.limit) this.#cache.delete(this.#cache.keys().next().value!);
	}

	/** Lotes de ids únicos; los permisos de listado y de lectura se respetan en el puerto. */
	async read(ids: RecordId[]): Promise<Map<RecordId, VegaRecord>> {
		const unique = [...new Set(ids)];
		const generation = this.#generation;
		const missing = unique.filter((id) => !this.#cache.has(id) && !this.#pending.has(id));
		for (const chunk of chunkIds(missing)) {
			const request = fetchRecordsByIds(this.port, 'vega_media', chunk).then(({ records }) => {
				if (generation === this.#generation) this.seed([...records.values()]);
				return records;
			});
			for (const id of chunk) {
				const result = request.then((records) => records.get(id)).catch(() => undefined);
				this.#pending.set(id, result);
				void result.finally(() => {
					if (this.#pending.get(id) === result) this.#pending.delete(id);
				});
			}
		}
		const entries = await Promise.all(
			unique.map(async (id) => {
				const record = this.#cache.get(id) ?? (await this.#pending.get(id));
				return [id, record] as const;
			})
		);
		return new Map(entries.filter((entry): entry is readonly [RecordId, VegaRecord] => !!entry[1]));
	}
}

/** Resuelve el fichero local o el medio relacionado, conservando el texto alternativo de la obra. */
export async function recordThumbnails(
	records: readonly VegaRecord[],
	source: RelationThumbSource | null,
	media: MediaThumbnailRecords
): Promise<Map<RecordId, RecordThumbnail>> {
	const result = new Map<RecordId, RecordThumbnail>();
	if (!source) return result;
	const related =
		source.kind === 'media'
			? await media.read(
					records.flatMap((record) => {
						const id = record.values[source.field.name];
						return typeof id === 'string' && id !== '' ? [id] : [];
					})
				)
			: null;
	for (const record of records) {
		let thumbnail: RecordThumbnail | null = null;
		if (source.kind === 'file') {
			const ref = thumbRefOf(record, source.field.name);
			if (ref)
				thumbnail = {
					owner: { type: record.type, id: record.id },
					field: source.field.name,
					ref,
					thumbs: source.field.thumbs,
					alt: ''
				};
		} else {
			const id = record.values[source.field.name];
			const asset = typeof id === 'string' ? related?.get(id) : undefined;
			if (asset) thumbnail = mediaRecordThumbnail(asset, source.file);
		}
		if (!thumbnail) continue;
		const alt = record.values.alt;
		const title = record.values.title;
		result.set(record.id, {
			...thumbnail,
			alt:
				typeof alt === 'string' && alt.trim()
					? alt
					: typeof title === 'string' && title.trim()
						? title
						: thumbnail.alt
		});
	}
	return result;
}

/** Toda URL pasa por el puerto con el propietario del binario, nunca el de la relación. */
export function recordThumbnailSrc(
	port: Pick<BackendPort, 'fileUrl' | 'capabilities'>,
	thumbnail: RecordThumbnail | null | undefined,
	requested: ThumbSpec
): string | null {
	if (!thumbnail) return null;
	try {
		return port.fileUrl(
			thumbnail.owner,
			thumbnail.field,
			thumbnail.ref,
			port.capabilities.thumbs ? { thumb: selectThumbSpec(requested, thumbnail.thumbs) } : undefined
		);
	} catch {
		return null;
	}
}
