/**
 * Duplicado de páginas y bloques sobre el puerto genérico. La copia nunca arrastra campos
 * readonly ni `file`: un FileRef pertenece al registro original y los adaptadores rechazan
 * reutilizarlo al crear otro. Las relaciones y el JSON sí se clonan en profundidad.
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
	return { ...input, ...overrides };
}

function copyCandidate(original: string, attempt: number): string {
	const suffix = attempt === 1 ? 'copia' : `copia-${attempt}`;
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

export interface DuplicatePageResult {
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
		await Promise.allSettled(createdBlocks.map((record) => port.delete(record.type, record.id)));
		await port.delete(createdPage.type, createdPage.id).catch(() => {});
		throw err;
	}

	return { page: createdPage, blocks: createdBlocks };
}
