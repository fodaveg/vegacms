/**
 * Carga del editor (`/c/[type]/[id]`): un fallo del backend con `backendCode` pinta el texto del
 * catálogo y no el mensaje crudo de PocketBase (inglés, de un hook de servidor o un 5xx).
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import type { ContentType } from '$lib/backend/types';

vi.mock('$app/state', () => ({ page: { params: { type: 'notes', id: 'n1' } } }));
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

import EditorPage from './+page.svelte';

const notes = {
	name: 'notes',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
} as ContentType;

function mountPage(error: VegaError) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		model: resolveContentModel({ types: [notes], manifestRaw: {} }),
		port: {
			get: vi.fn(async () => {
				throw error;
			})
		},
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
	const instance = mount(EditorPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) await Promise.resolve();
	await tick();
}

describe('/c/[type]/[id]: fallo de carga', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;
	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('con backendCode server-error pinta el texto del catálogo, no el crudo', async () => {
		mounted = mountPage(VegaError.backend('Something went wrong.', undefined, 'server-error'));
		await settle();
		const alert = mounted.target.querySelector('.vega-editor-error')!;
		expect(alert.textContent).toContain(translate('es', 'errors.backendCode.serverError'));
		expect(alert.textContent).not.toContain('Something went wrong.');
	});

	test('sin backendCode sigue pintando el mensaje', async () => {
		mounted = mountPage(VegaError.backend('Fallo raro del hook.'));
		await settle();
		expect(mounted.target.querySelector('.vega-editor-error')!.textContent).toContain(
			'Fallo raro del hook.'
		);
	});
});
