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
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import FileInput from './FileInput.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedField } from '$lib/model/types';
import type { MediaPickResult } from '$lib/media/media-picker';

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
		model: {},
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
