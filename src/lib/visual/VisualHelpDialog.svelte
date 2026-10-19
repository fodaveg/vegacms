<script lang="ts">
	/** Ayuda bajo demanda del editor visual. La pantalla conserva la intención y el cierre por
	 *  Escape; esta ficha posee su foco inicial y el ciclo de Tab mientras está montada. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	let { onClose }: { onClose: () => void } = $props();
	const ctx = getVegaContext();
	let dialogEl: HTMLElement;
	let firstEl: HTMLButtonElement;
	onMount(() => firstEl.focus());
	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Tab') return;
		const items = Array.from(dialogEl.querySelectorAll<HTMLButtonElement>('button'));
		const first = items[0],
			last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<div class="vega-visual-help-backdrop">
	<div
		class="vega-visual-help-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="vega-visual-help-title"
		tabindex="-1"
		bind:this={dialogEl}
		onkeydown={handleKeydown}
	>
		<div class="vega-visual-help-head">
			<h2 id="vega-visual-help-title">{ctx.t('editor.visual.help.title')}</h2>
			<button
				type="button"
				class="vega-visual-help-close"
				bind:this={firstEl}
				aria-label={ctx.t('common.close')}
				onclick={onClose}
			>
				<Icon id="close" size={16} />
			</button>
		</div>
		<dl class="vega-visual-help-list">
			<div>
				<dt><kbd>Esc</kbd></dt>
				<dd>{ctx.t('editor.visual.help.deselect')}</dd>
			</div>
			<div>
				<dt><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></dt>
				<dd>{ctx.t('editor.visual.help.move')}</dd>
			</div>
			<div>
				<dt><kbd>Supr</kbd> / <kbd>⌫</kbd></dt>
				<dd>{ctx.t('editor.visual.help.delete')}</dd>
			</div>
			<div>
				<dt><kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd></dt>
				<dd>{ctx.t('editor.visual.help.save')}</dd>
			</div>
			<div>
				<dt><kbd>?</kbd></dt>
				<dd>{ctx.t('editor.visual.help.toggleHelp')}</dd>
			</div>
		</dl>
		<!-- La asimetría se DICE con palabras (§encargo), no se deja implícita: mover/
				     duplicar/borrar/crear secciones se guardan solos (decisión 1 de
				     `blocks-state.svelte.ts`); el texto de un campo se guarda con el botón
				     "Guardar" de la ficha. -->
		<p class="vega-visual-help-asymmetry">{ctx.t('editor.visual.help.asymmetry')}</p>
	</div>
</div>

<style>
	/* Diálogo de ayuda (ver cabecera, "Panel de ayuda de atajos"): mismo par backdrop/dialog que
	   `ExportDialog.svelte`/`ReloginModal.svelte` (ver sus cabeceras), scrim ALLOWLISTED en
	   `check-theme-coverage.mjs` por el mismo motivo que ahí (§3 no tiene token de velo). */
	.vega-visual-help-backdrop {
		position: fixed;
		z-index: 80;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		background: rgb(15 17 21 / 55%);
	}

	.vega-visual-help-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 26rem;
		max-height: calc(100dvh - var(--vega-space-gutter) * 2);
		padding: 1.25rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
		overflow-y: auto;
	}

	.vega-visual-help-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.vega-visual-help-head h2 {
		margin: 0;
		font-size: 1.05rem;
		color: var(--ink-hi);
	}

	.vega-visual-help-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.9rem;
		height: 1.9rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}

	.vega-visual-help-close:hover {
		background: var(--active);
		color: var(--ink);
	}

	.vega-visual-help-close:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.vega-visual-help-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
	}

	.vega-visual-help-list > div {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.vega-visual-help-list dt {
		flex-shrink: 0;
		width: 7.5rem;
	}

	.vega-visual-help-list dd {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-visual-help-list kbd {
		padding: 0.1rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--surface-2);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.75rem;
	}

	/* La asimetría (ver cabecera del script, "Estado de guardado en la barra") se DICE aparte del
	   listado de teclas: no es un atajo, es la explicación de por qué el punto "sin guardar" de la
	   barra no siempre corresponde a lo último que se hizo. */
	.vega-visual-help-asymmetry {
		margin: 0;
		padding-top: 0.6rem;
		border-top: 1px solid var(--line);
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	@media (pointer: coarse) {
		.vega-visual-help-close {
			min-height: 44px;
			min-width: 44px;
		}
	}
</style>
