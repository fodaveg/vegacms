/**
 * Suite de `FileInput.svelte` — el gesto de L-P6.9 (Fase P6·6e): sin `ctx.mediaPicker`, el
 * botón "Elegir de la biblioteca" NUNCA se pinta (nunca deshabilitado, directamente AUSENTE); con
 * él, se pinta y lo abre. Y el aviso informativo de texto alternativo que sigue a elegir una
 * imagen sin alt de la biblioteca (audit del 23 sep, lámina pieza 3), que solo vive en la sesión.
 *
 * **Por qué esto necesita un montaje real (proyecto vitest `component`, ver `vite.config.ts`;
 * Svelte 5 `mount()`/`unmount()` — sin librería nueva, ambas ya las exporta `svelte`) y no basta
 * con e2e**: el ÚNICO shell real (`src/routes/+layout.svelte`) publica `ctx.mediaPicker` SIEMPRE
 * (`<MediaPicker>` montado incondicionalmente, L-P6.11) — no existe ninguna ruta de la app donde
 * `ctx.mediaPicker` sea `undefined` en producción, así que Playwright NUNCA podría ejercitar la
 * rama "sin picker". La degradación (L-P6.9) solo es observable montando el widget de forma
 * aislada, con un `VegaAppContext` de mentira que a propósito NO incluye `mediaPicker` — de ahí
 * este test, el PRIMER uso real de la convención `*.svelte.test.ts` (reservada desde F5-g, ver el
 * comentario del proyecto `dom` en `vite.config.ts`; antes todo era lógica pura `.test.ts` o e2e
 * Playwright — `mount`/`unmount` bastan, sin añadir `@testing-library/svelte`).
 *
 * `VEGA_CONTEXT_KEY` se exporta de `$lib/app-context` ÚNICAMENTE para este uso (ver su cabecera).
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import FileInput from './FileInput.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import { VegaError } from '$lib/backend/errors';
import type { BackendPort } from '$lib/backend/port';
import type { ContentType, RecordInput, VegaRecord } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import type { MediaPickResult } from '$lib/media/media-picker';
import { AFTER_SAVE_KEY, createAfterSaveRegistry } from '../after-save';

const fileField: ResolvedField = {
	schema: {
		name: 'coverImage',
		type: 'file',
		multiple: false,
		mimeTypes: ['image/*'],
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	name: 'coverImage',
	label: 'Portada',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'file',
	subtype: null,
	listable: false
};

const fakePort = {
	capabilities: {
		realtime: false,
		thumbs: false,
		schemaDiscovery: true,
		filePerRecord: true,
		protectedFiles: false
	},
	fileUrl: vi.fn().mockReturnValue('')
} as unknown as BackendPort;

/** `VegaAppContext` mínimo: `mediaPicker` es lo único que varía entre los dos tests, el resto son
 *  stubs que el widget nunca llega a invocar (sin identidad de registro, `value` siempre `null`). */
function fakeCtx(mediaPicker?: VegaAppContext['mediaPicker']): VegaAppContext {
	return {
		port: fakePort,
		model: { types: [] },
		session: {},
		t: (key: string) => key,
		locale: 'es',
		icons: {},
		reloadModel: async () => {},
		nav: {},
		feedback: { toast: () => {}, reportError: () => {} },
		registerExitGuard: () => () => {},
		mediaPicker
	} as unknown as VegaAppContext;
}

function mountFileInput(ctx: VegaAppContext): {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(FileInput, {
		target,
		props: {
			field: fileField,
			value: null,
			error: null,
			disabled: false,
			readonly: false,
			onChange: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance };
}

describe('FileInput.svelte — botón "Elegir de la biblioteca" (Fase P6·6e, L-P6.9)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('SIN `ctx.mediaPicker`: el botón está AUSENTE (nunca deshabilitado) — el resto del widget sigue funcionando', () => {
		mounted = mountFileInput(fakeCtx(undefined));

		expect(mounted.target.querySelector('.vega-file-pick-library')).toBeNull();
		// El resto del widget (dropzone/input real) sigue montado con normalidad: L-P6.9 exige
		// "idéntico", no solo "sin el botón".
		expect(mounted.target.querySelector('.vega-file-input')).not.toBeNull();
	});

	test('CON `ctx.mediaPicker`: el botón se pinta y lo abre al pulsarlo', async () => {
		const open = vi.fn<
			(opts: { multiple: boolean; accept?: string[] }) => Promise<MediaPickResult[] | null>
		>(
			() => new Promise(() => {}) // nunca resuelve: solo interesa que SE LLAMÓ, no el resultado
		);
		mounted = mountFileInput(fakeCtx({ open }));

		const button = mounted.target.querySelector<HTMLButtonElement>('.vega-file-pick-library');
		expect(button).not.toBeNull();
		expect(button?.disabled).toBe(false);

		button?.click();
		await Promise.resolve(); // dispara el handler async (microtask) antes de aserta

		expect(open).toHaveBeenCalledTimes(1);
		expect(open).toHaveBeenCalledWith({ multiple: false, accept: ['image/*'] });
	});
});

