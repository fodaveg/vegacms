/**
 * Arranque de proyecto en un paso, sin migración. Lo lanza la tarjeta «Base del sitio» de
 * `/settings` (`SiteBaseCard.svelte`), que antes de escribir enseña el preflight de solo lectura
 * (`previewSiteSeed`).
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
 * primera escritura y el adaptador comprueba su tipo y sus reglas contra `pb.collections.getOne`
 * antes de crearla o saltarla. Si ya existe con alguna regla distinta de `null` (`listRule`,
 * `viewRule`, `createRule`, `updateRule`, `deleteRule` o `manageRule`), el sembrado aborta ahí,
 * antes de escribir nada: es la colección que decide quién edita, y una regla abierta en ella no
 * se adopta en silencio. `authRule` no cuenta (PocketBase la crea en `""`).
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
 * El registro del manifiesto es la otra excepción, y es acotada: FUSIÓN ADITIVA
 * (`site-seeding-merge.ts`). Al manifiesto guardado se le añaden las entradas que le faltan de cada
 * módulo sembrado, y no se le quita ni se le cambia nada de lo que ya tiene, esté editado a mano o
 * no. Es lo que permite que un proyecto ya sembrado reciba las etiquetas y ayudas de los campos
 * que una versión nueva del sembrado añade, y que un módulo se sume a un sitio en marcha. Qué
 * cuenta como «la misma entrada» está en la cabecera de ese fichero, igual que lo que la fusión
 * NO puede añadir (`manifestSkipped` en el plan y en el resultado: un grupo de campos en una
 * colección con `fieldGroups` propios, un campo en un tipo de bloque que ya existe). Un manifiesto
 * editado a mano NO aborta: recibe lo que le falta. El sembrado solo aborta sin escribir si el
 * manifiesto guardado no es un objeto, si hay más de un registro candidato o si el resultado de la
 * fusión no pasa `validateManifestStrict`.
 *
 * MÓDULOS (`SiteSeedModule`). Lo que se siembra se agrupa en módulos: colecciones a asegurar más
 * un fragmento de manifiesto. La base de siempre es el módulo `base` y va en toda pasada; los
 * demás se piden en `SiteSeedOptions.modules` y se registran en `site-seeding-modules.ts`.
 *
 * Tercera excepción, también acotada: el `pattern` de `redirects.from`/`to`. En una `redirects` ya
 * sembrada sin él, se pone SOLO si el campo no tiene ninguno (`addCollectionFieldPatterns`: el
 * campo se modifica conservando su `id`, nunca se borra y recrea). El patrón no cuenta en la
 * comparación de formas, así que un proyecto sin él no diverge, y uno con patrón propio lo conserva.
 */

