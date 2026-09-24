/**
 * `/restablecer` (`PasswordResetForm`): validación de las dos contraseñas, éxito con enlace a
 * entrar, token caducado, rechazo de la contraseña por el servidor y URL sin token. El recorrido
 * contra PocketBase real (correo → enlace → token → `verified` → login) está en
 * `tests/contract/pocketbase.contract.test.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend';
import PasswordResetForm from './PasswordResetForm.svelte';

function mountForm(token: string, confirm: ((t: string, p: string) => Promise<void>) | null) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key
	} as unknown as VegaAppContext;
	const instance = mount(PasswordResetForm, {
		target,
		props: { token, confirm, loginHref: '/login' },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await tick();
}

async function fill(target: HTMLElement, password: string, repeat: string): Promise<void> {
	const [first, second] = Array.from(target.querySelectorAll<HTMLInputElement>('input'));
	for (const [el, value] of [
		[first, password],
		[second, repeat]
	] as const) {
		el.value = value;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}
	await tick();
	target.querySelector('form')!.requestSubmit();
	await settle();
}

describe('PasswordResetForm', () => {
	let mounted: ReturnType<typeof mountForm> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('valida antes de enviar y, con éxito, dice que ya puede entrar y enlaza a /login', async () => {
		const confirm = vi.fn(async () => undefined);
		mounted = mountForm('tok-1', confirm);
		await settle();

		await fill(mounted.target, 'corta', 'corta');
		expect(mounted.target.textContent).toContain('admin.form.passwordTooShort:{"min":8}');
		await fill(mounted.target, 'la-suya-123', 'la-suya-124');
		expect(mounted.target.textContent).toContain('admin.form.passwordMismatch');
		expect(confirm).not.toHaveBeenCalled();

		await fill(mounted.target, 'la-suya-123', 'la-suya-123');
		expect(confirm).toHaveBeenCalledWith('tok-1', 'la-suya-123');
		expect(mounted.target.querySelector('[data-reset-state="done"]')).not.toBeNull();
		expect(mounted.target.querySelector('a')?.getAttribute('href')).toBe('/login');
	});

	test('un token que el servidor rechaza lleva al estado «este enlace ya no sirve»', async () => {
		mounted = mountForm('tok-viejo', async () => {
			throw VegaError.validation({
				token: { code: 'validation_invalid_token', message: 'Invalid or expired token.' }
			});
		});
		await settle();
		await fill(mounted.target, 'la-suya-123', 'la-suya-123');
		expect(mounted.target.querySelector('[data-reset-state="expired"]')).not.toBeNull();
		expect(mounted.target.querySelector('form')).toBeNull();
	});

	test('una contraseña que el servidor rechaza se pinta en el campo, con su mensaje', async () => {
		mounted = mountForm('tok-1', async () => {
			throw VegaError.validation({
				password: {
					code: 'validation_length_out_of_range',
					message: 'The length must be between 12 and 255.'
				}
			});
		});
		await settle();
		await fill(mounted.target, 'la-suya-123', 'la-suya-123');
		expect(mounted.target.textContent).toContain('The length must be between 12 and 255.');
		expect(mounted.target.querySelector('form')).not.toBeNull();
	});

	test('un fallo de red deja el formulario con el aviso de error', async () => {
		mounted = mountForm('tok-1', async () => {
			throw VegaError.network();
		});
		await settle();
		await fill(mounted.target, 'la-suya-123', 'la-suya-123');
		expect(mounted.target.querySelector('[data-reset-state="error"]')).not.toBeNull();
	});

	test('sin token en la URL no ofrece el formulario', async () => {
		mounted = mountForm('', vi.fn());
		await settle();
		expect(mounted.target.querySelector('[data-reset-state="missing"]')).not.toBeNull();
		expect(mounted.target.querySelector('form')).toBeNull();
	});
});
