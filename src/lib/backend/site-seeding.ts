/**
 * Arranque de proyecto en un paso, deliberadamente sin UI ni migración.
 *
 * La frontera es por PIEZA: colección, campo, registro de manifiesto o página canónica.
 * Una pieza ausente se añade; una presente y compatible se conserva; una presente e
 * incompatible aborta el lote completo. El preflight recorre todas las piezas visibles antes de
 * la primera escritura. También impide crear `blocks` sobre unas `pages` preexistentes cuya
 * lectura esté denegada, porque PocketBase no podría listar después la colección cruzada. Los
 * campos extra, el orden, los ids internos y los defaults del servidor no participan en la
 * comparación.
 *
 * Única excepción: PocketBase excluye TODA colección `auth` del esquema descubierto, por lo que
 * `vega_editors` no se puede preflightar desde el puerto. `ensureCollections` la aplica como la
 * primera escritura y el adaptador comprueba su tipo contra `pb.collections.getOne` antes de
 * crearla o saltarla.
 *
 * La garantía "divergencia => ninguna escritura" presupone que no hay escritores concurrentes y
 * que `vega`, `pages`, `vega_media`, `blocks` y `redirects` no colisionan con colecciones
 * `auth`. Una colisión `auth` con cualquiera de esos nombres queda fuera de la garantía porque el
 * descubrimiento la oculta; `ensureCollections` sí la rechaza después con colección, tipo hallado
 * y tipo esperado.
 *
 * No hay rollback implícito si una escritura válida posterior falla: lo ya creado se conserva y
 * la siguiente pasada completa únicamente las piezas ausentes.
 *
 * El registro del manifiesto es la otra excepción, y es acotada: si su contenido es EXACTAMENTE
 * un manifiesto inicial que Vega sembró antes (`PREVIOUS_STARTER_MANIFESTS`), nadie lo ha
 * editado, así que se sustituye por el actual. Es lo que permite que un proyecto ya sembrado
 * reciba las etiquetas y ayudas de los campos que una versión nueva del sembrado añade. Un
 * manifiesto que no case byte a byte (en forma canónica) con ninguno sigue abortando: es trabajo
 * humano y no se reconcilia.
 *
 * Tercera excepción, también acotada: el `pattern` de `redirects.from`/`to`. En una `redirects` ya
 * sembrada sin él, se pone SOLO si el campo no tiene ninguno (`addCollectionFieldPatterns`: el
 * campo se modifica conservando su `id`, nunca se borra y recrea). El patrón no cuenta en la
 * comparación de formas, así que un proyecto sin él no diverge, y uno con patrón propio lo conserva.
 */

