/**
 * `RevisionsPanel.svelte` cuando el trozo de `RevisionDiff.svelte` (que se descarga al abrir una
 * revisión) no llega: la revisión abierta no se queda en blanco, lo dice y deja volver a la lista.
 * Fichero aparte porque el `vi.mock` de abajo rompe el diff para todo el fichero.
 */
import { mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, Page, VegaRecord } from '$lib/backend';
import type { ResolvedContentType } from '$lib/model/types';
import { t as translate } from '$lib/i18n';
import RevisionsPanel from './RevisionsPanel.svelte';

vi.mock('./RevisionDiff.svelte', () => {
	throw new Error('Failed to fetch dynamically imported module');
});

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

const TYPE = {
	schema: { name: 'article', readonly: false, fields: [] },
	name: 'article',
	label: 'Artículos',
	labelSingular: 'Artículo',
	permissions: ALL_PERMISSIONS,
	titleField: null,
	fields: []
} as unknown as ResolvedContentType;

const page: Page<VegaRecord> = {
	items: [
		{
			id: 'rev1',
			type: 'vega_revisions',
			values: {
				kind: 'update',
				collection: 'article',
				recordId: 'rec1',
				values: { headline: 'Mi titular' },
				label: 'Mi titular',
				author: 'demo@vega.dev',
				created: '2026-01-01T00:00:00.000Z'
			}
		}
	],
	totalItems: 1,
	page: 1,
	perPage: 20,
	totalPages: 1
};

test('sin el trozo del diff, la revisión abierta lo dice y se puede volver al historial', async () => {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		port: { list: vi.fn(async () => page) } as unknown as BackendPort,
		locale: 'es',
		t,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(RevisionsPanel, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]]),
		props: { type: TYPE, recordId: 'rec1', onRestore: vi.fn() }
	});

	try {
		await tick();
		target.querySelector<HTMLButtonElement>('.vega-revisions-toggle')!.click();
		await vi.waitFor(() =>
			expect(target.querySelector('.vega-revisions-list button')).not.toBeNull()
		);
		target.querySelector<HTMLButtonElement>('.vega-revisions-list button')!.click();
		await vi.waitFor(() => expect(target.querySelector('.vega-revisions-error')).not.toBeNull());
		const error = target.querySelector<HTMLElement>('.vega-revisions-error')!;
		expect(error.getAttribute('role')).toBe('alert');
		expect(error.textContent).toContain(t('revisions.panel.error'));
		error.querySelector<HTMLButtonElement>('button')!.click();
		await tick();
		expect(target.querySelector('.vega-revisions-list')).not.toBeNull();
	} finally {
		await unmount(instance);
		target.remove();
	}
});
