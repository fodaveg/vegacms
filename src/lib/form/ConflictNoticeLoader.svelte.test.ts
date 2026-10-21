/**
 * Suite de componente de `ConflictNoticeLoader.svelte`: el aviso de edición concurrente llega por
 * `import()` (fuera del coste de abrir los editores, `scripts/check-bundle-budget.mjs`) con las
 * mismas props que le da el anfitrión. El caso sin trozo descargable vive en
 * `ConflictNoticeLoader.fallback.svelte.test.ts`, que necesita su propio `vi.mock`.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ConflictNoticeLoader from './ConflictNoticeLoader.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import { t as translate } from '$lib/i18n';

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

function fakeCtx(): VegaAppContext {
	return {
		port: {
			list: vi.fn(async () => {
				throw VegaError.notFound();
			})
		},
		t,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
}

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
});

describe('ConflictNoticeLoader.svelte', () => {
	test('descarga el aviso y le pasa las props del anfitrión, también cuando cambian', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const props = $state({
			name: 'Sobre mí',
			fields: [],
			rows: [{ field: 'title', scope: 'server' as const, before: 'Sobre mí', after: 'Otro' }],
			collection: 'pages',
			recordId: 'p1',
			openedVersion: recordVersion({ values: { title: 'Sobre mí' } }),
			serverVersion: 'v-servidor-1',
			fallbackAt: null,
			onForce: vi.fn(async () => {}),
			onDiscard: vi.fn(async () => {})
		});
		const instance = mount(ConflictNoticeLoader, {
			target,
			props,
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		cleanup = () => {
			unmount(instance);
			target.remove();
		};

		await vi.waitFor(() => expect(target.querySelector('.vega-conflict')).not.toBeNull());
		const title = () => target.querySelector('.vega-conflict-title')?.textContent?.trim();
		expect(title()).toBe(t('editor.conflict.title', { name: 'Sobre mí' }));
		expect(target.querySelector('.vega-conflict-fallback')).toBeNull();

		props.name = 'Sobre mí y este cuaderno';
		flushSync();
		expect(title()).toBe(t('editor.conflict.title', { name: 'Sobre mí y este cuaderno' }));
	});
});
