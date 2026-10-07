import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaStrongAuthError } from '$lib/backend';
import type { BackendPort, StepUpMethod, StrongAuthPort } from '$lib/backend';
import SecuritySettings from './SecuritySettings.svelte';

function fakeStrongAuth(): StrongAuthPort {
	return {
		loginWithPassword: vi.fn(),
		loginWithTotp: vi.fn(),
		loginWithRecovery: vi.fn(),
		loginWithPasskey: vi.fn(),
		getStatus: vi.fn(async () => ({
			totpEnabled: false,
			recoveryCodesRemaining: 0,
			passkeys: [{ id: 'passkey-1', name: 'Touch ID', created: '2026-07-22' }]
		})),
		enrollTotp: vi.fn(async () => ({
			otpauthUrl: 'otpauth://totp/Vega:test?secret=ABCDEF',
			secret: 'ABCDEF'
		})),
		verifyTotp: vi.fn(async () => undefined),
		disableTotp: vi.fn(async () => undefined),
		generateRecoveryCodes: vi.fn(async () => ['ABCDE-F2345', 'GHJKL-M6789']),
		registerPasskey: vi.fn(async () => undefined),
		deletePasskey: vi.fn(async () => undefined),
		verifyWithPasskey: vi.fn(async () => undefined)
	};
}

