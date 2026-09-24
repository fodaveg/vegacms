import { describe, expect, test, vi } from 'vitest';
import type { AdministrationPort } from './port';
import { deferredAdministration } from './administration';
import { sortBackups, sortEditors, toIsoDate } from './administration-rules';

function fakeSection(): AdministrationPort {
	return {
		listEditors: vi.fn(async () => ({ editors: [], passwordMinLength: 8 })),
		mailEnabled: vi.fn(async () => true),
		createEditor: vi.fn(),
		setEditorPassword: vi.fn(),
		sendEditorInvitation: vi.fn(),
		removeEditor: vi.fn(),
		listBackups: vi.fn(async () => []),
		createBackup: vi.fn(async () => 'created' as const),
		backupDownloadUrl: vi.fn(async (key: string) => `url:${key}`)
	};
}

describe('deferredAdministration', () => {
	test('no carga nada hasta el primer uso, y carga una sola vez aunque haya llamadas a la vez', async () => {
		const section = fakeSection();
		const load = vi.fn(async () => section);
		const admin = deferredAdministration(load);
		expect(load).not.toHaveBeenCalled();

		const [mail, url] = await Promise.all([admin.mailEnabled(), admin.backupDownloadUrl('k')]);
		expect(mail).toBe(true);
		expect(url).toBe('url:k');
		expect(load).toHaveBeenCalledTimes(1);
		expect(section.backupDownloadUrl).toHaveBeenCalledWith('k');
	});

	test('si el import() falla rechaza con VegaError network, y el siguiente uso lo reintenta', async () => {
		const section = fakeSection();
		const load = vi
			.fn<() => Promise<AdministrationPort>>()
			.mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
			.mockResolvedValueOnce(section);
		const admin = deferredAdministration(load);

		await expect(admin.listBackups()).rejects.toMatchObject({ kind: 'network', retryable: true });
		await expect(admin.listBackups()).resolves.toEqual([]);
		expect(load).toHaveBeenCalledTimes(2);
	});
});

describe('reglas de administración', () => {
	test('toIsoDate lee la fecha con espacio de PocketBase y rechaza lo ilegible', () => {
		expect(toIsoDate('2026-09-24 06:28:36.690Z')).toBe('2026-09-24T06:28:36.690Z');
		expect(toIsoDate('')).toBeNull();
		expect(toIsoDate('nunca')).toBeNull();
		expect(toIsoDate(null)).toBeNull();
	});

	test('copias: la más reciente primero; editores: alta más antigua primero', () => {
		expect(
			sortBackups([
				{ key: 'a.zip', size: 1, modified: '2026-08-02T18:40:00.000Z' },
				{ key: 'b.zip', size: 1, modified: '2026-09-24T10:15:00.000Z' }
			]).map((b) => b.key)
		).toEqual(['b.zip', 'a.zip']);
		expect(
			sortEditors([
				{ id: '2', email: 'b@x.es', verified: true, created: '2026-09-22T00:00:00.000Z' },
				{ id: '1', email: 'a@x.es', verified: true, created: '2026-02-03T00:00:00.000Z' }
			]).map((e) => e.id)
		).toEqual(['1', '2']);
	});
});
