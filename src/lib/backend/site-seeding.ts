/**
 * Arranque de proyecto en un paso, deliberadamente sin UI ni migración.
 *
 * La frontera es por PIEZA: colección, campo, registro de manifiesto o página canónica.
 * Una pieza ausente se añade; una presente y compatible se conserva; una presente e
 * incompatible aborta el lote completo. El preflight recorre todas las piezas visibles antes de
 * la primera escritura. Los campos extra, el orden, los ids internos y los defaults del servidor
 * no participan en la comparación.
 *
 * Única excepción: PocketBase excluye TODA colección `auth` del esquema descubierto, por lo que
 * `vega_editors` no se puede preflightar desde el puerto. `ensureCollections` la aplica como la
 * primera escritura y el adaptador comprueba su tipo contra `pb.collections.getOne` antes de
 * crearla o saltarla.
 *
 * La garantía "divergencia => ninguna escritura" presupone que no hay escritores concurrentes y
 * que `vega`, `pages`, `vega_media` y `blocks` no colisionan con colecciones `auth`. Una colisión
 * `auth` con cualquiera de esos nombres queda fuera de la garantía porque el descubrimiento la
 * oculta; `ensureCollections` sí la rechaza después con colección, tipo hallado y tipo esperado.
 *
 * No hay rollback implícito si una escritura válida posterior falla: lo ya creado se conserva y
 * la siguiente pasada completa únicamente las piezas ausentes.
 */

import starterManifestDocument from './site-seeding-manifest.json';
import { deriveBlockRecordFields } from './block-schema';
import { VEGA_COLLECTION, type CollectionFieldSpec, type CollectionSpec } from './collections';
import type { BackendPort } from './port';
import type { ContentType, Field, JsonValue } from './types';
import { ensureMediaCollection, VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';
import { listManifestRecords, saveManifest } from '$lib/model/load';
import { resolveContentModel } from '$lib/model/resolve';
import type { ResolvedBlocksConfig } from '$lib/model/types';

export const SITE_SEED_MANIFEST_READ_RULE = '@request.auth.collectionName = "vega_editors"';
export const SITE_SEED_CANONICAL_PAGE_PATH = '/';

export const SITE_SEED_CANONICAL_PAGE = {
	title: 'Inicio',
	path: SITE_SEED_CANONICAL_PAGE_PATH,
	layout: 'default',
	status: 'draft'
} as const;

const STARTER_MANIFEST = starterManifestDocument as JsonValue;

const VEGA_EDITORS_COLLECTION: CollectionSpec = {
	name: 'vega_editors',
	type: 'auth',
	fields: []
};

const PAGES_COLLECTION: CollectionSpec = {
	name: 'pages',
	fields: [
		{ name: 'title', type: 'text', required: true, max: 200 },
		{ name: 'path', type: 'text', required: true, max: 200, unique: true },
		{ name: 'layout', type: 'text', max: 64 },
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		}
	]
};

const STARTER_BLOCKS = readStarterBlocksConfig(STARTER_MANIFEST);
const STARTER_BLOCK_TYPES = resolveContentModel({
	types: [],
	manifestRaw: STARTER_MANIFEST
}).blockTypes;

const BLOCKS_COLLECTION: CollectionSpec = {
	name: 'blocks',
	fields: [
		{
			name: STARTER_BLOCKS.parentField,
			type: 'relation',
			target: PAGES_COLLECTION.name,
			required: true,
			multiple: false,
			cascadeDelete: true
		},
		{ name: STARTER_BLOCKS.orderField, type: 'number' },
		{ name: STARTER_BLOCKS.typeField!, type: 'text', required: true, max: 64 },
		{ name: STARTER_BLOCKS.dataField!, type: 'json' },
		...deriveBlockRecordFields(STARTER_BLOCK_TYPES, STARTER_BLOCKS)
	]
};

const PROJECT_MANIFEST_COLLECTION: CollectionSpec = {
	...VEGA_COLLECTION,
	fields: [...VEGA_COLLECTION.fields],
	listRule: SITE_SEED_MANIFEST_READ_RULE,
	viewRule: SITE_SEED_MANIFEST_READ_RULE
};

