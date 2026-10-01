<script lang="ts">
	/**
	 * `EditorToolbar.svelte` (F5-d del contrato P5): la barra de formato COMPARTIDA por
	 * `Richtext.svelte` y `Markdown.svelte` — ambos editan sobre las mismas extensiones
	 * (`editor.ts`), así que los mismos botones sirven para los dos (D-P5.7: negrita/cursiva/
	 * tachado/código, encabezados h1-h4, cita, listas, línea horizontal, enlace, imagen).
	 *
	 * NO posee el `Editor`: lo recibe por prop (el widget lo crea/destruye en `onMount`, ver su
	 * cabecera) y solo LEE su estado (`isActive`) e invoca comandos (`chain().focus()...run()`).
	 * TipTap no es reactivo a la manera de Svelte (muta su propio estado interno, invisible a
	 * `$state`) — de ahí `tick`, un contador que se incrementa en cada `transaction`/
	 * `selectionUpdate` del editor SOLO para forzar que Svelte vuelva a leer `editor.isActive(...)`
	 * (patrón "señal de repintado", sin guardar el estado real en ningún sitio más que el editor).
	 *
	 * **Enlace e imagen** (antes dos `window.prompt`): el enlace abre `RichtextLinkDialog.svelte`
	 * (página del sitio, por su RUTA, o dirección externa), también sobre un enlace que ya existe,
	 * donde ofrece «Quitar enlace». La imagen abre el selector de medios del shell
	 * (`ctx.mediaPicker`, solo imágenes) y escribe en el `src` la URL pública del fichero
	 * (`richtext-image.ts`); si el medio no trae texto alternativo, `RichtextImageDialog.svelte` lo
	 * pide antes de insertar. Sin `ctx.mediaPicker` (un montaje fuera del shell) el botón de imagen
	 * no se pinta, mismo criterio que «Elegir de la biblioteca» en `FileInput.svelte`.
	 *
	 * Abrir y cerrar cualquiera de los dos sin aplicar NO toca el documento: los diálogos no reciben
	 * el editor, devuelven un resultado, y los comandos se ejecutan solo al aplicar. Al cerrar, el
	 * foco vuelve al editor, con la selección que tenía (ProseMirror la guarda en su estado aunque
	 * el `<div>` pierda el foco).
	 *
	 * **Mockup final `aquelarre-detalle-post.html` (`.rt-toolbar`)**: la barra deja de tener caja
	 * propia (borde + radio superior) y pasa a ser una franja `--paper` separada del cuerpo por una
	 * hairline `--line-soft` — el marco entero lo pone ahora el contenedor del widget
	 * (`Richtext.svelte`), que las recorta a las dos con un solo `overflow: hidden`. Los botones
	 * pierden el borde y ganan el par hover/`aria-pressed` del mockup (`--active` / `--accent-soft`).
	 * Solo CSS: ni un comando, ni un `aria-*`, ni la señal de repintado cambian.
	 */
	import { tick as flushed, untrack } from 'svelte';
	import type { Editor } from '@tiptap/core';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import Icon from '$lib/icons/Icon.svelte';
	import RichtextLinkDialog from '$lib/form/widgets/RichtextLinkDialog.svelte';
	import RichtextImageDialog from '$lib/form/widgets/RichtextImageDialog.svelte';
	import { richtextImageFromPick } from '$lib/form/widgets/richtext-image';

	interface Props {
		editor: Editor | null;
		/** `disabled || readonly` del widget: deshabilita TODOS los botones a la vez. */
		disabled: boolean;
		t: (key: string, params?: Record<string, string | number>) => string;
	}

	let { editor, disabled, t }: Props = $props();

	// Ver cabecera: contador de "repintar", no de datos — nunca se lee por su valor, solo por su
	// cambio (`void tick` dentro de `isActive`/`headingValue`).
	let tick = $state(0);

	$effect(() => {
		if (!editor) return;
		// `untrack` en la LECTURA: TipTap emite `transaction` de forma síncrona también cuando el
		// editor pierde el foco, y eso puede pasar DENTRO del `$effect` de otro componente (el
		// selector de medios enfoca su buscador al abrirse). Un `tick++` a secas lee y escribe `tick`
		// dentro de ese efecto ajeno, que pasa a depender de lo que él mismo acaba de escribir:
		// `effect_update_depth_exceeded`, y el selector se queda en «Cargando…». Visto al abrir la
		// biblioteca desde la barra con el cursor en el editor.
		const bump = (): void => {
			tick = untrack(() => tick) + 1;
		};
		editor.on('transaction', bump);
		editor.on('selectionUpdate', bump);
		return () => {
			editor.off('transaction', bump);
			editor.off('selectionUpdate', bump);
		};
	});

	function isActive(name: string, attrs?: Record<string, unknown>): boolean {
		void tick;
		return editor?.isActive(name, attrs) ?? false;
	}

	const HEADING_LEVELS = [1, 2, 3, 4] as const;

	const headingValue = $derived.by((): string => {
		void tick;
		if (!editor) return 'paragraph';
		const active = HEADING_LEVELS.find((level) => editor.isActive('heading', { level }));
		return active !== undefined ? String(active) : 'paragraph';
	});

	function run(fn: (editor: Editor) => void): void {
		if (!editor || disabled) return;
		fn(editor);
	}

	function handleHeadingChange(event: Event): void {
		const raw = (event.currentTarget as HTMLSelectElement).value;
		run((ed) => {
			if (raw === 'paragraph') {
				ed.chain().focus().setParagraph().run();
			} else {
				ed.chain()
					.focus()
					.toggleHeading({ level: Number(raw) as 1 | 2 | 3 | 4 })
					.run();
			}
		});
	}

	const ctx = getVegaContext();

	// Diálogos de enlace e imagen (ver cabecera): `null` = cerrado. Guardan solo lo que el diálogo
	// necesita para pintarse, nunca el editor.
	let linkDialog = $state<{ currentHref: string | null } | null>(null);
	let imageDialog = $state<{ src: string; fileName: string } | null>(null);

	/** Cierra lo que haya abierto y devuelve el foco al editor. Tras `flushed()`: el diálogo ya se
	 *  ha desmontado y ha devuelto el foco a quien lo tenía (que puede ser el botón de la barra si
	 *  se abrió con el teclado); el editor lo toma después. `focus()` no cambia el documento, así
	 *  que no dispara `onUpdate`. */
	async function closeDialogs(): Promise<void> {
		linkDialog = null;
		imageDialog = null;
		await flushed();
		editor?.commands.focus();
	}

	function openLinkDialog(): void {
		run((ed) => {
			const href = ed.isActive('link') ? ed.getAttributes('link').href : null;
			linkDialog = { currentHref: typeof href === 'string' ? href : null };
		});
	}

	/**
	 * Aplica el enlace elegido. Sobre un enlace existente o con texto seleccionado, enlaza eso; con
	 * el cursor suelto, inserta `text` (el título de la página o la propia dirección) ya enlazado.
	 * El `target`/`rel` los pone la extensión `Link`; a las rutas del sitio se los quita el widget
	 * al serializar (`stripNewTabFromInternalLinks`).
	 */
	function applyLink(link: { href: string; text: string }): void {
		run((ed) => {
			if (ed.isActive('link') || !ed.state.selection.empty) {
				ed.chain().focus().extendMarkRange('link').setLink({ href: link.href }).run();
			} else {
				ed.chain()
					.focus()
					.insertContent({
						type: 'text',
						text: link.text,
						marks: [{ type: 'link', attrs: { href: link.href } }]
					})
					.run();
			}
		});
		void closeDialogs();
	}

	function removeLink(): void {
		run((ed) => void ed.chain().focus().extendMarkRange('link').unsetLink().run());
		void closeDialogs();
	}

	function placeImage(src: string, alt: string): void {
		run((ed) => void ed.chain().focus().setImage({ src, alt }).run());
		void closeDialogs();
	}

	/** Abre el selector de medios y, con lo elegido, inserta la imagen o pide su texto alternativo. */
	async function insertImage(): Promise<void> {
		const picker = ctx.mediaPicker;
		if (!editor || disabled || !picker) return;
		// `notice`: el selector dice por defecto que se inserta una COPIA, que es lo que hace el
		// campo de fichero. Aquí se enlaza la imagen de la biblioteca por su URL.
		const picked = await picker.open({
			multiple: false,
			accept: ['image/*'],
			notice: t('form.editor.imageDialog.libraryNotice')
		});
		const first = picked?.[0];
		if (!first) {
			void closeDialogs();
			return;
		}
		let image;
		try {
			image = richtextImageFromPick(ctx.port, first);
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al insertar la imagen', err),
				{ action: 'richtext:image' }
			);
			void closeDialogs();
			return;
		}
		if (image.alt !== '') {
			placeImage(image.src, image.alt);
			return;
		}
		imageDialog = { src: image.src, fileName: image.fileName };
	}

	// FIX (debugging de flake e2e, `e2e/form.spec.ts` "escribir en richtext"): sin esto, clicar
	// CUALQUIER botón de esta barra le roba el foco al editor ANTES de que el `onclick` llegue a
	// ejecutarse — el navegador enfoca el `<button>` como acción POR DEFECTO de `mousedown`, y esa
	// pérdida de foco puede colapsar la selección de ProseMirror (llega un `selectionchange` async
	// que la reduce a un cursor) en la ventana entre `mousedown` y `click`. El resultado es una
	// carrera real: 2-3 de cada 8 veces, `toggleBold()`/etc. se ejecutaba sobre una selección YA
	// vacía y no envolvía nada — el usuario veía que "Negrita" no hacía nada, de forma intermitente.
	// `Markdown.svelte` ya blinda sus PROPIOS botones así por el mismo motivo (selección del
	// `<textarea>`); esta barra, COMPARTIDA con `Richtext.svelte`, se había quedado sin el mismo
	// blindaje. Solo en los `<button>` (nunca en el `<select>` de encabezados: prevenir su
	// `mousedown` le impediría abrir el desplegable/tomar foco, que sí necesita).
	function keepEditorFocus(event: MouseEvent): void {
		event.preventDefault();
	}
