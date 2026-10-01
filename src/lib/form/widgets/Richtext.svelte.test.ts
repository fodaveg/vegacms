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
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { tick } from 'svelte';
import type { Editor } from '@tiptap/core';
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

/**
 * Regresión «guardar sin tocar deja el formulario sin guardar» (entrada_2 de la demo, 30 sep).
 * Al guardar, el formulario se deshabilita y se rehabilita: `setEditable` dispara un `onUpdate`
 * espurio, y el editor serializa el `<a>` con `target`/`rel` que añade `Link` aunque el HTML
 * guardado no los trajera. Ese HTML normalizado no era byte-igual a `lastEmitted` (el saneado
 * del valor CRUDO), así que salía un `onChange` que el usuario no había provocado.
 */
describe('Richtext.svelte — un valor que el editor normaliza no se marca como cambio', () => {
	test('deshabilitar y rehabilitar con un <a> sin rel/target NO llama a onChange', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const onChange = vi.fn();
		const props = $state({
			field: richtextField,
			value: '<p>Mira <a href="https://fodaveg.net/x">esto</a> y <code>--paper</code></p>',
			error: null,
			disabled: false,
			readonly: false,
			onChange
		});
		const instance = mount(Richtext, {
			target,
			props,
			context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
		});
		try {
			await settle(target);
			props.disabled = true;
			await tick();
			props.disabled = false;
			await tick();
			await new Promise((r) => setTimeout(r, 50));
			expect(onChange).not.toHaveBeenCalled();
		} finally {
			await unmount(instance);
			target.remove();
		}
	});
});

/**
 * Enlace e imagen de la barra (tarea «insertar imagen desde la biblioteca y enlace a una página del
 * sitio»). Con el editor REAL montado: lo que se afirma es el HTML que sale por `onChange`, que es
 * lo que acaba guardado, y que abrir y cancelar un diálogo no emite nada (el formulario no se
 * marca como sucio).
 */
