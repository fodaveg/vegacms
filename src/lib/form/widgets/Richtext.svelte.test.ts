/**
 * Suite de `Richtext.svelte` — SOLO el estado PREVIO al montaje de TipTap, que es donde vivía un bug
 * de pérdida silenciosa de datos (ver la cabecera del componente para la historia completa).
 *
 * **Por qué necesita un montaje aislado** (proyecto vitest `component`, convención
 * `*.svelte.test.ts`, mismo patrón que `FileInput.svelte.test.ts`): el editor real llega por un
 * `import()` dinámico de ~145 KB, así que la ventana que se prueba aquí es justo el hueco entre el
 * primer render y ese `import()` resuelto. En e2e esa ventana existe pero NO es observable de forma
 * determinista —dura lo que tarde la red/el bundler— y un test que intente pillarla al vuelo sería
 * exactamente el tipo de test que un día se queda ciego en silencio. Montando el componente a mano
 * el estado inicial es SÍNCRONO y no depende de ningún tiempo: un `import()` dinámico nunca resuelve
 * antes de que vuelva `mount()`.
 *
 * Lo que se protege, que es lo que se rompió de verdad:
 * 1. Que el hueco NO se anuncie como un campo de texto ya usable (`getByRole('textbox')` no debe
 *    encontrar nada): antes ponía `role="textbox"` en un `<div>` que no era `contenteditable` ni
 *    focusable, así que clicar y teclear ahí perdía las pulsaciones sin decir nada.
 * 2. Que el hueco DIGA que está cargando, con texto visible y no solo con ARIA: quitar la mentira
 *    para lectores de pantalla no arreglaba nada para quien usa el ratón y ve una caja con borde
 *    idéntica a un campo vacío.
 */
import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { tick } from 'svelte';
import Richtext from './Richtext.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ResolvedField } from '$lib/model/types';

const richtextField: ResolvedField = {
	schema: {
		name: 'content',
		type: 'richtext',
		subtype: 'html',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	name: 'content',
	label: 'Contenido',
	help: null,
	placeholder: null,
	hidden: false,
	group: null,
	widget: 'richtext',
	subtype: 'html',
	listable: false
} as unknown as ResolvedField;

/** `VegaAppContext` mínimo: el widget solo consume `t` en este tramo (el aviso de carga). `t`
 *  devuelve la propia clave, así que el test afirma sobre la CLAVE y no sobre la traducción —
 *  cambiar el texto en español no debe romperlo, quitar el aviso sí. */
function fakeCtx(): VegaAppContext {
	return {
		port: {},
		model: {},
		session: {},
		t: (key: string) => key,
		locale: 'es',
		icons: {},
		reloadModel: async () => {},
		nav: {},
		feedback: { toast: () => {}, reportError: () => {} },
		registerExitGuard: () => () => {}
	} as unknown as VegaAppContext;
}

function mountRichtext(): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Richtext, {
		target,
		props: {
			field: richtextField,
			value: '',
			error: null,
			disabled: false,
			readonly: false,
			onChange: vi.fn()
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

/**
 * Espera a que el editor REAL haya montado. Obligatorio al final de cada test, y no es adorno: el
 * `onMount` del widget lanza un `import()` dinámico (TipTap + DOMPurify) que no se puede cancelar,
 * así que un test que termine antes de que resuelva deja a vitest cargando módulos DESPUÉS de
 * destruir el entorno (`EnvironmentTeardownError`, 3 de golpe — visto en el gate completo, no al
 * correr este fichero solo). Además convierte la espera en aserción útil: el aviso de carga
 * desaparece y en su lugar aparece el campo de verdad.
 */
async function settle(target: HTMLElement): Promise<void> {
	await vi.waitFor(() => {
		expect(target.querySelector('[role="textbox"]')).not.toBeNull();
	});
	await tick();
	expect(target.querySelector('.vega-widget-richtext-loading')).toBeNull();
	expect(target.querySelector('.vega-widget-richtext-content')?.hasAttribute('data-loading')).toBe(
		false
	);
}

describe('Richtext.svelte — el hueco previo al montaje de TipTap', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('no se anuncia como un campo de texto: NADA con role="textbox" hasta que el editor exista', async () => {
		mounted = mountRichtext();

		// Ni el contenedor ni ningún descendiente: mientras no hay editor, no hay campo. El `<div>`
		// real de TipTap trae su propio `role="textbox"` cuando monta, y esa es la única fuente.
		expect(mounted.target.querySelector('[role="textbox"]')).toBeNull();

		await settle(mounted.target);
	});

	test('dice que está cargando, con texto VISIBLE y no solo con ARIA', async () => {
		mounted = mountRichtext();

		const notice = mounted.target.querySelector('.vega-widget-richtext-loading');
		expect(notice).not.toBeNull();
		// `role="status"` + texto de verdad: un `role="status"` vacío no anuncia nada.
		expect(notice?.getAttribute('role')).toBe('status');
		expect(notice?.textContent?.trim()).toBe('form.richtext.loading');

		await settle(mounted.target);
	});

	test('el contenedor se marca `data-loading` (es lo que colapsa su hueco y evita el salto de layout)', async () => {
		mounted = mountRichtext();

		const content = mounted.target.querySelector('.vega-widget-richtext-content');
		expect(content?.getAttribute('data-loading')).toBe('true');

		await settle(mounted.target);
	});
});