</script>

<div class="vega-editor-toolbar" role="toolbar" aria-label={t('form.editor.toolbarLabel')}>
	<select
		class="vega-editor-toolbar-select"
		aria-label={t('form.editor.headingLabel')}
		value={headingValue}
		disabled={disabled || !editor}
		onchange={handleHeadingChange}
	>
		<option value="paragraph">{t('form.editor.paragraph')}</option>
		{#each HEADING_LEVELS as level (level)}
			<!-- `String(level)`: `headingValue` es una cadena y Svelte compara el valor de las opciones
			     de forma estricta; con el número a secas ninguna casaba y el selector salía en blanco
			     con el cursor en un título. -->
			<option value={String(level)}>{t('form.editor.heading', { level })}</option>
		{/each}
	</select>

	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('bold')}
		aria-label={t('form.editor.bold')}
		disabled={disabled || !editor}
		title={t('form.editor.bold')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleBold().run())}
	>
		<strong>B</strong>
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('italic')}
		aria-label={t('form.editor.italic')}
		disabled={disabled || !editor}
		title={t('form.editor.italic')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleItalic().run())}
	>
		<em>I</em>
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('strike')}
		aria-label={t('form.editor.strike')}
		disabled={disabled || !editor}
		title={t('form.editor.strike')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleStrike().run())}
	>
		<s>S</s>
	</button>
	<!-- Separadores del mockup (`.rt-toolbar .sep`): agrupan marcas | bloques | listas | inserciones.
	     Decorativos (`aria-hidden`), nunca `role="separator"`: no separan valores, solo dan ritmo
	     visual dentro de la MISMA barra. -->
	<span class="vega-editor-toolbar-sep" aria-hidden="true"></span>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('code')}
		aria-label={t('form.editor.code')}
		disabled={disabled || !editor}
		title={t('form.editor.code')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleCode().run())}
	>
		&lt;/&gt;
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('codeBlock')}
		aria-label={t('form.editor.codeBlock')}
		disabled={disabled || !editor}
		title={t('form.editor.codeBlock')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleCodeBlock().run())}
	>
		{'{ }'}
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('blockquote')}
		aria-label={t('form.editor.blockquote')}
		disabled={disabled || !editor}
		title={t('form.editor.blockquote')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleBlockquote().run())}
	>
		"
	</button>
	<span class="vega-editor-toolbar-sep" aria-hidden="true"></span>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('bulletList')}
		aria-label={t('form.editor.bulletList')}
		disabled={disabled || !editor}
		title={t('form.editor.bulletList')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleBulletList().run())}
	>
		•—
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('orderedList')}
		aria-label={t('form.editor.orderedList')}
		disabled={disabled || !editor}
		title={t('form.editor.orderedList')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().toggleOrderedList().run())}
	>
		1.
	</button>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-label={t('form.editor.horizontalRule')}
		disabled={disabled || !editor}
		title={t('form.editor.horizontalRule')}
		onmousedown={keepEditorFocus}
		onclick={() => run((ed) => void ed.chain().focus().setHorizontalRule().run())}
	>
		―
	</button>
	<span class="vega-editor-toolbar-sep" aria-hidden="true"></span>
	<button
		type="button"
		class="vega-editor-toolbar-btn"
		aria-pressed={isActive('link')}
		aria-label={t('form.editor.link')}
		aria-haspopup="dialog"
		disabled={disabled || !editor}
		title={t('form.editor.link')}
		onmousedown={keepEditorFocus}
		onclick={openLinkDialog}
	>
		🔗
	</button>
	{#if ctx.mediaPicker}
		<button
			type="button"
			class="vega-editor-toolbar-btn"
			aria-label={t('form.editor.image')}
			aria-haspopup="dialog"
			disabled={disabled || !editor}
			title={t('form.editor.image')}
			onmousedown={keepEditorFocus}
			onclick={insertImage}
		>
			<Icon id="media" size={16} />
		</button>
	{/if}
</div>

{#if linkDialog}
	<RichtextLinkDialog
		currentHref={linkDialog.currentHref}
		onApply={applyLink}
		onRemove={removeLink}
		onClose={closeDialogs}
	/>
{/if}
{#if imageDialog}
	<RichtextImageDialog
		src={imageDialog.src}
		fileName={imageDialog.fileName}
		onInsert={(alt) => imageDialog && placeImage(imageDialog.src, alt)}
		onClose={closeDialogs}
	/>
{/if}

<style>
	/* Franja de la barra (mockup `.rt-toolbar`): sin caja propia — el borde y el radio los pone el
	   contenedor del widget (ver cabecera). `--paper` sobre el `--surface` del cuerpo editable: la
	   barra es "chrome", el cuerpo es el control. */
	.vega-editor-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		padding: 0.35rem;
		border-bottom: 1px solid var(--line-soft);
		background: var(--paper);
	}

	/* Botones cuadrados de 30px, sin borde (mockup `.rt-toolbar button`). Centrado con flex y no
	   con `line-height`: así un glifo de texto y un icono SVG caen en el mismo sitio, también cuando
	   el botón crece a 44 px con puntero basto. Selector de clase pura, que es lo que sabe leer
	   `scripts/check-touch-targets.mjs`. */
	.vega-editor-toolbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 30px;
		height: 30px;
		padding: 0 0.45rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.9em;
		line-height: 1;
		cursor: pointer;
	}

	.vega-editor-toolbar-btn:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink-hi);
	}

	/* Activo = fondo tenue de marca + acento como texto (mockup `button[aria-pressed='true']`):
	   NUNCA el relleno `--accent` sólido, que es lenguaje de acción primaria (el botón "Guardar"). */
	.vega-editor-toolbar-btn[aria-pressed='true'] {
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	/* Separador de 1px (mockup `.sep`), con aire arriba y abajo para que no toque los bordes. */
	.vega-editor-toolbar-sep {
		width: 1px;
		align-self: stretch;
		margin: 0.25rem 0.3rem;
		background: var(--line-soft);
	}

	.vega-editor-toolbar-btn:disabled,
	.vega-editor-toolbar-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* El selector de estilo de párrafo SÍ conserva caja (es un `<select>`: sin borde no se lee como
	   desplegable), en el mismo alto de 30px que los botones. */
	.vega-editor-toolbar-select {
		height: 30px;
		margin-right: 0.3rem;
		padding: 0 0.4rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.85em;
	}

	/* Objetivo táctil de 44 px con puntero basto (misma regla que `.vega-admin-btn` y el resto de la
	   app): con el dedo, los 30 px del mockup se quedan cortos. La barra ya parte en varias líneas
	   (`flex-wrap`), así que a 390 px crece hacia abajo, no hacia los lados. */
	@media (pointer: coarse) {
		.vega-editor-toolbar-btn {
			min-width: 44px;
			height: 44px;
		}

		.vega-editor-toolbar-select {
			height: 44px;
		}
	}
</style>