describe('FileInput.svelte — aviso de texto alternativo al elegir de la biblioteca (lámina pieza 3)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		// jsdom no implementa object URLs; el widget previsualiza cada `File` nuevo con una.
		URL.createObjectURL = vi.fn(() => 'blob:vega-test');
		URL.revokeObjectURL = vi.fn();
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	/** Monta el widget con `value` VIVO (`$state`): `onChange` lo escribe, como haría `RecordForm`. */
	function mountLive(results: MediaPickResult[]): {
		target: HTMLElement;
		props: { value: unknown };
	} {
		const props = $state({
			field: fileField,
			value: null as unknown,
			error: null,
			disabled: false,
			readonly: false,
			onChange: (next: unknown) => {
				props.value = next;
			}
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(FileInput, {
			target,
			// `value` es `FieldValue` en `WidgetProps`; aquí basta con que el widget lo reciba.
			props: props as never,
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx({ open: async () => results })]])
		});
		mounted = { target, instance };
		return { target, props };
	}

	async function pick(target: HTMLElement): Promise<void> {
		target.querySelector<HTMLButtonElement>('.vega-file-pick-library')?.click();
		await Promise.resolve();
		await Promise.resolve();
		flushSync();
	}

	function photo(name: string): File {
		return new File([new Uint8Array(4)], name, { type: 'image/png' });
	}

	test('una imagen elegida SIN alt en la biblioteca marca su fila y avisa en una región status', async () => {
		const { target } = mountLive([
			{ file: photo('IMG_2026.png'), mediaId: 'm1', alt: '', missingAlt: true }
		]);
		const status = target.querySelector('.vega-file-alt-status');
		expect(status?.getAttribute('role')).toBe('status');
		// Antes de elegir, la región existe pero vacía (fuera del flujo, ver CSS del widget).
		expect(status?.matches(':empty')).toBe(true);

		await pick(target);

		expect(target.querySelectorAll('.vega-file-item')).toHaveLength(1);
		expect(target.querySelector('.vega-file-item--warn')).not.toBeNull();
		expect(status?.textContent).toContain('form.file.libraryMissingAltOne');
	});

	test('con alt en la biblioteca no se pinta nada', async () => {
		const { target } = mountLive([
			{ file: photo('portada.png'), mediaId: 'm2', alt: 'Portada', missingAlt: false }
		]);

		await pick(target);

		expect(target.querySelectorAll('.vega-file-item')).toHaveLength(1);
		expect(target.querySelector('.vega-file-item--warn')).toBeNull();
		expect(target.querySelector('.vega-file-alt-status')?.matches(':empty')).toBe(true);
	});

	test('solo vive en la sesión: al reasentar el valor a la FileRef guardada, el aviso se va', async () => {
		const { target, props } = mountLive([
			{ file: photo('IMG_2026.png'), mediaId: 'm1', alt: '', missingAlt: true }
		]);
		await pick(target);
		expect(target.querySelector('.vega-file-item--warn')).not.toBeNull();

		// Lo que hace `RecordForm` tras guardar: el `File` pendiente pasa a ser la `FileRef` real.
		props.value = 'img_2026_abc123.png';
		flushSync();

		expect(target.querySelector('.vega-file-item--warn')).toBeNull();
		expect(target.querySelector('.vega-file-alt-status')?.matches(':empty')).toBe(true);
	});
});

