import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ToastAction, VegaAppContext } from '$lib/app-context';
import type { Field } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { model, type } from '$lib/home/fixture';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { withRevisions } from './with-revisions';
import { deleteRecordWithFeedback } from './delete-feedback';

const REVISIONS = VEGA_REVISIONS_COLLECTION.name;
async function setup() {
	const title: Field = {
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		hidden: false,
		presentable: false,
		unique: false
	};
	const inner = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'pw' }],
		contentTypes: [{ name: 'posts', readonly: false, fields: [title] }],
		records: {
			posts: [
				{ id: 'p1', values: { title: 'Primera' } },
				{ id: 'p2', values: { title: 'Segunda' } }
			]
		}
	});
	const session = await inner.login({ email: 'admin@vega.test', password: 'pw' });
	await inner.ensureCollections([VEGA_REVISIONS_COLLECTION]);
	const toast = vi.fn();
	const toTrash = vi.fn();
	const ctx = {
		port: withRevisions(inner),
		session,
		model: model([type('posts'), type(REVISIONS, { hidden: true })], {
			revisions: { enabled: true, trashDays: 30, keepPerRecord: 20 }
		}),
		t: (key: string) => key,
		feedback: { toast },
		nav: { toTrash }
	} as unknown as VegaAppContext;
	return { ctx, inner, toast, toTrash };
}
function action(toast: ReturnType<typeof vi.fn>): ToastAction | undefined {
	return toast.mock.calls[0]?.[1]?.action;
}

beforeEach(() => {
	vi.restoreAllMocks();
});
describe('borrado con acceso acreditado a papelera', () => {
	test('borrado real + get/list exactos: ofrece navegar por el contrato existente', async () => {
		const { ctx, inner, toast, toTrash } = await setup();
		const list = vi.spyOn(ctx.port, 'list');
		expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
		await expect(inner.get('posts', 'p1')).rejects.toMatchObject({ kind: 'not-found' });
		const revision = (await inner.list(REVISIONS)).items[0];
		expect(list).toHaveBeenCalledWith(
			REVISIONS,
			expect.objectContaining({
				perPage: 1,
				filter: expect.objectContaining({
					nodes: expect.arrayContaining([
						{ kind: 'cond', field: 'id', op: 'eq', value: revision.id }
					])
				})
			})
		);
		expect(action(toast)?.label).toBe('revisions.trash.viewSaved');
		action(toast)?.invoke();
		expect(toTrash).toHaveBeenCalledWith();
	});
	test('listRule que devuelve [] no acredita acceso aunque get resuelva', async () => {
		const { ctx, inner, toast } = await setup();
		vi.spyOn(ctx.port, 'list').mockResolvedValue({
			items: [],
			page: 1,
			perPage: 1,
			totalItems: 0,
			totalPages: 0
		});
		expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
		await expect(inner.get('posts', 'p1')).rejects.toMatchObject({ kind: 'not-found' });
		expect(action(toast)).toBeUndefined();
	});
	test.each(['kind', 'id', 'expired', 'invalidDate', 'futureDate'])(
		'una revisión %s no demuestra que esté en papelera',
		async (invalid) => {
			const { ctx, toast } = await setup();
			const get = ctx.port.get;
			vi.spyOn(ctx.port, 'get').mockImplementation(async (collection, id) => {
				const record = await get(collection, id);
				if (collection !== REVISIONS) return record;
				return {
					...record,
					id: invalid === 'id' ? 'another' : record.id,
					values: {
						...record.values,
						kind: invalid === 'kind' ? 'update' : 'delete',
						created:
							invalid === 'expired'
								? '2000-01-01T00:00:00Z'
								: invalid === 'invalidDate'
									? 'bad'
									: invalid === 'futureDate'
										? '2999-01-01T00:00:00Z'
										: record.values.created
					}
				};
			});
			expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
			expect(action(toast)).toBeUndefined();
		}
	);
	test.each(['getDenied', 'listDenied', 'permissions', 'disabled', 'missingCollection'])(
		'%s: no ofrece acción ni convierte el delete en fallo',
		async (scenario) => {
			const { ctx, toast } = await setup();
			if (scenario === 'getDenied')
				vi.spyOn(ctx.port, 'get').mockRejectedValue(VegaError.forbidden());
			if (scenario === 'listDenied')
				vi.spyOn(ctx.port, 'list').mockRejectedValue(VegaError.forbidden());
			if (scenario === 'permissions')
				ctx.model.types.find((t) => t.name === REVISIONS)!.permissions.list = false;
			if (scenario === 'disabled') ctx.model.revisions.enabled = false;
			if (scenario === 'missingCollection') ctx.model.types.splice(1, 1);
			expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
			expect(action(toast)).toBeUndefined();
		}
	);
	test('el listado debe contener el mismo ticket, no otra revisión válida', async () => {
		const { ctx, toast } = await setup();
		vi.spyOn(ctx.port, 'list').mockResolvedValue({
			items: [
				{
					id: 'other',
					type: REVISIONS,
					values: {
						kind: 'delete',
						collection: 'posts',
						recordId: 'p1',
						created: new Date().toISOString()
					}
				}
			],
			page: 1,
			perPage: 1,
			totalItems: 1,
			totalPages: 1
		});
		expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
		expect(action(toast)).toBeUndefined();
	});
	test.each(['token', 'user', 'port'])(
		'cambio de %s durante la lectura: no emite datos ni permite navegar',
		async (part) => {
			const { ctx, toast, toTrash } = await setup();
			const get = ctx.port.get;
			vi.spyOn(ctx.port, 'get').mockImplementation(async (collection, id) => {
				const record = await get(collection, id);
				if (collection === REVISIONS) {
					if (part === 'token') ctx.session.token = 'new-token';
					if (part === 'user') ctx.session.user.id = 'new-user';
					if (part === 'port') Object.assign(ctx, { port: { ...ctx.port } });
				}
				return record;
			});
			expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(false);
			expect(toast).not.toHaveBeenCalled();
			expect(toTrash).not.toHaveBeenCalled();
		}
	);
	test('una acción ya visible no navega después de cambiar sesión', async () => {
		const { ctx, toast, toTrash } = await setup();
		await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera');
		ctx.session.token = 'other';
		expect(action(toast)?.isCurrent()).toBe(false);
		action(toast)?.invoke();
		expect(toTrash).not.toHaveBeenCalled();
	});
	test('sin decorador real se ejecuta delete una sola vez y no inventa recuperación', async () => {
		const { ctx, inner, toast } = await setup();
		Object.assign(ctx, { port: inner });
		const deletion = vi.spyOn(inner, 'delete');
		expect(await deleteRecordWithFeedback(ctx, 'posts', 'p1', 'Primera')).toBe(true);
		expect(deletion).toHaveBeenCalledOnce();
		expect(action(toast)).toBeUndefined();
	});
});