import starterManifestDocument from './site-seeding-manifest.json';
// Manifiesto inicial tal como lo sembró `1bda988` (hasta el lote SEO/redirecciones del 24 sep
// 2026). Se conserva byte a byte para reconocerlo al actualizar; nunca se edita.
import starterManifest1bda988 from './site-seeding-manifest.1bda988.json';
// Manifiesto inicial tal como lo sembró `0ace139` (SEO y redirecciones, hasta la publicación
// programada del 24 sep 2026). Mismo trato: byte a byte, nunca se edita.
import starterManifest0ace139 from './site-seeding-manifest.0ace139.json';
import { deriveBlockRecordFields } from './block-schema';
import { VEGA_COLLECTION, type CollectionFieldSpec, type CollectionSpec } from './collections';
import type { BackendPort } from './port';
import type { ContentType, Field, InvitationLinkState, JsonValue } from './types';
import { ensureMediaCollection, VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';
import { listManifestRecords, saveManifest } from '$lib/model/load';
import { resolveContentModel } from '$lib/model/resolve';
import type { ResolvedBlocksConfig } from '$lib/model/types';

export const SITE_SEED_MANIFEST_READ_RULE = '@request.auth.collectionName = "vega_editors"';
export const SITE_SEED_EDITOR_ACCESS_RULE = '@request.auth.collectionName = "vega_editors"';
export const SITE_SEED_PAGES_READ_RULE =
	'status = "published" || @request.auth.collectionName = "vega_editors"';
/**
 * Las redirecciones se leen igual que una página publicada: cualquiera, sin sesión. No llevan
 * estado de publicación propio (una redirección existe o no), y el sitio las necesita en el build
 * y en cada petición SSR sin credenciales.
 */
export const SITE_SEED_REDIRECTS_READ_RULE = '';
export const SITE_SEED_CANONICAL_PAGE_PATH = '/';

export const SITE_SEED_CANONICAL_PAGE = {
	title: 'Inicio',
	path: SITE_SEED_CANONICAL_PAGE_PATH,
	layout: 'default',
	status: 'draft'
} as const;

const STARTER_MANIFEST = starterManifestDocument as JsonValue;

/** Manifiestos iniciales de versiones anteriores del sembrado, del más antiguo al más reciente. */
const PREVIOUS_STARTER_MANIFESTS: readonly JsonValue[] = [
	starterManifest1bda988 as JsonValue,
	starterManifest0ace139 as JsonValue
];

/**
 * `created` (autodate, solo al crear) da fecha de alta a las cuentas en `/editores`. Una `auth`
 * creada por API no la trae de fábrica (medido en PocketBase 0.39.6). En un proyecto ya sembrado se
 * añade aparte (`ensureEditorsCollection`): las cuentas que ya existían se quedan sin fecha, porque
 * PocketBase no rellena un autodate nuevo hacia atrás (medido: vale `""`).
 */
const VEGA_EDITORS_COLLECTION: CollectionSpec = {
	name: 'vega_editors',
	type: 'auth',
	fields: [{ name: 'created', type: 'autodate' }]
};

/**
 * Fechas de alta y de última edición, en `pages`, `blocks` y `redirects`. Una colección creada por
 * API NO las trae (como `vega_editors.created`), y sin `updated` la comprobación de «cambios sin
 * publicar» (`unpublished-changes.ts`, que solo mira un autodate llamado `updated`) no detecta
 * nunca nada en un sitio sembrado. `updated` lleva `onUpdate`: es lo que lo hace «última edición».
 * En un proyecto ya sembrado se añaden como cualquier campo ausente; los registros anteriores
 * quedan con `""` (PocketBase no rellena un autodate nuevo hacia atrás) y cuentan como «sin
 * fecha» hasta que se editen.
 */
const AUTODATE_FIELDS: CollectionFieldSpec[] = [
	{ name: 'created', type: 'autodate' },
	{ name: 'updated', type: 'autodate', onUpdate: true }
];

const PAGES_COLLECTION: CollectionSpec = {
	name: 'pages',
	listRule: SITE_SEED_PAGES_READ_RULE,
	viewRule: SITE_SEED_PAGES_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{ name: 'title', type: 'text', required: true, max: 200 },
		{ name: 'path', type: 'text', required: true, max: 200, unique: true },
		{ name: 'layout', type: 'text', max: 64 },
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published'],
			multiple: false
		},
		// «Publicar el» (publicación programada, `publishAtField` del manifiesto). Columna real y
		// OPCIONAL: la consulta el cron de `vegaschedule` en el servidor, que publica los borradores
		// cuya fecha ya pasó y la vacía; una fecha obligatoria publicaría todo borrador.
		{ name: 'publishAt', type: 'date' },
		// SEO por página. Columnas reales, no `data`: `noindex` lo FILTRA el sitemap del sitio y
		// `socialImage` ENLAZA un medio (misma convención que `blocks.image`: relación simple a
		// `vega_media`, sin cascada, para que borrar un medio no borre la página). `description`
		// acompaña a las otras dos en la misma tarjeta del formulario.
		{ name: 'description', type: 'text', max: 300 },
		{
			name: 'socialImage',
			type: 'relation',
			target: VEGA_MEDIA_COLLECTION.name,
			multiple: false,
			cascadeDelete: false
		},
		{ name: 'noindex', type: 'bool' },
		...AUTODATE_FIELDS
	]
};

