/**
 * Lógica pura de la tarjeta «Base del sitio» de `/settings` (`SiteBaseCard.svelte`): convierte el
 * preflight (`previewSiteSeed`) y el resultado (`seedSiteProject`) en lo que se enseña. Sin DOM ni
 * puerto; el texto sale de `settings.site.*` vía el `t` que recibe.
 *
 * La palabra «sembrado» no sale en la interfaz: la pieza se llama «Base del sitio».
 */
import type {
	SiteSeedDivergence,
	SiteSeedPlanSummary,
	SiteSeedPreview,
	SiteSeedResult
} from '$lib/backend/site-seeding';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Colecciones visibles que comprueba el preflight (sin `vega_editors`, que no se puede leer). */
export const SITE_BASE_COLLECTIONS = [
	'pages',
	'vega_media',
	'blocks',
	'redirects',
	'vega'
] as const;

/** Qué muestra la tarjeta cuando el preflight terminó. */
export type SiteBaseKind = 'unprepared' | 'update' | 'current' | 'blocked';

export function siteBaseKind(preview: SiteSeedPreview): SiteBaseKind {
	if (preview.status === 'blocked') return 'blocked';
	if (preview.plan.upToDate) return 'current';
	return preview.plan.createdCollections.length > 0 ? 'unprepared' : 'update';
}

/** El diálogo prepara (hay colecciones por crear) o actualiza. */
export type SiteBaseMode = 'prepare' | 'update';

export function siteBaseMode(plan: SiteSeedPlanSummary): SiteBaseMode {
	return plan.createdCollections.length > 0 ? 'prepare' : 'update';
}

function collectionLabel(t: Translate, name: string): string {
	return (SITE_BASE_COLLECTIONS as readonly string[]).includes(name)
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

export interface PlanItem {
	title: string;
	text: string;
	/** Nombre técnico (colección o campos), en `<code>`. */
	code?: string;
	/** `true`: el código va antes del texto (colecciones); `false`: después (campos). */
	codeFirst?: boolean;
}

export interface PlanGroup {
	/** `create` | `add` | `replace`: sirve de `data-` y de clave del encabezado. */
	id: 'create' | 'add' | 'replace';
	heading: string;
	items: PlanItem[];
}

export interface PlanView {
	groups: PlanGroup[];
	/** Solo al actualizar: lo que no cambia («Medios y Bloques ya están al día.»). */
	rest: string | null;
}

/** El plan en grupos «Se crea» / «Se añade» / «Se sustituye», con su texto. */
export function buildPlanView(plan: SiteSeedPlanSummary, t: Translate): PlanView {
	const mode = siteBaseMode(plan);
	const create: PlanItem[] = [];
	const add: PlanItem[] = [];
	const replace: PlanItem[] = [];

	for (const name of plan.createdCollections) {
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

	for (const [collection, fields] of Object.entries(plan.addedFields)) {
		const friendly = fields
			.map((field) => fieldLabel(t, field))
			.filter((label): label is string => label !== null);
		add.push({
			title: t(
				fields.length === 1 ? 'settings.site.addFields.one' : 'settings.site.addFields.many',
				{
					count: fields.length,
					collection: collectionLabel(t, collection)
				}
			),
			text: friendly.length > 0 ? friendly.map((label) => `«${label}»`).join(', ') : '',
			code: fields.join(', ')
		});
	}
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
	if (plan.manifest === 'upgrade') {
		replace.push({
			title: collectionLabel(t, 'vega'),
			text: t('settings.site.replace.manifest')
		});
	}

	const groups: PlanGroup[] = [];
	if (create.length > 0) {
		groups.push({ id: 'create', heading: t('settings.site.group.create'), items: create });
	}
	if (add.length > 0) groups.push({ id: 'add', heading: t('settings.site.group.add'), items: add });
	if (replace.length > 0) {
		groups.push({ id: 'replace', heading: t('settings.site.group.replace'), items: replace });
	}

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
			rest = t(untouched.length === 1 ? 'settings.site.plan.restOne' : 'settings.site.plan.rest', {
				names: joinList(t, untouched)
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

export interface DivergenceView {
	title: string;
	body: string;
	/** El texto literal de `SiteSeedDivergence`, para plegar y copiar. */
	detail: string;
}

/** El texto técnico literal de una divergencia, tal como lo escribe `SiteSeedDivergenceError`. */
export function divergenceDetail(item: SiteSeedDivergence): string {
	return `${item.piece}: encontró ${item.actual}; esperaba ${item.expected}`;
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
