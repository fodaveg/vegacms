/**
 * Suite de `MediaPicker.svelte` — la paginación sobrevive al filtro `accept` (audit del 30 sep): una
 * página cuyos assets no pasan el filtro (solo vídeos con `accept: image/*`) sigue teniendo
 * páginas vecinas, y el usuario ha de poder ir a ellas.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import MediaPicker from './MediaPicker.svelte';
import { mediaPickerState } from './media-picker-state.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import { VegaError } from '$lib/backend/errors';
import { fileFromMediaAsset, MediaFileFetchError } from './media-file-from-url';
import type { Page, VegaRecord } from '$lib/backend/types';

vi.mock('./media-file-from-url', async (importOriginal) => ({
	...(await importOriginal<typeof import('./media-file-from-url')>()),
	fileFromMediaAsset: vi.fn(
		async (_port, item) =>
			new File(['asset bytes'], String(item.fileRef ?? 'asset.png'), { type: 'image/png' })
	)
}));

function mediaRecord(id: string, file: string): VegaRecord {
	return { id, type: 'vega_media', values: { file, alt: 'x', title: '', tags: [] } } as VegaRecord;
}

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

function mountPicker(
	page: Page<VegaRecord>,
	options: { port?: Partial<BackendPort>; canUpdate?: boolean } = {}
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	);
	const ctx = {
		model: {
			types:
				options.canUpdate === false
					? [
							{
								name: 'vega_media',
								schema: { name: 'vega_media', fields: [], access: { update: 'denied' } }
							}
						]
					: [],
			revisions: { enabled: false, trashDays: 30 }
		},
		port: {
			capabilities: { thumbs: false },
			list: vi.fn(async () => page),
			fileUrl: vi.fn(() => 'data:image/png;base64,aW1hZ2U='),
			...options.port
		} as unknown as BackendPort,
		t: (key: string) => key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(MediaPicker, {
		target,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	return target;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
	await tick();
}

afterEach(async () => {
	mediaPickerState.settle(null);
	vi.useRealTimers();
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.mocked(fileFromMediaAsset)
		.mockReset()
		.mockImplementation(
			async (_port, item) =>
				new File(['asset bytes'], String(item.fileRef ?? 'asset.png'), { type: 'image/png' })
		);
});

describe('MediaPicker.svelte — paginación con filtro accept', () => {
	test('la página queda vacía por accept pero hay más páginas: se pinta el vacío Y la paginación', async () => {
		const target = mountPicker({
			items: [mediaRecord('v1', 'clip.mp4'), mediaRecord('v2', 'otro.mp4')],
			page: 1,
			perPage: 24,
			totalItems: 60,
			totalPages: 3
		});
		void mediaPickerState.open({ multiple: false, accept: ['image/*'] });
		await settle();

		expect(target.querySelector('.vega-media-picker-empty')).not.toBeNull();
		expect(target.querySelector('[data-pagination]')).not.toBeNull();
	});

	test('sin más páginas no hay paginación aunque accept deje la página vacía', async () => {
		const target = mountPicker({
			items: [mediaRecord('v1', 'clip.mp4')],
			page: 1,
			perPage: 24,
			totalItems: 1,
			totalPages: 1
		});
		void mediaPickerState.open({ multiple: false, accept: ['image/*'] });
		await settle();

		expect(target.querySelector('.vega-media-picker-empty')).not.toBeNull();
		expect(target.querySelector('[data-pagination]')).toBeNull();
	});
});

/**
 * `opts.notice`: el aviso de la cabecera dice que se inserta una COPIA, que es lo que hace el campo
 * de fichero. Quien enlaza lo elegido por su URL (la barra del texto enriquecido) pasa el suyo.
 */
describe('MediaPicker.svelte — aviso de la cabecera', () => {
	const emptyPage = { items: [], page: 1, perPage: 24, totalItems: 0, totalPages: 1 };

	test('sin notice pinta el aviso de siempre', async () => {
		const target = mountPicker(emptyPage);
		void mediaPickerState.open({ multiple: false });
		await settle();

		expect(target.querySelector('.vega-media-picker-copy')?.textContent?.trim()).toBe(
			'media.picker.copyNotice'
		);
	});

	test('con notice pinta ese texto en su lugar', async () => {
		const target = mountPicker(emptyPage);
		void mediaPickerState.open({ multiple: false, notice: 'Se enlaza la imagen.' });
		await settle();

		expect(target.querySelector('.vega-media-picker-copy')?.textContent?.trim()).toBe(
			'Se enlaza la imagen.'
		);
	});
});

