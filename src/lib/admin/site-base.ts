/**
 * Lógica pura de la tarjeta «Base del sitio» de `/settings` (`SiteBaseCard.svelte`): convierte el
 * preflight (`previewSiteSeed`) y el resultado (`seedSiteProject`) en lo que se enseña. Sin DOM ni
 * puerto; el texto sale de `settings.site.*` vía el `t` que recibe.
 *
 * La palabra «sembrado» no sale en la interfaz: la pieza se llama «Base del sitio».
 */
import { COMMON_COLLECTION_RULE_KEYS, type CollectionRule } from '$lib/backend/collections';
import {
	ruleDifferencesToConfirm,
	type SiteSeedDivergence,
	type SiteSeedModule,
	type SiteSeedModulePlan,
	type SiteSeedPlanSummary,
	type SiteSeedPreview,
	type SiteSeedResult,
	type SiteSeedRuleDifference
} from '$lib/backend/site-seeding';
import type { ManifestMergeSkipped } from '$lib/backend/site-seeding-merge';
import { SITE_SEED_OPTIONAL_MODULES } from '$lib/backend/site-seeding-modules';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Colecciones visibles que comprueba el preflight (sin `vega_editors`, que no se puede leer). */
const SITE_BASE_COLLECTIONS = ['pages', 'vega_media', 'blocks', 'redirects', 'vega'] as const;

/**
 * Los módulos que la tarjeta ofrece añadir, debajo de la base: los opcionales del registro, en su
 * orden. El nombre y la descripción de cada uno salen de `settings.site.module.<id>.name` y
 * `.desc`, y los de sus colecciones de `settings.site.collection.<c>` y `settings.site.create.<c>`
 * (`site-base.test.ts` comprueba que un módulo registrado no se quede sin texto).
 */
export const SITE_BASE_MODULES: readonly SiteSeedModule[] = SITE_SEED_OPTIONAL_MODULES;

const MODULE_COLLECTIONS: readonly string[] = SITE_BASE_MODULES.flatMap((module) =>
	module.collections.map((spec) => spec.name)
);

/**
 * Módulos con una línea fija de «esto se configura fuera de Vega» en su fila. El de contacto: el
 * aviso por correo de cada mensaje lo manda el servidor, y la SPA no tiene forma de saber si está
 * configurado.
 */
const MODULE_NOTES: readonly string[] = ['contacto'];

export function moduleName(t: Translate, id: string): string {
	return t(`settings.site.module.${id}.name`);
}

export function moduleDescription(t: Translate, id: string): string {
	return t(`settings.site.module.${id}.desc`);
}

export function moduleNote(t: Translate, id: string): string | null {
	return MODULE_NOTES.includes(id) ? t(`settings.site.module.${id}.note`) : null;
}

/**
 * Cómo está un módulo, deducido de su parte del preflight:
 * - `absent`: no existe ninguna de sus colecciones;
 * - `incomplete`: existe alguna, pero le falta algo (una colección, un campo, una entrada del
 *   modelo de contenido): «Añadir» pone lo que falta;
 * - `added`: no hay nada que añadir.
 */
type SiteModuleState = 'absent' | 'incomplete' | 'added';

export function siteModuleState(module: SiteSeedModule, plan: SiteSeedModulePlan): SiteModuleState {
	if (plan.createdCollections.length === module.collections.length) return 'absent';
	const pending =
		plan.createdCollections.length > 0 ||
		Object.keys(plan.addedFields).length > 0 ||
		plan.manifestEntries.length > 0;
	return pending ? 'incomplete' : 'added';
}

/**
 * `true` si el preflight de «base + un módulo» solo escribiría cosas de ESE módulo. Es la condición
 * para que el diálogo de un módulo pueda enseñar solo lo del módulo y decir que solo se añade: la
 * base va en toda pasada y, si tuviera algo pendiente, se escribiría también.
 */
export function onlyModuleWrites(plan: SiteSeedPlanSummary, base: SiteSeedModulePlan): boolean {
	return (
		base.createdCollections.length === 0 &&
		Object.keys(base.addedFields).length === 0 &&
		base.manifestEntries.length === 0 &&
		!plan.constrainedFields &&
		!plan.pageMissing
	);
}

