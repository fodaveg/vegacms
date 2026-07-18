<script lang="ts">
	/**
	 * Widget `richtext` (F5-d del contrato P5, `field.subtype==='html'`): editor TipTap sobre HTML,
	 * saneado con DOMPurify en DOS puntos (D-P5.6, defensa en profundidad) — al montar/resincronizar
	 * el HTML entrante en el editor, y de nuevo dentro de `onUpdate` justo antes de llamar a
	 * `onChange` (ese valor es lo que acaba viajando al backend al guardar). El editor (ProseMirror)
	 * es quien renderiza el documento ya parseado; este widget nunca pinta HTML crudo con `{@html}`.
	 *
	 * Carga diferida (landmine del contrato): TipTap+ProseMirror+DOMPurify pesan ~145 KB gzip —
	 * `@tiptap/core`, `$lib/richtext/editor` y `$lib/richtext/sanitize` se importan con `import()`
	 * DINÁMICO dentro de `onMount`, nunca top-level, para que ese chunk no entre en el bundle de
	 * rutas que no editan richtext (verificado con `pnpm build`, ver informe de entrega).
	 *
	 * Editor controlado (landmine de reconciliación): el contenido se asienta en el editor UNA vez
	 * al montar. Si `value` cambia desde FUERA (reset de baseline tras guardar, deep-link a otro
	 * registro que reutiliza esta instancia) se detecta comparando la versión SANEADA de `value`
	 * contra `lastEmitted` ("última emisión conocida", mismo patrón que `syncedModel` de
	 * `RecordForm.svelte`): si difiere, se resincroniza con `setContent` (`emitUpdate:false`, para
	 * no disparar `onUpdate`→`onChange` con lo que el propio padre acaba de asentar). Comparar
	 * contra la versión YA saneada (no la cruda) evita un resync espurio en cada render: el HTML
	 * de entrada y el que devuelve `sanitizeHtml` casi nunca son BYTE-iguales (DOMPurify normaliza
	 * comillas/orden de atributos) aunque sean equivalentes.
	 *
	 * Un widget readonly NUNCA llama a `onChange` (L-P5.2): además de que el editor queda
	 * no-editable (`editable:false`/`setEditable`), `onUpdate` comprueba `disabled||readonly` antes
	 * de propagar, por si algún evento programático se colara con el editor inerte.
	 *
	 * a11y durante la carga diferida (fix de code-review): `editorProps.attributes` solo pone
	 * `id`/`role`/`aria-*` en el `<div>` real que crea TipTap DESPUÉS de que resuelva el `import()`
	 * dinámico — mientras tanto, el `<label for={ids.inputId}>` de `FieldRow` apunta a un id que
	 * todavía no existe. `id`/`aria-labelledby`/`aria-describedby`/`aria-invalid` se fijan TAMBIÉN
	 * directamente en el `<div class="vega-widget-richtext-content">` del template (mismo patrón
	 * que `role="group"`+`aria-labelledby` de `Chips.svelte` para un control que no es nativamente
	 * labelable) — así la asociación existe desde el PRIMER render. `editorProps.attributes` (más
	 * abajo) YA NO fija `id` ahí (sería un id DUPLICADO: el `<div>` de TipTap se monta DENTRO del
	 * contenedor, no en su lugar). `role="textbox"` del contenedor es CONDICIONAL (`editor ?
	 * undefined : 'textbox'`): antes de montar comunica igualmente "esto será un campo de texto",
	 * pero una vez montado el `<div>` REAL de TipTap ya lleva su propio `role="textbox"` — dejar
	 * los DOS a la vez anida dos textbox con el mismo `aria-labelledby` (confuso para lectores de
	 * pantalla, y `getByRole('textbox', {name})` de Playwright lo resuelve de forma ambigua,
	 * detectado en `e2e/form.spec.ts`).
	 *
	 * LANDMINES encontradas en QA manual (no en el contrato, documentadas también inline):
	 * (1) `Editor#setEditable()` de TipTap dispara `onUpdate` SIEMPRE que se llama, incluso sin
	 * cambio real de estado — el `$effect` que lo invoca guarda el ÚLTIMO `inert` aplicado
	 * (`lastInert`) para no llamarlo de más. (2) Un doc "vacío" no serializa igual que el string
	 * vacío que se le pasó (`getHTML()` de un párrafo vacío da `<p></p>`, no `''`) — `onUpdate` usa
	 * `editor.isEmpty` para normalizar cualquier doc semánticamente vacío a `''` ANTES de comparar
	 * con `lastEmitted`, si no un ciclo disabled→enabled (p.ej. justo tras guardar) marcaría el
	 * campo como "dirty" sin que el usuario haya tecleado nada — se vio como un `beforeNavigate`
	 * pidiendo confirmación justo tras un guardado con éxito.
	 */
	import { onMount } from 'svelte';
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
	// `$state.raw` (no `$state`): un `Editor` de TipTap es una clase con montones de estado mutable
	// PROPIO (ProseMirror, vistas, plugins…). `$state` normal lo envolvería en un Proxy PROFUNDO,
	// que Svelte re-trackearía en cada mutación INTERNA del editor (cada tecla dispara docenas) —
	// eso disparó un bucle real (`effect_update_depth_exceeded`, visto en e2e) al reaccionar a sus
	// propias escrituras internas. `$state.raw` solo trackea la REASIGNACIÓN de la variable
	// (montar/destruir), que es todo lo que este componente necesita: la reactividad de CONTENIDO
	// va por el canal imperativo (`onUpdate`/`tick` de `EditorToolbar.svelte`), no por el propio
	// objeto `Editor`.
	let editor = $state.raw<Editor | null>(null);
	// Plana (no `$state`, mismo motivo que `syncedModel` de RecordForm.svelte): el propio
	// `onUpdate` la escribe, así que si fuera reactiva crearía un ciclo effect↔escritura propia.
	let lastEmitted = '';
	let sanitizeHtmlRef: ((html: string) => string) | null = null;
	// Último `inert` de verdad aplicado a `setEditable` (landmine (1) de la cabecera): evita
	// llamarlo de más cuando el `$effect` de abajo se re-ejecuta sin que `inert` haya cambiado.
	let lastInert: boolean | null = null;

	onMount(() => {
		let disposed = false;

		(async () => {
			const [{ Editor: EditorCtor }, { createExtensions }, { sanitizeHtml }] = await Promise.all([
				import('@tiptap/core'),
				import('$lib/richtext/editor'),
				import('$lib/richtext/sanitize')
			]);
			if (disposed) return;

			// ORDEN FRÁGIL (fix de code-review, blindaje para un refactor futuro): `sanitizeHtmlRef`
			// (plana) DEBE quedar asignada ANTES que `editor` (`$state.raw`, dispara el `$effect` de
			// resync más abajo en cuanto cambia). Si algún día esto se reestructura en un único
			// objeto/paso, mantén ese orden — o el `$effect` de resync podría ejecutarse con
			// `sanitizeHtmlRef` todavía `null` (su guard `if (!editor || !sanitizeHtmlRef) return`
			// lo cubre hoy, pero solo POR ese orden; no lo des por hecho al tocar este bloque).
			sanitizeHtmlRef = sanitizeHtml;
			const initialHtml = sanitizeHtml(typeof value === 'string' ? value : '');
			lastEmitted = initialHtml;
			lastInert = inert;

			editor = new EditorCtor({
				element: container,
				extensions: createExtensions(),
				content: initialHtml,
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
					// `ed.isEmpty` normaliza cualquier doc semánticamente vacío (p.ej. un único
					// párrafo sin texto) a `''` — ver landmine (2) de la cabecera: sin esto, un
					// `onUpdate` espurio (landmine (1)) podría propagar `<p></p>` como si fuera un
					// cambio real, marcando "dirty" un campo que el usuario nunca tocó.
					const html = ed.isEmpty ? '' : sanitizeHtml(ed.getHTML());
					// Guard adicional: solo propagar si el contenido CAMBIÓ de verdad respecto a lo
					// último emitido — L-P5.2 exige que solo se propaguen cambios REALES.
					if (html === lastEmitted) return;
					lastEmitted = html;
					onChange(html);
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
		if (!editor || !sanitizeHtmlRef) return;
		const sanitized = sanitizeHtmlRef(typeof value === 'string' ? value : '');
		if (sanitized === lastEmitted) return;
		lastEmitted = sanitized;
		editor.commands.setContent(sanitized, { emitUpdate: false });
	});

	// disabled/readonly son reactivos sin recrear el editor (ver landmine (1) de la cabecera).
	$effect(() => {
		if (!editor || inert === lastInert) return;
		lastInert = inert;
		editor.setEditable(!inert);
	});

	// `error`/`help` pueden cambiar después de montar el editor (p.ej. tras un intento de guardar).
	$effect(() => {
		if (!editor) return;
		const dom = editor.view.dom;
		if (error) dom.setAttribute('aria-invalid', 'true');
		else dom.removeAttribute('aria-invalid');
		if (describedBy) dom.setAttribute('aria-describedby', describedBy);
		else dom.removeAttribute('aria-describedby');
	});
</script>

<div class="vega-widget-richtext" data-invalid={error ? 'true' : undefined}>
	<EditorToolbar {editor} disabled={inert} t={ctx.t} />
	<div
		class="vega-widget-richtext-content"
		bind:this={container}
		id={ids.inputId}
		role={editor ? undefined : 'textbox'}
		aria-labelledby={ids.labelId}
		aria-describedby={describedBy}
		aria-invalid={error ? 'true' : undefined}
	></div>
</div>

<style>
	.vega-widget-richtext-content {
		min-height: 8rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--vega-color-border);
		border-radius: 0 0 6px 6px;
		background: var(--vega-color-bg);
		color: var(--vega-color-text);
	}

	.vega-widget-richtext[data-invalid='true'] .vega-widget-richtext-content {
		border-color: var(--vega-color-danger);
	}

	.vega-widget-richtext-content :global(.tiptap) {
		outline: none;
	}

	.vega-widget-richtext-content :global(.tiptap > * + *) {
		margin-top: 0.6em;
	}

	.vega-widget-richtext-content :global(pre) {
		padding: 0.6rem;
		border-radius: 4px;
		background: var(--vega-color-bg-raised);
		overflow-x: auto;
	}

	.vega-widget-richtext-content :global(blockquote) {
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--vega-color-border);
		color: var(--vega-color-text-muted);
	}
</style>
