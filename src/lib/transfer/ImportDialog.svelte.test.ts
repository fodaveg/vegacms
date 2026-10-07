/**
 * `ImportDialog` — la sesión de importación (hallazgos de revisión del lote de importación):
 * (a) una escritura que sigue en vuelo tras cerrar y reabrir NO pisa el estado de la sesión nueva;
 * (b) si `runImport` lanza, la fase no se queda en `running`.
 *
 * Se mockean las tres piezas que tocan red/fichero (`import-collection`, `import-format`,
 * `read-file-progress`): aquí solo se prueba la máquina de fases del diálogo, no la importación.
 */

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { t } from '$lib/i18n';
import type { ImportPreview, ImportReport } from './import-collection';
import ImportDialog from './ImportDialog.svelte';

const mocks = vi.hoisted(() => ({
	runImport: vi.fn(),
	buildImportPreview: vi.fn()
}));

vi.mock('./import-collection', () => ({
	createCachingFileFetcher: () => async () => null,
	buildImportPreview: mocks.buildImportPreview,
	runImport: mocks.runImport
}));
vi.mock('./import-format', () => ({
	validateTransferDocument: () => ({ ok: true, collections: [] })
}));
vi.mock('./read-file-progress', () => ({ readTextWithProgress: async () => '{}' }));

/** Vista previa con un solo registro CREA: lo mínimo para que «Importar» esté habilitado. */
function previewOf(id: string): ImportPreview {
	return {
		collections: [
			{
				type: 'posts',
				contentType: {} as never,
				records: [{ id, values: {} }],
				entries: [{ id, status: 'create', reasons: [] }]
			}
		]
	};
}

const report: ImportReport = {
	outcomes: [],
	createdCount: 1,
	updatedCount: 0,
	failedCount: 0,
	skippedCount: 0,
	success: true
};

/** Promesa resoluble desde fuera: la escritura "en vuelo" del test. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

let mounted: { target: HTMLElement; instance: Record<string, unknown> } | null = null;
const reportError = vi.fn();
const toast = vi.fn();
const onImported = vi.fn();

afterEach(() => {
	if (mounted) {
		void unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

beforeEach(() => {
	vi.clearAllMocks();
});

function mountDialog() {
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		model: {},
		port: {},
		feedback: { reportError, toast }
	} as unknown as VegaAppContext;
	// `open` reactivo sin compilar runas: un `SvelteMap` que el getter lee.
	const state = new SvelteMap<string, boolean>([['open', true]]);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(ImportDialog, {
		target,
		props: {
			get open() {
				return state.get('open') ?? false;
			},
			onClose: () => {},
			onImported
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	flushSync(); // que corra el `$effect` de apertura ANTES de que el test elija fichero
	return { target, setOpen: (open: boolean) => state.set('open', open) };
}

/** Elige un fichero en el `<input>` y espera a que la fase de lectura/validación/vista previa acabe. */
async function pickFile(target: HTMLElement, name: string) {
	const input = target.querySelector<HTMLInputElement>('input[type="file"]')!;
	Object.defineProperty(input, 'files', {
		configurable: true,
		value: [new File(['{}'], name, { type: 'application/json' })]
	});
	input.dispatchEvent(new Event('change', { bubbles: true }));
	for (let i = 0; i < 5; i++) await tick();
}

async function settle() {
	for (let i = 0; i < 5; i++) await tick();
	flushSync();
}