describe('Richtext.svelte — enlace e imagen de la barra', () => {
	const REL = 'noopener noreferrer nofollow';

	function textField(name: string) {
		return { ...richtextField.schema, name, type: 'text', subtype: 'plain' };
	}

	const pageType = {
		name: 'paginas',
		label: 'Páginas',
		labelSingular: 'Página',
		titleField: 'title',
		schema: { name: 'paginas', fields: [textField('title'), textField('ruta')] },
		page: { pathField: 'ruta', pathFieldUnique: true, layoutField: null, localizedPath: null }
	};

	const pages = {
		items: [{ id: 'p1', type: 'paginas', values: { title: 'Sobre mí', ruta: '/sobre-mi' } }],
		page: 1,
		perPage: 20,
		totalItems: 1,
		totalPages: 1
	};

	interface Harness {
		target: HTMLElement;
		onChange: ReturnType<typeof vi.fn>;
		pickerOpen: ReturnType<typeof vi.fn>;
		editor: Editor;
		lastHtml: () => string;
		unmount: () => Promise<void>;
	}

	let harness: Harness | null = null;

	// jsdom no implementa la geometría de `Range`, y ProseMirror la pide al desplazar la vista hasta
	// la selección tras un comando (`scrollIntoView`). Sin layout no hay nada que medir: basta con
	// que las dos llamadas existan y devuelvan una caja vacía.
	beforeAll(() => {
		const emptyRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
		Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
		Range.prototype.getBoundingClientRect = () => emptyRect as DOMRect;
	});

	async function mountWithToolbar(
		value: string,
		picked: { alt: string } | null = null
	): Promise<Harness> {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const onChange = vi.fn();
		const pickerOpen = vi.fn(async () =>
			picked
				? [
						{
							file: new File(['x'], 'portada_ab12.png', { type: 'image/png' }),
							mediaId: 'm1',
							alt: picked.alt,
							missingAlt: picked.alt === ''
						}
					]
				: null
		);
		const ctx = {
			...fakeCtx(),
			model: { types: [pageType] },
			port: {
				list: vi.fn(async () => pages),
				fileUrl: (record: { type: string; id: string }, _field: string, file: string) =>
					`https://cms.ejemplo.com/api/files/${record.type}/${record.id}/${file}`
			},
			mediaPicker: { open: pickerOpen }
		} as unknown as VegaAppContext;
		const instance = mount(Richtext, {
			target,
			props: {
				field: richtextField,
				value,
				error: null,
				disabled: false,
				readonly: false,
				onChange
			},
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		await settle(target);
		// TipTap deja su instancia en el nodo editable (`view.dom.editor`): es la única forma de
		// colocar la selección desde un test sin simular el ratón.
		const editor = (target.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
		harness = {
			target,
			onChange,
			pickerOpen,
			editor,
			lastHtml: () => String(onChange.mock.calls.at(-1)?.[0] ?? ''),
			unmount: async () => {
				await unmount(instance);
				target.remove();
			}
		};
		return harness;
	}

	function toolbarButton(target: HTMLElement, label: string): HTMLButtonElement {
		return target.querySelector<HTMLButtonElement>(
			`.vega-editor-toolbar button[aria-label="${label}"]`
		)!;
	}

	function dialog(target: HTMLElement): HTMLElement | null {
		return target.querySelector<HTMLElement>('[role="dialog"]');
	}

	function dialogButton(target: HTMLElement, text: string): HTMLButtonElement {
		return Array.from(dialog(target)!.querySelectorAll('button')).find(
			(button) => button.textContent?.trim() === text
		)!;
	}

	async function flush(): Promise<void> {
		for (let i = 0; i < 10; i++) await Promise.resolve();
		await tick();
		await new Promise((r) => setTimeout(r, 30));
	}

	async function openLinkDialog(target: HTMLElement): Promise<void> {
		toolbarButton(target, 'form.editor.link').click();
		await flush();
		expect(dialog(target)).not.toBeNull();
	}

	async function submitDialog(target: HTMLElement): Promise<void> {
		dialog(target)!
			.querySelector('form')!
			.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await flush();
	}

	async function applyExternal(target: HTMLElement, url: string): Promise<void> {
		const radio = dialog(target)!.querySelector<HTMLInputElement>('input[value="external"]')!;
		radio.checked = true;
		radio.dispatchEvent(new Event('change', { bubbles: true }));
		await tick();
		const input = dialog(target)!.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
		input.value = url;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		await submitDialog(target);
	}

	afterEach(async () => {
		await harness?.unmount();
		harness = null;
	});

	test('abrir el diálogo de enlace y cancelar NO llama a onChange', async () => {
		const { target, onChange, editor } = await mountWithToolbar('<p>Hola mundo</p>');
		editor.commands.setTextSelection({ from: 1, to: 5 });

		await openLinkDialog(target);
		dialogButton(target, 'common.cancel').click();
		await flush();

		expect(dialog(target)).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});

	test('Escape cierra el diálogo de enlace sin llamar a onChange', async () => {
		const { target, onChange } = await mountWithToolbar('<p>Hola mundo</p>');

		await openLinkDialog(target);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await flush();

		expect(dialog(target)).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});

	test('página del sitio sobre una selección: el href es la RUTA y no lleva target ni rel', async () => {
		const { target, editor, lastHtml } = await mountWithToolbar('<p>Hola mundo</p>');
		editor.commands.setTextSelection({ from: 1, to: 5 });

		await openLinkDialog(target);
		dialog(target)!.querySelector<HTMLButtonElement>('.vega-rt-link-page')!.click();
		await tick();
		await submitDialog(target);

		expect(lastHtml()).toBe('<p><a href="/sobre-mi">Hola</a> mundo</p>');
	});

	test('página del sitio sin selección: inserta el título de la página ya enlazado', async () => {
		const { target, editor, lastHtml } = await mountWithToolbar('<p>Hola: </p>');
		editor.commands.setTextSelection(6);

		await openLinkDialog(target);
		dialog(target)!.querySelector<HTMLButtonElement>('.vega-rt-link-page')!.click();
		await tick();
		await submitDialog(target);

		expect(lastHtml()).toBe('<p>Hola:<a href="/sobre-mi">Sobre mí</a></p>');
	});

	test('dirección externa: lleva el target y el rel que pone la extensión Link', async () => {
		const { target, editor, lastHtml } = await mountWithToolbar('<p>Hola mundo</p>');
		editor.commands.setTextSelection({ from: 1, to: 5 });

		await openLinkDialog(target);
		await applyExternal(target, 'https://fodaveg.net');

		expect(lastHtml()).toBe(
			`<p><a target="_blank" rel="${REL}" href="https://fodaveg.net">Hola</a> mundo</p>`
		);
	});

	test('dirección externa sin selección: inserta la propia dirección como texto', async () => {
		const { target, editor, lastHtml } = await mountWithToolbar('<p>Hola: </p>');
		editor.commands.setTextSelection(6);

		await openLinkDialog(target);
		await applyExternal(target, 'mailto:hola@fodaveg.net');

		expect(lastHtml()).toBe(
			`<p>Hola:<a target="_blank" rel="${REL}" href="mailto:hola@fodaveg.net">mailto:hola@fodaveg.net</a></p>`
		);
	});

	test('javascript: no se aplica: el diálogo sigue abierto y onChange no se llama', async () => {
		const { target, editor, onChange } = await mountWithToolbar('<p>Hola mundo</p>');
		editor.commands.setTextSelection({ from: 1, to: 5 });

		await openLinkDialog(target);
		await applyExternal(target, 'javascript:alert(1)');

		expect(dialog(target)).not.toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});

	test('sobre un enlace existente: se abre con su valor y «Quitar enlace» lo quita entero', async () => {
		const { target, editor, lastHtml } = await mountWithToolbar(
			'<p>Mira <a href="https://fodaveg.net/x">este enlace</a> de aquí</p>'
		);
		editor.commands.setTextSelection(8);

		await openLinkDialog(target);
		expect(dialog(target)!.querySelector<HTMLInputElement>('input[inputmode="url"]')!.value).toBe(
			'https://fodaveg.net/x'
		);
		dialogButton(target, 'form.editor.linkRemove').click();
		await flush();

		expect(dialog(target)).toBeNull();
		expect(lastHtml()).toBe('<p>Mira este enlace de aquí</p>');
	});

	test('un enlace interno guardado con target="_blank" no marca cambio al cargar', async () => {
		const { onChange } = await mountWithToolbar(
			`<p><a href="/sobre-mi" target="_blank" rel="${REL}">Sobre mí</a></p>`
		);
		await flush();

		expect(onChange).not.toHaveBeenCalled();
	});

	/**
	 * Regresión vista en el navegador al abrir la biblioteca desde la barra con el cursor en el
	 * editor: el selector de medios enfoca su buscador dentro de un `$effect`, el editor pierde el
	 * foco, TipTap emite `transaction` en ese mismo instante y la barra incrementaba su contador de
	 * repintado LEYÉNDOLO dentro del efecto ajeno. Ese efecto pasaba a depender de lo que acababa de
	 * escribir y se repetía hasta `effect_update_depth_exceeded`, con el selector en «Cargando…».
	 */
	test('una transacción emitida dentro del $effect de otro componente no lo hace repetirse', async () => {
		const { editor } = await mountWithToolbar('<p>Hola</p>');
		let runs = 0;

		const stop = $effect.root(() => {
			$effect(() => {
				runs += 1;
				editor.view.dispatch(editor.state.tr.setMeta('blur', true));
			});
		});
		await flush();
		stop();

		expect(runs).toBe(1);
	});

	/**
	 * El selector de estilo salía EN BLANCO con el cursor en un título: `headingValue` es una cadena
	 * (`'2'`) y las opciones llevaban `value={level}` numérico, que Svelte compara de forma estricta
	 * al asentar el valor de un `<select>`. Ninguna casaba y quedaba `selectedIndex -1`.
	 */
	test('con el cursor en un título, el selector de estilo marca ese nivel', async () => {
		const { target, editor } = await mountWithToolbar('<h2>Un título</h2><p>Y un párrafo</p>');
		const select = target.querySelector<HTMLSelectElement>('.vega-editor-toolbar-select')!;

		editor.commands.setTextSelection(2);
		await flush();
		expect(select.value).toBe('2');
		expect(select.selectedIndex).toBe(2);

		editor.commands.setTextSelection(14);
		await flush();
		expect(select.value).toBe('paragraph');
	});

	test('imagen con alt en la biblioteca: se inserta con la URL del fichero y ese alt', async () => {
		const { target, pickerOpen, lastHtml } = await mountWithToolbar('<p>Hola</p>', {
			alt: 'Una portada'
		});

		toolbarButton(target, 'form.editor.image').click();
		await flush();

		// Solo imágenes, y con su propio aviso: aquí no se copia el fichero, se enlaza por su URL.
		expect(pickerOpen).toHaveBeenCalledWith({
			multiple: false,
			accept: ['image/*'],
			notice: 'form.editor.imageDialog.libraryNotice'
		});
		expect(dialog(target)).toBeNull();
		expect(lastHtml()).toContain(
			'<img src="https://cms.ejemplo.com/api/files/vega_media/m1/portada_ab12.png" alt="Una portada">'
		);
	});

	test('imagen sin alt: lo pide antes de insertar y usa lo que se escriba', async () => {
		const { target, onChange, lastHtml } = await mountWithToolbar('<p>Hola</p>', { alt: '' });

		toolbarButton(target, 'form.editor.image').click();
		await flush();
		expect(dialog(target)).not.toBeNull();
		expect(onChange).not.toHaveBeenCalled();

		const input = dialog(target)!.querySelector<HTMLInputElement>('input[type="text"]')!;
		input.value = 'Un gato en un tejado';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		await submitDialog(target);

		expect(dialog(target)).toBeNull();
		expect(lastHtml()).toContain(
			'<img src="https://cms.ejemplo.com/api/files/vega_media/m1/portada_ab12.png" alt="Un gato en un tejado">'
		);
	});

	test('imagen sin alt, dejada vacía: se inserta como decorativa (alt="")', async () => {
		const { target, lastHtml } = await mountWithToolbar('<p>Hola</p>', { alt: '' });

		toolbarButton(target, 'form.editor.image').click();
		await flush();
		await submitDialog(target);

		expect(lastHtml()).toContain(
			'<img src="https://cms.ejemplo.com/api/files/vega_media/m1/portada_ab12.png" alt="">'
		);
	});

	test('cancelar el selector de medios o el diálogo del alt NO llama a onChange', async () => {
		const cancelled = await mountWithToolbar('<p>Hola</p>');
		toolbarButton(cancelled.target, 'form.editor.image').click();
		await flush();
		expect(cancelled.pickerOpen).toHaveBeenCalledTimes(1);
		expect(cancelled.onChange).not.toHaveBeenCalled();
		await cancelled.unmount();

		const { target, onChange } = await mountWithToolbar('<p>Hola</p>', { alt: '' });
		toolbarButton(target, 'form.editor.image').click();
		await flush();
		dialogButton(target, 'common.cancel').click();
		await flush();

		expect(dialog(target)).toBeNull();
		expect(onChange).not.toHaveBeenCalled();
	});
});
