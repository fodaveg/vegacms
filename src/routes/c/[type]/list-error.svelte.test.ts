/**
 * Listado (`/c/[type]`): el panel de error pinta el texto del catálogo cuando el `VegaError` trae
 * `backendCode`, no el mensaje crudo de PocketBase.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';
import type { ContentType } from '$lib/backend/types';

vi.mock('$app/state', () => ({
	page: { params: { type: 'notes' }, url: new URL('http://localhost/c/notes') }
}));
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {}, goto: vi.fn() }));

import ListPage from './+page.svelte';

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
			capabilities: {},
			list: vi.fn(async () => {
				throw error;
			})
		},
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn(), reportConnectivity: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(ListPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i++) await Promise.resolve();
	await tick();
	await new Promise((r) => setTimeout(r, 20));
	await tick();
}

describe('/c/[type]: fallo del listado', () => {
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
		const panel = mounted.target.querySelector('[data-list-state="error"]')!;
		expect(panel.textContent).toContain(translate('es', 'errors.backendCode.serverError'));
		expect(panel.textContent).not.toContain('Something went wrong.');
	});
});