import starterManifestDocument from './site-seeding-manifest.json';
import { deriveBlockRecordFields } from './block-schema';
import { VEGA_COLLECTION, type CollectionFieldSpec, type CollectionSpec } from './collections';
import type { BackendPort } from './port';
import {
	isManifestObject,
	mergeManifestFragment,
	type ManifestMergeSkipped
} from './site-seeding-merge';
import type { ContentType, Field, InvitationLinkState, JsonValue } from './types';
import { ensureMediaCollection, VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';
import { listManifestRecords, saveManifest } from '$lib/model/load';
import { resolveContentModel } from '$lib/model/resolve';
import type { ResolvedBlocksConfig } from '$lib/model/types';
import { validateManifestStrict } from '$lib/model/validate';

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
export const SITE_SEED_AUTODATE_FIELDS: readonly CollectionFieldSpec[] = [
	{ name: 'created', type: 'autodate' },
	{ name: 'updated', type: 'autodate', onUpdate: true }
];

/**
 * Los campos de publicación y de SEO de `pages`, con nombre propio para que un módulo cuyo
 * contenido se publica igual (las entradas del blog) los declare con la MISMA forma y no con una
 * copia que pueda desviarse.
 */
export const SITE_SEED_STATUS_FIELD: CollectionFieldSpec = {
	name: 'status',
	type: 'select',
	options: ['draft', 'published'],
	multiple: false
};

/**
 * «Publicar el» (publicación programada, `publishAtField` del manifiesto). Columna real y
 * OPCIONAL: la consulta el cron de `vegaschedule` en el servidor, que publica los borradores cuya
 * fecha ya pasó y la vacía; una fecha obligatoria publicaría todo borrador.
 */
export const SITE_SEED_PUBLISH_AT_FIELD: CollectionFieldSpec = { name: 'publishAt', type: 'date' };

/**
 * SEO por registro. Columnas reales, no `data`: `noindex` lo FILTRA el sitemap del sitio y
 * `socialImage` ENLAZA un medio (misma convención que `blocks.image`: relación simple a
 * `vega_media`, sin cascada, para que borrar un medio no borre la página). `description` acompaña
 * a las otras dos en la misma tarjeta del formulario.
 */
export const SITE_SEED_SEO_FIELDS: readonly CollectionFieldSpec[] = [
	{ name: 'description', type: 'text', max: 300 },
	{
		name: 'socialImage',
		type: 'relation',
		target: VEGA_MEDIA_COLLECTION.name,
		multiple: false,
		cascadeDelete: false
	},
	{ name: 'noindex', type: 'bool' }
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
		SITE_SEED_STATUS_FIELD,
		SITE_SEED_PUBLISH_AT_FIELD,
		...SITE_SEED_SEO_FIELDS,
		...SITE_SEED_AUTODATE_FIELDS
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
		...SITE_SEED_AUTODATE_FIELDS
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
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const PROJECT_MANIFEST_COLLECTION: CollectionSpec = {
	...VEGA_COLLECTION,
	fields: [...VEGA_COLLECTION.fields],
	listRule: SITE_SEED_MANIFEST_READ_RULE,
	viewRule: SITE_SEED_MANIFEST_READ_RULE
};

/**
 * Una unidad de sembrado: las colecciones que asegura y el fragmento de manifiesto que aporta.
 *
 * Las dos mitades siguen la misma regla aditiva. Una colección ausente se crea; a una presente se
 * le añaden los campos que falten; un campo presente con otra forma aborta el lote entero antes
 * de escribir. Al manifiesto se le añaden las entradas del fragmento que falten
 * (`mergeManifestFragment`).
 */
export interface SiteSeedModule {
	/** Identificador estable: es la clave por la que el preflight y el resultado nombran el módulo. */
	id: string;
	/**
	 * Colecciones a asegurar, EN EL ORDEN en que se aplican: el destino de una relación va antes
	 * que quien lo enlaza. Tienen que ser visibles para el descubrimiento del puerto, así que una
	 * `auth` no vale aquí (ver la cabecera del módulo). Un nombre no puede repetirse entre los
	 * módulos de una misma pasada.
	 */
	collections: readonly CollectionSpec[];
	/**
	 * Fragmento de manifiesto: un objeto con la misma forma que el manifiesto, solo con las
	 * entradas que el módulo aporta (`collections.<c>`, `blockTypes.<t>`…).
	 */
	manifest: JsonValue;
}

/**
 * La base de siempre, como módulo. Sus colecciones van en el orden en que `seedSiteProject` las
 * aplica (`vega_media` antes que `pages`, que la enlaza). `vega_editors` no figura: no es visible
 * para el descubrimiento y la base la asegura aparte (`ensureEditorsCollection`), igual que el
 * `pattern` de `redirects` y la página «Inicio», que son pasos propios de la base y no de un
 * módulo cualquiera.
 */
export const SITE_SEED_BASE_MODULE: SiteSeedModule = {
	id: 'base',
	collections: [
		VEGA_MEDIA_COLLECTION,
		PAGES_COLLECTION,
		BLOCKS_COLLECTION,
		REDIRECTS_COLLECTION,
		PROJECT_MANIFEST_COLLECTION
	],
	manifest: STARTER_MANIFEST
};

interface CollectionPlan {
	spec: CollectionSpec;
	missing: boolean;
	missingFields: CollectionFieldSpec[];
	incompatibleFields: Set<string>;
	/** Campos `text` presentes y compatibles cuyo spec trae `pattern` y que aún no tienen ninguno. */
	unconstrainedFields: string[];
}

/**
 * Qué hacer con el registro del manifiesto tras el preflight. `upgrade` conserva el nombre de
 * cuando sustituía un manifiesto inicial sin editar; desde la fusión aditiva significa «se le
 * AÑADEN entradas»: nunca se sustituye ni se modifica nada.
 */
type ManifestAction = 'create' | 'upgrade' | 'keep';

interface ManifestPlan {
	action: ManifestAction;
	/** El manifiesto a escribir (`create` y `upgrade`); `null` si no hay nada que escribir. */
	merged: JsonValue | null;
	/** Entradas de manifiesto que aporta cada módulo, por `id`. Vacía en `keep`. */
	entries: Map<string, string[]>;
	/** Lo que el fragmento de cada módulo traía y la fusión NO puede añadir, por `id`. No depende
	 *  de `action`: se repite mientras lo guardado siga igual. */
	skipped: Map<string, ManifestMergeSkipped[]>;
}

interface SeedPlan {
	/** La base primero y luego los módulos pedidos, en ese orden. */
	modules: readonly SiteSeedModule[];
	collections: Map<string, CollectionPlan>;
	manifest: ManifestPlan;
	pageMissing: boolean;
}

export interface SiteSeedResult {
	createdCollections: string[];
	addedFields: Record<string, string[]>;
	createdRecords: Array<'manifest' | 'page:/'>;
	/** `manifest`: a un manifiesto que ya existía se le añadieron entradas (`manifestEntries`). */
	upgradedRecords: Array<'manifest'>;
	/** Solo si hubo alguna: entradas AÑADIDAS a un manifiesto que ya existía, por `id` de módulo
	 *  (rutas de `mergeManifestFragment`). Un manifiesto recién creado va en `createdRecords`. */
	manifestEntries?: Record<string, string[]>;
	/** Solo si hubo alguna: lo que el fragmento de un módulo traía y NO se pudo añadir al
	 *  manifiesto, por `id` de módulo (ver `ManifestMergeSkipped`). No es un fallo: lo guardado
	 *  se conservó tal cual. */
	manifestSkipped?: Record<string, ManifestMergeSkipped[]>;
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
	/**
	 * Módulos a sembrar ADEMÁS de la base, que va siempre y la primera. Se aplican en este orden,
	 * después de las colecciones de la base y antes de escribir el manifiesto.
	 */
	modules?: readonly SiteSeedModule[];
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
 * Completa una instalación limpia o parcial sin reconciliar jamás una pieza ya presente (al
 * manifiesto solo se le añaden entradas, ver la cabecera del módulo).
 * El orden de aplicación es explícito porque el puerto no ordena specs:
 * `vega_editors` -> `vega_media` (sola) -> `pages` -> `blocks` -> `redirects` -> `vega` -> las
 * colecciones de cada módulo pedido, en su orden -> manifiesto -> página canónica.
 * `vega_media` va antes que `pages` porque `pages.socialImage` la enlaza.
 */
export async function seedSiteProject(
	port: BackendPort,
	options: SiteSeedOptions = {}
): Promise<SiteSeedResult> {
	const plan = await inspectSeedPlan(port, options.modules);
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

	// Los módulos pedidos, después de la base (pueden enlazar sus colecciones) y antes del
	// manifiesto, cuyo `schemaSnapshot` tiene que ver ya las colecciones nuevas.
	for (const module of plan.modules) {
		if (module === SITE_SEED_BASE_MODULE) continue;
		for (const spec of module.collections) {
			await applyCollectionPlan(port, plan.collections.get(spec.name)!, result);
		}
	}

	if (plan.manifest.action === 'create') {
		await saveManifest(port, plan.manifest.merged!);
		result.createdRecords.push('manifest');
	} else if (plan.manifest.action === 'upgrade') {
		// `saveManifest` actualiza el registro canónico existente (el mismo que inspeccionó el
		// preflight) y regenera su `schemaSnapshot`, que ya incluye los campos recién añadidos. Lo
		// que se escribe es el manifiesto guardado más las entradas que le faltaban.
		await saveManifest(port, plan.manifest.merged!);
		result.upgradedRecords.push('manifest');
		result.manifestEntries = Object.fromEntries(
			[...plan.manifest.entries].filter(([, entries]) => entries.length > 0)
		);
	}
	const skipped = [...plan.manifest.skipped].filter(([, items]) => items.length > 0);
	if (skipped.length > 0) result.manifestSkipped = Object.fromEntries(skipped);
	if (plan.pageMissing) {
		await port.create(PAGES_COLLECTION.name, { ...SITE_SEED_CANONICAL_PAGE });
		result.createdRecords.push('page:/');
	}

	return result;
}

/**
 * Lo que `seedSiteProject` escribiría ahora mismo, en los mismos términos que su resultado
 * (`SiteSeedResult`) y sin escribir nada. Solo cuenta las piezas visibles: `vega_editors` no se
 * puede preflightar (ver la cabecera del módulo), así que no aparece aquí aunque el sembrado la
 * cree o le añada `created`.
 */
export interface SiteSeedPlanSummary {
	/** Colecciones visibles ausentes, en el orden en que se aplican. */
	createdCollections: string[];
	/** Campos que faltan en colecciones ya existentes. */
	addedFields: Record<string, string[]>;
	/** Solo si hay alguno: campos de una `redirects` existente que recibirían su `pattern`. */
	constrainedFields?: Record<string, string[]>;
	/** `create`: se escribe el manifiesto; `upgrade`: al que hay se le AÑADEN entradas (las de
	 *  `SiteSeedModulePlan.manifestEntries`), sin sustituir ni modificar ninguna. */
	manifest: ManifestAction;
	/** La página canónica «Inicio» se crearía. */
	pageMissing: boolean;
	/** Nada que escribir en las piezas visibles. */
	upToDate: boolean;
}

/**
 * Lo que un módulo AÑADIRÍA, y nada más: el sembrado no tiene camino para modificar o quitar una
 * colección, un campo o una entrada de manifiesto ya presentes, así que este plan no trae lista
 * de «modificados» porque no puede haberlos. (La única modificación del sembrado es el `pattern`
 * de `redirects`, que es de la base y va en `SiteSeedPlanSummary.constrainedFields`.)
 */
export interface SiteSeedModulePlan {
	id: string;
	/** Colecciones del módulo que no existen y se crearían, en su orden de aplicación. */
	createdCollections: string[];
	/** Campos que faltan en colecciones del módulo que ya existen. */
	addedFields: Record<string, string[]>;
	/**
	 * Entradas del fragmento del módulo que faltan en el manifiesto y se añadirían, como rutas con
	 * puntos (`collections.redirects`, `collections.pages.fields.publishAt`, `blockTypes.hero`).
	 * Con el manifiesto aún sin crear son todas las del fragmento.
	 */
	manifestEntries: string[];
	/**
	 * Lo que el fragmento del módulo trae y la fusión NO añadiría, porque lo guardado se conserva
	 * entero: un grupo de menú en un `nav` de forma inesperada, un grupo de campos en una colección
	 * con `fieldGroups` propios, un campo en un tipo de bloque que ya existe.
	 */
	manifestSkipped: ManifestMergeSkipped[];
}

export type SiteSeedPreview =
	| { status: 'ready'; plan: SiteSeedPlanSummary }
	/** El sembrado abortaría entero: no escribiría nada. */
	| { status: 'blocked'; divergences: readonly SiteSeedDivergence[] };

/**
 * Lo que devuelve `previewSiteSeed`: un `SiteSeedPreview` (vale donde se espere uno) que, cuando
 * hay plan, lo desglosa además por módulo. `plan` es la suma de todos los módulos.
 */
export type SiteSeedModulesPreview =
	| {
			status: 'ready';
			plan: SiteSeedPlanSummary;
			/** La base primero y luego los módulos pedidos, en ese orden. */
			modules: SiteSeedModulePlan[];
	  }
	| { status: 'blocked'; divergences: readonly SiteSeedDivergence[] };

/**
 * Preflight de SOLO LECTURA: el mismo recorrido que hace `seedSiteProject` antes de su primera
 * escritura, sin llegar a ninguna. Devuelve el plan (total y por módulo) o las divergencias que
 * harían abortar. Un fallo de lectura (red, permisos) se propaga tal cual: no es una divergencia.
 * `options.modules` son los mismos que se le pasarían a `seedSiteProject`.
 */
export async function previewSiteSeed(
	port: BackendPort,
	options: Pick<SiteSeedOptions, 'modules'> = {}
): Promise<SiteSeedModulesPreview> {
	let plan: SeedPlan;
	try {
		plan = await inspectSeedPlan(port, options.modules);
	} catch (error) {
		if (error instanceof SiteSeedDivergenceError) {
			return { status: 'blocked', divergences: error.divergences };
		}
		throw error;
	}
	const createdCollections: string[] = [];
	const addedFields: Record<string, string[]> = {};
	let constrainedFields: Record<string, string[]> | undefined;
	const modules: SiteSeedModulePlan[] = [];
	for (const module of plan.modules) {
		const modulePlan: SiteSeedModulePlan = {
			id: module.id,
			createdCollections: [],
			addedFields: {},
			manifestEntries: [...(plan.manifest.entries.get(module.id) ?? [])],
			manifestSkipped: [...(plan.manifest.skipped.get(module.id) ?? [])]
		};
		for (const { name } of module.collections) {
			const collection = plan.collections.get(name)!;
			if (collection.missing) {
				modulePlan.createdCollections.push(name);
				continue;
			}
			if (collection.missingFields.length > 0) {
				modulePlan.addedFields[name] = collection.missingFields.map((field) => field.name);
			}
			// Solo `redirects`, de la base, se constriñe al sembrar (`constrainFieldPatterns`).
			if (
				module === SITE_SEED_BASE_MODULE &&
				name === REDIRECTS_COLLECTION.name &&
				collection.unconstrainedFields.length > 0
			) {
				constrainedFields = { redirects: [...collection.unconstrainedFields] };
			}
		}
		createdCollections.push(...modulePlan.createdCollections);
		Object.assign(addedFields, modulePlan.addedFields);
		modules.push(modulePlan);
	}
	const summary: SiteSeedPlanSummary = {
		createdCollections,
		addedFields,
		...(constrainedFields ? { constrainedFields } : {}),
		manifest: plan.manifest.action,
		pageMissing: plan.pageMissing,
		upToDate: false
	};
	summary.upToDate =
		createdCollections.length === 0 &&
		Object.keys(addedFields).length === 0 &&
		!constrainedFields &&
		plan.manifest.action === 'keep' &&
		!plan.pageMissing;
	return { status: 'ready', plan: summary, modules };
}

/**
 * La base y, detrás, los módulos pedidos. Un `id` o un nombre de colección repetido es un error
 * de quien registra el módulo, no una divergencia del proyecto: lanza antes de leer nada.
 */
function resolveSeedModules(extra: readonly SiteSeedModule[] = []): readonly SiteSeedModule[] {
	const modules = [SITE_SEED_BASE_MODULE, ...extra.filter((m) => m !== SITE_SEED_BASE_MODULE)];
	const ids = new Set<string>();
	const owners = new Map<string, string>();
	for (const module of modules) {
		if (ids.has(module.id)) throw new Error(`Módulo de sembrado repetido: "${module.id}".`);
		ids.add(module.id);
		if (!isManifestObject(module.manifest)) {
			throw new Error(`El fragmento de manifiesto del módulo "${module.id}" no es un objeto.`);
		}
		for (const { name } of module.collections) {
			const owner = owners.get(name);
			if (owner !== undefined) {
				throw new Error(
					`La colección "${name}" la declaran dos módulos de sembrado: "${owner}" y "${module.id}".`
				);
			}
			owners.set(name, module.id);
		}
	}
	return modules;
}

async function inspectSeedPlan(
	port: BackendPort,
	extraModules?: readonly SiteSeedModule[]
): Promise<SeedPlan> {
	const modules = resolveSeedModules(extraModules);
	const types = await port.listContentTypes();
	const actualByName = new Map(types.map((type) => [type.name, type]));
	const collections = new Map<string, CollectionPlan>();
	const divergences: SiteSeedDivergence[] = [];

	for (const module of modules) {
		for (const spec of module.collections) {
			const actual = actualByName.get(spec.name);
			const plan = inspectCollection(spec, actual, divergences);
			collections.set(spec.name, plan);
		}
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
		modules,
		divergences
	);
	const pageMissing = await inspectCanonicalPage(
		port,
		actualByName.get(PAGES_COLLECTION.name),
		collections.get('pages')!,
		divergences
	);

	if (divergences.length > 0) throw new SiteSeedDivergenceError(divergences);
	return { modules, collections, manifest, pageMissing };
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
			incompatibleFields: new Set(),
			unconstrainedFields: []
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
	const unconstrainedFields: string[] = [];
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
		} else if (expected.type === 'text' && expected.pattern && found.type === 'text') {
			if (!found.pattern) unconstrainedFields.push(expected.name);
		}
	}
	return { spec, missing: false, missingFields, incompatibleFields, unconstrainedFields };
}

async function inspectManifestRecord(
	port: BackendPort,
	actual: ContentType | undefined,
	plan: CollectionPlan,
	modules: readonly SiteSeedModule[],
	divergences: SiteSeedDivergence[]
): Promise<ManifestPlan> {
	if (!actual) return createManifestPlan(modules);

	const manifestField = actual.fields.find((field) => field.name === 'manifest');
	if (plan.incompatibleFields.has('manifest') || plan.incompatibleFields.has('key')) {
		return KEEP_MANIFEST;
	}
	if (!manifestField) {
		const records = await port.list(VEGA_COLLECTION.name, { perPage: 2 });
		if (records.totalItems > 0) {
			divergences.push({
				piece: 'registro "vega/default"',
				expected: 'un registro con campo manifest',
				actual: `${records.totalItems} registro(s) sin campo manifest`
			});
			return KEEP_MANIFEST;
		}
		return createManifestPlan(modules);
	}
	if (plan.missingFields.some((field) => field.name === 'key')) {
		const records = await port.list(VEGA_COLLECTION.name, { perPage: 2 });
		return inspectManifestPage(records, modules, divergences);
	}

	const records = await listManifestRecords(port, actual, 2);
	return inspectManifestPage(records, modules, divergences);
}

const KEEP_MANIFEST: ManifestPlan = {
	action: 'keep',
	merged: null,
	entries: new Map(),
	skipped: new Map()
};

/** El manifiesto de un proyecto que aún no tiene ninguno: los fragmentos de los módulos, en orden. */
function createManifestPlan(modules: readonly SiteSeedModule[]): ManifestPlan {
	const { merged, entries, skipped } = mergeModuleFragments({}, modules);
	// Aquí no hay manifiesto humano de por medio: si esto no valida, el fragmento de un módulo está
	// mal escrito. Se dice ahora, en el preflight, porque `saveManifest` lo rechazaría DESPUÉS de
	// haber creado las colecciones.
	const validation = validateManifestStrict(merged);
	if (!validation.ok) {
		throw new Error(
			`Los fragmentos de los módulos de sembrado (${modules
				.map((module) => module.id)
				.join(', ')}) no forman un manifiesto válido: ${validation.errors
				.slice(0, 3)
				.map((error) => `${error.path}: ${error.message}`)
				.join('; ')}`
		);
	}
	return { action: 'create', merged, entries, skipped };
}

/** Fusiona en `saved` el fragmento de cada módulo, en orden, y anota qué aporta cada uno. */
function mergeModuleFragments(
	saved: JsonValue,
	modules: readonly SiteSeedModule[]
): {
	merged: JsonValue;
	entries: Map<string, string[]>;
	skipped: Map<string, ManifestMergeSkipped[]>;
} {
	let merged = saved;
	const entries = new Map<string, string[]>();
	const skipped = new Map<string, ManifestMergeSkipped[]>();
	for (const module of modules) {
		const step = mergeManifestFragment(merged, module.manifest);
		merged = step.manifest;
		entries.set(module.id, step.added);
		skipped.set(module.id, step.skipped);
	}
	return { merged, entries, skipped };
}

function inspectManifestPage(
	records: Awaited<ReturnType<BackendPort['list']>>,
	modules: readonly SiteSeedModule[],
	divergences: SiteSeedDivergence[]
): ManifestPlan {
	if (records.totalItems === 0) return createManifestPlan(modules);
	if (records.totalItems !== 1) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'un único manifiesto canónico',
			actual: `${records.totalItems} registros candidatos`
		});
		return KEEP_MANIFEST;
	}

	// Las dos divergencias de abajo empiezan por «manifiesto distinto»: es el prefijo por el que
	// `describeDivergence` (`$lib/admin/site-base.ts`) elige la frase «se ha editado a mano», que
	// sigue siendo cierta en los dos casos (un manifiesto así solo sale de una edición manual).
	const saved = records.items[0]?.values.manifest;
	if (!isManifestObject(saved)) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'un manifiesto (objeto JSON) al que añadir las entradas que faltan',
			actual: `manifiesto distinto: no es un objeto (${JSON.stringify(saved)})`
		});
		return KEEP_MANIFEST;
	}

	const { merged, entries, skipped } = mergeModuleFragments(saved, modules);
	if ([...entries.values()].every((added) => added.length === 0)) {
		return { ...KEEP_MANIFEST, skipped };
	}

	// La fusión no arregla ni empeora lo guardado, pero `saveManifest` rechaza un manifiesto que no
	// valide. Mejor decirlo aquí, antes de la primera escritura, que dejar el sembrado a medias.
	const validation = validateManifestStrict(merged);
	if (!validation.ok) {
		divergences.push({
			piece: 'registro "vega/default"',
			expected: 'un manifiesto válido tras añadirle las entradas que faltan',
			actual: `manifiesto distinto y no válido (${validation.errors
				.slice(0, 3)
				.map((error) => `${error.path}: ${error.message}`)
				.join('; ')})`
		});
		return KEEP_MANIFEST;
	}
	return { action: 'upgrade', merged, entries, skipped };
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
 *
 * Eso vale solo para una `vega_editors` con las reglas en `null`, que es como la crea el sembrado
 * y como la propone el panel de PocketBase. Con cualquier otra regla, `ensureCollections` lanza
 * (`vega_collection_rules_mismatch`) y no se llega a añadirle campos: como es la primera escritura
 * del sembrado, no queda nada a medias.
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