const VISIBLE_COLLECTIONS = [
	PAGES_COLLECTION,
	VEGA_MEDIA_COLLECTION,
	BLOCKS_COLLECTION,
	PROJECT_MANIFEST_COLLECTION
] as const;

type VisibleCollectionName = (typeof VISIBLE_COLLECTIONS)[number]['name'];

interface CollectionPlan {
	spec: CollectionSpec;
	missing: boolean;
	missingFields: CollectionFieldSpec[];
	incompatibleFields: Set<string>;
}

interface SeedPlan {
	collections: Map<VisibleCollectionName, CollectionPlan>;
	manifestMissing: boolean;
	pageMissing: boolean;
}

export interface SiteSeedResult {
	createdCollections: string[];
	addedFields: Record<string, string[]>;
	createdRecords: Array<'manifest' | 'page:/'>;
}

export interface SiteSeedDivergence {
	piece: string;
	expected: string;
	actual: string;
}

export class SiteSeedDivergenceError extends Error {
	readonly divergences: readonly SiteSeedDivergence[];

	constructor(divergences: readonly SiteSeedDivergence[]) {
		super(
			[
				'El proyecto diverge del sembrado; no se escribió ninguna pieza:',
				...divergences.map(
					(item) => `- ${item.piece}: encontró ${item.actual}; esperaba ${item.expected}`
				)
			].join('\n')
		);
		this.name = 'SiteSeedDivergenceError';
		this.divergences = divergences;
	}
}

/**
 * Completa una instalación limpia o parcial sin reconciliar jamás una pieza ya presente.
 * El orden de aplicación es explícito porque el puerto no ordena specs:
 * `vega_editors` -> `pages` -> `vega_media` (sola) -> `blocks` -> `vega`.
 */
export async function seedSiteProject(port: BackendPort): Promise<SiteSeedResult> {
	const plan = await inspectSeedPlan(port);
	const result: SiteSeedResult = {
		createdCollections: [],
		addedFields: {},
		createdRecords: []
	};

	await ensureOne(port, VEGA_EDITORS_COLLECTION, result);
	await applyCollectionPlan(port, plan.collections.get('pages')!, result);

	const mediaPlan = plan.collections.get('vega_media')!;
	const mediaResult = await ensureMediaCollection(port);
	result.createdCollections.push(...mediaResult.created);
	await addMissingFields(port, mediaPlan, result);

	await applyCollectionPlan(port, plan.collections.get('blocks')!, result);
	await applyCollectionPlan(port, plan.collections.get('vega')!, result);

	if (plan.manifestMissing) {
		await saveManifest(port, structuredClone(STARTER_MANIFEST));
		result.createdRecords.push('manifest');
	}
	if (plan.pageMissing) {
		await port.create(PAGES_COLLECTION.name, { ...SITE_SEED_CANONICAL_PAGE });
		result.createdRecords.push('page:/');
	}

	return result;
}

async function inspectSeedPlan(port: BackendPort): Promise<SeedPlan> {
	const types = await port.listContentTypes();
	const actualByName = new Map(types.map((type) => [type.name, type]));
	const collections = new Map<VisibleCollectionName, CollectionPlan>();
	const divergences: SiteSeedDivergence[] = [];

	for (const spec of VISIBLE_COLLECTIONS) {
		const actual = actualByName.get(spec.name);
		const plan = inspectCollection(spec, actual, divergences);
		collections.set(spec.name, plan);
	}

	const manifestMissing = await inspectManifestRecord(
		port,
		actualByName.get(PROJECT_MANIFEST_COLLECTION.name),
		collections.get('vega')!,
		divergences
	);
	const pageMissing = await inspectCanonicalPage(
		port,
		actualByName.get(PAGES_COLLECTION.name),
		collections.get('pages')!,
		divergences
	);

	if (divergences.length > 0) throw new SiteSeedDivergenceError(divergences);
	return { collections, manifestMissing, pageMissing };
}