/**
 * Patrones de `redirects.from` y `redirects.to`. PocketBase los aplica con `regexp.MatchString`
 * (RE2), SIN anclar: por eso llevan su propio `^`.
 *
 * - `from`: una ruta del sitio, empieza por `/`.
 * - `to`: una ruta del propio sitio o una URL absoluta `http(s)://`. Rechaza `javascript:`, `data:`,
 *   `//evil.com` y `/\evil.com` (los navegadores leen `/\` como `//`: redirección a otro host sin
 *   que parezca una URL absoluta). Tampoco admite un espacio o carácter de control justo tras la
 *   barra: los navegadores borran tabuladores y saltos de línea de una URL, así que `/<tab>/evil.com`
 *   se convertiría en `//evil.com`.
 * - `to: "/"` (la raíz sola) SÍ vale: es un destino legítimo (retirar una sección y mandarla a
 *   Inicio) y el sembrado ya lo usa en sus tests; por eso la primera alternativa es `/$`.
 *
 * Solo restringen la escritura: un registro antiguo que no los cumpla se queda como está hasta que
 * se edite.
 */
export const SITE_SEED_REDIRECT_FROM_PATTERN = '^/';
export const SITE_SEED_REDIRECT_TO_PATTERN = String.raw`^(/$|/[^/\\\x00-\x20]|https?://)`;

/**
 * Redirecciones del sitio publicado. `from` es la ruta vieja y es única, como `pages.path`: dos
 * reglas para la misma ruta serían ambiguas. `code` solo admite las dos permanentes; una temporal
 * no tiene sentido en un sitio que se reconstruye al publicar.
 */
const REDIRECTS_COLLECTION: CollectionSpec = {
	name: 'redirects',
	listRule: SITE_SEED_REDIRECTS_READ_RULE,
	viewRule: SITE_SEED_REDIRECTS_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{
			name: 'from',
			type: 'text',
			required: true,
			max: 200,
			unique: true,
			pattern: SITE_SEED_REDIRECT_FROM_PATTERN
		},
		{
			name: 'to',
			type: 'text',
			required: true,
			max: 2000,
			pattern: SITE_SEED_REDIRECT_TO_PATTERN
		},
		{
			name: 'code',
			type: 'select',
			options: ['301', '308'],
			multiple: false,
			required: true
		},
		...AUTODATE_FIELDS
	]
};

const STARTER_BLOCKS = readStarterBlocksConfig(STARTER_MANIFEST);
export const SITE_SEED_BLOCKS_READ_RULE = `${STARTER_BLOCKS.parentField}.status = "published" || @request.auth.collectionName = "vega_editors"`;
const STARTER_BLOCK_TYPES = resolveContentModel({
	types: [],
	manifestRaw: STARTER_MANIFEST
}).blockTypes;

const BLOCKS_COLLECTION: CollectionSpec = {
	name: 'blocks',
	listRule: SITE_SEED_BLOCKS_READ_RULE,
	viewRule: SITE_SEED_BLOCKS_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
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
		...deriveBlockRecordFields(STARTER_BLOCK_TYPES, STARTER_BLOCKS),
		...AUTODATE_FIELDS
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
	REDIRECTS_COLLECTION,
	PROJECT_MANIFEST_COLLECTION
] as const;

type VisibleCollectionName = (typeof VISIBLE_COLLECTIONS)[number]['name'];

interface CollectionPlan {
	spec: CollectionSpec;
	missing: boolean;
	missingFields: CollectionFieldSpec[];
	incompatibleFields: Set<string>;
}

/** Qué hacer con el registro del manifiesto tras el preflight. */
type ManifestAction = 'create' | 'upgrade' | 'keep';

interface SeedPlan {
	collections: Map<VisibleCollectionName, CollectionPlan>;
	manifest: ManifestAction;
	pageMissing: boolean;
}

export interface SiteSeedResult {
	createdCollections: string[];
	addedFields: Record<string, string[]>;
	createdRecords: Array<'manifest' | 'page:/'>;
	/** Registros sustituidos por su versión actual: hoy solo un manifiesto inicial sin editar. */
	upgradedRecords: Array<'manifest'>;
	/** Solo si hubo alguno: campos de una colección YA existente que no tenían `pattern` y lo
	 *  recibieron (`redirects.from`/`to`). Un campo con patrón propio no aparece aquí: no se toca. */
	constrainedFields?: Record<string, string[]>;
	/** Solo con `SiteSeedOptions.passwordResetUrl`: qué pasó con el enlace de los correos de
	 *  invitación de `vega_editors` (ver `AdministrationPort.ensureInvitationLink`). */
	invitationLink?: InvitationLinkState;
}

