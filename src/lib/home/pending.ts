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
import { createBuildClient } from '$lib/backend/build-client';
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
 * «Cambios sin publicar en el sitio»: `true`/`false` si se puede saber, `null` si no (ningún tipo
 * con fecha de última edición legible, ver `detectUnpublishedChanges`). Solo tiene sentido si el
 * proyecto anuncia `build` (`port.buildApiUrl`); sin él la tarjeta no existe y esto no se llama.
 *
 * Coste: un `GET` al estado del build (de ahí sale la fecha de la última publicación) más la
 * consulta de `detectUnpublishedChanges`, una `list` de un registro por colección con fecha de
 * edición. Es el mismo cálculo que hace el botón «Publicar» de la barra superior, repetido aquí
 * porque ese botón no comparte su resultado. Rechaza si el estado del build no se puede leer.
 */
export async function loadUnpublishedChanges(
	port: BackendPort,
	model: ContentModel,
	token: string,
	fetcher?: typeof fetch
): Promise<boolean | null> {
	if (!port.buildApiUrl) return null;
	const client = createBuildClient({ apiUrl: port.buildApiUrl, token, fetcher });
	const status = await client.fetchStatus();
	const result = await detectUnpublishedChanges(
		port,
		model.types.map((type) => type.schema),
		status.lastPublishedAt
	);
	return result.hasChanges;
}

/** El número de una tarjeta: `totalItems` de su única consulta. Rechaza si la consulta falla. */
export async function loadPendingCount(
	port: Pick<BackendPort, 'list'>,
	card: PendingCard
): Promise<number> {
	const page = await port.list(card.collection, card.query);
	return page.totalItems;
}
