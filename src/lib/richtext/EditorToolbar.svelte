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
	 * Enlace/imagen usan `window.prompt` (mismo criterio ya aceptado en el repo para diálogos
	 * síncronos simples, ver `RecordForm.svelte` con `window.confirm`): no hay presupuesto en
	 * F5-d para un modal propio, y un prompt nativo no bloquea nada más allá de sí mismo.
	 *
	 * **Mockup final `aquelarre-detalle-post.html` (`.rt-toolbar`)**: la barra deja de tener caja
	 * propia (borde + radio superior) y pasa a ser una franja `--paper` separada del cuerpo por una
	 * hairline `--line-soft` — el marco entero lo pone ahora el contenedor del widget
	 * (`Richtext.svelte`), que las recorta a las dos con un solo `overflow: hidden`. Los botones
	 * pierden el borde y ganan el par hover/`aria-pressed` del mockup (`--active` / `--accent-soft`).
	 * Solo CSS: ni un comando, ni un `aria-*`, ni la señal de repintado cambian.
	 */
	import type { Editor } from '@tiptap/core';

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
		const bump = (): void => {
			tick++;
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

	function toggleLink(): void {
		run((ed) => {
			if (ed.isActive('link')) {
				ed.chain().focus().unsetLink().run();
				return;
			}
			const url = window.prompt(t('form.editor.linkPrompt'));
			if (!url) return;
			ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
		});
	}

	function insertImage(): void {
		run((ed) => {
			const src = window.prompt(t('form.editor.imagePrompt'));
			if (!src) return;
			const alt = window.prompt(t('form.editor.imageAltPrompt')) ?? '';
			ed.chain().focus().setImage({ src, alt }).run();
		});
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
			<option value={level}>{t('form.editor.heading', { level })}</option>
		{/each}
	</select>

	<button
		type="button"
		aria-pressed={isActive('bold')}
		aria-label={t('form.editor.bold')}
		disabled={disabled || !editor}
		title={t('form.editor.bold')}
		onclick={() => run((ed) => void ed.chain().focus().toggleBold().run())}
	>
		<strong>B</strong>
	</button>
	<button
		type="button"
		aria-pressed={isActive('italic')}
		aria-label={t('form.editor.italic')}
		disabled={disabled || !editor}
		title={t('form.editor.italic')}
		onclick={() => run((ed) => void ed.chain().focus().toggleItalic().run())}
	>
		<em>I</em>
	</button>
	<button
		type="button"
		aria-pressed={isActive('strike')}
		aria-label={t('form.editor.strike')}
		disabled={disabled || !editor}
		title={t('form.editor.strike')}
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
		aria-pressed={isActive('code')}
		aria-label={t('form.editor.code')}
		disabled={disabled || !editor}
		title={t('form.editor.code')}
		onclick={() => run((ed) => void ed.chain().focus().toggleCode().run())}
	>
		&lt;/&gt;
	</button>
	<button
		type="button"
		aria-pressed={isActive('codeBlock')}
		aria-label={t('form.editor.codeBlock')}
		disabled={disabled || !editor}
		title={t('form.editor.codeBlock')}
		onclick={() => run((ed) => void ed.chain().focus().toggleCodeBlock().run())}
	>
		{'{ }'}
	</button>
	<button
		type="button"
		aria-pressed={isActive('blockquote')}
		aria-label={t('form.editor.blockquote')}
		disabled={disabled || !editor}
		title={t('form.editor.blockquote')}
		onclick={() => run((ed) => void ed.chain().focus().toggleBlockquote().run())}
	>
		"
	</button>
	<span class="vega-editor-toolbar-sep" aria-hidden="true"></span>
	<button
		type="button"
		aria-pressed={isActive('bulletList')}
		aria-label={t('form.editor.bulletList')}
		disabled={disabled || !editor}
		title={t('form.editor.bulletList')}
		onclick={() => run((ed) => void ed.chain().focus().toggleBulletList().run())}
	>
		•—
	</button>
	<button
		type="button"
		aria-pressed={isActive('orderedList')}
		aria-label={t('form.editor.orderedList')}
		disabled={disabled || !editor}
		title={t('form.editor.orderedList')}
		onclick={() => run((ed) => void ed.chain().focus().toggleOrderedList().run())}
	>
		1.
	</button>
	<button
		type="button"
		aria-label={t('form.editor.horizontalRule')}
		disabled={disabled || !editor}
		title={t('form.editor.horizontalRule')}
		onclick={() => run((ed) => void ed.chain().focus().setHorizontalRule().run())}
	>
		―
	</button>
	<span class="vega-editor-toolbar-sep" aria-hidden="true"></span>
	<button
		type="button"
		aria-pressed={isActive('link')}
		aria-label={isActive('link') ? t('form.editor.linkRemove') : t('form.editor.link')}
		disabled={disabled || !editor}
		title={isActive('link') ? t('form.editor.linkRemove') : t('form.editor.link')}
		onclick={toggleLink}
	>
		🔗
	</button>
	<button
		type="button"
		aria-label={t('form.editor.image')}
		disabled={disabled || !editor}
		title={t('form.editor.image')}
		onclick={insertImage}
	>
		🖼
	</button>
</div>

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

	/* Botones cuadrados de 30px, sin borde (mockup `.rt-toolbar button`). `line-height` explícito:
	   el heredado no viaja a un componente Svelte y el glifo quedaría descentrado. */
	.vega-editor-toolbar button {
		min-width: 30px;
		height: 30px;
		padding: 0 0.45rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.9em;
		line-height: 30px;
		cursor: pointer;
	}

	.vega-editor-toolbar button:hover:not(:disabled) {
		background: var(--active);
		color: var(--ink-hi);
	}

	/* Activo = fondo tenue de marca + acento como texto (mockup `button[aria-pressed='true']`):
	   NUNCA el relleno `--accent` sólido, que es lenguaje de acción primaria (el botón "Guardar"). */
	.vega-editor-toolbar button[aria-pressed='true'] {
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

	.vega-editor-toolbar button:disabled,
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
</style>