/** Comportamientos del recorrido real; el puerto representa persistencia, no drafts de la UI. */
function mountFlow(options: { canUpdate?: boolean; list?: BackendPort['list'] } = {}) {
	let records = [mediaRecord('m1', 'uno.png'), mediaRecord('m2', 'dos.png')];
	const list = vi.fn(
		options.list ??
			(async () => ({
				items: records,
				page: 1,
				perPage: 24,
				totalItems: records.length,
				totalPages: 1
			}))
	);
	const update = vi.fn(async (_type: string, id: string, input: Record<string, unknown>) => {
		const previous = records.find((record) => record.id === id)!;
		const saved = {
			...previous,
			values: { ...previous.values, ...input, alt: String(input.alt).trim() }
		} as VegaRecord;
		records = records.map((record) => (record.id === id ? saved : record));
		return saved;
	});
	const target = mountPicker(
		{ items: records, page: 1, perPage: 24, totalItems: 2, totalPages: 1 },
		{ port: { list, update } as unknown as Partial<BackendPort>, canUpdate: options.canUpdate }
	);
	return { target, list, update };
}
function card(target: HTMLElement, id = 'm1'): HTMLButtonElement {
	return target.querySelector<HTMLButtonElement>(`[data-media-item="${id}"]`)!;
}
function toggle(target: HTMLElement, id = 'm1'): HTMLButtonElement {
	return card(target, id)
		.closest('li')!
		.querySelector<HTMLButtonElement>('.vega-media-check--control')!;
}
function finalSelection(target: HTMLElement): HTMLButtonElement {
	return target.querySelector<HTMLButtonElement>(
		'.vega-media-picker-actions-primary button:last-child'
	)!;
}
function cancelPicker(target: HTMLElement): void {
	target
		.querySelector<HTMLButtonElement>('.vega-media-picker-actions-primary button:first-child')!
		.click();
}
function editAlt(target: HTMLElement, value: string): void {
	const input = target.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}
