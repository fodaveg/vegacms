import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ToastHost from './ToastHost.svelte';
import { toastStore } from './toasts.svelte';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';

let target: HTMLElement;
let instance: ReturnType<typeof mount>;
beforeEach(() => {
	vi.useFakeTimers();
	target = document.createElement('div');
	document.body.append(target);
	instance = mount(ToastHost, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, { t: (key: string) => key }]])
	});
	flushSync();
});
afterEach(async () => {
	for (const toast of toastStore.entries) toastStore.dismiss(toast.id);
	await unmount(instance);
	target.remove();
	vi.useRealTimers();
});
describe('anuncios del shell', () => {
	test('la primera actualización y las siguientes usan la misma región polite que ya estaba vacía', () => {
		const region = target.querySelector('[aria-live="polite"]')!;
		expect(region).not.toBeNull();
		expect(region.textContent?.trim()).toBe('');
		expect(region.getAttribute('role')).not.toBe('alert');
		toastStore.push('Guardado', { kind: 'success' });
		flushSync();
		expect(region.textContent?.trim()).toBe('Guardado');
		vi.advanceTimersByTime(5000);
		flushSync();
		expect(region.textContent?.trim()).toBe('');
		toastStore.push('Copiado');
		flushSync();
		expect(target.querySelector('[aria-live="polite"]')).toBe(region);
		expect(region.textContent?.trim()).toBe('Copiado');
	});
	test('el error mantiene su alert hasta descartarlo, separado de la región polite permanente', () => {
		expect(target.querySelector('[role="alert"]')).toBeNull();
		toastStore.push('Error persistente', { kind: 'error' });
		flushSync();
		vi.advanceTimersByTime(60000);
		flushSync();
		expect(target.querySelector('[role="alert"]')?.textContent).toContain('Error persistente');
		target.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
		flushSync();
		expect(target.querySelector('[role="alert"]')).toBeNull();
		expect(target.querySelector('[aria-live="polite"]')).not.toBeNull();
	});
});
