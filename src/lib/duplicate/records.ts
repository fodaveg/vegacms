/**
 * Duplicado de páginas y bloques (y, desde el Lote 12, de cualquier registro desde el listado:
 * `duplicateRecord`) sobre el puerto genérico. La copia nunca arrastra campos
 * readonly ni `file`: un FileRef pertenece al registro original y los adaptadores rechazan
 * reutilizarlo al crear otro. Las relaciones y el JSON sí se clonan en profundidad.
 *
 * La copia de un tipo publicable (`statusField`) nace SIEMPRE en borrador y sin `publishAtField`:
 * duplicar una página publicada no puede publicar una copia a medias en la ruta `-copia`, y una
 * fecha programada copiada haría que `vegaschedule` publicara la copia sin que nadie la revisara.
 * Un `override` explícito del llamador sigue ganando.
 *
 * El rollback de `duplicatePage` es best-effort: el puerto no tiene transacciones, y el error
 * original manda aunque la limpieza también falle.
 */
import type { BackendPort } from '$lib/backend/port';
import type { RecordInput, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import type { ResolvedContentType } from '$lib/model/types';

const PAGE_SIZE = 200;
const MAX_COPY_SUFFIX = 10_000;

export function duplicateInput(
	type: ResolvedContentType,
	record: VegaRecord,
	overrides: RecordInput = {}
): RecordInput {
	const input: RecordInput = {};
	for (const field of type.fields) {
		if (field.schema.readonly) continue;
		if (field.schema.type === 'file' || field.schema.type === 'unsupported') continue;
		if (!(field.name in record.values)) continue;
		input[field.name] = structuredClone(record.values[field.name]);
	}
	// `statusField` solo se resuelve si es un select con `draft`+`published`, así que `draft` existe.
	// Con el campo readonly no se escribe (el servidor decide el valor inicial).
	const writable = (name: string | null | undefined): name is string =>
		!!name && type.fields.some((f) => f.name === name && !f.schema.readonly);
	if (writable(type.statusField)) input[type.statusField] = 'draft';
	if (writable(type.statusField) && writable(type.publishAtField)) input[type.publishAtField] = '';
	return { ...input, ...overrides };
}

function copyCandidate(original: string, attempt: number): string {
	const suffix = attempt === 1 ? 'copia' : `copia-${attempt}`;
	// Sin valor original no hay nada a lo que colgar el sufijo: el candidato ES el sufijo (ver
	// `duplicateRecord`, campo `text` único vacío).
	if (original.trim() === '') return suffix;
	if (original === '/') return `/${suffix}`;
	const withoutTrailingSlash = original.replace(/\/+$/, '');
	return `${withoutTrailingSlash}-${suffix}`;
}

async function availableCopyValue(
	port: BackendPort,
	type: string,
	field: string,
	original: string
): Promise<string> {
	for (let attempt = 1; attempt <= MAX_COPY_SUFFIX; attempt += 1) {
		const candidate = copyCandidate(original, attempt);
		const page = await port.list(type, {
			perPage: 1,
			filter: { kind: 'cond', field, op: 'eq', value: candidate }
		});
		if (page.totalItems === 0) return candidate;
	}
	throw VegaError.validation({
		[field]: {
			code: 'duplicate',
			message: `No se encontró un valor libre para duplicar "${original}".`
		}
	});
}

async function listAllChildren(
	port: BackendPort,
	collection: string,
	parentField: string,
	parentId: string,
	orderField: string
): Promise<VegaRecord[]> {
	const records: VegaRecord[] = [];
	let pageNumber = 1;
	for (;;) {
		const page = await port.list(collection, {
			page: pageNumber,
			perPage: PAGE_SIZE,
			filter: { kind: 'cond', field: parentField, op: 'eq', value: parentId },
			sort: [{ field: orderField, dir: 'asc' }]
		});
		records.push(...page.items);
		if (pageNumber >= page.totalPages) return records;
		pageNumber += 1;
	}
}

interface DuplicatePageResult {
	page: VegaRecord;
	blocks: VegaRecord[];
}

export function canDuplicatePage(
	pageType: ResolvedContentType,
	modelTypes: readonly ResolvedContentType[]
): boolean {
	if (!pageType.page || !pageType.permissions.create || !pageType.permissions.list) return false;
	const blocks = pageType.blocks;
	if (!blocks) return true;
	const childType = modelTypes.find((type) => type.name === blocks.collection);
	return childType?.permissions.create === true && childType.permissions.list;
}

export function canDuplicateBlock(blockType: ResolvedContentType): boolean {
	// Insertar la copia justo debajo no termina en el `create`: también reescribe los orderField
	// afectados. Sin ambos permisos se dejaría una copia parcial al final de la lista.
	return blockType.permissions.create && blockType.permissions.update;
}

export async function duplicatePage(
	port: BackendPort,
	pageType: ResolvedContentType,
	source: VegaRecord,
	modelTypes: readonly ResolvedContentType[]
): Promise<DuplicatePageResult> {
	if (!pageType.page) throw VegaError.backend(`"${pageType.name}" no es una colección de páginas.`);
	if (!pageType.permissions.create) {
		throw VegaError.forbidden(`No tienes permiso para duplicar ${pageType.labelSingular}.`);
	}
	if (!pageType.permissions.list) {
		throw VegaError.forbidden(`No tienes permiso para listar ${pageType.label}.`);
	}

	const blocks = pageType.blocks;
	const childType = blocks
		? (modelTypes.find((type) => type.name === blocks.collection) ?? null)
		: null;
	if (blocks && !childType) {
		throw VegaError.backend(`La colección de bloques "${blocks.collection}" no está disponible.`);
	}
	if (childType && !childType.permissions.create) {
		throw VegaError.forbidden(`No tienes permiso para duplicar ${childType.label}.`);
	}
	if (childType && !childType.permissions.list) {
		throw VegaError.forbidden(`No tienes permiso para listar ${childType.label}.`);
	}

	// Leer los hijos ANTES de crear nada: un fallo de lectura no deja una página huérfana.
	const sourceBlocks =
		blocks && childType
			? await listAllChildren(
					port,
					childType.name,
					blocks.parentField,
					source.id,
					blocks.orderField
				)
			: [];

	const input = duplicateInput(pageType, source);
	// `page.pathField` puede ser una columna física (el caso de siempre) o, con ruta BILINGÜE
	// (`localizedPath`, encargo "la ruta pública de una página puede ser bilingüe"), el nombre
	// LÓGICO de un campo traducible — que no es columna de `input`, así que forzar unicidad sobre
	// él sería un no-op silencioso. Con `localizedPath` se fuerza en cambio CADA columna física por
	// idioma (misma razón que el aviso `page-path-not-unique` por columna: dos páginas pueden
	// colisionar en la ruta EN sin colisionar en la ES).
	const uniqueTextFields = new Set<string>(
		pageType.page.localizedPath
			? Object.values(pageType.page.localizedPath.fields)
			: [pageType.page.pathField]
	);
	if (pageType.slugField) uniqueTextFields.add(pageType.slugField);
	for (const field of pageType.fields) {
		if (field.schema.type === 'text' && field.schema.unique) uniqueTextFields.add(field.name);
	}
	for (const field of uniqueTextFields) {
		const original = input[field];
		if (typeof original !== 'string' || original.trim() === '') continue;
		input[field] = await availableCopyValue(port, pageType.name, field, original);
	}

	const createdPage = await port.create(pageType.name, input);
	const createdBlocks: VegaRecord[] = [];
	try {
		if (blocks && childType) {
			for (const sourceBlock of sourceBlocks) {
				const created = await port.create(
					childType.name,
					duplicateInput(childType, sourceBlock, {
						[blocks.parentField]: createdPage.id
					})
				);
				createdBlocks.push(created);
			}
		}
	} catch (err) {
		// El puerto no ofrece transacciones multi-colección. Rollback best-effort para no dejar una
		// página a medio clonar; el error original manda aunque alguna limpieza también falle.
		// Se usa `port.delete` (no un borrado crudo): con `withRevisions` cada borrado deja su revisión
		// de papelera, y es ese decorador quien la retira si el borrado real falla.
		await Promise.allSettled(createdBlocks.map((record) => port.delete(record.type, record.id)));
		await port.delete(createdPage.type, createdPage.id).catch(() => {});
		throw err;
	}

	return { page: createdPage, blocks: createdBlocks };
}

/**
 * ¿Se ofrece «Duplicar» en la fila del listado para `type`? (Lote 12, lámina 7, decisión de
 * David: el menú de fila lleva Duplicar además de Borrar.) Una colección de páginas sigue las
 * reglas de `canDuplicatePage` (sus bloques también se clonan); cualquier otra, con permiso de
 * crear y de listar (`availableCopyValue` consulta la colección para encontrar un valor libre).
 */
export function canDuplicateRecord(
	type: ResolvedContentType,
	modelTypes: readonly ResolvedContentType[]
): boolean {
	if (type.page) return canDuplicatePage(type, modelTypes);
	return type.permissions.create && type.permissions.list;
}

/**
 * Duplica un registro CUALQUIERA desde el listado (Lote 12, lámina 7). Para una colección de
 * páginas delega en `duplicatePage` (página + bloques, con el mismo rollback); para el resto, la
 * regla campo a campo es:
 *
 * - `readonly` (`id`, autodate `created`/`updated`, cualquier campo que gestione el servidor): no
 *   se escribe, el servidor pone el suyo (`duplicateInput`).
 * - `file`: no se copia. Un `FileRef` pertenece al registro original y los adaptadores rechazan
 *   reutilizarlo en otro `create`; la copia nace sin ficheros (`duplicateInput`).
 * - `unsupported`: no se copia (`duplicateInput`).
 * - `statusField`: `draft`. Duplicar algo publicado no puede publicar una copia a medias.
 *   `publishAtField`: vacío, para que `vegaschedule` no publique la copia sin revisarla
 *   (`duplicateInput`, mismo criterio que el editor).
 * - `slugField` y cualquier `text` con índice único: el primer valor libre con sufijo `-copia`,
 *   `-copia-2`… (`availableCopyValue`, igual que la ruta de una página). Si el original está
 *   VACÍO también recibe valor (`copia`, `copia-2`…): el índice único de `text` que crea Vega es
 *   completo (`collectionUniqueIndexes`), así que dos registros con '' colisionan y la copia no
 *   puede nacer vacía como el original.
 * - Cualquier OTRO campo con índice único (`email`, `url`, `number`…): no se copia. Un sufijo
 *   rompería su formato y repetir el valor fallaría en el servidor; se deja vacío (el índice de
 *   `email`/`url` es parcial: el vacío no colisiona) y, si el campo es obligatorio, el `create`
 *   devuelve la validación del servidor tal cual (honesto, no se inventa un valor).
 * - `relation`, `select`, `json`, `richtext`, `bool`, `number`, `date`: se clonan tal cual
 *   (una copia que apunta a los mismos autores o etiquetas es lo que se espera).
 *
 * Devuelve el registro creado (la página, si era una colección de páginas).
 */
export async function duplicateRecord(
	port: BackendPort,
	type: ResolvedContentType,
	source: VegaRecord,
	modelTypes: readonly ResolvedContentType[]
): Promise<VegaRecord> {
	if (type.page) return (await duplicatePage(port, type, source, modelTypes)).page;
	if (!type.permissions.create) {
		throw VegaError.forbidden(`No tienes permiso para duplicar ${type.labelSingular}.`);
	}
	if (!type.permissions.list) {
		throw VegaError.forbidden(`No tienes permiso para listar ${type.label}.`);
	}

	const input = duplicateInput(type, source);
	const uniqueTextFields = new Set<string>();
	if (type.slugField) uniqueTextFields.add(type.slugField);
	for (const field of type.fields) {
		if (field.schema.readonly || !field.schema.unique) continue;
		if (field.schema.type === 'text') uniqueTextFields.add(field.name);
		else delete input[field.name];
	}
	for (const field of uniqueTextFields) {
		const original = input[field];
		input[field] = await availableCopyValue(
			port,
			type.name,
			field,
			typeof original === 'string' ? original : ''
		);
	}
	return port.create(type.name, input);
}
