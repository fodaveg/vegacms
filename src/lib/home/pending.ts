/**
 * Tarjetas de pendientes de la portada (`/`): qué tarjetas EXISTEN en este proyecto según su
 * modelo, y la consulta de cada una. Sin Svelte.
 *
 * Reglas (encargo «portada con pendientes»):
 * - Cada tarjeta cuesta UNA `list` con `perPage: 1`, de la que solo se lee `totalItems`. Se lanzan
 *   en paralelo y cada una falla por su cuenta: una caída no tumba a las demás.
 * - Una tarjeta cuyo dato no existe en el proyecto (tipo sin estado, sin campo de descripción,
 *   sin biblioteca de medios) NO existe: enseñar un cero ahí sería afirmar algo que no se sabe.
 * - Solo es un enlace la tarjeta cuyo filtro se puede escribir en la URL del listado. Hoy esa URL
 *   solo sabe `?q=&sort=&dir=&status=&page=` (`list/query-state.ts`), así que únicamente «en
 *   borrador» enlaza. «Con publicación programada» (estado más fecha futura) y «sin descripción»
 *   (campo vacío) no caben en ella, y `/media` no tiene filtro: esas tarjetas son solo el número.
 */

import type { BackendPort } from '$lib/backend/port';
import { createBuildClient, type BuildState, type BuildStatus } from '$lib/backend/build-client';
import { detectUnpublishedChanges } from '$lib/backend/unpublished-changes';
import { allowedFilterOps, type FilterNode, type Query } from '$lib/backend/query';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import { listStatusRoute } from '$lib/nav/routes';
import { navContentTypes } from './home-types';

/** Colección de la biblioteca de medios y su campo de texto alternativo (`media-collection.ts`). */
const MEDIA_COLLECTION = 'vega_media';
const MEDIA_ALT_FIELD = 'alt';

/** Valor de `statusField` de un borrador (convención de publicación, P2 §4.5). */
const DRAFT_STATUS = 'draft';

export type PendingKind = 'drafts' | 'scheduled' | 'description' | 'media-alt';

/** Una tarjeta que el proyecto puede pintar, con la consulta que da su número. */
export interface PendingCard {
	/** Estable entre renders: `kind` más la colección. */
	key: string;
	kind: PendingKind;
	collection: string;
	/** Nombre en plural del tipo («Entradas»), o `null` en la tarjeta de medios. */
	typeLabel: string | null;
	query: Query;
	/** Listado ya filtrado, o `null` si ese filtro no cabe en su URL (ver cabecera). */
	href: string | null;
}

/**
 * Campo de descripción de `type`, o `null` si no tiene: el que su tarjeta social declara
 * (`social.descriptionField`) y, si no declara ninguno, un campo llamado `description`. Tiene que
 * admitir el filtro «vacío» (un campo de texto), o no hay consulta que hacer.
 */
function descriptionFieldOf(type: ResolvedContentType): string | null {
	const name = type.social?.descriptionField ?? 'description';
	const field = type.fields.find((candidate) => candidate.name === name);
	if (!field || !allowedFilterOps(field.schema).includes('empty')) return null;
	return field.name;
}

function countQuery(filter: FilterNode): Query {
	return { filter, page: 1, perPage: 1, fields: [] };
}

/**
 * Las tarjetas de pendientes de este proyecto, en orden: borradores, programadas y sin
 * descripción (cada grupo en el orden del menú lateral) y, al final, la de medios.
 *
 * - **En borrador**: tipos con `statusField`.
 * - **Con publicación programada**: tipos con `publishAtField`, y solo si el servidor publica solo
 *   (`scheduledPublishing === 'active'`): sin ese cron una fecha futura no programa nada. Cuenta
 *   los borradores cuya fecha es posterior a `now`.
 * - **Sin descripción**: tipos con campo de descripción (`descriptionFieldOf`).
 * - **Medios sin texto alternativo**: si existe `vega_media` con su campo `alt`. Cuenta TODOS los
 *   ficheros, también los PDF: el tipo de fichero no se puede filtrar en una consulta (un campo
 *   `file` solo admite «vacío» o «no vacío»), y contarlo en el cliente obligaría a traerlos todos.
 *
 * Solo entran tipos del menú que esta sesión puede listar; los singleton quedan fuera (un único
 * registro no es una lista de pendientes).
 */
