import { describe, expect, test, vi } from 'vitest';
import type { AdministrationPort } from './port';
import { deferredAdministration } from './administration';
import {
	canWriteInvitationLink,
	invitationTemplateBody,
	sortBackups,
	sortEditors,
	toIsoDate
} from './administration-rules';

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
		backupDownloadUrl: vi.fn(async (key: string) => `url:${key}`),
		ensureInvitationLink: vi.fn(async () => 'current' as const)
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

describe('invitationTemplateBody', () => {
	const factory = '<a href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}">Reset</a>';

	test('Vega bajo el appURL de PB: enlace relativo a {APP_URL}', () => {
		expect(
			invitationTemplateBody(
				factory,
				'https://admin.fodaveg.net/restablecer',
				'https://admin.fodaveg.net/'
			)
		).toBe('<a href="{APP_URL}/restablecer?token={TOKEN}">Reset</a>');
	});

	test('Vega en otra dirección (o appURL de fábrica): enlace absoluto a Vega', () => {
		expect(
			invitationTemplateBody(factory, 'https://vega.example/restablecer', 'http://localhost:8090')
		).toBe('<a href="https://vega.example/restablecer?token={TOKEN}">Reset</a>');
	});

	test('una plantilla de fábrica sin el enlace conocido (otra versión de PB) → null', () => {
		expect(invitationTemplateBody('<p>{TOKEN}</p>', 'https://x.test/restablecer', '')).toBeNull();
	});
});

describe('canWriteInvitationLink', () => {
	test.each([
		['https y mismo origen', 'https://admin.example.org/restablecer', 'https://admin.example.org'],
		[
			'appURL con barra final y espacios',
			'https://admin.example.org/restablecer',
			' https://admin.example.org/ '
		],
		[
			'Vega bajo una subruta del mismo origen',
			'https://example.org/vegacms/restablecer',
			'https://example.org'
		],
		[
			'puerto https explícito e igual',
			'https://admin.example.org:8443/restablecer',
			'https://admin.example.org:8443'
		],
		[
			'desarrollo local: localhost por http',
			'http://localhost:8090/restablecer',
			'http://localhost:8090'
		],
		[
			'desarrollo local: 127.0.0.1 por http',
			'http://127.0.0.1:8090/restablecer',
			'http://127.0.0.1:8090/'
		],
		['desarrollo local: IPv6 de loopback', 'http://[::1]:8090/restablecer', 'http://[::1]:8090'],
		[
			'desarrollo local: subdominio de localhost',
			'http://vega.localhost:8090/restablecer',
			'http://vega.localhost:8090'
		]
	])('escribe: %s', (_name, resetUrl, appUrl) => {
		expect(canWriteInvitationLink(resetUrl, appUrl)).toBe(true);
	});

	test.each([
		[
			'localhost (vite dev) contra producción',
			'http://localhost:5173/restablecer',
			'https://admin.example.org'
		],
		[
			'localhost con otro puerto que el appURL local',
			'http://localhost:5173/restablecer',
			'http://localhost:8090'
		],
		[
			'localhost frente a 127.0.0.1: orígenes distintos',
			'http://localhost:8090/restablecer',
			'http://127.0.0.1:8090'
		],
		['otro dominio https', 'https://otra.example.org/restablecer', 'https://admin.example.org'],
		[
			'mismo host, http frente a https',
			'http://admin.example.org/restablecer',
			'https://admin.example.org'
		],
		[
			'http fuera de la máquina aunque coincida con appURL',
			'http://admin.example.org/restablecer',
			'http://admin.example.org'
		],
		[
			'IP de red local por http aunque coincida',
			'http://192.168.1.20:8090/restablecer',
			'http://192.168.1.20:8090'
		],
		[
			'un dominio que solo empieza por localhost',
			'http://localhost.example.org/restablecer',
			'http://localhost.example.org'
		],
		['appURL vacío', 'https://admin.example.org/restablecer', ''],
		['appURL ilegible', 'https://admin.example.org/restablecer', 'no es una url'],
		['resetUrl relativa', '/restablecer', 'https://admin.example.org']
	])('no escribe: %s', (_name, resetUrl, appUrl) => {
		expect(canWriteInvitationLink(resetUrl, appUrl)).toBe(false);
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
