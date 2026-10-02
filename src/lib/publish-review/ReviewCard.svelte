<script lang="ts">
	/**
	 * `ReviewCard.svelte` (lote 13, lámina «Revisión antes de publicar», decisiones 1, 3 y 8): la
	 * tarjeta «Revisión» del formulario, la PRIMERA del aside de `RecordForm.svelte` — encima de los
	 * campos de SEO que señala la mitad de los avisos, y a la vista mientras se edita porque el aside
	 * es pegajoso. Junto al campo Estado queda solo una línea («La revisión tiene 7 avisos. Ver la
	 * revisión»), que es lo que cubre el móvil, donde el aside cae al final: «Ver la revisión» baja
	 * hasta aquí y pone el foco en la tarjeta (`focus()`, exportado).
	 *
	 * **Resumen en la cabecera, siempre con texto** (decisión 3): «7 avisos» (tono aviso), «Sin
	 * avisos» (éxito) o «Incompleta» (neutro: cero avisos pero algo sin comprobar o la carga
	 * fallida). La píldora es la de `.vega-editor-tag`. Mientras carga, en su lugar el texto
	 * «Comprobando…» de `.vega-used-in-loading`. El resumen lleva `aria-live="polite"`: por voz se
	 * anuncia el RESULTADO de una carga, no cada pulsación (los avisos de SEO cambian mientras se
	 * escribe, y anunciar cada tecla sería ruido).
	 *
	 * **Quién decide si hay tarjeta** (decisión 8): `RecordForm` la monta solo con `review.enabled`
	 * (`statusField` y alguna comprobación que aplique); Etiquetas y Redirecciones no publican nada.
	 *
	 * **Sin permiso de editar** (`canAct === false`, decisión 7): los avisos se ven, sin acciones y
	 * sin el pie «Ningún aviso impide publicar» (no puede publicar).
	 *
	 * La tarjeta CONTENEDORA se repinta aquí, no se hereda: `.vega-fsection`/`--aside` y su `h2`
	 * viven en los estilos de `RecordForm.svelte` y Svelte los acota a ese componente (mismo motivo
	 * y mismos valores que `SocialCardPreview.svelte`).
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { ReviewFinding } from './publish-review';
	import type { ReviewState } from './review-state.svelte';
	import ReviewGroups from './ReviewGroups.svelte';

	interface Props {
		review: ReviewState;
		/** `false` sin permiso de editar: los avisos salen sin acciones ni pie. */
		canAct: boolean;
		/** Ir al campo o al bloque de un aviso (`RecordForm` despliega y enfoca). */
		onGo: (finding: ReviewFinding) => void;
		/** «Describir la imagen…»: abrir la ficha de Medios encima del formulario. */
		onDescribe: (finding: ReviewFinding) => void;
	}

	let { review, canAct, onGo, onDescribe }: Props = $props();

	const ctx = getVegaContext();
	const uid = $props.id();

	let sectionEl = $state<HTMLElement | null>(null);

	const loading = $derived(review.phase === 'loading' || review.phase === 'idle');
	const count = $derived(review.result.findings.length);
	/** Cero avisos con algo sin comprobar (o la carga fallida): «Incompleta», nunca «Sin avisos». */
	const incomplete = $derived(
		count === 0 && (review.result.skipped.length > 0 || review.phase === 'error')
	);

	/** «Ver la revisión» (la línea bajo Estado): desplaza hasta aquí y pone el foco en la tarjeta. */
	export function focus(): void {
		if (!sectionEl) return;
		sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
		sectionEl.focus();
	}
</script>

<section
	class="vega-fsection vega-fsection--aside vega-review"
	aria-labelledby="{uid}-title"
	aria-busy={loading ? 'true' : undefined}
	tabindex="-1"
	bind:this={sectionEl}
	data-review-card
>
	<div class="vega-review-head">
		<h2 id="{uid}-title">{ctx.t('review.title')}</h2>
		<span class="vega-review-summary" aria-live="polite">
			{#if loading}
				<span class="vega-review-checking">{ctx.t('review.checking')}</span>
			{:else}
				<span
					class="vega-review-count"
					data-tone={count > 0 ? 'warn' : incomplete ? 'muted' : 'ok'}
				>
					{count > 0
						? ctx.t(count === 1 ? 'review.count.one' : 'review.count.many', { count })
						: incomplete
							? ctx.t('review.count.incomplete')
							: ctx.t('review.count.none')}
				</span>
			{/if}
		</span>
	</div>
	<ReviewGroups {review} surface="form" {canAct} {onGo} {onDescribe} />
	{#if canAct && count > 0}
		<p class="vega-review-note">{ctx.t('review.notBlocking')}</p>
	{/if}
</section>

<style>
	/* Mismos tokens y valores que `.vega-fsection`/`--aside`/`h2` de `RecordForm.svelte` (ver cabecera). */
	.vega-fsection {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}

	.vega-fsection--aside {
		padding: calc(var(--pad-card) * 0.75);
	}

	.vega-fsection h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* Destino de foco de «Ver la revisión»: el anillo de siempre, solo con foco de teclado/programa. */
	.vega-review:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	/* Cabecera: el rótulo de tarjeta a la izquierda y el resumen a la derecha, como `.vega-blocks-head`. */
	.vega-review-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 24px;
	}

	.vega-review-summary {
		display: inline-flex;
		flex-shrink: 0;
	}

	/* Resumen: la píldora de `.vega-editor-tag` con sus mismas parejas de color (`warn` = overdue,
	   `ok` = pub, `muted` = draft). Lleva texto siempre: el color no dice nada solo. */
	.vega-review-count {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		height: 24px;
		padding: 0 0.65rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 24px;
		white-space: nowrap;
	}

	.vega-review-count[data-tone='warn'] {
		color: var(--warning);
		background: var(--warning-soft);
	}

	.vega-review-count[data-tone='ok'] {
		color: var(--success);
		background: var(--success-soft);
	}

	.vega-review-count[data-tone='muted'] {
		color: var(--ink-2);
		background: var(--btn);
	}

	/* Mientras carga, en vez de píldora: el texto de `.vega-used-in-loading`. */
	.vega-review-checking {
		font-size: 0.8rem;
		color: var(--ink-2);
	}

	/* Pie de la tarjeta: «Ningún aviso impide publicar». */
	.vega-review-note {
		margin: 0;
		font-size: 0.78rem;
		color: var(--ink-2);
	}
</style>
