/** Carpetas planas de organización interna; la biblioteca canónica sigue pudiendo crearse sola. */
import type { CollectionFieldSpec, CollectionSpec } from '$lib/backend/collections';
import type { BackendPort } from '$lib/backend/port';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { fetchAllPages } from '$lib/transfer/paginate';
import { VEGA_MEDIA_EDITOR_ACCESS_RULE } from './media-collection';
import {
	assertProjectEditorAuth,
	resolveProjectEditorCollection
} from '$lib/backend/project-editor';

export const VEGA_MEDIA_FOLDERS_COLLECTION: CollectionSpec = {
	projectEditorRules: true,
	name: 'vega_media_folders',
	listRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	viewRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	createRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	updateRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	deleteRule: VEGA_MEDIA_EDITOR_ACCESS_RULE,
	fields: [
		{ name: 'name', type: 'text', required: true, max: 80, unique: true },
		{ name: 'created', type: 'autodate' }
	]
};
export const VEGA_MEDIA_FOLDER_FIELD: CollectionFieldSpec = {
	name: 'folder',
	type: 'relation',
	target: 'vega_media_folders',
	multiple: false,
	cascadeDelete: false
};
export type MediaFoldersState = 'ready' | 'missing' | 'incompatible';
export interface MediaFolder {
	id: string;
	name: string;
}
export type MediaFolderFilter = string | null;

/** No adopta formas ajenas ni interpreta una relación múltiple o con cascada como carpeta. */
export function mediaFoldersState(types: readonly ContentType[]): MediaFoldersState {
	const folders = types.find((type) => type.name === 'vega_media_folders');
	const media = types.find((type) => type.name === 'vega_media');
	const name = folders?.fields.find((field) => field.name === 'name');
	const created = folders?.fields.find((field) => field.name === 'created');
	const folder = media?.fields.find((field) => field.name === 'folder');
	if (
		folders?.readonly ||
		(name && (name.type !== 'text' || !name.required || !name.unique || name.maxLength !== 80)) ||
		(created && (created.type !== 'date' || !created.readonly)) ||
		(folder &&
			(folder.type !== 'relation' ||
				folder.target !== 'vega_media_folders' ||
				folder.multiple ||
				folder.required ||
				folder.cascadeDelete))
	)
		return 'incompatible';
	return folders && media && name && created && folder ? 'ready' : 'missing';
}

/** Completa por adición y llamadas separadas; nunca cambia reglas ni campos existentes. */
export async function ensureMediaFolders(port: BackendPort): Promise<void> {
	await assertProjectEditorAuth(port);
	const types = await port.listContentTypes();
	if (mediaFoldersState(types) === 'incompatible')
		throw VegaError.backend('Las carpetas tienen un esquema incompatible. No se ha modificado.');
	if (!types.some((type) => type.name === 'vega_media'))
		throw VegaError.backend('La biblioteca de medios debe existir antes de completarla.');
	await port.ensureCollections([
		resolveProjectEditorCollection(VEGA_MEDIA_FOLDERS_COLLECTION, port)
	]);
	const present = types.find((type) => type.name === 'vega_media_folders');
	if (present) {
		const missing = VEGA_MEDIA_FOLDERS_COLLECTION.fields.filter(
			(field) => !present.fields.some((existing) => existing.name === field.name)
		);
		if (missing.length) await port.addCollectionFields('vega_media_folders', missing);
	}
	await port.addCollectionFields('vega_media', [VEGA_MEDIA_FOLDER_FIELD]);
}

/** Recorte y validación mínimos de nombre; la unicidad la decide el servidor. */
export function normalizeMediaFolderName(value: string): string {
	const name = value.trim();
	if (!name || name.length > 80)
		throw VegaError.validation({
			name: { code: 'vega_folder_name', message: 'El nombre debe tener entre 1 y 80 caracteres.' }
		});
	return name;
}

/** Carga todas las carpetas por cursor, sin el límite silencioso de una primera página de200. */
export async function loadMediaFolders(port: Pick<BackendPort, 'list'>): Promise<MediaFolder[]> {
	const { records } = await fetchAllPages(
		(query) => port.list('vega_media_folders', { ...query, fields: ['name'] }),
		undefined
	);
	return records
		.map((record) => ({ id: record.id, name: String(record.values.name ?? '') }))
		.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Mueve secuencialmente, corta en el primer fallo y permite conservar la selección pendiente. */
export async function moveSelectedMedia(
	port: Pick<BackendPort, 'update'>,
	ids: readonly string[],
	folder: string | null,
	onMoved: (id: string) => void
): Promise<{ moved: number; failure: unknown }> {
	let moved = 0;
	for (const id of ids) {
		try {
			await port.update('vega_media', id, { folder });
			onMoved(id);
			moved += 1;
		} catch (failure) {
			return { moved, failure };
		}
	}
	return { moved, failure: null };
}

export function mediaRecordFolder(record: VegaRecord): string | null {
	return typeof record.values.folder === 'string' && record.values.folder
		? record.values.folder
		: null;
}