function inspectCollection(
	spec: CollectionSpec,
	actual: ContentType | undefined,
	divergences: SiteSeedDivergence[]
): CollectionPlan {
	if (!actual) {
		return {
			spec,
			missing: true,
			missingFields: [...spec.fields],
			incompatibleFields: new Set()
		};
	}
	if (actual.readonly) {
		divergences.push({
			piece: `colección "${spec.name}"`,
			expected: 'type=base',
			actual: 'type=view'
		});
	}

	const actualByName = new Map(actual.fields.map((field) => [field.name, field]));
	const missingFields: CollectionFieldSpec[] = [];
	const incompatibleFields = new Set<string>();
	for (const expected of spec.fields) {
		const found = actualByName.get(expected.name);
		if (!found) {
			missingFields.push(expected);
			continue;
		}
		const expectedShape = expectedFieldShape(expected);
		const actualShape = actualFieldShape(found);
		if (!sameShape(expectedShape, actualShape)) {
			incompatibleFields.add(expected.name);
			divergences.push({
				piece: `campo "${spec.name}.${expected.name}"`,
				expected: JSON.stringify(expectedShape),
				actual: JSON.stringify(actualShape)
			});
		}
	}
	return { spec, missing: false, missingFields, incompatibleFields };
}

async function inspectManifestRecord(
	port: BackendPort,
	actual: ContentType | undefined,
	plan: CollectionPlan,
	divergences: SiteSeedDivergence[]
): Promise<boolean> {
	if (!actual) return true;

	const manifestField = actual.fields.find((field) => field.name === 'manifest');
	if (plan.incompatibleFields.has('manifest') || plan.incompatibleFields.has('key')) return false;
	if (!manifestField) {
		const records = await port.list(VEGA_COLLECTION.name, { perPage: 2 });
		if (records.totalItems > 0) {
			divergences.push({
				piece: 'registro "vega/default"',
				expected: 'manifiesto inicial exacto',
				actual: `${records.totalItems} registro(s) sin campo manifest`
			});
			return false;
		}
		return true;
	}
	if (plan.missingFields.some((field) => field.name === 'key')) {
		const records = await port.list(VEGA_COLLECTION.name, { perPage: 2 });
		return inspectManifestPage(records, divergences);
	}

	const records = await listManifestRecords(port, actual, 2);
	return inspectManifestPage(records, divergences);
}

function inspectManifestPage(
	records: Awaited<ReturnType<BackendPort['list']>>,
	divergences: SiteSeedDivergence[]
): boolean {
	if (records.totalItems === 0) return true;
	if (records.totalItems !== 1) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'un único manifiesto canónico',
			actual: `${records.totalItems} registros candidatos`
		});
		return false;
	}

	const actualManifest = records.items[0]?.values.manifest;
	if (!sameJson(actualManifest, STARTER_MANIFEST)) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'manifiesto inicial exacto',
			actual: `manifiesto distinto (${JSON.stringify(actualManifest)})`
		});
	}
	return false;
}

async function inspectCanonicalPage(
	port: BackendPort,
	actual: ContentType | undefined,
	plan: CollectionPlan,
	divergences: SiteSeedDivergence[]
): Promise<boolean> {
	if (!actual || plan.missingFields.some((field) => field.name === 'path')) return true;
	if (plan.incompatibleFields.has('path')) return false;

	const records = await port.list(PAGES_COLLECTION.name, {
		perPage: 2,
		filter: {
			kind: 'cond',
			field: 'path',
			op: 'eq',
			value: SITE_SEED_CANONICAL_PAGE_PATH
		}
	});
	if (records.totalItems === 0) return true;
	if (records.totalItems > 1) {
		divergences.push({
			piece: `página canónica "${SITE_SEED_CANONICAL_PAGE_PATH}"`,
			expected: 'un único registro con esa ruta',
			actual: `${records.totalItems} registros con esa ruta`
		});
	}
	return false;
}

async function applyCollectionPlan(
	port: BackendPort,
	plan: CollectionPlan,
	result: SiteSeedResult
): Promise<void> {
	await ensureOne(port, plan.spec, result);
	await addMissingFields(port, plan, result);
}

async function ensureOne(
	port: BackendPort,
	spec: CollectionSpec,
	result: SiteSeedResult
): Promise<void> {
	const ensured = await port.ensureCollections([spec]);
	result.createdCollections.push(...ensured.created);
}