/**
 * Las diferencias de reglas que hay que confirmar para añadir este módulo, o ninguna: solo cuentan
 * si el módulo tiene algo que escribir (ver `ruleDifferencesToConfirm`).
 */
export function moduleRuleDifferences(plan: SiteSeedModulePlan): SiteSeedRuleDifference[] {
	return ruleDifferencesToConfirm(plan);
}

/** Una regla de acceso dicha en llano: `null` y `""` son las dos que se confunden. */
function describeRuleValue(t: Translate, rule: CollectionRule): string {
	if (rule === null) return t('settings.site.rules.none');
	return rule === '' ? t('settings.site.rules.open') : rule;
}

function ruleDifferenceItem(item: SiteSeedRuleDifference, t: Translate): PlanItem {
	const known = (COMMON_COLLECTION_RULE_KEYS as readonly string[]).includes(item.rule);
	return {
		title: t('settings.site.rules.title', {
			collection: collectionLabel(t, item.collection),
			rule: known ? t(`settings.site.rules.${item.rule}`) : item.rule
		}),
		text: t('settings.site.rules.item', {
			actual: describeRuleValue(t, item.actual),
			expected: describeRuleValue(t, item.expected)
		}),
		code: `${item.collection}.${item.rule}`
	};
}

/** Qué muestra la tarjeta cuando el preflight terminó. */
type SiteBaseKind = 'unprepared' | 'update' | 'current' | 'blocked';

export function siteBaseKind(preview: SiteSeedPreview): SiteBaseKind {
	if (preview.status === 'blocked') return 'blocked';
	if (preview.plan.upToDate) return 'current';
	return preview.plan.createdCollections.length > 0 ? 'unprepared' : 'update';
}

/** El diálogo prepara (hay colecciones por crear) o actualiza. */
type SiteBaseMode = 'prepare' | 'update';

export function siteBaseMode(plan: SiteSeedPlanSummary): SiteBaseMode {
	return plan.createdCollections.length > 0 ? 'prepare' : 'update';
}

function collectionLabel(t: Translate, name: string): string {
	return (SITE_BASE_COLLECTIONS as readonly string[]).includes(name) ||
		MODULE_COLLECTIONS.includes(name)
		? t(`settings.site.collection.${name}`)
		: name;
}

const FRIENDLY_FIELDS = [
	'publishAt',
	'description',
	'socialImage',
	'noindex',
	'created',
	'updated'
] as const;

function fieldLabel(t: Translate, name: string): string | null {
	return (FRIENDLY_FIELDS as readonly string[]).includes(name)
		? t(`settings.site.field.${name}`)
		: null;
}

