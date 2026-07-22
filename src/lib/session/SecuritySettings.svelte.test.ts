import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, StrongAuthPort } from '$lib/backend';
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
		deletePasskey: vi.fn(async () => undefined)
	};
}

function mountSettings(auth: StrongAuthPort): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		port: { strongAuth: auth } as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(SecuritySettings, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
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

		expect(auth.verifyTotp).toHaveBeenCalledWith('123456');
		expect(auth.generateRecoveryCodes).toHaveBeenCalledOnce();
		expect(mounted.target.textContent).toContain('ABCDE-F2345');
		expect(mounted.target.textContent).toContain('GHJKL-M6789');
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

		expect(auth.registerPasskey).toHaveBeenCalledWith('MacBook Touch ID');
	});
});
