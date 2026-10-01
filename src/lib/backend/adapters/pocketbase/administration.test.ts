/**
 * `ensureInvitationLink` del adaptador PocketBase con un cliente de mentira: cuándo escribe la
 * plantilla de invitación y cuándo se abstiene. El criterio de origen está probado suelto en
 * `administration.test.ts` (`canWriteInvitationLink`); aquí, que el adaptador lo aplica y en qué
 * orden respecto a «ya vigente» y «personalizada». El recorrido contra PocketBase real vive en
 * `tests/contract/pocketbase.contract.test.ts`.
 */
import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import { describe, expect, test, vi } from 'vitest';
import { createPocketBaseAdministration } from './administration';

const FACTORY_BODY = '<a href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}">Reset</a>';
const VEGA_BODY = '<a href="{APP_URL}/restablecer?token={TOKEN}">Reset</a>';

function setup(opts: { appURL: unknown; currentBody?: string }) {
	const update = vi.fn(async () => ({}));
	const pb = {
		collections: {
			getOne: vi.fn(async () => ({
				resetPasswordTemplate: { subject: 'Asunto', body: opts.currentBody ?? FACTORY_BODY }
			})),
			update
		},
		send: vi.fn(async () => ({
			auth: { resetPasswordTemplate: { subject: 'Asunto', body: FACTORY_BODY } }
		})),
		settings: { getAll: vi.fn(async () => ({ meta: { appURL: opts.appURL } })) }
	} as unknown as PocketBase;
	const administration = createPocketBaseAdministration({ pb, guarded: (op) => op() });
	return { administration, update };
}

describe('ensureInvitationLink (PocketBase)', () => {
	test('https y mismo origen que appURL: escribe la plantilla relativa a {APP_URL}', async () => {
		const { administration, update } = setup({ appURL: 'https://admin.example.org' });

		await expect(
			administration.ensureInvitationLink('https://admin.example.org/restablecer')
		).resolves.toBe('updated');
		expect(update).toHaveBeenCalledExactlyOnceWith('vega_editors', {
			resetPasswordTemplate: { subject: 'Asunto', body: VEGA_BODY }
		});
	});

	test('localhost contra un servidor de producción: no escribe y lo dice', async () => {
		const { administration, update } = setup({ appURL: 'https://admin.example.org' });

		await expect(
			administration.ensureInvitationLink('http://localhost:5173/restablecer')
		).resolves.toBe('foreign-origin');
		expect(update).not.toHaveBeenCalled();
	});

	test('otro dominio https distinto del appURL: tampoco escribe', async () => {
		const { administration, update } = setup({ appURL: 'https://admin.example.org' });

		await expect(
			administration.ensureInvitationLink('https://otra.example.org/restablecer')
		).resolves.toBe('foreign-origin');
		expect(update).not.toHaveBeenCalled();
	});

	test('mismo origen que appURL pero por http fuera de la máquina: no escribe', async () => {
		const { administration, update } = setup({ appURL: 'http://admin.example.org' });

		await expect(
			administration.ensureInvitationLink('http://admin.example.org/restablecer')
		).resolves.toBe('foreign-origin');
		expect(update).not.toHaveBeenCalled();
	});

	test('desarrollo local: PocketBase local por http con su appURL local sí escribe', async () => {
		const { administration, update } = setup({ appURL: 'http://localhost:8090' });

		await expect(
			administration.ensureInvitationLink('http://localhost:8090/restablecer')
		).resolves.toBe('updated');
		expect(update).toHaveBeenCalledExactlyOnceWith('vega_editors', {
			resetPasswordTemplate: { subject: 'Asunto', body: VEGA_BODY }
		});
	});

	test('appURL ausente o ilegible: no escribe', async () => {
		for (const appURL of [undefined, '', 'no es una url', 42]) {
			const { administration, update } = setup({ appURL });
			await expect(
				administration.ensureInvitationLink('https://admin.example.org/restablecer')
			).resolves.toBe('foreign-origin');
			expect(update).not.toHaveBeenCalled();
		}
	});

	test('plantilla ya vigente: «current» sin escribir', async () => {
		const { administration, update } = setup({
			appURL: 'https://admin.example.org',
			currentBody: VEGA_BODY
		});

		await expect(
			administration.ensureInvitationLink('https://admin.example.org/restablecer')
		).resolves.toBe('current');
		expect(update).not.toHaveBeenCalled();
	});

	test('plantilla personalizada: «custom» sin escribir, venga de donde venga la petición', async () => {
		for (const resetUrl of [
			'https://admin.example.org/restablecer',
			'http://localhost:5173/restablecer'
		]) {
			const { administration, update } = setup({
				appURL: 'https://admin.example.org',
				currentBody: '<p>Mi enlace: {TOKEN}</p>'
			});
			await expect(administration.ensureInvitationLink(resetUrl)).resolves.toBe('custom');
			expect(update).not.toHaveBeenCalled();
		}
	});
});

describe('createEditor (PocketBase)', () => {
	function setupCreate(requestPasswordReset: () => Promise<boolean>) {
		const create = vi.fn(async () => ({ id: 'e1', email: 'ana@vega.test', verified: false }));
		const pb = {
			collection: vi.fn(() => ({ create, requestPasswordReset }))
		} as unknown as PocketBase;
		return createPocketBaseAdministration({ pb, guarded: (op) => op() });
	}

	test('invitación pedida con éxito: invitationSent true', async () => {
		const administration = setupCreate(async () => true);
		const created = await administration.createEditor('ana@vega.test', { kind: 'invite' });
		expect(created).toMatchObject({ id: 'e1', invitationSent: true });
	});

	test('la cuenta se crea pero el correo falla: no lanza y devuelve invitationSent false', async () => {
		const administration = setupCreate(async () => {
			throw new ClientResponseError({ status: 500, response: {} });
		});
		const created = await administration.createEditor('ana@vega.test', { kind: 'invite' });
		expect(created).toMatchObject({ id: 'e1', email: 'ana@vega.test', invitationSent: false });
	});

	test('una sesión caducada (401) durante el correo sigue subiendo', async () => {
		const administration = setupCreate(async () => {
			throw new ClientResponseError({ status: 401, response: {} });
		});
		await expect(
			administration.createEditor('ana@vega.test', { kind: 'invite' })
		).rejects.toBeInstanceOf(ClientResponseError);
	});

	test('con contraseña no hay invitación', async () => {
		const administration = setupCreate(async () => true);
		const created = await administration.createEditor('ana@vega.test', {
			kind: 'password',
			password: 'una-contraseña-larga'
		});
		expect(created.invitationSent).toBe(false);
	});
});