function saveMetadata(target: HTMLElement): void {
	target
		.querySelector('form')!
		.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
async function search(target: HTMLElement, term: string): Promise<void> {
	vi.useFakeTimers();
	const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
	input.value = term;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await vi.advanceTimersByTimeAsync(250);
	await settle();
	vi.useRealTimers();
}

describe('MediaPicker — inspeccionar, guardar y seleccionar independientes', () => {
	test('seleccionar sin modificar devuelve File y no hace ninguna escritura', async () => {
		const { target, update } = mountFlow();
		const result = mediaPickerState.open({ multiple: false });
		await settle();
		toggle(target).click();
		await settle();
		expect(target.querySelector('form')).toBeNull();
		expect(toggle(target).getAttribute('aria-pressed')).toBe('true');
		finalSelection(target).click();
		await settle();
		expect((await result)?.[0]).toMatchObject({ mediaId: 'm1', alt: 'x', missingAlt: false });
		expect((await result)?.[0].file).toBeInstanceOf(File);
		expect(update).not.toHaveBeenCalled();
	});

	test('abrir ficha no elige; Guardar no cierra ni elige y cancelar no revierte lo confirmado', async () => {
		const { target, update } = mountFlow();
		const result = mediaPickerState.open({ multiple: false });
		await settle();
		card(target).click();
		await settle();
		expect(target.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(finalSelection(target).disabled).toBe(true);
		editAlt(target, '  Descripción guardada  ');
		await settle();
		const submit = target.querySelector<HTMLButtonElement>(
			'.vega-media-picker-metadata-actions button'
		)!;
		expect(submit.form).toBe(target.querySelector('form'));
		saveMetadata(target);
		await settle();
		expect(mediaPickerState.request).not.toBeNull();
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.value).toBe(
			'Descripción guardada'
		);
		expect(finalSelection(target).disabled).toBe(true);
		cancelPicker(target);
		await settle();
		expect(await result).toBeNull();
		void mediaPickerState.open({ multiple: false });
		await settle();
		card(target).click();
		await settle();
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.value).toBe(
			'Descripción guardada'
		);
		expect(update).toHaveBeenCalledTimes(1);
	});

	test('el elegido recibe alt/missingAlt de la respuesta backend, no del draft', async () => {
		const { target, update } = mountFlow();
		const result = mediaPickerState.open({ multiple: true });
		await settle();
		toggle(target).click();
		card(target).click();
		await settle();
		editAlt(target, '  Respuesta confirmada  ');
		await settle();
		expect(finalSelection(target).disabled).toBe(true);
		saveMetadata(target);
		await settle();
		expect(finalSelection(target).disabled).toBe(false);
		finalSelection(target).click();
		await settle();
		expect((await result)?.[0].alt).toBe('Respuesta confirmada');
		expect((await result)?.[0].missingAlt).toBe(false);
		expect(update).toHaveBeenCalledTimes(1);
	});

	test('fallo de guardado conserva draft y selección, muestra error y permite reintentar', async () => {
		const { target, update } = mountFlow();
		void mediaPickerState.open({ multiple: false });
		await settle();
		toggle(target).click();
		card(target).click();
		await settle();
		editAlt(target, 'Borrador offline');
		await settle();
		update.mockRejectedValueOnce(VegaError.backend('Sin conexión'));
		saveMetadata(target);
		await settle();
		expect(target.querySelector('[role="alert"]')?.textContent).toContain('Sin conexión');
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.value).toBe(
			'Borrador offline'
		);
		expect(finalSelection(target).disabled).toBe(true);
		expect(toggle(target).getAttribute('aria-pressed')).toBe('true');
		saveMetadata(target);
		await settle();
		expect(target.querySelector('[role="alert"]')).toBeNull();
		expect(finalSelection(target).disabled).toBe(false);
	});

	test('cancelar el guard de salir/cambiar conserva draft y foco; confirmar descarta solo el draft', async () => {
		const { target, update } = mountFlow();
		const result = mediaPickerState.open({ multiple: false });
		await settle();
		card(target).click();
		await settle();
		editAlt(target, 'Pendiente');
		await settle();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const input = target.querySelector<HTMLInputElement>('#vega-media-detail-alt')!;
		input.focus();
		card(target, 'm2').click();
		await settle();
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.value).toBe(
			'Pendiente'
		);
		cancelPicker(target);
		await settle();
		expect(mediaPickerState.request).not.toBeNull();
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(document.activeElement).toBe(input);
		confirm.mockReturnValue(true);
		cancelPicker(target);
		await settle();
		expect(await result).toBeNull();
		expect(update).not.toHaveBeenCalled();
	});

	test('guardando bloquea cambio, cierre y selección hasta respuesta', async () => {
		const { target, update } = mountFlow();
		let release!: (record: VegaRecord) => void;
		update.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				})
		);
		void mediaPickerState.open({ multiple: false });
		await settle();
		toggle(target).click();
		card(target).click();
		await settle();
		editAlt(target, 'En vuelo');
		await settle();
		saveMetadata(target);
		await settle();
		cancelPicker(target);
		card(target, 'm2').click();
		await settle();
		expect(mediaPickerState.request).not.toBeNull();
		expect(finalSelection(target).disabled).toBe(true);
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.value).toBe(
			'En vuelo'
		);
		release({
			...mediaRecord('m1', 'uno.png'),
			values: { file: 'uno.png', alt: 'Confirmado', title: '', tags: [] }
		} as VegaRecord);
		await settle();
		expect(finalSelection(target).disabled).toBe(false);
	});

	test('sin update efectivo se puede inspeccionar y elegir, nunca guardar', async () => {
		const { target, update } = mountFlow({ canUpdate: false });
		const result = mediaPickerState.open({ multiple: false });
		await settle();
		toggle(target).click();
		card(target).click();
		await settle();
		expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.disabled).toBe(true);
		expect(target.querySelector('.vega-media-picker-metadata-actions')).toBeNull();
		saveMetadata(target);
		await settle();
		expect(update).not.toHaveBeenCalled();
		finalSelection(target).click();
		await settle();
		expect((await result)?.[0].mediaId).toBe('m1');
	});

	for (const inspect of [false, true]) {
		test(`selección lenta congela ficha y mantiene Tab dentro del diálogo (ficha=${inspect})`, async () => {
			const { target, update } = mountFlow();
			let release!: (file: File) => void;
			vi.mocked(fileFromMediaAsset).mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						release = resolve;
					})
			);
			const result = mediaPickerState.open({ multiple: false });
			await settle();
			toggle(target).click();
			await settle();
			if (inspect) {
				card(target).click();
				await settle();
			}
			finalSelection(target).click();
			await settle();
			const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!;
			if (inspect) {
				expect(target.querySelector<HTMLInputElement>('#vega-media-detail-alt')?.disabled).toBe(
					true
				);
				expect(target.querySelector<HTMLElement>('.vega-media-detail-dialog')?.inert).toBe(true);
				saveMetadata(target);
			}
			for (const shiftKey of [false, true]) {
				const tab = new KeyboardEvent('keydown', {
					key: 'Tab',
					shiftKey,
					bubbles: true,
					cancelable: true
				});
				document.dispatchEvent(tab);
				expect(tab.defaultPrevented).toBe(true);
				expect(document.activeElement).toBe(dialog);
			}
			cancelPicker(target);
			expect(mediaPickerState.request).not.toBeNull();
			expect(update).not.toHaveBeenCalled();
			release(new File(['bytes'], 'uno.png', { type: 'image/png' }));
			await settle();
			expect((await result)?.[0].alt).toBe('x');
		});
	}

	test('fallo preparando File no entrega parciales y conserva selección para reintentar', async () => {
		const { target } = mountFlow();
		const result = mediaPickerState.open({ multiple: true });
		await settle();
		toggle(target).click();
		toggle(target, 'm2').click();
		await settle();
		vi.mocked(fileFromMediaAsset).mockRejectedValueOnce(
			new MediaFileFetchError('Descarga interrumpida')
		);
		finalSelection(target).click();
		await settle();
		expect(target.querySelector('[role="alert"]')?.textContent).toContain('Descarga interrumpida');
		expect(toggle(target).getAttribute('aria-pressed')).toBe('true');
		expect(toggle(target, 'm2').getAttribute('aria-pressed')).toBe('true');
		finalSelection(target).click();
		await settle();
		expect((await result)?.map((item) => item.mediaId)).toEqual(['m1', 'm2']);
	});

	test('Volver conserva consulta, elección, scroll y foco de la tarjeta', async () => {
		const { target } = mountFlow();
		void mediaPickerState.open({ multiple: false });
		await settle();
		await search(target, 'x');
		const list = target.querySelector<HTMLDivElement>('.vega-media-picker-list')!;
		list.scrollTop = 76;
		list.dispatchEvent(new Event('scroll'));
		toggle(target).click();
		const opener = card(target);
		opener.focus();
		opener.click();
		await settle();
		target.querySelector<HTMLButtonElement>('.vega-media-detail-close')!.click();
		await settle();
		expect(target.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('x');
		expect(list.scrollTop).toBe(76);
		expect(toggle(target).getAttribute('aria-pressed')).toBe('true');
		expect(document.activeElement).toBe(opener);
	});
});

