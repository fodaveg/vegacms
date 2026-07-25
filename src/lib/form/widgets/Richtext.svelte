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
	 * `role="status"` del PLACEHOLDER (bug de producto real, no solo flake de test): el `<div>` de
	 * más arriba, antes de montar, anunciaba `role="textbox"` PERO no era `contenteditable` ni
	 * focusable — un clic real (o de Playwright) sobre él no hacía nada visible, y si el usuario
	 * empezaba a teclear justo después (el `import()` dinámico de más arriba tarda), las teclas no
	 * iban a ningún sitio: el foco anterior ya se había perdido con el clic y el placeholder no
	 * puede recibirlo. Resultado: PÉRDIDA SILENCIOSA de lo tecleado, sin ningún aviso — reproducido
	 * en `e2e/form.spec.ts` ("escribir en richtext") con un accessibility snapshot: el editor
	 * terminaba montado y VACÍO, con "Negrita" ya activo (marca para el próximo carácter) pero sin
	 * una sola letra visible. `role="status"` + `aria-busy="true"` deja de anunciar un campo YA
	 * usable donde no lo hay: un lector de pantalla oye "cargando", no "campo de texto vacío", y
	 * `getByRole('textbox', {name})` de Playwright (y cualquier código real que dependa del mismo
	 * criterio de accesibilidad) simplemente NO encuentra nada hasta que el `<div>` REAL de TipTap
	 * exista — forzando una ESPERA correcta en vez de actuar sobre un decorado inerte. Probado
	 * "rompiendo el arreglo a propósito" (`git stash` de este cambio): el fallo vuelve de forma
	 * reproducible con `--repeat-each=30`.
	 *
	 * …y la MITAD VISIBLE del mismo bug: quitar la mentira de ARIA no arreglaba nada para quien usa
	 * el ratón y ve. El contenedor vacío se sigue pareciendo a un campo de texto listo (caja con
	 * borde y radio), así que clicar y teclear ahí perdía las pulsaciones igual, en silencio. Por eso
	 * el `role="status"` se pinta ahora con TEXTO ("Cargando el editor…", `form.richtext.loading`) en
	 * un nodo propio: la única pista que había antes era la barra de herramientas deshabilitada
	 * encima, que nadie lee como "espera". La barra ya llevaba `disabled={inert}`; esto completa el
	 * eje de "feedback del sistema" para el caso en el que el widget todavía no existe.
	 *
	 * **Mockup final `aquelarre-detalle-post.html` (`.richtext`)**: el marco (borde, radio, fondo,
	 * anillo de foco) pasa al CONTENEDOR y el área editable se queda solo con su padding — antes el
	 * borde lo pintaban por separado la barra y el `<div>` de contenido, y el radio inferior había
	 * que escribirlo a mano (`0 0 6px 6px`). Con una sola caja + `overflow: hidden`, barra y cuerpo
	 * comparten esquinas sin que ninguno de los dos sepa nada del otro. Solo CSS: ni el editor, ni
	 * el saneado, ni la a11y de más arriba cambian una línea.
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
	{#if !editor}
		<!-- El aviso de carga VISIBLE (ver cabecera): el `role="status"` vive aquí y no en el
		     contenedor de abajo por dos razones. Una, un `role="status"` VACÍO no anuncia nada — hace
		     falta texto para que un lector de pantalla diga "cargando" en vez de callarse. Y dos,
		     este nodo es de Svelte en exclusiva: el contenedor es el que TipTap manipula al montar, y
		     no conviene meterle hijos que otro dueño va a tocar. -->
		<p class="vega-widget-richtext-loading" role="status" aria-busy="true">
			{ctx.t('form.richtext.loading')}
		</p>
	{/if}
	<div
		class="vega-widget-richtext-content"
		bind:this={container}
		data-loading={editor ? undefined : 'true'}
		id={ids.inputId}
		aria-labelledby={ids.labelId}
		aria-describedby={describedBy}
		aria-invalid={error ? 'true' : undefined}
	></div>
</div>

<style>
	/* Contenedor del editor (mockup final `.richtext`): UNA sola caja con borde y radio que envuelve
	   barra + área editable; el `overflow: hidden` es lo que recorta las esquinas de la barra
	   (`--paper`) contra ese radio. El anillo de foco sube AL CONTENEDOR (mockup
	   `.richtext:focus-within`): el `<div contenteditable>` de TipTap no es un `<input>`, así que el
	   `:focus-visible` global de `theme/base.css` nunca lo alcanza. */
	.vega-widget-richtext {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		overflow: hidden;
	}

	.vega-widget-richtext:focus-within {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.vega-widget-richtext[data-invalid='true'] {
		border-color: var(--danger);
	}

	/* Área editable (mockup `.rt-body`): `max-width: 68ch` es medida de LECTURA, no de caja — un
	   párrafo de 200 caracteres por línea no hay quien lo edite. */
	.vega-widget-richtext-content {
		padding: calc(var(--pad-field) * 0.9) calc(var(--pad-field) * 1.1);
		min-height: 200px;
		max-width: 68ch;
		color: var(--ink);
	}

	/* Mientras carga, el hueco lo ocupa el aviso de abajo y NO los dos a la vez: el contenedor se
	   colapsa (queda solo como anclaje para el `<div>` de TipTap) y el aviso hereda su padding y su
	   `min-height`, así que la caja mide LO MISMO antes y después de montar — sin salto de layout
	   justo debajo del cursor de quien está a punto de escribir. */
	.vega-widget-richtext-content[data-loading='true'] {
		min-height: 0;
		padding: 0;
	}

	.vega-widget-richtext-loading {
		margin: 0;
		padding: calc(var(--pad-field) * 0.9) calc(var(--pad-field) * 1.1);
		min-height: 200px;
		color: var(--ink-2);
	}

	.vega-widget-richtext-content :global(.tiptap) {
		outline: none;
	}

	.vega-widget-richtext-content :global(.tiptap > * + *) {
		margin-top: 0.6em;
	}

	.vega-widget-richtext-content :global(h2) {
		font-size: 1.15em;
		color: var(--ink-hi);
	}

	/* Enlace del cuerpo (mockup `.rt-body a`): acento como TEXTO (`--accent-text`, el token con
	   contraste AA sobre papel), nunca `--accent` a secas. */
	.vega-widget-richtext-content :global(a) {
		color: var(--accent-text);
		text-underline-offset: 2px;
	}

	/* Código en línea (mockup `.rt-body code`): mono sobre `--btn` con hairline — un VALOR
	   canónico, mismo criterio que ids y slugs. */
	.vega-widget-richtext-content :global(code) {
		font-family: var(--mono);
		font-size: 0.9em;
		background: var(--btn);
		border: 1px solid var(--line-soft);
		border-radius: 4px;
		padding: 0.05em 0.3em;
	}

	.vega-widget-richtext-content :global(pre) {
		padding: 0.6rem;
		border-radius: 4px;
		background: var(--surface-2);
		overflow-x: auto;
	}

	/* Dentro de un bloque de código el `code` NO lleva su propia cajita (la caja es el `pre`). */
	.vega-widget-richtext-content :global(pre code) {
		background: none;
		border: 0;
		padding: 0;
	}

	.vega-widget-richtext-content :global(blockquote) {
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--line);
		color: var(--ink-2);
	}
</style>
