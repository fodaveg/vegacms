/**
 * `ConflictNoticeLoader.svelte` cuando el trozo del aviso no se puede descargar (sin red, o un
 * despliegue nuevo que retiró el anterior): el hueco no se queda vacío. Fichero aparte porque el
 * `vi.mock` de abajo rompe el aviso para todo el fichero.
 */
import { mount, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import ConflictNoticeLoader from './ConflictNoticeLoader.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { recordVersion } from '$lib/backend/version';
import { t as translate } from '$lib/i18n';

vi.mock('./ConflictNotice.svelte', () => {
	throw new Error('Failed to fetch dynamically imported module');
});

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

test('sin el trozo del aviso, el hueco dice que cambió en el servidor y que no se guardó nada', async () => {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = { port: {}, t, locale: 'es', feedback: { toast: vi.fn(), reportError: vi.fn() } };
	const instance = mount(ConflictNoticeLoader, {
		target,
		props: {
			name: 'Sobre mí',
			variant: 'narrow',
			fields: [],
			rows: [],
			collection: 'pages',
			recordId: 'p1',
			openedVersion: recordVersion({ values: { title: 'Sobre mí' } }),
			serverVersion: 'v-servidor-1',
			fallbackAt: null,
			onForce: vi.fn(async () => {}),
			onDiscard: vi.fn(async () => {})
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx as unknown as VegaAppContext]])
	});

	try {
		await vi.waitFor(() => expect(target.querySelector('.vega-conflict-fallback')).not.toBeNull());
		const fallback = target.querySelector<HTMLElement>('.vega-conflict-fallback')!;
		expect(fallback.getAttribute('role')).toBe('alert');
		expect(fallback.textContent).toContain(t('editor.conflict.titleNarrow', { name: 'Sobre mí' }));
		expect(fallback.textContent).toContain(t('editor.conflict.nothingSaved'));
		expect(target.querySelector('.vega-conflict')).toBeNull();
	} finally {
		unmount(instance);
		target.remove();
	}
});
