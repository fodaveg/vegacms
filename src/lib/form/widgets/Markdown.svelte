<script lang="ts">
	/**
	 * Widget `markdown` (F5-d del contrato P5, `field.subtype==='markdown'` — override de manifiesto
	 * sobre un campo `type:'text', subtype:'plain'`, §4.3/L9): mismo editor TipTap que
	 * `Richtext.svelte`, pero el valor de dominio es MARKDOWN CRUDO (`string|null`), nunca HTML, y
	 * nunca se pinta con `{@html}` — no hay sanitizado aquí (D-P5.6/D-P5.8: "richtext seguro" es un
	 * problema específico de `richtext`, `markdown` no tiene esa superficie de XSS).
	 *
	 * D-P5.8 (round-trip byte-exacto en los casos comunes, ver `$lib/richtext/markdown.ts` y su
	 * test de regresión): el editor se inicializa desde el MD crudo con `contentType:'markdown'`
	 * (extensión `Markdown` de `@tiptap/markdown`, registrada por `createMarkdownExtensions()`) y
	 * solo re-serializa TipTap→MD cuando el usuario edita de verdad (`onUpdate`) — un campo no
	 * tocado nunca emite un `onChange` espurio al montar. **Limitaciones conocidas** (spike ya
	 * cerrado, documentadas en `markdown.ts`): HTML embebido con atributos y tablas no son
	 * byte-exactos; ninguna de las dos entra en el vocabulario v1.
	 *
	 * Carga diferida y reconciliación: mismo patrón que `Richtext.svelte` (ver su cabecera) —
	 * `import()` dinámico en `onMount`, comparación contra `lastEmitted` para no resetear el
	 * cursor en cada render, `setEditable` reactivo a `disabled||readonly`.
	 *
	 * Mismas LANDMINES que `Richtext.svelte` (ver su cabecera, encontradas en QA manual): (1)
	 * `setEditable()` dispara `onUpdate` SIEMPRE, cambie o no el estado real — `lastInert` evita
	 * llamarlo de más; (2) un doc vacío puede no serializar igual que el string vacío original —
	 * `onUpdate` usa `editor.isEmpty` para normalizar a `''` antes de comparar con `lastEmitted`,
	 * evitando marcar "dirty" un campo no tocado tras un ciclo disabled→enabled (p.ej. al guardar).
	 *
	 * a11y durante la carga diferida (fix de code-review, misma nota que `Richtext.svelte`):
	 * `id`/`aria-labelledby`/`aria-describedby`/`aria-invalid` se fijan TAMBIÉN directamente en el
	 * `<div class="vega-widget-markdown-content">` del template (no solo vía `editorProps`, que
	 * solo existe DESPUÉS de que resuelva el `import()` dinámico) — así el `<label for=
	 * {ids.inputId}>` de `FieldRow` siempre encuentra su id, desde el primer render.
	 * `editorProps.attributes` ya NO fija `id` (el `<div>` de TipTap se monta DENTRO del contenedor:
	 * un segundo `id` igual sería un duplicado inválido). `role="textbox"` del contenedor es
	 * CONDICIONAL (`editor ? undefined : 'textbox'`): una vez montado, el `<div>` REAL de TipTap ya
	 * lleva su propio `role="textbox"` — mantener los DOS anida dos textbox con el mismo
	 * `aria-labelledby` (confuso para lectores de pantalla y ambiguo para `getByRole` de Playwright,
	 * ver la misma nota en `Richtext.svelte`).
	 */
	import { onMount, untrack } from 'svelte';
	import type { Editor } from '@tiptap/core';
	import type { WidgetProps } from './types';
	import { fieldIds } from '../field-ids';
	import { getVegaContext } from '$lib/app-context';
	import EditorToolbar from '$lib/richtext/EditorToolbar.svelte';

	let { field, value, error, disabled, readonly, onChange }: WidgetProps = $props();

	const ctx = getVegaContext();
	const ids = $derived(fieldIds(field.name));
	const describedBy = $derived(
		[field.help ? ids.helpId : null, error ? ids.errorId : null]
			.filter((id): id is string => id !== null)
			.join(' ') || undefined
	);
	const inert = $derived(disabled || readonly);

	let container: HTMLDivElement;
	// `$state.raw` (ver la misma decisión, documentada en detalle, en `Richtext.svelte`): evita que
	// Svelte envuelva el `Editor` de TipTap en un Proxy profundo y reaccione a sus mutaciones
	// internas (causó un bucle real, `effect_update_depth_exceeded`).
	let editor = $state.raw<Editor | null>(null);
	// Plana (no `$state`), mismo motivo que en `Richtext.svelte`: la escribe el propio `onUpdate`.
	// Semilla con `untrack` (mismo patrón que `RecordForm.svelte`): solo nos interesa el valor
	// INICIAL de `value` aquí; el `$effect` de reconciliación de más abajo es quien la mantiene al
	// día a partir de ahí.
	let lastEmitted = untrack(() => (typeof value === 'string' ? value : ''));
	// Último `inert` de verdad aplicado a `setEditable` (landmine (1) de la cabecera): evita
	// llamarlo de más cuando el `$effect` de abajo se re-ejecuta sin que `inert` haya cambiado.
	let lastInert: boolean | null = null;

	onMount(() => {
		let disposed = false;

		(async () => {
			const [{ Editor: EditorCtor }, { createMarkdownExtensions }] = await Promise.all([
				import('@tiptap/core'),
				import('$lib/richtext/markdown')
			]);
			if (disposed) return;

			const initialMarkdown = typeof value === 'string' ? value : '';
			lastEmitted = initialMarkdown;
			lastInert = inert;

			editor = new EditorCtor({
				element: container,
				extensions: createMarkdownExtensions(),
				content: initialMarkdown,
				contentType: 'markdown',
				editable: !lastInert,
				editorProps: {
					// Sin `id` (ver cabecera): ya lo lleva el `<div>` contenedor del template, y este
					// nodo se monta DENTRO de él — un segundo `id` igual sería un duplicado inválido.
					attributes: {
						role: 'textbox',
						'aria-multiline': 'true',
						'aria-labelledby': ids.labelId
					}
				},
				onUpdate: ({ editor: ed }) => {
					if (disabled || readonly) return;
					// `ed.isEmpty` normaliza cualquier doc semánticamente vacío a `''` (landmine (2)
					// de la cabecera) antes de comparar/propagar.
					const markdown = ed.isEmpty ? '' : ed.getMarkdown();
					// Guard adicional: solo propagar si el contenido CAMBIÓ de verdad respecto a lo
					// último emitido — L-P5.2 exige que solo se propaguen cambios REALES.
					if (markdown === lastEmitted) return;
					lastEmitted = markdown;
					onChange(markdown);
				}
			});
		})();

		return () => {
			disposed = true;
			editor?.destroy();
			editor = null;
		};
	});

	// Resincroniza si `value` cambia desde FUERA del propio editor (ver cabecera).
	$effect(() => {
		if (!editor) return;
		const incoming = typeof value === 'string' ? value : '';
		if (incoming === lastEmitted) return;
		lastEmitted = incoming;
		editor.commands.setContent(incoming, { contentType: 'markdown', emitUpdate: false });
	});

	// disabled/readonly son reactivos sin recrear el editor (ver landmine de `lastInert` arriba).
	$effect(() => {
		if (!editor || inert === lastInert) return;
		lastInert = inert;
		editor.setEditable(!inert);
	});

	// `error`/`help` pueden cambiar después de montar el editor.
	$effect(() => {
		if (!editor) return;
		const dom = editor.view.dom;
		if (error) dom.setAttribute('aria-invalid', 'true');
		else dom.removeAttribute('aria-invalid');
		if (describedBy) dom.setAttribute('aria-describedby', describedBy);
		else dom.removeAttribute('aria-describedby');
	});
</script>

<div class="vega-widget-markdown" data-invalid={error ? 'true' : undefined}>
	<EditorToolbar {editor} disabled={inert} t={ctx.t} />
	<div
		class="vega-widget-markdown-content"
		bind:this={container}
		id={ids.inputId}
		role={editor ? undefined : 'textbox'}
		aria-labelledby={ids.labelId}
		aria-describedby={describedBy}
		aria-invalid={error ? 'true' : undefined}
	></div>
</div>

<style>
	.vega-widget-markdown-content {
		min-height: 8rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 0 0 6px 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
	}

	.vega-widget-markdown[data-invalid='true'] .vega-widget-markdown-content {
		border-color: var(--vega-color-danger);
	}

	.vega-widget-markdown-content :global(.tiptap) {
		outline: none;
	}

	.vega-widget-markdown-content :global(.tiptap > * + *) {
		margin-top: 0.6em;
	}

	.vega-widget-markdown-content :global(pre) {
		padding: 0.6rem;
		border-radius: 4px;
		background: var(--vega-color-bg-raised);
		overflow-x: auto;
	}

	.vega-widget-markdown-content :global(blockquote) {
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--vega-color-border);
		color: var(--vega-color-text-muted);
	}
</style>