export function pendingCards(model: ContentModel, now: number = Date.now()): PendingCard[] {
	const types = navContentTypes(model).filter((type) => !type.singleton && type.permissions.list);
	const cards: PendingCard[] = [];

	for (const type of types) {
		if (type.statusField === null) continue;
		cards.push({
			key: `drafts:${type.name}`,
			kind: 'drafts',
			collection: type.name,
			typeLabel: type.label,
			query: countQuery({ kind: 'cond', field: type.statusField, op: 'eq', value: DRAFT_STATUS }),
			href: listStatusRoute(type.name, DRAFT_STATUS)
		});
	}

	if (model.scheduledPublishing === 'active') {
		// Formato con el que PocketBase guarda las fechas (espacio en vez de `T`): compara el
		// texto, mismo motivo que `trashCutoff` (`revisions/trash-query.ts`).
		const nowText = new Date(now).toISOString().replace('T', ' ');
		for (const type of types) {
			if (type.statusField === null || !type.publishAtField) continue;
			cards.push({
				key: `scheduled:${type.name}`,
				kind: 'scheduled',
				collection: type.name,
				typeLabel: type.label,
				query: countQuery({
					kind: 'group',
					combinator: 'and',
					nodes: [
						{ kind: 'cond', field: type.statusField, op: 'eq', value: DRAFT_STATUS },
						{ kind: 'cond', field: type.publishAtField, op: 'gt', value: nowText }
					]
				}),
				href: null
			});
		}
	}

	for (const type of types) {
		const field = descriptionFieldOf(type);
		if (field === null) continue;
		cards.push({
			key: `description:${type.name}`,
			kind: 'description',
			collection: type.name,
			typeLabel: type.label,
			query: countQuery({ kind: 'cond', field, op: 'empty', value: null }),
			href: null
		});
	}

	const media = model.types.find((type) => type.name === MEDIA_COLLECTION);
	if (
		media &&
		media.permissions.list &&
		media.schema.fields.some((field) => field.name === MEDIA_ALT_FIELD && field.type === 'text')
	) {
		cards.push({
			key: `media-alt:${MEDIA_COLLECTION}`,
			kind: 'media-alt',
			collection: MEDIA_COLLECTION,
			typeLabel: null,
			query: countQuery({ kind: 'cond', field: MEDIA_ALT_FIELD, op: 'empty', value: null }),
			href: null
		});
	}

	return cards;
}

/**
 * Estado de publicación del sitio: cambios conocidos o `null` si no hay fecha de edición
 * legible (ver `detectUnpublishedChanges`), y fecha de la última publicación. Solo tiene sentido
 * si el proyecto anuncia `build` (`port.buildApiUrl`); sin él la tarjeta no existe.
 *
 * Coste inicial: un `GET` al estado del build más la consulta de `detectUnpublishedChanges`,
 * una `list` de un registro por colección con fecha de edición. Si un botón «Publicar» acaba
 * de observar un cambio, reutiliza ese `observedStatus` sin otro GET. En running/failed no
 * calcula la pista de cambios ni afirma que el sitio esté al día. Rechaza si el GET falla.
 */
export async function loadUnpublishedStatus(
	port: BackendPort,
	model: ContentModel,
	token: string,
	fetcher?: typeof fetch,
	observedStatus?: BuildStatus
): Promise<{
	hasChanges: boolean | null;
	lastPublishedAt: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	state: BuildState;
} | null> {
	if (!port.buildApiUrl) return null;
	const status =
		observedStatus ??
		(await createBuildClient({ apiUrl: port.buildApiUrl, token, fetcher }).fetchStatus());
	if (status.state === 'running' || status.state === 'failed')
		return {
			hasChanges: null,
			lastPublishedAt: status.lastPublishedAt,
			startedAt: status.startedAt,
			finishedAt: status.finishedAt,
			state: status.state
		};
	const result = await detectUnpublishedChanges(
		port,
		model.types.map((type) => type.schema),
		status.lastPublishedAt
	);
	return {
		hasChanges: result.hasChanges,
		lastPublishedAt: status.lastPublishedAt,
		startedAt: status.startedAt,
		finishedAt: status.finishedAt,
		state: status.state
	};
}

/** Compatibilidad con quien solo necesita la pista de cambios, sin la fecha de publicación. */
export async function loadUnpublishedChanges(
	port: BackendPort,
	model: ContentModel,
	token: string,
	fetcher?: typeof fetch
): Promise<boolean | null> {
	return (await loadUnpublishedStatus(port, model, token, fetcher))?.hasChanges ?? null;
}

/**
 * Fecha de la última publicación como la escribe la lámina de Inicio v2: «hoy, 09:12», «ayer,
 * 18:40» y, más atrás, día y mes cortos («20 jul, 18:40»). Días de calendario en la zona del
 * navegador, no tramos de 24 h. `null` si la fecha no se puede leer.
 */
export function formatPublishedAt(
	iso: string,
	locale: string,
	now: number = Date.now()
): string | null {
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return null;
	const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
	const startOfDay = (value: Date) =>
		new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
	const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000);
	const day =
		days === 0 || days === 1
			? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day')
			: new Intl.DateTimeFormat(locale, {
					day: 'numeric',
					month: 'short',
					...(new Date(now).getFullYear() === date.getFullYear() ? {} : { year: 'numeric' })
				})
					.format(date)
					.replace(/\.$/, '');
	return `${day}, ${time}`;
}

/** El número de una tarjeta: `totalItems` de su única consulta. Rechaza si la consulta falla. */
export async function loadPendingCount(
	port: Pick<BackendPort, 'list'>,
	card: PendingCard
): Promise<number> {
	const page = await port.list(card.collection, card.query);
	return page.totalItems;
}
