/**
 * `/editores` montada con un puerto de mentira: el aviso de colección ausente con «Ir a Ajustes», la
 * tarjeta del correo debajo de la lista (solo con `serverSettings`, y solo con la lista cargada) y lo
 * que hace la página al guardarse el correo: releer si hay correo y corregir la plantilla de la
 * invitación, diciéndolo. El recorrido completo contra `memory` está en `e2e/superuser.spec.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import {
	VegaError,
	type AdministrationPort,
	type BackendPort,
	type InvitationLinkState,
	type ServerSettings,
	type ServerSettingsPort
} from '$lib/backend';

const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

import EditorsPage from '../../routes/editores/+page.svelte';

const SETTINGS: ServerSettings = {
	meta: {
		appURL: 'https://aguja.example',
		senderName: 'Aguja',
		senderAddress: 'web@aguja.example'
	},
	smtp: { enabled: true, host: 'smtp.aguja.example', port: 587, username: '', tls: false },
	backups: {
		cron: '',
		cronMaxKeep: 3,
		s3: {
			enabled: false,
			endpoint: '',
			bucket: '',
			region: '',
			accessKey: '',
			forcePathStyle: false
		}
	}
};

function fakeAdministration(overrides: Partial<AdministrationPort> = {}): AdministrationPort {
	return {
		listEditors: vi.fn(async () => ({
			editors: [{ id: 'e1', email: 'ana@aguja.example', verified: true, created: null }],
			passwordMinLength: 8
		})),
		mailEnabled: vi.fn(async () => false),
		createEditor: vi.fn(),
		setEditorPassword: vi.fn(),
		sendEditorInvitation: vi.fn(),
		removeEditor: vi.fn(),
		listBackups: vi.fn(),
		createBackup: vi.fn(),
		backupDownloadUrl: vi.fn(),
		ensureInvitationLink: vi.fn(async () => 'current' as InvitationLinkState),
		...overrides
	} as AdministrationPort;
}

function fakeSettings(overrides: Partial<ServerSettingsPort> = {}): ServerSettingsPort {
	return {
		get: vi.fn(async () => SETTINGS),
		update: vi.fn(async () => SETTINGS),
		testS3: vi.fn(),
		testEmail: vi.fn(),
		...overrides
	} as ServerSettingsPort;
}

type Mounted = { target: HTMLElement; instance: Record<string, never>; ctx: VegaAppContext };
let mounted: Mounted | null = null;

function mountPage(admin: AdministrationPort, serverSettings?: ServerSettingsPort) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		session: { user: { id: 'su', email: 'david@aguja.example' } },
		port: {
			capabilities: { administration: true, serverSettings: serverSettings !== undefined },
			administration: admin,
			serverSettings
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(EditorsPage as never, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	mounted = { target, instance, ctx };
	return { target, ctx };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await tick();
}

function button(target: HTMLElement, text: string): HTMLButtonElement {
	const found = Array.from(target.querySelectorAll('button')).find((b) =>
		b.textContent?.includes(text)
	);
	if (!found) throw new Error(`No hay botón con «${text}»`);
	return found;
}

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.clearAllMocks();
});

describe('/editores', () => {
	test('colección ausente: el aviso nuevo, sin mandar al Admin de PocketBase, y «Ir a Ajustes» lleva a /settings', async () => {
		const admin = fakeAdministration({
			listEditors: vi.fn(async () => {
				throw VegaError.notFound('sin colección');
			})
		});
		const { target } = mountPage(admin, fakeSettings());
		await settle();
		const notice = target.querySelector('[data-editors-state="missing"]')!;
		expect(notice.textContent).toContain('admin.editors.missingCollection');
		expect(notice.textContent).not.toContain('vega_editors');
		button(target, 'admin.editors.goToSettings').click();
		expect(goto).toHaveBeenCalledWith(expect.stringMatching(/\/settings$/));
		// Sin colección la tarjeta del correo no tiene sentido: no sale.
		expect(target.querySelector('[data-mail-card]')).toBeNull();
	});

	test('con la lista cargada, la tarjeta del correo va DEBAJO de la lista', async () => {
		const { target } = mountPage(fakeAdministration(), fakeSettings());
		await settle();
		const list = target.querySelector('[data-editors-state="ready"]')!;
		const card = target.querySelector('[data-mail-card]')!;
		expect(list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	test('sin sección serverSettings no hay tarjeta de correo', async () => {
		const { target } = mountPage(fakeAdministration());
		await settle();
		expect(target.querySelector('[data-editors-state="ready"]')).not.toBeNull();
		expect(target.querySelector('[data-mail-card]')).toBeNull();
	});

	test('si los ajustes no cargan, error con «Reintentar» y la lista sigue a la vista', async () => {
		const get = vi
			.fn<ServerSettingsPort['get']>()
			.mockRejectedValueOnce(VegaError.network(new Error('x'), 'caído'))
			.mockResolvedValue(SETTINGS);
		const { target, ctx } = mountPage(fakeAdministration(), fakeSettings({ get }));
		await settle();
		expect(target.querySelector('[data-mail-card="error"]')).not.toBeNull();
		expect(target.querySelector('[data-editors-state="ready"]')).not.toBeNull();
		expect(ctx.feedback.reportError).toHaveBeenCalled();
		button(target, 'common.retry').click();
		await settle();
		expect(target.querySelector('[data-mail-card="configured"]')).not.toBeNull();
	});

	test('al guardar el correo: relee si hay correo y, si la plantilla se corrigió, lo dice', async () => {
		const ensure = vi
			.fn<AdministrationPort['ensureInvitationLink']>()
			.mockResolvedValueOnce('foreign-origin')
			.mockResolvedValueOnce('updated');
		const admin = fakeAdministration({
			ensureInvitationLink: ensure,
			mailEnabled: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
		});
		const update = vi.fn(async () => SETTINGS);
		const { target, ctx } = mountPage(admin, fakeSettings({ update }));
		await settle();
		button(target, 'admin.settings.change').click();
		await settle();
		const host = target.querySelector<HTMLInputElement>('input[id$="-host"]')!;
		host.value = 'otro.aguja.example';
		host.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		target
			.querySelector('[data-mail-card] form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		expect(update).toHaveBeenCalledTimes(1);
		expect(admin.mailEnabled).toHaveBeenCalledTimes(2);
		expect(ensure).toHaveBeenCalledTimes(2);
		expect(ctx.feedback.toast).toHaveBeenCalledWith('admin.appUrl.linkFixed', { kind: 'success' });
	});

	test('si la plantilla ya estaba al día, no hay toast de corrección', async () => {
		const admin = fakeAdministration();
		const { target, ctx } = mountPage(admin, fakeSettings());
		await settle();
		button(target, 'admin.settings.change').click();
		await settle();
		const host = target.querySelector<HTMLInputElement>('input[id$="-host"]')!;
		host.value = 'otro.aguja.example';
		host.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		target
			.querySelector('[data-mail-card] form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		expect(ctx.feedback.toast).not.toHaveBeenCalledWith(
			'admin.appUrl.linkFixed',
			expect.anything()
		);
	});
});
