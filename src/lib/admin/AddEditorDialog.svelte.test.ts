import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError, type AdministrationPort, type BackendPort } from '$lib/backend';
import AddEditorDialog from './AddEditorDialog.svelte';

function fakeAdministration(overrides: Partial<AdministrationPort> = {}): AdministrationPort {
	return {
		listEditors: vi.fn(),
		mailEnabled: vi.fn(),
		createEditor: vi.fn(async (email: string) => ({
			id: 'e1',
			email,
			verified: false,
			created: null
		})),
		setEditorPassword: vi.fn(),
		sendEditorInvitation: vi.fn(),
		removeEditor: vi.fn(),
		listBackups: vi.fn(),
		createBackup: vi.fn(),
		backupDownloadUrl: vi.fn(),
		ensureInvitationLink: vi.fn(),
		...overrides
	};
}

function mountDialog(
	admin: AdministrationPort,
	mailEnabled: boolean,
	inviteLinkNote: string | null = null
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const onCreated = vi.fn();
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		port: { administration: admin } as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(AddEditorDialog, {
		target,
		props: {
			open: true,
			mailEnabled,
			passwordMinLength: 8,
			inviteLinkNote,
			onClose: vi.fn(),
			onCreated
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, onCreated, ctx };
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

function input(target: HTMLElement, type: string, index = 0): HTMLInputElement {
	return target.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`)[index];
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();
}

async function submit(target: HTMLElement): Promise<void> {
	target.querySelector('form')!.requestSubmit();
	await settle();
}

describe('AddEditorDialog', () => {
	let mounted: ReturnType<typeof mountDialog> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin correo: solo «poner yo la contraseña», con la nota de por qué, y valida antes de enviar', async () => {
		const admin = fakeAdministration();
		mounted = mountDialog(admin, false);
		await settle();
		const { target } = mounted;

		expect(target.querySelectorAll('input[type="radio"]')).toHaveLength(0);
		expect(target.textContent).toContain('admin.editors.addDialog.noMail');
		expect(target.textContent).not.toContain('Copiar');

		await submit(target);
		expect(target.textContent).toContain('admin.form.emailInvalid');
		expect(admin.createEditor).not.toHaveBeenCalled();

		await type(input(target, 'email'), 'lucia@fodaveg.net');
		await type(input(target, 'password', 0), 'huerto');
		await type(input(target, 'password', 1), 'huerto2');
		await submit(target);
		expect(target.textContent).toContain('admin.form.passwordTooShort:{"min":8}');
		expect(target.textContent).not.toContain('admin.form.passwordMismatch');
		expect(admin.createEditor).not.toHaveBeenCalled();

		await type(input(target, 'password', 0), 'huerto-largo');
		await type(input(target, 'password', 1), 'huerto-largo');
		await submit(target);
		expect(admin.createEditor).toHaveBeenCalledWith('lucia@fodaveg.net', {
			kind: 'password',
			password: 'huerto-largo'
		});
		expect(mounted.onCreated).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'lucia@fodaveg.net' }),
			'password'
		);
	});

	test('con correo: invitar es la opción por defecto y no pide contraseña', async () => {
		const admin = fakeAdministration();
		mounted = mountDialog(admin, true);
		await settle();
		const { target } = mounted;

		const radios = target.querySelectorAll<HTMLInputElement>('input[type="radio"]');
		expect(radios).toHaveLength(2);
		expect(radios[0].checked).toBe(true);
		expect(target.querySelectorAll('input[type="password"]')).toHaveLength(0);
		expect(target.textContent).toContain('admin.editors.addDialog.submitInvite');

		await type(input(target, 'email'), 'jorge@fodaveg.net');
		await submit(target);
		expect(admin.createEditor).toHaveBeenCalledWith('jorge@fodaveg.net', { kind: 'invite' });
		expect(mounted.onCreated).toHaveBeenCalledWith(expect.anything(), 'invite');
	});

	test('con la plantilla del correo personalizada, avisa junto a «invitar» y no junto a «contraseña»', async () => {
		mounted = mountDialog(fakeAdministration(), true, 'aviso-enlace');
		await settle();
		const { target } = mounted;
		expect(target.querySelector('[data-editors-invite-link="note"]')?.textContent).toContain(
			'aviso-enlace'
		);

		const passwordRadio = target.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
		passwordRadio.click();
		await settle();
		expect(target.querySelector('[data-editors-invite-link="note"]')).toBeNull();
	});

	test('un email repetido que rechaza el servidor se pinta en el campo y el diálogo sigue abierto', async () => {
		const admin = fakeAdministration({
			createEditor: vi.fn(async () => {
				throw VegaError.validation({
					email: { code: 'validation_not_unique', message: 'Value must be unique.' }
				});
			})
		});
		mounted = mountDialog(admin, true);
		await settle();
		const { target } = mounted;

		await type(input(target, 'email'), 'ana@fodaveg.net');
		await submit(target);
		expect(target.textContent).toContain('admin.form.emailTaken');
		expect(input(target, 'email').getAttribute('aria-invalid')).toBe('true');
		expect(mounted.onCreated).not.toHaveBeenCalled();
		expect(mounted.ctx.feedback.reportError).not.toHaveBeenCalled();
	});
});
