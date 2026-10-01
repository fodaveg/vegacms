/**
 * Suite de `MergedViewTable.svelte` (lote 7b): el asa de arrastre queda DESHABILITADA y explicada
 * cuando la vista no se puede reordenar, y una fuente caída se nombra en un aviso.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MergedViewTable from './MergedViewTable.svelte';
import type { MergedRow } from './merged-merge';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t } from '$lib/i18n';

const rows: MergedRow[] = [
	{
		record: { id: 'a1', type: 'arte', values: {} },
		source: {
			collection: 'arte',
			where: null,
			orderField: 'sort',
			titleField: null,
			label: 'Obra'
		},
		orderValue: 0
	}
];

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		locale: 'es',
		model: { types: [] },
		nav: { toRecord: vi.fn() }
	} as unknown as VegaAppContext;
}

describe('MergedViewTable.svelte: asa y avisos', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	function mountTable(props: {
		reorderable: boolean;
		reorderBlockedNotice?: string | null;
		failedSources?: string[];
		rows?: MergedRow[];
	}): HTMLElement {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(MergedViewTable, {
			target,
			props: {
				rows: props.rows ?? rows,
				truncatedCollections: [],
				failedSources: props.failedSources ?? [],
				reorderBlockedNotice: props.reorderBlockedNotice,
				reorderable: props.reorderable,
				onReorder: vi.fn()
			},
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		mounted = { target, instance };
		return target;
	}

	test('reordenable: asa activa (draggable) y sin aviso de bloqueo', () => {
		const target = mountTable({ reorderable: true });
		const handle = target.querySelector('.vega-reorder-handle');
		expect(handle?.getAttribute('aria-disabled')).toBe('false');
		expect(handle?.getAttribute('draggable')).toBe('true');
		expect(target.querySelector('[data-merged-reorder-blocked]')).toBeNull();
	});

	test('bloqueado: asa deshabilitada, NO arrastrable, y el motivo en el aviso y en el asa', () => {
		const motivo = 'No se puede reordenar: motivo de prueba.';
		const target = mountTable({ reorderable: false, reorderBlockedNotice: motivo });
		const handle = target.querySelector('.vega-reorder-handle');
		expect(handle?.getAttribute('aria-disabled')).toBe('true');
		expect(handle?.getAttribute('draggable')).toBe('false');
		expect(handle?.getAttribute('title')).toBe(motivo);
		expect(target.querySelector('[data-merged-reorder-blocked]')?.textContent?.trim()).toBe(motivo);
	});

	test('una fuente caída se nombra en el aviso, con filas', () => {
		const target = mountTable({ reorderable: false, failedSources: ['Pieza', 'Libro'] });
		expect(target.querySelector('[data-merged-failed]')?.textContent).toContain('Pieza, Libro');
	});

	test('una fuente caída se nombra también si no hay ninguna fila', () => {
		const target = mountTable({ reorderable: false, failedSources: ['Pieza'], rows: [] });
		expect(target.querySelector('[data-merged-failed]')?.textContent).toContain('Pieza');
	});
});