describe('MediaPicker — última reapertura compatible, sin IDs entre sesiones', () => {
	test('normaliza accept como conjunto y conserva consulta/página/scroll, pero vacía elegidos', async () => {
		const { target, list } = mountFlow({
			list: async (_type, query) => ({
				items: [mediaRecord(`m${query?.page ?? 1}`, 'foto.png')],
				page: query?.page ?? 1,
				perPage: 24,
				totalItems: 60,
				totalPages: 3
			})
		});
		void mediaPickerState.open({ multiple: true, accept: ['image/png', 'image/*'] });
		await settle();
		await search(target, 'portada');
		target.querySelector<HTMLButtonElement>('[data-pagination] button:last-child')!.click();
		await settle();
		const region = target.querySelector<HTMLDivElement>('.vega-media-picker-list')!;
		region.scrollTop = 81;
		region.dispatchEvent(new Event('scroll'));
		toggle(target, 'm2').click();
		await settle();
		cancelPicker(target);
		await settle();
		void mediaPickerState.open({ multiple: true, accept: [' IMAGE/* ', 'image/png', 'image/png'] });
		await settle();
		expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ page: 2 });
		expect(JSON.stringify(list.mock.calls.at(-1)?.[1])).toContain('portada');
		expect(target.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('portada');
		expect(target.querySelector<HTMLDivElement>('.vega-media-picker-list')?.scrollTop).toBe(81);
		expect(toggle(target, 'm2').getAttribute('aria-pressed')).toBe('false');
		expect(finalSelection(target).disabled).toBe(true);
	});

	test('cerrar antes del debounce recuerda la búsqueda nueva desde página1, sin scroll anterior', async () => {
		const { target, list } = mountFlow({
			list: async (_type, query) => ({
				items: [mediaRecord(`m${query?.page ?? 1}`, 'foto.png')],
				page: query?.page ?? 1,
				perPage: 24,
				totalItems: 60,
				totalPages: 3
			})
		});
		void mediaPickerState.open({ multiple: false });
		await settle();
		target.querySelector<HTMLButtonElement>('[data-pagination] button:last-child')!.click();
		await settle();
		const region = target.querySelector<HTMLDivElement>('.vega-media-picker-list')!;
		region.scrollTop = 81;
		region.dispatchEvent(new Event('scroll'));
		vi.useFakeTimers();
		const input = target.querySelector<HTMLInputElement>('input[type="search"]')!;
		input.value = 'nueva';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		cancelPicker(target);
		await settle();
		void mediaPickerState.open({ multiple: false });
		await settle();
		expect(list.mock.calls.at(-1)?.[1]?.page).toBe(1);
		expect(JSON.stringify(list.mock.calls.at(-1)?.[1])).toContain('nueva');
		expect(target.querySelector<HTMLDivElement>('.vega-media-picker-list')?.scrollTop).toBe(0);
		await vi.advanceTimersByTimeAsync(250);
	});

	test('opciones incompatibles reinician recorrido y solo se recuerda la apertura más reciente', async () => {
		const { target } = mountFlow();
		void mediaPickerState.open({ multiple: false });
		await settle();
		await search(target, 'anterior');
		cancelPicker(target);
		await settle();
		void mediaPickerState.open({ multiple: true });
		await settle();
		expect(target.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
		await search(target, 'otra');
		cancelPicker(target);
		await settle();
		void mediaPickerState.open({ multiple: false, accept: [] });
		await settle();
		expect(target.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('');
	});

	test('si cambia el resultado reinicia scroll, y si desaparece página2 recarga la última válida', async () => {
		let totalPages = 3,
			changed = false;
		const { target, list } = mountFlow({
			list: async (_type, query) => ({
				items: [mediaRecord(changed ? 'nuevo' : `m${query?.page ?? 1}`, 'foto.png')],
				page: query?.page ?? 1,
				perPage: 24,
				totalItems: 60,
				totalPages
			})
		});
		void mediaPickerState.open({ multiple: false });
		await settle();
		target.querySelector<HTMLButtonElement>('[data-pagination] button:last-child')!.click();
		await settle();
		const region = target.querySelector<HTMLDivElement>('.vega-media-picker-list')!;
		region.scrollTop = 82;
		region.dispatchEvent(new Event('scroll'));
		cancelPicker(target);
		await settle();
		changed = true;
		void mediaPickerState.open({ multiple: false });
		await settle();
		expect(target.querySelector<HTMLDivElement>('.vega-media-picker-list')?.scrollTop).toBe(0);
		cancelPicker(target);
		await settle();
		totalPages = 1;
		void mediaPickerState.open({ multiple: false });
		await settle();
		expect(list.mock.calls.slice(-2).map((call) => call[1]?.page)).toEqual([2, 1]);
		expect(target.querySelector('[data-pagination]')).toBeNull();
	});
});
