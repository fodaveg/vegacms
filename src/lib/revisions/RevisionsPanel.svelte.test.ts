/**
 * Suite de `RevisionsPanel.svelte` — etiqueta MOSTRADA de cada entrada del historial (fix de
 * code-review, `#lote-integridad` Fase B §10.1/L11): `guessRecordLabel` (`record-label.ts`) es un
 * heurístico ciego de la capa P3 (sin `ContentModel`, ver su cabecera) — pero aquí, al PINTAR, sí
 * tenemos el `ResolvedContentType` (prop `type`) con su `titleField` ya resuelto. Este archivo
 * cubre que la etiqueta mostrada prefiere ese `titleField` sobre el `label` almacenado, y que cae
 * al `label` almacenado cuando no hay `titleField` o su valor no es un texto usable — la papelera
 * de B2 reutilizará este mismo criterio.
 *
 * Montaje real (proyecto vitest `component`, `mount`/`unmount` de Svelte 5), contexto falso vía
 * `VEGA_CONTEXT_KEY` — mismo patrón que `SocialCardPreview.svelte.test.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, FieldValue, Page, VegaRecord } from '$lib/backend';
import type { ResolvedContentType } from '$lib/model/types';
import RevisionsPanel from './RevisionsPanel.svelte';

/** Ver `PreviewPanel.svelte.test.ts`: espera un macrotask real (para drenar la cadena de
 *  microtasks del `load()` async del panel) + un `tick()` de Svelte para reflejar el `$state`. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 10));
	await tick();
}

const ARTICLE_TYPE: ResolvedContentType = {
	schema: { name: 'article', readonly: false, fields: [] },
	name: 'article',
	label: 'Artículos',
	labelSingular: 'Artículo',
	icon: null,
	hidden: false,
	group: null,
	singleton: false,
	readonly: false,
	// Campo de título con un nombre que NO es "title"/"name" — el caso que
	// `guessRecordLabel` (heurístico ciego de P3, sin esquema) no puede acertar.
	titleField: 'headline',
	subtitleField: null,
	slugField: null,
	orderField: null,
	defaultSort: null,
	statusField: null,
	statusLabels: null,
	previewUrl: null,
	fields: [],
	listFields: [],
	fieldGroups: [],
	editorRail: false
};

function revisionRecord(overrides: {
	id: string;
	label: string;
	values: Record<string, FieldValue>;
}): VegaRecord {
	return {
		id: overrides.id,
		type: 'vega_revisions',
		values: {
			kind: 'update',
			collection: 'article',
			recordId: 'rec1',
			values: overrides.values as unknown as FieldValue,
			label: overrides.label,
			author: 'demo@vega.dev',
			created: '2026-01-01T00:00:00.000Z'
		}
	};
}

function fakeCtx(list: BackendPort['list']): VegaAppContext {
	return {
		port: { list } as unknown as BackendPort,
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
}

function mountPanel(list: BackendPort['list']): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RevisionsPanel, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx(list)]]),
		props: { type: ARTICLE_TYPE, recordId: 'rec1', onRestore: vi.fn() }
	});
	return { target, instance };
}

describe('RevisionsPanel.svelte — etiqueta de cada entrada', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('con titleField resoluble: la etiqueta mostrada viene de `values[titleField]`, NO del label almacenado', async () => {
		const page: Page<VegaRecord> = {
			items: [
				revisionRecord({
					id: 'rev1',
					// El `label` que guardó `guessRecordLabel` en su día (cayó al id, "headline" no
					// está en su vocabulario cerrado title/name) — debe quedar ignorado.
					label: 'rec1',
					values: { headline: 'Mi titular', body: 'Cuerpo' }
				})
			],
			totalItems: 1,
			page: 1,
			perPage: 20,
			totalPages: 1
		};
		const list = vi.fn(async () => page) as unknown as BackendPort['list'];
		mounted = mountPanel(list);
		// Deja asentar los `$effect` de montaje (reset por destino/refreshToken) ANTES de simular
		// el clic — en el DOM real siempre hay un ciclo de por medio entre montar y que alguien
		// pueda pulsar nada.
		await tick();

		mounted.target.querySelector<HTMLButtonElement>('.vega-revisions-toggle')!.click();
		await flush();

		const item = mounted.target.querySelector('.vega-revisions-item-label');
		expect(item?.textContent).toBe('Mi titular');
		expect(mounted.target.textContent).not.toContain('rec1');
	});

	test('sin valor usable en titleField: cae al label almacenado', async () => {
		const page: Page<VegaRecord> = {
			items: [
				revisionRecord({
					id: 'rev1',
					label: 'Reserva legible',
					// "headline" ausente en esta revisión concreta (esquema cambiado desde entonces).
					values: { body: 'Cuerpo' }
				})
			],
			totalItems: 1,
			page: 1,
			perPage: 20,
			totalPages: 1
		};
		const list = vi.fn(async () => page) as unknown as BackendPort['list'];
		mounted = mountPanel(list);
		await tick();

		mounted.target.querySelector<HTMLButtonElement>('.vega-revisions-toggle')!.click();
		await flush();

		const item = mounted.target.querySelector('.vega-revisions-item-label');
		expect(item?.textContent).toBe('Reserva legible');
	});
});