/**
 * Lote 12, lámina 5: una imagen subida desde el campo pide su texto alternativo y, al guardar,
 * se copia a Medios con él. Lo que SOLO se puede observar montando el widget aislado: la rama sin
 * permiso de crear en Medios (el shell real siempre tiene biblioteca en e2e), el gancho tras
 * guardar llamado a mano con un registro inventado (la fila pasa por «Guardando en Medios…» y
 * acaba en «En Medios…» o en el error con «reintentar»), y que lo elegido de la biblioteca no se
 * copia otra vez. El recorrido real (subir, guardar, ver el asset en `/media`) es de Playwright.
 */
describe('FileInput.svelte — texto alternativo y copia en Medios (lote 12, lámina 5)', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	beforeEach(() => {
		URL.createObjectURL = vi.fn(() => 'blob:vega-test');
		URL.revokeObjectURL = vi.fn();
	});

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	const mediaCollection: ContentType = {
		name: 'vega_media',
		readonly: false,
		fields: [
			{
				name: 'file',
				type: 'file',
				multiple: false,
				protected: false,
				required: true,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false,
				maxSizeBytes: 10_000,
				mimeTypes: ['image/png', 'application/pdf']
			}
		]
	};

	function mediaType(create = true): ResolvedContentType {
		return {
			schema: mediaCollection,
			name: 'vega_media',
			permissions: { ...ALL_PERMISSIONS, create }
		} as unknown as ResolvedContentType;
	}

	type CreateFn = (collection: string, input: RecordInput) => Promise<VegaRecord>;

	interface Harness {
		target: HTMLElement;
		props: { value: unknown; disabled: boolean };
		create: ReturnType<typeof vi.fn<CreateFn>>;
		toast: ReturnType<typeof vi.fn>;
		registry: ReturnType<typeof createAfterSaveRegistry>;
	}

	/** Monta el widget con `value` VIVO, biblioteca en el modelo y el registro de ganchos de
	 *  `RecordForm` en contexto. `field` por defecto es `coverImage` (solo imágenes). */
	function mountWithLibrary(opts?: {
		canCreate?: boolean;
		field?: ResolvedField;
		create?: Harness['create'];
		picker?: VegaAppContext['mediaPicker'];
	}): Harness {
		const create =
			opts?.create ??
			vi.fn<CreateFn>(async () => ({ id: 'm_new', type: 'vega_media', values: {} }));
		const toast = vi.fn();
		const registry = createAfterSaveRegistry();
		const ctx = {
			...fakeCtx(opts?.picker),
			port: { ...fakePort, create },
			model: { types: [mediaType(opts?.canCreate ?? true)] },
			feedback: { toast, reportError: vi.fn() }
		} as unknown as VegaAppContext;
		const props = $state({
			field: opts?.field ?? fileField,
			value: null as unknown,
			error: null,
			disabled: false,
			readonly: false,
			onChange: (next: unknown) => {
				props.value = next;
			}
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(FileInput, {
			target,
			props: props as never,
			context: new Map<symbol, unknown>([
				[VEGA_CONTEXT_KEY, ctx],
				[AFTER_SAVE_KEY, registry]
			])
		});
		mounted = { target, instance };
		return { target, props, create, toast, registry };
	}

	/** Lo que hace el navegador al elegir ficheros: `files` en el input real y `change`. */
	async function chooseFiles(target: HTMLElement, files: File[]): Promise<void> {
		const input = target.querySelector<HTMLInputElement>('.vega-file-input');
		if (!input) throw new Error('sin input');
		Object.defineProperty(input, 'files', { value: files, configurable: true });
		input.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		await tick(); // `focusAlt` espera un tick antes de llevar el foco
		await tick();
		flushSync();
	}

	function typeAlt(target: HTMLElement, text: string): void {
		const textarea = target.querySelector<HTMLTextAreaElement>('.vega-file-alt-input');
		if (!textarea) throw new Error('sin textarea');
		textarea.value = text;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
	}

	const png = (name = 'huerto.png'): File =>
		new File([new Uint8Array(64)], name, { type: 'image/png' });
	const savedRecord = (value: unknown): VegaRecord => ({
		id: 'post_1',
		type: 'posts',
		values: { coverImage: value as never }
	});

	test('una imagen subida desde el campo despliega su fila: texto alternativo con foco, aviso mientras está vacío y «se guardará en Medios»', async () => {
		const { target } = mountWithLibrary();

		await chooseFiles(target, [png()]);

		const row = target.querySelector('.vega-file-item');
		expect(row?.classList.contains('vega-file-item--alt')).toBe(true);
		expect(row?.classList.contains('vega-file-item--warn')).toBe(true);
		const textarea = target.querySelector<HTMLTextAreaElement>('.vega-file-alt-input');
		expect(textarea).not.toBeNull();
		expect(document.activeElement).toBe(textarea);
		// Rótulo asociado por `for`/`id` y ayuda enlazada por `aria-describedby`.
		const label = target.querySelector<HTMLLabelElement>('.vega-file-alt-label');
		expect(label?.getAttribute('for')).toBe(textarea?.id);
		expect(textarea?.getAttribute('aria-describedby')).toBe(
			target.querySelector('.vega-file-alt-help')?.id
		);
		expect(target.querySelector('.vega-file-alt-status')?.textContent).toContain(
			'media.detail.altMissingHint'
		);
		expect(target.querySelector('.vega-file-library-state')?.textContent).toContain(
			'form.file.libraryPending'
		);
	});

	test('al escribir el texto, el borde de aviso, la frase de aviso y la ayuda desaparecen', async () => {
		const { target } = mountWithLibrary();
		await chooseFiles(target, [png()]);

		typeAlt(target, 'Tres calabazas recién cortadas');

		expect(target.querySelector('.vega-file-item--warn')).toBeNull();
		expect(target.querySelector('.vega-file-alt-status')?.matches(':empty')).toBe(true);
		expect(target.querySelector('.vega-file-alt-help')).toBeNull();
		expect(target.querySelector<HTMLTextAreaElement>('.vega-file-alt-input')?.value).toBe(
			'Tres calabazas recién cortadas'
		);
	});

	test('al guardar: el gancho copia a Medios con el texto, la fila pasa por «Guardando…» y, reasentada a la FileRef, dice «En Medios, con texto alternativo»', async () => {
		let release: (() => void) | undefined;
		const create = vi.fn<CreateFn>(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ id: 'm_new', type: 'vega_media', values: {} });
				})
		);
		const { target, props, registry } = mountWithLibrary({ create });
		const file = png();
		await chooseFiles(target, [file]);
		typeAlt(target, '  Tres calabazas ');

		// Lo que hace `RecordForm`: el formulario queda deshabilitado y corre el gancho.
		props.disabled = true;
		flushSync();
		const run = registry.run(savedRecord('abc_huerto.png'));
		// Antes de `create` va la reducción (`shrinkImage`, que en jsdom no decodifica y deja el
		// original): varios microtasks, de ahí la espera activa.
		await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
		flushSync();
		expect(target.querySelector('.vega-file-library-state')?.getAttribute('data-state')).toBe(
			'uploading'
		);
		expect(target.querySelector<HTMLTextAreaElement>('.vega-file-alt-input')?.disabled).toBe(true);

		release?.();
		const notes = await run;
		expect(create).toHaveBeenCalledWith('vega_media', { file, alt: 'Tres calabazas' });
		expect(notes).toEqual(['form.file.copiedOne']);

		// `commitSaved`: el `File` pendiente pasa a ser la `FileRef` real.
		props.value = 'abc_huerto.png';
		props.disabled = false;
		flushSync();
		const state = target.querySelector('.vega-file-library-state');
		expect(state?.getAttribute('data-state')).toBe('done');
		expect(state?.textContent).toContain('form.file.libraryDone');
		// El texto ya no se edita aquí: vive en la ficha de Medios.
		expect(target.querySelector('.vega-file-alt-input')).toBeNull();
		expect(target.querySelector('.vega-file-item--alt')).not.toBeNull();
	});

	test('guardado sin texto: se copia igual (avisa, no bloquea) y la fila lo dice', async () => {
		const { target, props, registry, create } = mountWithLibrary();
		await chooseFiles(target, [png()]);

		const notes = await registry.run(savedRecord('abc_huerto.png'));
		props.value = 'abc_huerto.png';
		flushSync();

		expect(create.mock.calls[0]?.[1]).toEqual({ file: expect.any(File) });
		expect(notes).toEqual(['form.file.copiedOne']);
		expect(target.querySelector('.vega-file-library-state')?.textContent).toContain(
			'form.file.libraryDoneNoAlt'
		);
	});

	test('si la copia falla, el registro no se deshace: la fila guarda el error con «reintentar», que vuelve a subir', async () => {
		const create = vi
			.fn<CreateFn>()
			.mockRejectedValueOnce(VegaError.backend('se cayó el servidor'))
			.mockResolvedValue({ id: 'm_new', type: 'vega_media', values: {} });
		const { target, props, registry, toast } = mountWithLibrary({ create });
		await chooseFiles(target, [png()]);
		typeAlt(target, 'Tres calabazas');

		const notes = await registry.run(savedRecord('abc_huerto.png'));
		expect(notes).toEqual([]);
		props.value = 'abc_huerto.png';
		flushSync();

		const state = target.querySelector('.vega-file-library-state');
		expect(state?.getAttribute('data-state')).toBe('error');
		expect(state?.getAttribute('role')).toBe('alert');
		expect(state?.textContent).toContain('form.file.libraryError');
		// En edición el aviso se queda en la fila, no en un toast que se va.
		expect(toast).not.toHaveBeenCalled();

		state?.querySelector('button')?.click();
		await vi.waitFor(() => {
			flushSync();
			expect(target.querySelector('.vega-file-library-state')?.getAttribute('data-state')).toBe(
				'done'
			);
		});

		expect(create).toHaveBeenCalledTimes(2);
		expect(create.mock.calls[1]?.[1]).toEqual({ file: expect.any(File), alt: 'Tres calabazas' });
	});

	test('sin permiso de crear en Medios: todo como hoy, ni texto ni copia', async () => {
		const { target, registry, create } = mountWithLibrary({ canCreate: false });
		await chooseFiles(target, [png()]);

		expect(target.querySelector('.vega-file-item--alt')).toBeNull();
		expect(target.querySelector('.vega-file-alt-input')).toBeNull();
		expect(target.querySelector('.vega-file-library-state')).toBeNull();
		expect(target.querySelector('.vega-file-alt-status')?.matches(':empty')).toBe(true);

		expect(await registry.run(savedRecord('abc_huerto.png'))).toEqual([]);
		expect(create).not.toHaveBeenCalled();
	});

	test('un fichero que no es imagen se copia sin pedir texto ni línea de estado', async () => {
		const anyFile: ResolvedField = {
			...fileField,
			name: 'attachment',
			schema: { ...fileField.schema, name: 'attachment', mimeTypes: undefined } as never
		};
		const { target, registry, create } = mountWithLibrary({ field: anyFile });
		const pdf = new File(['%PDF-1.4'], 'calendario.pdf', { type: 'application/pdf' });
		await chooseFiles(target, [pdf]);

		expect(target.querySelector('.vega-file-item--alt')).toBeNull();
		expect(target.querySelector('.vega-file-library-state')).toBeNull();

		const notes = await registry.run({
			id: 'post_1',
			type: 'posts',
			values: { attachment: 'abc_calendario.pdf' }
		});
		expect(create).toHaveBeenCalledWith('vega_media', { file: pdf });
		expect(notes).toEqual(['form.file.copiedOneFile']);
	});

	test('elegida de la biblioteca: ya está en Medios, ni se pregunta ni se vuelve a copiar', async () => {
		const { target, registry, create } = mountWithLibrary({
			picker: {
				open: async () => [
					{ file: png('tomateras.png'), mediaId: 'm1', alt: 'Tomateras', missingAlt: false }
				]
			}
		});
		target.querySelector<HTMLButtonElement>('.vega-file-pick-library')?.click();
		await Promise.resolve();
		await Promise.resolve();
		flushSync();

		expect(target.querySelectorAll('.vega-file-item')).toHaveLength(1);
		expect(target.querySelector('.vega-file-item--alt')).toBeNull();
		expect(await registry.run(savedRecord('abc_tomateras.png'))).toEqual([]);
		expect(create).not.toHaveBeenCalled();
	});

	test('quitar la imagen antes de guardar olvida su texto y su copia pendiente', async () => {
		const { target, registry, create } = mountWithLibrary();
		await chooseFiles(target, [png()]);
		typeAlt(target, 'Tres calabazas');

		target.querySelector<HTMLButtonElement>('.vega-file-remove')?.click();
		flushSync();

		expect(target.querySelectorAll('.vega-file-item')).toHaveLength(0);
		expect(target.querySelector('.vega-file-alt-status')?.matches(':empty')).toBe(true);
		expect(await registry.run(savedRecord(null))).toEqual([]);
		expect(create).not.toHaveBeenCalled();
	});
});
