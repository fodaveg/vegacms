import { flushSync, mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t as translate } from '$lib/i18n';
import ReviewMediaLoader from './ReviewMediaLoader.svelte';

const importGate = vi.hoisted(() => {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
});

vi.mock('./ReviewMediaDialog.svelte', async (importOriginal) => {
	await importGate.pending;
	return importOriginal();
});

test('la carga de la ficha se puede cancelar por teclado y no reabre al resolver tarde', async () => {
	const opener = document.createElement('button');
	const target = document.createElement('div');
	document.body.append(opener, target);
	opener.focus();
	const ctx = {
		t: (key: string) => translate('es', key),
		feedback: { reportError: vi.fn() }
	} as unknown as VegaAppContext;
	let instance: ReturnType<typeof mount>;
	let closing: Promise<void> | null = null;
	const onClose = vi.fn(() => {
		closing = unmount(instance);
	});
	const editorKeydown = vi.fn();
	window.addEventListener('keydown', editorKeydown);

	try {
		instance = mount(ReviewMediaLoader, {
			target,
			props: {
				mediaId: 'm1',
				onClose,
				onSaved: vi.fn(),
				onDeleted: vi.fn(),
				fallbackFocusEl: null
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		flushSync();
		await tick();
		const loading = target.querySelector<HTMLElement>('.vega-review-media-loading')!;
		expect(loading.getAttribute('aria-modal')).toBe('true');
		expect(loading.querySelector('[role="status"]')?.textContent).toContain('Cargando');
		const close = loading.querySelector<HTMLButtonElement>('button')!;
		expect(document.activeElement).toBe(close);

		const save = new KeyboardEvent('keydown', {
			key: 's',
			metaKey: true,
			bubbles: true,
			cancelable: true
		});
		close.dispatchEvent(save);
		expect(save.defaultPrevented).toBe(true);
		expect(editorKeydown).not.toHaveBeenCalled();

		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		close.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(close);
		expect(editorKeydown).not.toHaveBeenCalled();

		const escape = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		});
		close.dispatchEvent(escape);
		expect(escape.defaultPrevented).toBe(true);
		expect(editorKeydown).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledOnce();
		if (closing) await closing;
		await tick();
		expect(document.activeElement).toBe(opener);

		// El botón también cancela una nueva apertura, sin esperar la misma descarga pendiente.
		instance = mount(ReviewMediaLoader, {
			target,
			props: {
				mediaId: 'm2',
				onClose,
				onSaved: vi.fn(),
				onDeleted: vi.fn(),
				fallbackFocusEl: null
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		flushSync();
		await tick();
		target.querySelector<HTMLButtonElement>('.vega-review-media-loading button')!.click();
		expect(onClose).toHaveBeenCalledTimes(2);
		if (closing) await closing;

		importGate.release();
		await import('./ReviewMediaDialog.svelte');
		await tick();
		expect(target.querySelector('[role="dialog"]')).toBeNull();
		expect(ctx.feedback.reportError).not.toHaveBeenCalled();
	} finally {
		importGate.release();
		if (closing) await closing;
		window.removeEventListener('keydown', editorKeydown);
		target.remove();
		opener.remove();
	}
});