describe('ImportDialog — sesión de importación', () => {
	test('creación parcial refresca la lista, informa relaciones pendientes y nunca anuncia éxito', async () => {
		mocks.buildImportPreview.mockResolvedValueOnce(previewOf('parcial'));
		mocks.runImport.mockResolvedValueOnce({
			outcomes: [
				{
					type: 'posts',
					id: 'parcial',
					status: 'failed',
					partialWrite: 'created',
					error: 'rechazado'
				}
			],
			createdCount: 0,
			updatedCount: 0,
			failedCount: 1,
			skippedCount: 0,
			success: false
		} satisfies ImportReport);
		const { target } = mountDialog();
		await pickFile(target, 'ciclo.vega.json');
		target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!.click();
		await settle();
		expect(onImported).toHaveBeenCalledTimes(1);
		expect(target.textContent).toContain('0 creados · 0 actualizados · 1 con error');
		expect(target.textContent).toContain('sus relaciones quedaron pendientes');
		expect(toast).toHaveBeenCalledWith(expect.any(String), { kind: 'error' });
		expect(toast).not.toHaveBeenCalledWith(expect.any(String), { kind: 'success' });
	});

	test('un ciclo obligatorio se explica en preview y no ofrece importar', async () => {
		const preview = previewOf('ciclo');
		preview.collections[0].entries[0] = {
			id: 'ciclo',
			status: 'blocked',
			reasons: [{ kind: 'required-relation-cycle' }]
		};
		mocks.buildImportPreview.mockResolvedValueOnce(preview);
		const { target } = mountDialog();
		await pickFile(target, 'ciclo.vega.json');
		await settle();
		expect(target.textContent).toContain('relaciones obligatorias forman un ciclo');
		expect(
			target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')?.disabled ?? true
		).toBe(true);
		expect(mocks.runImport).not.toHaveBeenCalled();
	});

	test('cerrar durante `running`, reabrir y cargar otro fichero: la escritura vieja NO pisa la sesión nueva', async () => {
		const firstRun = deferred<ImportReport>();
		mocks.buildImportPreview
			.mockResolvedValueOnce(previewOf('viejo'))
			.mockResolvedValueOnce(previewOf('nuevo'));
		mocks.runImport.mockReturnValueOnce(firstRun.promise);
		const { target, setOpen } = mountDialog();

		await pickFile(target, 'viejo.vega.json');
		target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!.click();
		await settle();
		expect(target.querySelector('progress, .vega-import-progress')).not.toBeNull();

		// Cierra con la escritura en vuelo, reabre y carga OTRO fichero hasta su vista previa.
		setOpen(false);
		await settle();
		setOpen(true);
		await settle();
		await pickFile(target, 'nuevo.vega.json');
		await settle();
		expect(target.querySelector('.vega-import-confirm-button')).not.toBeNull();
		expect(target.textContent).toContain('nuevo');

		// La escritura vieja termina AHORA: el diálogo sigue en la vista previa nueva.
		firstRun.resolve(report);
		await settle();

		expect(target.querySelector('.vega-import-report')).toBeNull();
		expect(target.querySelector('.vega-import-confirm-button')).not.toBeNull();
		expect(target.textContent).toContain('nuevo');
		// Lo escrito sí refresca la tabla, pero no hay toast de resultado de otra sesión.
		expect(onImported).toHaveBeenCalledTimes(1);
		expect(toast).not.toHaveBeenCalled();
	});

	test('sin cerrar, una importación normal llega a `done` con su informe y su toast', async () => {
		mocks.buildImportPreview.mockResolvedValueOnce(previewOf('a'));
		mocks.runImport.mockResolvedValueOnce(report);
		const { target } = mountDialog();

		await pickFile(target, 'a.vega.json');
		target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!.click();
		await settle();

		expect(target.querySelector('.vega-import-report')).not.toBeNull();
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test('si `runImport` lanza, la fase no se queda en `running`: vuelve a elegir fichero y reporta el error', async () => {
		mocks.buildImportPreview.mockResolvedValueOnce(previewOf('a'));
		mocks.runImport.mockRejectedValueOnce(new Error('boom'));
		const { target } = mountDialog();

		await pickFile(target, 'a.vega.json');
		target.querySelector<HTMLButtonElement>('.vega-import-confirm-button')!.click();
		await settle();

		expect(target.querySelector('input[type="file"]')).not.toBeNull();
		expect(target.querySelector('.vega-import-progress')).toBeNull();
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError.mock.calls[0][0].message).toBe(
			t('es', 'list.import.runError') // el texto de la clave nueva, nunca el `boom` crudo
		);
	});
});