async function addMissingFields(
	port: BackendPort,
	plan: CollectionPlan,
	result: SiteSeedResult
): Promise<void> {
	if (plan.missing || plan.missingFields.length === 0) return;
	const added = await port.addCollectionFields(plan.spec.name, plan.missingFields);
	if (added.added.length > 0) result.addedFields[plan.spec.name] = added.added;
}

interface ComparableFieldShape {
	type: string;
	target: string | null;
	multiple: boolean;
	required: boolean;
	unique: boolean;
	options: readonly string[] | null;
	maxSelect: number | null;
}

function expectedFieldShape(field: CollectionFieldSpec): ComparableFieldShape {
	return {
		type: field.type,
		target: field.type === 'relation' ? field.target : null,
		multiple:
			field.type === 'relation' || field.type === 'select' || field.type === 'file'
				? (field.multiple ?? false)
				: false,
		required: 'required' in field ? (field.required ?? false) : false,
		unique: field.type === 'text' ? (field.unique ?? false) : false,
		options: field.type === 'select' ? field.options : null,
		// Solo cuenta en un `select` MÚLTIPLE: ver la nota de `actualFieldShape`.
		maxSelect: field.type === 'select' && field.multiple ? 99 : null
	};
}

function actualFieldShape(field: Field): ComparableFieldShape {
	return {
		// El puerto proyecta `autodate` como `date` readonly. Esa pareja es inequívoca en el
		// vocabulario actual y permite recuperar el tipo físico sin abrir una inspección raw.
		type: field.type === 'date' && field.readonly ? 'autodate' : field.type,
		target: field.type === 'relation' ? field.target : null,
		multiple:
			field.type === 'relation' || field.type === 'select' || field.type === 'file'
				? field.multiple
				: false,
		required: field.required,
		unique: field.unique,
		options: field.type === 'select' ? field.options : null,
		// El límite SOLO se compara en un `select` múltiple, y la razón es una asimetría del
		// propio adaptador: PocketBase trata `maxSelect` 0, 1 y ausente como el MISMO single
		// (`adapters/pocketbase/schema.ts:180-189` deriva `multiple = maxSelect > 1` y colapsa el 0
		// a `undefined`). Compararlo en un single haría DIVERGENTE una colección legítima cuyo dato
		// crudo es 0 frente al 1 que produce la creación, y abortaría un sembrado que debería
		// completar. En un múltiple sí es información: dos límites distintos son cardinalidades
		// distintas, y el formulario aplica la real.
		maxSelect: field.type === 'select' && field.multiple ? (field.maxSelect ?? null) : null
	};
}

function sameShape(left: ComparableFieldShape, right: ComparableFieldShape): boolean {
	return (
		left.type === right.type &&
		left.target === right.target &&
		left.multiple === right.multiple &&
		left.required === right.required &&
		left.unique === right.unique &&
		sameSelectOptions(left.options, right.options) &&
		left.maxSelect === right.maxSelect
	);
}

function sameSelectOptions(
	expected: readonly string[] | null,
	actual: readonly string[] | null
): boolean {
	if (expected === null || actual === null) return expected === actual;
	if (new Set(actual).size !== actual.length) return false;
	const actualOptions = new Set(actual);
	return expected.every((option) => actualOptions.has(option));
}

function sameJson(left: unknown, right: JsonValue): boolean {
	return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function readStarterBlocksConfig(manifest: JsonValue): ResolvedBlocksConfig {
	const root = manifest as Record<string, unknown>;
	const collections = root.collections as Record<string, unknown>;
	const pages = collections.pages as Record<string, unknown>;
	const blocks = pages.blocks as Record<string, unknown>;
	const values = [
		blocks.collection,
		blocks.parentField,
		blocks.orderField,
		blocks.typeField,
		blocks.dataField
	];
	if (!values.every((value) => typeof value === 'string' && value.length > 0)) {
		throw new Error('El manifiesto inicial no declara la configuración completa de blocks.');
	}
	return {
		collection: blocks.collection as string,
		parentField: blocks.parentField as string,
		orderField: blocks.orderField as string,
		typeField: blocks.typeField as string,
		dataField: blocks.dataField as string
	};
}