export interface SiteSeedOptions {
	/**
	 * URL absoluta de la ruta `/restablecer` de la Vega que sirve este proyecto. Con ella, el
	 * sembrado deja la plantilla del correo de restablecimiento de `vega_editors` apuntando ahí si
	 * sigue la de fábrica (nunca pisa una personalizada). Opcional porque el sembrado es headless y
	 * no sabe en qué dirección está servida Vega; sin ella, lo hace `/editores` al abrirse.
	 */
	passwordResetUrl?: string;
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
 * Completa una instalación limpia o parcial sin reconciliar jamás una pieza ya presente (salvo
 * el manifiesto inicial sin editar, ver la cabecera del módulo).
 * El orden de aplicación es explícito porque el puerto no ordena specs:
 * `vega_editors` -> `vega_media` (sola) -> `pages` -> `blocks` -> `redirects` -> `vega`.
 * `vega_media` va antes que `pages` porque `pages.socialImage` la enlaza.
 */
export async function seedSiteProject(
	port: BackendPort,
	options: SiteSeedOptions = {}
): Promise<SiteSeedResult> {
	const plan = await inspectSeedPlan(port);
	const result: SiteSeedResult = {
		createdCollections: [],
		addedFields: {},
		createdRecords: [],
		upgradedRecords: []
	};

	await ensureEditorsCollection(port, result);
	if (options.passwordResetUrl && port.capabilities.administration && port.administration) {
		result.invitationLink = await port.administration.ensureInvitationLink(
			options.passwordResetUrl
		);
	}

	const mediaPlan = plan.collections.get('vega_media')!;
	const mediaResult = await ensureMediaCollection(port);
	result.createdCollections.push(...mediaResult.created);
	await addMissingFields(port, mediaPlan, result);

	await applyCollectionPlan(port, plan.collections.get('pages')!, result);
	await applyCollectionPlan(port, plan.collections.get('blocks')!, result);
	const redirectsPlan = plan.collections.get('redirects')!;
	await applyCollectionPlan(port, redirectsPlan, result);
	// Una `redirects` ya existente conserva sus campos tal cual; solo se le pone el patrón a los que
	// no tienen ninguno (ver `addCollectionFieldPatterns`). La recién creada ya lo trae.
	if (!redirectsPlan.missing) await constrainFieldPatterns(port, redirectsPlan.spec, result);
	await applyCollectionPlan(port, plan.collections.get('vega')!, result);

	if (plan.manifest === 'create') {
		await saveManifest(port, structuredClone(STARTER_MANIFEST));
		result.createdRecords.push('manifest');
	} else if (plan.manifest === 'upgrade') {
		// `saveManifest` actualiza el registro canónico existente (el mismo que inspeccionó el
		// preflight) y regenera su `schemaSnapshot`, que ya incluye los campos recién añadidos.
		await saveManifest(port, structuredClone(STARTER_MANIFEST));
		result.upgradedRecords.push('manifest');
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

	const pages = actualByName.get(PAGES_COLLECTION.name);
	const pagesPlan = collections.get('pages')!;
	const blocksPlan = collections.get('blocks')!;
	if (!pagesPlan.missing && blocksPlan.missing && pages?.access?.list === 'denied') {
		divergences.push({
			piece: 'creación de "blocks" sobre "pages" preexistente',
			expected: 'lectura de "pages" permitida o condicional',
			actual: 'lectura de "pages" denegada; "blocks" quedaría imposible de listar'
		});
	}

	const manifest = await inspectManifestRecord(
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
	return { collections, manifest, pageMissing };
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
): Promise<ManifestAction> {
	if (!actual) return 'create';

	const manifestField = actual.fields.find((field) => field.name === 'manifest');
	if (plan.incompatibleFields.has('manifest') || plan.incompatibleFields.has('key')) return 'keep';
	if (!manifestField) {
		const records = await port.list(VEGA_COLLECTION.name, { perPage: 2 });
		if (records.totalItems > 0) {
			divergences.push({
				piece: 'registro "vega/default"',
				expected: 'manifiesto inicial exacto',
				actual: `${records.totalItems} registro(s) sin campo manifest`
			});
			return 'keep';
		}
		return 'create';
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
): ManifestAction {
	if (records.totalItems === 0) return 'create';
	if (records.totalItems !== 1) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'un único manifiesto canónico',
			actual: `${records.totalItems} registros candidatos`
		});
		return 'keep';
	}

	const actualManifest = records.items[0]?.values.manifest;
	if (sameJson(actualManifest, STARTER_MANIFEST)) return 'keep';
	if (PREVIOUS_STARTER_MANIFESTS.some((previous) => sameJson(actualManifest, previous))) {
		return 'upgrade';
	}
	divergences.push({
		piece: 'registro "vega/default"',
		expected: 'manifiesto inicial exacto (actual o de una versión anterior del sembrado)',
		actual: `manifiesto distinto (${JSON.stringify(actualManifest)})`
	});
	return 'keep';
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

/**
 * `vega_editors` no pasa por el preflight (la esconde el descubrimiento, ver la cabecera), así que
 * sus campos se completan aquí: si la colección ya existía, se le añaden los del sembrado que
 * falten, con la misma regla aditiva que el resto (un campo con ese nombre, sea del tipo que sea,
 * se deja tal cual). Nunca toca sus reglas ni sus cuentas.
 */
async function ensureEditorsCollection(port: BackendPort, result: SiteSeedResult): Promise<void> {
	const ensured = await port.ensureCollections([VEGA_EDITORS_COLLECTION]);
	result.createdCollections.push(...ensured.created);
	if (ensured.created.length > 0) return;
	const added = await port.addCollectionFields(
		VEGA_EDITORS_COLLECTION.name,
		VEGA_EDITORS_COLLECTION.fields
	);
	if (added.added.length > 0) result.addedFields[VEGA_EDITORS_COLLECTION.name] = added.added;
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

/**
 * Pone a los campos `text` del spec con `pattern` que aún no tengan ninguno el patrón del spec. El
 * patrón no entra en la comparación de formas (un proyecto sin él no diverge) y un patrón ya
 * presente, sea de quien sea, no se pisa.
 */
async function constrainFieldPatterns(
	port: BackendPort,
	spec: CollectionSpec,
	result: SiteSeedResult
): Promise<void> {
	const patterns: Record<string, string> = {};
	for (const field of spec.fields) {
		if (field.type === 'text' && field.pattern) patterns[field.name] = field.pattern;
	}
	if (Object.keys(patterns).length === 0) return;
	const constrained = await port.addCollectionFieldPatterns?.(spec.name, patterns);
	if (constrained && constrained.applied.length > 0) {
		result.constrainedFields = { ...result.constrainedFields, [spec.name]: constrained.applied };
	}
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

/** Exportada para testear directamente la rama de `select` MÚLTIPLE (§ comentario de `maxSelect`
 *  en `actualFieldShape`), que `seedSiteProject` nunca alcanza en la suite de integración — todos
 *  sus `select` (`pages.status`) son simples. Ver `site-seeding.test.ts`. */
export function expectedFieldShape(field: CollectionFieldSpec): ComparableFieldShape {
	return {
		// `editor` es el nombre PocketBase; el puerto lo proyecta como `richtext`.
		type: field.type === 'editor' ? 'richtext' : field.type,
		target: field.type === 'relation' ? field.target : null,
		multiple:
			field.type === 'relation' || field.type === 'select' || field.type === 'file'
				? (field.multiple ?? false)
				: false,
		required: 'required' in field ? (field.required ?? false) : false,
		unique:
			field.type === 'text' || field.type === 'url' || field.type === 'email'
				? (field.unique ?? false)
				: false,
		options: field.type === 'select' ? field.options : null,
		// Solo cuenta en un `select` MÚLTIPLE: ver la nota de `actualFieldShape`.
		maxSelect: field.type === 'select' && field.multiple ? 99 : null
	};
}

/** Exportada por el mismo motivo que `expectedFieldShape` — ver ahí. */
export function actualFieldShape(field: Field): ComparableFieldShape {
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

/** Exportada por el mismo motivo que `expectedFieldShape` — ver ahí. */
export function sameShape(left: ComparableFieldShape, right: ComparableFieldShape): boolean {
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