/** «A», «A y B», «A, B y C». */
export function joinList(t: Translate, items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} ${t('settings.site.listAnd')} ${items[items.length - 1]}`;
}

interface PlanItem {
	title: string;
	text: string;
	/** Nombre técnico (colección o campos), en `<code>`. */
	code?: string;
	/** `true`: el código va antes del texto (colecciones); `false`: después (campos). */
	codeFirst?: boolean;
}

interface PlanGroup {
	/**
	 * Sirve de `data-` y de clave del encabezado:
	 * - `create` y `add`: colecciones, campos y registros;
	 * - `rules`: reglas de acceso de una colección que ya existe y no son las del módulo (hay que
	 *   confirmarlas para añadirlo);
	 * - `manifest`: las entradas que se añaden al modelo de contenido, una a una y con su nombre;
	 * - `skipped`: lo que la versión nueva trae y NO se añade, porque lo guardado se conserva entero.
	 */
	id: 'rules' | 'create' | 'add' | 'manifest' | 'skipped';
	heading: string;
	items: PlanItem[];
	/** Texto bajo la lista del grupo (qué pasa con lo que ya hay, y cómo evitar que algo vuelva). */
	note?: string;
}

export interface PlanView {
	groups: PlanGroup[];
	/** Solo al actualizar: lo que no cambia («Medios y Bloques ya están al día.»). */
	rest: string | null;
}

/** El desglose por módulo del preflight y, si el diálogo es el de un módulo, cuál. */
interface PlanDetail {
	modules: readonly SiteSeedModulePlan[];
	/** `id` del módulo que se añade. Sin él, el plan es el de la base (preparar o actualizar). */
	target?: string;
}

/**
 * Una entrada del modelo de contenido, con nombre: la ruta que devuelve la fusión
 * (`collections.posts`, `collections.pages.fields.publishAt`, `blockTypes.hero`,
 * `nav.groups.Sitio`) dicha en llano. La ruta literal va en `code`.
 */
function describeManifestEntry(path: string, t: Translate): PlanItem {
	const base = { text: '', code: path };
	if (path.startsWith('nav.groups.')) {
		return {
			...base,
			title: t('settings.site.entry.navGroup', { name: path.slice('nav.groups.'.length) })
		};
	}
	const parts = path.split('.');
	if (parts[0] === 'nav') return { ...base, title: t('settings.site.entry.nav') };
	if (parts[0] === 'blockTypes' && parts.length === 2) {
		return { ...base, title: t('settings.site.entry.blockType', { name: parts[1] }) };
	}
	if (parts[0] === 'collections' && parts.length === 2) {
		return {
			...base,
			title: t('settings.site.entry.collection', { name: collectionLabel(t, parts[1]) })
		};
	}
	if (parts[0] === 'collections' && parts.length === 4 && parts[2] === 'fields') {
		return {
			...base,
			title: t('settings.site.entry.field', {
				field: fieldLabel(t, parts[3]) ?? parts[3],
				collection: collectionLabel(t, parts[1])
			})
		};
	}
	if (parts[0] === 'collections' && parts.length === 3) {
		// `page` declara que cada registro es una página con ruta: dicho en llano, no como opción.
		if (parts[2] === 'page') {
			return {
				...base,
				title: t('settings.site.entry.pageOption', { collection: collectionLabel(t, parts[1]) })
			};
		}
		return {
			...base,
			title: t('settings.site.entry.option', {
				option: parts[2],
				collection: collectionLabel(t, parts[1])
			})
		};
	}
	return { ...base, title: t('settings.site.entry.other', { name: path }) };
}

/** Una pieza que la fusión no ha podido añadir, con su motivo. La ruta literal va en `code`. */
function describeSkipped(item: ManifestMergeSkipped, t: Translate): PlanItem {
	if (item.kind === 'navGroup') {
		return {
			title: t('settings.site.entry.navGroup', { name: item.name }),
			text: t('settings.site.skipped.navGroup'),
			code: item.path
		};
	}
	if (item.kind === 'fieldGroup') {
		return {
			title: t('settings.site.skipped.fieldGroupTitle', {
				name: item.name,
				collection: collectionLabel(t, item.owner ?? '')
			}),
			text: t('settings.site.skipped.fieldGroup'),
			code: item.path
		};
	}
	return {
		title: t('settings.site.skipped.blockFieldTitle', {
			name: item.name,
			block: item.owner ?? ''
		}),
		text: t('settings.site.skipped.blockField'),
		code: item.path
	};
}

function fieldItems(addedFields: Record<string, string[]>, t: Translate): PlanItem[] {
	return Object.entries(addedFields).map(([collection, fields]) => {
		const friendly = fields
			.map((field) => fieldLabel(t, field))
			.filter((label): label is string => label !== null);
		return {
			title: t(
				fields.length === 1 ? 'settings.site.addFields.one' : 'settings.site.addFields.many',
				{ count: fields.length, collection: collectionLabel(t, collection) }
			),
			text: friendly.length > 0 ? friendly.map((label) => `«${label}»`).join(', ') : '',
			code: fields.join(', ')
		};
	});
}

/**
 * Los dos grupos del modelo de contenido: las entradas que se añaden, una a una, y lo que no se
 * ha podido añadir. `listEntries` es `false` cuando el modelo de contenido se CREA: ahí no hay
 * nada guardado que una entrada pueda devolver, y la lista sería el manifiesto entero.
 */
function manifestGroups(
	modules: readonly SiteSeedModulePlan[],
	listEntries: boolean,
	t: Translate
): PlanGroup[] {
	const groups: PlanGroup[] = [];
	const entries = listEntries ? modules.flatMap((module) => module.manifestEntries) : [];
	if (entries.length > 0) {
		groups.push({
			id: 'manifest',
			heading: t('settings.site.group.manifest'),
			items: entries.map((path) => describeManifestEntry(path, t)),
			note: `${t('settings.site.replace.manifest')} ${t('settings.site.manifest.hiddenHelp')}`
		});
	}
	const skipped = modules.flatMap((module) => module.manifestSkipped);
	if (skipped.length > 0) {
		groups.push({
			id: 'skipped',
			heading: t('settings.site.group.skipped'),
			items: skipped.map((item) => describeSkipped(item, t)),
			note: t('settings.site.skipped.note')
		});
	}
	return groups;
}

/** El plan de añadir UN módulo: solo lo suyo (ver `onlyModuleWrites`). */
function buildModulePlanView(module: SiteSeedModulePlan, t: Translate): PlanView {
	const groups: PlanGroup[] = [];
	const rules = moduleRuleDifferences(module);
	if (rules.length > 0) {
		groups.push({
			id: 'rules',
			heading: t('settings.site.group.rules'),
			items: rules.map((item) => ruleDifferenceItem(item, t)),
			note: t('settings.site.rules.note')
		});
	}
	if (module.createdCollections.length > 0) {
		groups.push({
			id: 'create',
			heading: t('settings.site.group.create'),
			items: module.createdCollections.map((name) => ({
				title: collectionLabel(t, name),
				code: name,
				codeFirst: true,
				text: t(`settings.site.create.${name}`)
			}))
		});
	}
	const add = fieldItems(module.addedFields, t);
	if (add.length > 0) groups.push({ id: 'add', heading: t('settings.site.group.add'), items: add });
	groups.push(...manifestGroups([module], true, t));
	return { groups, rest: null };
}

/**
 * El plan en grupos «Se crea» / «Se añade» / «Se añade al modelo de contenido» / «No se añade»,
 * con su texto. Con `detail.target`, el de añadir ese módulo; sin él, el de la base.
 */
export function buildPlanView(
	plan: SiteSeedPlanSummary,
	t: Translate,
	detail: PlanDetail = { modules: [] }
): PlanView {
	if (detail.target !== undefined) {
		const module = detail.modules.find((item) => item.id === detail.target);
		return module ? buildModulePlanView(module, t) : { groups: [], rest: null };
	}
	const mode = siteBaseMode(plan);
	const create: PlanItem[] = [];
	const add: PlanItem[] = [];

	// Orden de la lámina (Páginas primero), no el de aplicación (Medios antes que Páginas).
	const display = SITE_BASE_COLLECTIONS as readonly string[];
	const createdInDisplayOrder = [...plan.createdCollections].sort(
		(left, right) => display.indexOf(left) - display.indexOf(right)
	);
	for (const name of createdInDisplayOrder) {
		if (name === 'vega') continue; // va aparte: depende también del registro del manifiesto
		create.push({
			title: collectionLabel(t, name),
			code: name,
			codeFirst: true,
			text: t(`settings.site.create.${name}`)
		});
	}
	if (plan.createdCollections.includes('vega') || plan.manifest === 'create') {
		create.push({
			title: collectionLabel(t, 'vega'),
			code: 'vega',
			codeFirst: true,
			text: t('settings.site.create.vega')
		});
	}
	if (mode === 'prepare') {
		create.push({
			title: t('settings.site.editors.title'),
			code: 'vega_editors',
			codeFirst: true,
			text: t('settings.site.editors.create')
		});
	}
	if (plan.pageMissing) {
		create.push({ title: t('settings.site.page.title'), text: t('settings.site.page.text') });
	}

	add.push(...fieldItems(plan.addedFields, t));
	for (const [collection, fields] of Object.entries(plan.constrainedFields ?? {})) {
		add.push({
			title: t('settings.site.constrain.title', { collection: collectionLabel(t, collection) }),
			text: t('settings.site.constrain.text'),
			code: fields.join(', ')
		});
	}
	if (mode === 'update') {
		add.push({
			title: t('settings.site.editors.addCreatedTitle'),
			text: t('settings.site.editors.addCreatedText'),
			code: 'created'
		});
	}
	// Un modelo de contenido que YA existe no se sustituye: se le añaden las entradas que faltan,
	// y el plan las nombra una a una (quien borró una a propósito ve que va a volver).
	if (plan.manifest === 'upgrade' && detail.modules.length === 0) {
		add.push({
			title: collectionLabel(t, 'vega'),
			text: t('settings.site.replace.manifest')
		});
	}

	const groups: PlanGroup[] = [];
	if (create.length > 0) {
		groups.push({ id: 'create', heading: t('settings.site.group.create'), items: create });
	}
	if (add.length > 0) groups.push({ id: 'add', heading: t('settings.site.group.add'), items: add });
	groups.push(...manifestGroups(detail.modules, plan.manifest === 'upgrade', t));

	let rest: string | null = null;
	if (mode === 'update') {
		const touched = new Set<string>([
			...plan.createdCollections,
			...Object.keys(plan.addedFields),
			...Object.keys(plan.constrainedFields ?? {})
		]);
		if (plan.manifest !== 'keep') touched.add('vega');
		const untouched = SITE_BASE_COLLECTIONS.filter((name) => !touched.has(name)).map((name) =>
			collectionLabel(t, name)
		);
		if (!plan.pageMissing) untouched.push(t('settings.site.page.rest'));
		if (untouched.length > 0) {
			const names = joinList(t, untouched);
			rest = t(untouched.length === 1 ? 'settings.site.plan.restOne' : 'settings.site.plan.rest', {
				names: names.charAt(0).toUpperCase() + names.slice(1)
			});
		}
	}
	return { groups, rest };
}

/** La frase de la tarjeta (A1/A3) según lo que falta. */
export function describeCardPlan(plan: SiteSeedPlanSummary, t: Translate): string {
	const missing = plan.createdCollections;
	if (missing.length === SITE_BASE_COLLECTIONS.length) return t('settings.site.desc.unprepared');
	if (missing.length > 0) {
		return t('settings.site.desc.partial', {
			missing: missing.length,
			total: SITE_BASE_COLLECTIONS.length,
			names: joinList(
				t,
				missing.map((name) => collectionLabel(t, name))
			)
		});
	}
	const changes: string[] = [];
	const fieldCollections = Object.keys(plan.addedFields).map((name) => collectionLabel(t, name));
	if (fieldCollections.length > 0) {
		changes.push(t('settings.site.change.addFields', { names: joinList(t, fieldCollections) }));
	}
	if (plan.constrainedFields) {
		changes.push(
			t('settings.site.change.constrain', {
				names: joinList(
					t,
					Object.keys(plan.constrainedFields).map((name) => collectionLabel(t, name))
				)
			})
		);
	}
	if (plan.manifest !== 'keep') changes.push(t('settings.site.change.manifest'));
	if (plan.pageMissing) changes.push(t('settings.site.change.page'));
	return t('settings.site.desc.update', { changes: joinList(t, changes) });
}

interface DivergenceView {
	title: string;
	body: string;
	/** El texto literal de `SiteSeedDivergence`, para plegar y copiar. */
	detail: string;
}

/** El texto técnico literal de una divergencia, tal como lo escribe `SiteSeedDivergenceError`. */
function divergenceDetail(item: SiteSeedDivergence): string {
	// «sembrado» no sale en la interfaz, ni siquiera en el texto técnico plegado.
	return `${item.piece}: encontró ${item.actual}; esperaba ${item.expected}`.replace(
		/del sembrado/g,
		'de Vega'
	);
}

/** La frase en llano de cada divergencia, deducida del tipo de pieza; el literal queda en `detail`. */
export function describeDivergence(item: SiteSeedDivergence, t: Translate): DivergenceView {
	const detail = divergenceDetail(item);
	const field = /^campo "([^".]+)\.([^"]+)"$/.exec(item.piece);
	if (field) {
		return {
			title: t('settings.site.div.field.title', {
				field: field[2],
				collection: collectionLabel(t, field[1])
			}),
			body: t('settings.site.div.field.body'),
			detail
		};
	}
	const collection = /^colección "([^"]+)"$/.exec(item.piece);
	if (collection) {
		return {
			title: t('settings.site.div.collection.title', {
				collection: collectionLabel(t, collection[1])
			}),
			body: t('settings.site.div.collection.body'),
			detail
		};
	}
	if (item.piece.startsWith('registro "vega/')) {
		return {
			title: t('settings.site.div.manifest.title'),
			body: t(
				item.actual.startsWith('manifiesto distinto')
					? 'settings.site.div.manifest.edited'
					: 'settings.site.div.manifest.other'
			),
			detail
		};
	}
	if (item.piece.startsWith('página canónica')) {
		return {
			title: t('settings.site.page.title'),
			body: t('settings.site.div.page.body'),
			detail
		};
	}
	if (item.piece.startsWith('creación de "blocks"')) {
		return {
			title: t('settings.site.div.blocks.title'),
			body: t('settings.site.div.blocks.body'),
			detail
		};
	}
	return { title: item.piece, body: t('settings.site.div.other.body'), detail };
}

/** Todas las divergencias como un único texto, para «Copiar el detalle». */
export function divergencesText(items: readonly SiteSeedDivergence[]): string {
	return items.map(divergenceDetail).join('\n');
}

/** El resumen de un sembrado terminado («Hecho: 6 colecciones, …»), sin el «siguiente paso». */
export function summarizeResult(result: SiteSeedResult, t: Translate): string {
	const parts: string[] = [];
	const created = result.createdCollections.length;
	if (created > 0) {
		parts.push(
			created === 1
				? t('settings.site.result.collectionOne')
				: t('settings.site.result.collections', { count: created })
		);
	}
	const withFields = Object.keys(result.addedFields).map((name) => collectionLabel(t, name));
	if (withFields.length > 0) {
		parts.push(t('settings.site.result.fields', { names: joinList(t, withFields) }));
	}
	const constrained = Object.keys(result.constrainedFields ?? {}).map((name) =>
		collectionLabel(t, name)
	);
	if (constrained.length > 0) {
		parts.push(t('settings.site.result.constrained', { names: joinList(t, constrained) }));
	}
	if (result.createdRecords.includes('manifest')) {
		parts.push(t('settings.site.result.manifest'));
	}
	if (result.upgradedRecords.includes('manifest')) {
		parts.push(t('settings.site.result.manifestUpgraded'));
	}
	if (result.createdRecords.includes('page:/')) parts.push(t('settings.site.result.page'));
	if (parts.length === 0) return t('settings.site.result.nothing');
	return t('settings.site.result.done', { summary: joinList(t, parts) });
}

/**
 * Lo que no se pudo añadir al modelo de contenido, en una frase, para el resultado de la tarjeta.
 * `null` si se añadió todo. No es un error: lo guardado se conservó tal cual.
 */
export function skippedNote(result: SiteSeedResult, t: Translate): string | null {
	const items = Object.values(result.manifestSkipped ?? {}).flat();
	if (items.length === 0) return null;
	return t('settings.site.result.skipped', {
		names: joinList(
			t,
			items.map((item) => describeSkipped(item, t).title)
		)
	});
}

/**
 * El enlace del correo de invitación, solo cuando hay algo que contar: `'foreign-origin'` no es un
 * error (el sitio se preparó igual), pero el correo seguirá llevando al Admin de PocketBase.
 */
export function invitationLinkNote(result: SiteSeedResult, t: Translate): string | null {
	if (result.invitationLink === 'foreign-origin') {
		return t('admin.editors.addDialog.inviteLinkForeignOrigin');
	}
	if (result.invitationLink === 'custom') return t('admin.editors.addDialog.inviteLinkCustom');
	return null;
}
