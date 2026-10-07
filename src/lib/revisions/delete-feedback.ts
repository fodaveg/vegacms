/** Borrado unitario: acceso a la papelera solo tras acreditar su revisión exacta y la sesión.
 *  Las lecturas de recuperación son best-effort; nunca convierten un delete exitoso en fallo. */
import type { VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { RecordId } from '$lib/backend/types';
import { parseRevisionRecord } from './revision';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { buildTrashListQuery } from './trash-query';
import { deleteWithRecovery, type DeleteRecoveryTicket } from './with-revisions';

function canConsult(ctx: VegaAppContext): boolean {
	const type = ctx.model.types.find((item) => item.name === VEGA_REVISIONS_COLLECTION.name);
	return ctx.model.revisions.enabled && Boolean(type?.permissions.view && type.permissions.list);
}

function matches(
	ticket: DeleteRecoveryTicket,
	record: Parameters<typeof parseRevisionRecord>[0],
	days: number
): boolean {
	const revision = parseRevisionRecord(record);
	const created = revision?.created ? Date.parse(revision.created) : NaN;
	return Boolean(
		revision &&
		revision.id === ticket.revisionId &&
		revision.kind === 'delete' &&
		revision.collection === ticket.collection &&
		revision.recordId === ticket.recordId &&
		Number.isFinite(created) &&
		created >= Date.now() - days * 86400000 &&
		created <= Date.now()
	);
}

/** La listRule puede filtrar a vacío sin error: get y list deben acreditar ESTA revisión. */
async function confirmedRecovery(
	ctx: VegaAppContext,
	port: BackendPort,
	ticket: DeleteRecoveryTicket,
	isCurrent: () => boolean
): Promise<boolean> {
	try {
		if (!isCurrent() || !canConsult(ctx)) return false;
		const revision = await port.get(VEGA_REVISIONS_COLLECTION.name, ticket.revisionId);
		if (
			!isCurrent() ||
			!canConsult(ctx) ||
			!matches(ticket, revision, ctx.model.revisions.trashDays)
		)
			return false;
		const query = buildTrashListQuery(1, ctx.model.revisions.trashDays);
		const result = await port.list(VEGA_REVISIONS_COLLECTION.name, {
			...query,
			perPage: 1,
			filter: {
				kind: 'group',
				combinator: 'and',
				nodes: [query.filter!, { kind: 'cond', field: 'id', op: 'eq', value: ticket.revisionId }]
			}
		});
		return (
			isCurrent() &&
			canConsult(ctx) &&
			result.items.some((record) => matches(ticket, record, ctx.model.revisions.trashDays))
		);
	} catch {
		return false;
	}
}

/** Devuelve false al cambiar sesión: la ruta no navega ni emite datos de la cuenta anterior. */
export async function deleteRecordWithFeedback(
	ctx: VegaAppContext,
	collection: string,
	id: RecordId,
	label: string
): Promise<boolean> {
	const port = ctx.port;
	const { token, user } = ctx.session;
	const userId = user.id;
	const isCurrent = () =>
		ctx.port === port && ctx.session?.user.id === userId && ctx.session.token === token;
	let ticket: DeleteRecoveryTicket | null;
	try {
		ticket = await deleteWithRecovery(port, collection, id);
	} catch (error) {
		if (!isCurrent()) return false;
		throw error;
	}
	if (!isCurrent()) return false;
	const recoverable = ticket !== null && (await confirmedRecovery(ctx, port, ticket, isCurrent));
	if (!isCurrent()) return false;
	ctx.feedback.toast(
		[
			ctx.t('list.delete.success', { label }),
			recoverable ? ctx.t('revisions.trash.savedVersion') : null
		]
			.filter(Boolean)
			.join(' '),
		{
			kind: 'success',
			...(recoverable
				? {
						action: {
							label: ctx.t('revisions.trash.viewSaved'),
							isCurrent,
							invoke: () => {
								if (isCurrent()) ctx.nav.toTrash();
							}
						}
					}
				: {})
		}
	);
	return true;
}
