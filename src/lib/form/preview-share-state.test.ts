import { describe, expect, test, vi } from 'vitest';
import {
	PreviewShareRequestError,
	type CreatedPreviewShareLink,
	type PreviewShareLink
} from '$lib/backend/preview-share-client';
import { resolveContentModel } from '$lib/model/resolve';
import {
	canManagePreviewShare,
	PreviewShareController,
	shareFailure,
	validateShareInput
} from './preview-share-state';

const link: CreatedPreviewShareLink = {
	id: 'link1',
	label: 'Ana',
	createdAt: '2026-10-07T12:00:00Z',
	expiresAt: '2026-10-08T12:00:00Z',
	createdBy: 'editor1',
	createdByCollection: 'vega_editors',
	url: 'https://site.test/preview-share/opaque'
};
function setup() {
	const client = {
		listLinks: vi.fn(async (): Promise<PreviewShareLink[]> => []),
		createLink: vi.fn(async () => link),
		revokeLink: vi.fn(async () => {})
	};
	const changed = vi.fn();
	const controller = new PreviewShareController(client, 'pages', 'page1', changed);
	return { client, controller, changed };
}

describe('compartir: entradas y permisos', () => {
	test.each([
		['1', 'seconds', 1],
		['299', 'seconds', 299],
		['1', 'days', 86400],
		['30', 'days', 2592000],
		['43200', 'minutes', 2592000]
	] as const)('acepta %s %s sin mínimo de300segundos', (amount, unit, ttlSeconds) => {
		expect(validateShareInput(amount, unit, ' Ana ')).toEqual({
			ok: true,
			ttlSeconds,
			label: 'Ana'
		});
	});
	test.each(['', '0', '-1', '0.5', 'no', '2592001'])(
		'rechaza cantidad %s sin recortarla',
		(amount) => {
			expect(validateShareInput(amount, 'seconds', '')).toEqual({ ok: false, field: 'duration' });
		}
	);
	test('la etiqueta respeta120runas y rechaza controles', () => {
		expect(validateShareInput('1', 'days', '😀'.repeat(120)).ok).toBe(true);
		expect(validateShareInput('1', 'days', '😀'.repeat(121))).toEqual({
			ok: false,
			field: 'label'
		});
		expect(validateShareInput('1', 'days', 'Ana\u0085cliente')).toEqual({
			ok: false,
			field: 'label'
		});
	});
	test('necesita registro guardado, endpoint, anuncio, view y update; readonly nunca publica', () => {
		const type = resolveContentModel({
			types: [{ name: 'pages', readonly: false, fields: [] }],
			manifestRaw: null
		}).types[0];
		const port = { previewShare: true, previewApiUrl: 'https://pb.test/api/preview' };
		expect(canManagePreviewShare(type, 'page1', port)).toBe(true);
		expect(canManagePreviewShare(type, null, port)).toBe(false);
		expect(canManagePreviewShare(type, 'page1', { ...port, previewShare: false })).toBe(false);
		expect(canManagePreviewShare(type, 'page1', { ...port, previewApiUrl: null })).toBe(false);
		for (const key of ['view', 'update'] as const)
			expect(
				canManagePreviewShare(
					{ ...type, permissions: { ...type.permissions, [key]: false } },
					'page1',
					port
				)
			).toBe(false);
		expect(canManagePreviewShare({ ...type, readonly: true }, 'page1', port)).toBe(false);
		expect(canManagePreviewShare(type, 'page1', port, true)).toBe(false);
	});
	test.each([
		[401, 'session'],
		[403, 'forbidden'],
		[404, 'unavailable'],
		[409, 'limit'],
		[503, 'notReady'],
		[400, 'input']
	] as const)('status%s tiene categoría%s sin texto crudo', (status, failure) => {
		expect(shareFailure(new PreviewShareRequestError(status, 'POST', '/share'))).toBe(failure);
	});
});