function mountSettings(auth: StrongAuthPort): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	toast: ReturnType<typeof vi.fn>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const toast = vi.fn();
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		port: { strongAuth: auth } as BackendPort,
		feedback: { toast, reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(SecuritySettings, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, toast };
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

describe('SecuritySettings', () => {
	let mounted: ReturnType<typeof mountSettings> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('carga estado y completa el alta TOTP mostrando los recovery codes una sola vez', async () => {
		const auth = fakeStrongAuth();
		mounted = mountSettings(auth);
		await settle();

		expect(mounted.target.textContent).toContain('Touch ID');
		const enroll = Array.from(mounted.target.querySelectorAll('button')).find((button) =>
			button.textContent?.includes('security.totp.enroll')
		);
		enroll?.click();
		await settle();
		expect(mounted.target.textContent).toContain('ABCDEF');
		expect(mounted.target.querySelector('a[href^="otpauth:"]')).not.toBeNull();

		const code = mounted.target.querySelector<HTMLInputElement>('#security-totp-code');
		code!.value = '123456';
		code!.dispatchEvent(new Event('input', { bubbles: true }));
		code!.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();

		expect(auth.verifyTotp).toHaveBeenCalledWith('123456', undefined);
		expect(auth.generateRecoveryCodes).toHaveBeenCalledOnce();
		expect(mounted.target.textContent).toContain('ABCDE-F2345');
		expect(mounted.target.textContent).toContain('GHJKL-M6789');
	});

	test('si fallan los códigos tras verificar el TOTP, refresca el estado y avisa', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.generateRecoveryCodes).mockRejectedValueOnce(new Error('boom'));
		mounted = mountSettings(auth);
		await settle();
		Array.from(mounted.target.querySelectorAll('button'))
			.find((button) => button.textContent?.includes('security.totp.enroll'))
			?.click();
		await settle();
		// A partir de la verificación, el servidor ya devuelve el TOTP como activo.
		vi.mocked(auth.getStatus).mockResolvedValue({
			totpEnabled: true,
			recoveryCodesRemaining: 0,
			passkeys: []
		});
		const code = mounted.target.querySelector<HTMLInputElement>('#security-totp-code');
		code!.value = '123456';
		code!.dispatchEvent(new Event('input', { bubbles: true }));
		code!.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		await settle();

		expect(auth.verifyTotp).toHaveBeenCalledWith('123456', undefined);
		expect(mounted.target.querySelector('[role="alert"]')?.textContent).toContain(
			'security.totp.enabledNoCodes'
		);
		expect(mounted.target.textContent).toContain('security.status.enabled');
		expect(mounted.target.textContent).toContain('security.recovery.regenerate');
	});

	test('registra una passkey con el nombre introducido', async () => {
		const auth = fakeStrongAuth();
		mounted = mountSettings(auth);
		await settle();

		const name = mounted.target.querySelector<HTMLInputElement>('#security-passkey-name');
		name!.value = 'MacBook Touch ID';
		name!.dispatchEvent(new Event('input', { bubbles: true }));
		name!.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();

		expect(auth.registerPasskey).toHaveBeenCalledWith('MacBook Touch ID', undefined);
	});

	describe('prueba de posesión («Confirma que eres tú»)', () => {
		const stepUp = (methods: StepUpMethod[]) =>
			new VegaStrongAuthError('forbidden', 'step-up-required', 'falta la prueba', { methods });

		/** Pantalla con TOTP activo y una passkey, que es cuando el servidor pide la prueba. */
		async function mountEnabled(auth: StrongAuthPort): Promise<HTMLElement> {
			vi.mocked(auth.getStatus).mockResolvedValue({
				totpEnabled: true,
				recoveryCodesRemaining: 8,
				passkeys: [{ id: 'passkey-1', name: 'Touch ID', created: '2026-07-22' }]
			});
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			mounted = mountSettings(auth);
			await settle();
			return mounted.target;
		}

		function button(root: ParentNode, label: string): HTMLButtonElement {
			const found = Array.from(root.querySelectorAll('button')).find((candidate) =>
				candidate.textContent?.includes(label)
			);
			if (!found) throw new Error(`no hay botón «${label}»`);
			return found;
		}

		const dialog = (root: ParentNode) => root.querySelector<HTMLElement>('[role="dialog"]');

		async function submitCode(root: ParentNode, value: string): Promise<void> {
			const input = dialog(root)!.querySelector<HTMLInputElement>('input')!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input
				.closest('form')!
				.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			await settle();
			await settle();
		}

		test('un 428 abre el diálogo con el campo de código y el código correcto repite la MISMA acción y la completa', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.disableTotp).mockRejectedValueOnce(stepUp(['totp']));
			const root = await mountEnabled(auth);
			vi.mocked(auth.getStatus).mockResolvedValue({
				totpEnabled: false,
				recoveryCodesRemaining: 0,
				passkeys: [{ id: 'passkey-1', name: 'Touch ID', created: '2026-07-22' }]
			});

			const opener = button(root, 'security.totp.disable');
			opener.focus();
			opener.click();
			await settle();

			expect(dialog(root)?.textContent).toContain('security.stepUp.title');
			expect(dialog(root)?.textContent).toContain('security.stepUp.bodyTotp');
			// La falta de prueba no es un error de la pantalla: solo se abre el diálogo.
			expect(root.querySelector('.error')).toBeNull();
			const input = dialog(root)!.querySelector<HTMLInputElement>('input')!;
			expect(input.getAttribute('inputmode')).toBe('numeric');
			expect(input.getAttribute('autocomplete')).toBe('one-time-code');
			expect(document.activeElement).toBe(input);
			expect(dialog(root)?.textContent).not.toContain('security.stepUp.usePasskey');

			await submitCode(root, '123456');

			expect(vi.mocked(auth.disableTotp).mock.calls).toEqual([[undefined], [{ code: '123456' }]]);
			expect(dialog(root)).toBeNull();
			expect(document.contains(opener)).toBe(false);
			expect(document.activeElement).toBe(root.querySelector('.vega-security'));
			// La confirmación «¿Desactivar…?» no se repite al reintentar.
			expect(window.confirm).toHaveBeenCalledOnce();
			const ctxToast = vi.mocked(mounted!.toast);
			expect(ctxToast).toHaveBeenCalledWith('security.totp.disabled', { kind: 'success' });
		});

		test('un código incorrecto se enseña dentro del diálogo, que sigue abierto con la acción pendiente', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.generateRecoveryCodes)
				.mockRejectedValueOnce(stepUp(['totp']))
				.mockRejectedValueOnce(new VegaStrongAuthError('forbidden', 'invalid-code', 'no vale'))
				.mockRejectedValueOnce(
					new VegaStrongAuthError('backend', 'locked', 'espera', { waitSeconds: 130 })
				);
			const root = await mountEnabled(auth);
			button(root, 'security.recovery.regenerate').click();
			await settle();

			await submitCode(root, '000000');

			expect(dialog(root)?.querySelector('[role="alert"]')?.textContent).toContain(
				'security.error.invalidCode'
			);
			expect(root.querySelector('.error')).toBeNull();

			await submitCode(root, '111111');

			expect(dialog(root)?.querySelector('[role="alert"]')?.textContent).toContain(
				'security.error.lockedWait:{"minutes":3}'
			);

			await submitCode(root, '222222');

			expect(vi.mocked(auth.generateRecoveryCodes).mock.calls).toEqual([
				[undefined],
				[{ code: '000000' }],
				[{ code: '111111' }],
				[{ code: '222222' }]
			]);
			expect(dialog(root)).toBeNull();
			expect(root.textContent).toContain('ABCDE-F2345');
		});

		test('cancelar cierra el diálogo y deja la pantalla como estaba', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.deletePasskey).mockRejectedValueOnce(stepUp(['totp', 'passkey']));
			const root = await mountEnabled(auth);
			button(root, 'security.passkeys.delete').click();
			await settle();
			expect(dialog(root)?.textContent).toContain('security.stepUp.bodyBoth');

			button(dialog(root)!, 'common.cancel').click();
			await settle();

			expect(dialog(root)).toBeNull();
			expect(auth.deletePasskey).toHaveBeenCalledOnce();
			expect(root.textContent).toContain('Touch ID');
			expect(root.querySelector('.error')).toBeNull();
			expect(button(root, 'security.passkeys.delete').disabled).toBe(false);
		});

		test('Escape cierra el diálogo igual que cancelar', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.disableTotp).mockRejectedValueOnce(stepUp(['totp']));
			const root = await mountEnabled(auth);
			button(root, 'security.totp.disable').click();
			await settle();
			expect(dialog(root)).not.toBeNull();

			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await settle();

			expect(dialog(root)).toBeNull();
			expect(auth.disableTotp).toHaveBeenCalledOnce();
		});

		test('con solo passkey no hay campo de código: «Usar passkey» verifica y repite la acción sin código', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.registerPasskey).mockRejectedValueOnce(stepUp(['passkey']));
			const root = await mountEnabled(auth);
			const name = root.querySelector<HTMLInputElement>('#security-passkey-name')!;
			name.value = 'Llave nueva';
			name.dispatchEvent(new Event('input', { bubbles: true }));
			name.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			await settle();

			expect(dialog(root)?.textContent).toContain('security.stepUp.bodyPasskey');
			expect(dialog(root)!.querySelector('input')).toBeNull();
			const usePasskey = button(dialog(root)!, 'security.stepUp.usePasskey');
			expect(document.activeElement).toBe(usePasskey);

			usePasskey.click();
			await settle();
			await settle();

			expect(auth.verifyWithPasskey).toHaveBeenCalledOnce();
			expect(vi.mocked(auth.registerPasskey).mock.calls).toEqual([
				['Llave nueva', undefined],
				['Llave nueva', undefined]
			]);
			expect(dialog(root)).toBeNull();
		});

		test('si la passkey no verifica, el fallo se queda en el diálogo y la acción no se repite', async () => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.disableTotp).mockRejectedValueOnce(stepUp(['totp', 'passkey']));
			vi.mocked(auth.verifyWithPasskey!).mockRejectedValueOnce(
				new VegaStrongAuthError('forbidden', 'passkey-verify-failed', 'no verifica')
			);
			const root = await mountEnabled(auth);
			button(root, 'security.totp.disable').click();
			await settle();
			// Con los dos métodos se ofrecen los dos.
			expect(dialog(root)!.querySelector('input')).not.toBeNull();

			button(dialog(root)!, 'security.stepUp.usePasskey').click();
			await settle();
			await settle();

			expect(dialog(root)?.querySelector('[role="alert"]')?.textContent).toContain(
				'security.error.passkeyVerifyFailed'
			);
			expect(auth.disableTotp).toHaveBeenCalledOnce();
		});

		test('un puerto sin verificación con passkey no ofrece el botón y explica cómo salir', async () => {
			const auth = fakeStrongAuth();
			delete auth.verifyWithPasskey;
			vi.mocked(auth.deletePasskey).mockRejectedValueOnce(stepUp(['passkey']));
			const root = await mountEnabled(auth);
			button(root, 'security.passkeys.delete').click();
			await settle();

			expect(dialog(root)?.textContent).toContain('security.stepUp.unavailable');
			expect(dialog(root)?.textContent).not.toContain('security.stepUp.usePasskey');
			expect(dialog(root)!.querySelector('input')).toBeNull();
		});
	});

	test('cambiar de app no da el TOTP por desactivado: sigue «Activado» hasta verificar el secreto nuevo', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.getStatus).mockResolvedValue({
			totpEnabled: true,
			recoveryCodesRemaining: 8,
			passkeys: []
		});
		mounted = mountSettings(auth);
		await settle();
		const buttons = () => Array.from(mounted!.target.querySelectorAll('button'));

		buttons()
			.find((candidate) => candidate.textContent?.includes('security.totp.replace'))
			?.click();
		await settle();

		expect(auth.enrollTotp).toHaveBeenCalledOnce();
		expect(mounted.target.textContent).toContain('ABCDEF');
		expect(mounted.target.querySelector('.card-title span')?.textContent).toContain(
			'security.status.enabled'
		);
		expect(mounted.target.textContent).toContain('security.totp.replaceBody');

		const code = mounted.target.querySelector<HTMLInputElement>('#security-totp-code');
		code!.value = '654321';
		code!.dispatchEvent(new Event('input', { bubbles: true }));
		code!.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		await settle();

		expect(auth.verifyTotp).toHaveBeenCalledWith('654321', undefined);
		// Los códigos de recuperación ya guardados siguen valiendo: no se regeneran.
		expect(auth.generateRecoveryCodes).not.toHaveBeenCalled();
		expect(mounted.toast).toHaveBeenCalledWith('security.totp.replaced', { kind: 'success' });
		expect(mounted.target.querySelector('#security-totp-code')).toBeNull();
	});

	/** Pantalla con TOTP activo, cambio de app empezado y el código del secreto nuevo enviado. */
	async function submitReplacementCode(auth: StrongAuthPort, value: string): Promise<HTMLElement> {
		vi.mocked(auth.getStatus).mockResolvedValue({
			totpEnabled: true,
			recoveryCodesRemaining: 8,
			passkeys: []
		});
		mounted = mountSettings(auth);
		await settle();
		Array.from(mounted.target.querySelectorAll('button'))
			.find((candidate) => candidate.textContent?.includes('security.totp.replace'))
			?.click();
		await settle();
		const code = mounted.target.querySelector<HTMLInputElement>('#security-totp-code')!;
		code.value = value;
		code.dispatchEvent(new Event('input', { bubbles: true }));
		code.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		await settle();
		return mounted.target;
	}

	test('si verificar el secreto nuevo pide prueba, el código de confirmación viaja aparte y el del secreto nuevo no cambia', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.verifyTotp).mockRejectedValueOnce(
			new VegaStrongAuthError('forbidden', 'step-up-required', 'falta', { methods: ['totp'] })
		);
		const root = await submitReplacementCode(auth, '654321');

		const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
		const input = dialog.querySelector<HTMLInputElement>('input')!;
		input.value = '111222';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		await settle();

		expect(vi.mocked(auth.verifyTotp).mock.calls).toEqual([
			['654321', undefined],
			['654321', { code: '111222' }]
		]);
		expect(root.querySelector('[role="dialog"]')).toBeNull();
		expect(mounted!.toast).toHaveBeenCalledWith('security.totp.replaced', { kind: 'success' });
	});

	test.each(['current', 'new', undefined] as const)(
		'el rechazo TOTP %s permite corregir el código que el servidor identifica',
		async (codeSource) => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.verifyTotp)
				.mockRejectedValueOnce(
					new VegaStrongAuthError('forbidden', 'step-up-required', 'falta', { methods: ['totp'] })
				)
				.mockRejectedValueOnce(
					new VegaStrongAuthError('forbidden', 'invalid-code', 'inválido', { codeSource })
				);
			const root = await submitReplacementCode(auth, '654321');
			const input = root.querySelector<HTMLInputElement>('[role="dialog"] input')!;
			input.value = '111222';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input
				.closest('form')!
				.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			await settle();
			await settle();
			const dialog = root.querySelector('[role="dialog"]');
			const newCode = root.querySelector<HTMLInputElement>('#security-totp-code')!;
			expect(newCode.value).toBe('654321');
			expect(root.textContent).toContain('ABCDEF');
			expect(auth.enrollTotp).toHaveBeenCalledOnce();
			expect(mounted!.toast).not.toHaveBeenCalled();
			if (codeSource === 'new') {
				expect(dialog).toBeNull();
				expect(root.querySelector('.error')?.textContent).toContain(
					'security.error.invalidNewCode'
				);
				newCode.value = '777888';
				newCode.dispatchEvent(new Event('input', { bubbles: true }));
				newCode
					.closest('form')!
					.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
				await settle();
				await settle();
				expect(auth.verifyTotp).toHaveBeenLastCalledWith('777888', undefined);
				expect(mounted!.toast).toHaveBeenCalledWith('security.totp.replaced', { kind: 'success' });
			} else {
				expect(dialog?.textContent).toContain(
					codeSource === 'current'
						? 'security.error.invalidCurrentCode'
						: 'security.error.invalidCode'
				);
			}
		}
	);

	test.each([
		['enrollment-expired', 'security.error.enrollmentExpired'],
		['not-enrolled', 'security.error.notEnrolled']
	] as const)(
		'un alta que el servidor ya descartó (%s) avisa y vuelve al estado de antes de empezarla',
		async (code, messageKey) => {
			const auth = fakeStrongAuth();
			vi.mocked(auth.verifyTotp).mockRejectedValueOnce(
				new VegaStrongAuthError('forbidden', code, 'descartada')
			);
			const root = await submitReplacementCode(auth, '654321');

			expect(root.querySelector('.error')?.textContent).toContain(messageKey);
			expect(root.querySelector('#security-totp-code')).toBeNull();
			expect(root.textContent).not.toContain('ABCDEF');
			expect(root.textContent).toContain('security.totp.replace');
			expect(root.querySelector('.card-title span')?.textContent).toContain(
				'security.status.enabled'
			);
		}
	);

	test('si el alta caduca mientras se confirma la identidad, el diálogo se cierra y el aviso va a la pantalla', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.verifyTotp)
			.mockRejectedValueOnce(
				new VegaStrongAuthError('forbidden', 'step-up-required', 'falta', { methods: ['totp'] })
			)
			.mockRejectedValueOnce(new VegaStrongAuthError('forbidden', 'enrollment-expired', 'caducó'));
		const root = await submitReplacementCode(auth, '654321');
		const input = root.querySelector<HTMLInputElement>('[role="dialog"] input')!;
		input.value = '111222';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		await settle();

		expect(root.querySelector('[role="dialog"]')).toBeNull();
		expect(root.querySelector('.error')?.textContent).toContain('security.error.enrollmentExpired');
		expect(root.querySelector('#security-totp-code')).toBeNull();
	});

	test('abandonar el cambio de app vuelve a la tarjeta activada sin tocar el servidor', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.getStatus).mockResolvedValue({
			totpEnabled: true,
			recoveryCodesRemaining: 8,
			passkeys: []
		});
		mounted = mountSettings(auth);
		await settle();
		const find = (label: string) =>
			Array.from(mounted!.target.querySelectorAll('button')).find((candidate) =>
				candidate.textContent?.includes(label)
			);
		find('security.totp.replace')?.click();
		await settle();

		find('security.totp.replaceCancel')?.click();
		await settle();

		expect(mounted.target.querySelector('#security-totp-code')).toBeNull();
		expect(find('security.totp.disable')).toBeDefined();
		expect(auth.verifyTotp).not.toHaveBeenCalled();
		expect(auth.disableTotp).not.toHaveBeenCalled();
	});

	test('no refresca el token durante una acción protegida, su diálogo ni el reintento pendiente', async () => {
		const auth = fakeStrongAuth();
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		vi.mocked(auth.enrollTotp).mockRejectedValueOnce(
			new VegaStrongAuthError('forbidden', 'step-up-required', 'falta', { methods: ['totp'] })
		);
		vi.mocked(auth.enrollTotp).mockImplementationOnce(async () => {
			await pending;
			return { secret: 'ABCDEF', otpauthUrl: 'otpauth://totp/Vega?secret=ABCDEF' };
		});
		mounted = mountSettings(auth);
		await settle();
		const button = (key: string) =>
			Array.from(mounted!.target.querySelectorAll('button')).find((b) =>
				b.textContent?.includes(key)
			)!;
		const refresh = button('security.refresh');
		button('security.totp.enroll').click();
		// Direct event also exercises load's guard before the disabled DOM state flushes.
		refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(auth.getStatus).toHaveBeenCalledOnce();
		const input = mounted.target.querySelector<HTMLInputElement>('[role="dialog"] input')!;
		input.value = '111222';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settle();
		refresh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(auth.getStatus).toHaveBeenCalledOnce();
		expect(auth.enrollTotp).toHaveBeenCalledTimes(2);
		finish();
		await settle();
		await settle();
		expect(mounted.target.querySelector('[role="dialog"]')).toBeNull();
		refresh.click();
		await settle();
		expect(auth.getStatus).toHaveBeenCalledTimes(2);
	});

	test('una passkey con aviso de copia lo enseña en su fila y solo en la suya', async () => {
		const auth = fakeStrongAuth();
		vi.mocked(auth.getStatus).mockResolvedValue({
			totpEnabled: false,
			recoveryCodesRemaining: 0,
			passkeys: [
				{ id: 'pk1', name: 'Llave', created: '2026-09-30', cloneWarning: true },
				{ id: 'pk2', name: 'Touch ID', created: '2026-09-30', cloneWarning: false }
			]
		});
		mounted = mountSettings(auth);
		await settle();

		const rows = Array.from(mounted.target.querySelectorAll('.passkey-list li'));
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('security.passkeys.cloneWarning');
		expect(rows[1].textContent).not.toContain('security.passkeys.cloneWarning');
	});
});
