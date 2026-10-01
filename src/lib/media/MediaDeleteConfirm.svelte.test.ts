/**
 * `MediaDeleteConfirm` (audit móvil del 30 sep, tarea 6): el diálogo NO promete la papelera cuando
 * la colección tiene un campo `file` obligatorio (`vega_media` lo tiene y la papelera no restaura
 * ficheros), y dice UNA sola frase, sin repetir que el borrado es definitivo.
 */

import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaDeleteConfirm from './MediaDeleteConfirm.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { Field } from '$lib/backend/types';
import { t } from '$lib/i18n';

const fileField = (required: boolean): Field =>
	({ name: 'file', type: 'file', required, multiple: false }) as unknown as Field;

let mounted: { target: HTMLElement; instance: Record<string, unknown> } | null = null;

afterEach(() => {
	if (mounted) {
		void unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

function mountDialog(opts: { trash: boolean; fileRequired: boolean }) {
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		model: {
			revisions: { enabled: opts.trash, trashDays: 30 },
			types: [
				{ name: 'vega_revisions' },
				{ name: 'vega_media', schema: { fields: [fileField(opts.fileRequired)] } }
			]
		}
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(MediaDeleteConfirm, {
		target,
		props: {
			open: true,
			assetLabel: 'portada.png',
			deleting: false,
			fallbackFocusEl: null,
			onConfirm: vi.fn(),
			onCancel: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	return target;
}

describe('MediaDeleteConfirm — la papelera no promete lo que no restaura', () => {
	test('file obligatorio (vega_media) con papelera activa: NO promete recuperarlo', () => {
		const target = mountDialog({ trash: true, fileRequired: true });
		const body = target.querySelector('#vega-media-delete-body');
		expect(body?.getAttribute('data-trash-available')).toBe('false');
		expect(body?.textContent).toContain('no se podrá recuperar');
		expect(body?.textContent).not.toContain('papelera');
	});

	test('sin file obligatorio y con papelera: promete los días, en la misma frase única', () => {
		const target = mountDialog({ trash: true, fileRequired: false });
		const body = target.querySelector('#vega-media-delete-body');
		expect(body?.getAttribute('data-trash-available')).toBe('true');
		expect(body?.textContent).toContain('papelera');
		expect(body?.textContent).toContain('30 día(s)');
	});

	test('una sola frase de aviso: no quedan líneas de papelera aparte ni «DEFINITIVO»', () => {
		const target = mountDialog({ trash: false, fileRequired: true });
		expect(target.querySelectorAll('p').length).toBe(1);
		expect(target.textContent).not.toMatch(/DEFINITIV|permanente/);
	});
});