describe('una sola apertura de compartir', () => {
	test('lista antes de crear, default24h; URL solo éxito local y nunca en fila', async () => {
		const { client, controller } = setup();
		await controller.create('1', 'days', 'Ana');
		expect(client.createLink).not.toHaveBeenCalled();
		await controller.load();
		await controller.create('1', 'days', ' Ana ');
		expect(client.createLink).toHaveBeenCalledWith('pages', 'page1', {
			ttlSeconds: 86400,
			label: 'Ana'
		});
		expect(controller.state.created?.url).toBe(link.url);
		expect(controller.state.links[0]).not.toHaveProperty('url');
		controller.markCopied();
		expect(controller.state.copied).toBe(true);
		controller.dispose();
		expect(controller.state.created).toBeNull();
		const reopened = setup();
		await reopened.controller.load();
		expect(reopened.controller.state.created).toBeNull();
	});
	test('un POST tardío tras desmontaje no cambia estado ni expone URL al listener', async () => {
		const { client, controller, changed } = setup();
		await controller.load();
		let resolve!: (value: CreatedPreviewShareLink) => void;
		client.createLink.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const pending = controller.create('1', 'seconds', 'Ana');
		controller.dispose();
		changed.mockClear();
		resolve(link);
		await pending;
		expect(changed).not.toHaveBeenCalled();
		expect(controller.state.created).toBeNull();
	});
	test('busy no duplicaPOST; respuesta incierta bloquea nueva creación incluso después de leer', async () => {
		const { client, controller } = setup();
		await controller.load();
		let reject!: (error: Error) => void;
		client.createLink.mockImplementation(
			() =>
				new Promise((_resolve, fail) => {
					reject = fail;
				})
		);
		const pending = controller.create('1', 'seconds', 'Ana');
		await controller.create('1', 'seconds', 'Ana');
		expect(client.createLink).toHaveBeenCalledTimes(1);
		reject(new TypeError('transport body must never reach UI'));
		await pending;
		expect(controller.state.uncertain).toBe(true);
		expect(controller.state.error).toBe('network');
		await controller.load();
		await controller.create('1', 'seconds', 'Ana');
		expect(client.createLink).toHaveBeenCalledTimes(1);
	});
	test('400 conserva posibilidad de corregir y una lista fallida no parece vacía', async () => {
		const { client, controller } = setup();
		client.listLinks.mockRejectedValueOnce(new PreviewShareRequestError(403, 'GET', '/share'));
		await controller.load();
		expect(controller.state.listPhase).toBe('error');
		expect(controller.state.error).toBe('forbidden');
		await controller.load();
		client.createLink.mockRejectedValueOnce(new PreviewShareRequestError(400, 'POST', '/share'));
		await controller.create('1', 'seconds', 'Ana');
		expect(controller.state.error).toBe('input');
		expect(controller.state.uncertain).toBe(false);
		await controller.create('1', 'days', 'Ana');
		expect(controller.state.created).toEqual(link);
	});
	test('anulación fallida mantiene fila; éxito204 la quita y nunca recupera URL', async () => {
		const { client, controller } = setup();
		await controller.load();
		await controller.create('1', 'days', 'Ana');
		client.revokeLink.mockRejectedValueOnce(
			new PreviewShareRequestError(503, 'POST', '/share/revoke')
		);
		expect(await controller.revoke('link1')).toBe(false);
		expect(controller.state.links).toHaveLength(1);
		expect(await controller.revoke('link1')).toBe(true);
		expect(controller.state.links).toHaveLength(0);
		expect(controller.state.created).toBeNull();
	});
	test('una lectura superada por otra no repone una lista antigua', async () => {
		const { client, controller } = setup();
		let resolve!: (value: PreviewShareLink[]) => void;
		client.listLinks.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const { url: _url, ...dto } = link;
		client.listLinks.mockResolvedValueOnce([{ ...dto, id: 'new-list' }]);
		const old = controller.load();
		await controller.load();
		resolve([{ ...dto, id: 'old-list' }]);
		await old;
		expect(controller.state.listPhase).toBe('ready');
		expect(controller.state.error).toBeNull();
		expect(controller.state.links.map((link) => link.id)).toEqual(['new-list']);
	});
});
