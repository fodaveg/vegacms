<script lang="ts">
	/**
	 * `WarningsList.svelte` (§3.5.1/L10 del contrato P3): lista COMPLETA de `ModelWarning` en
	 * `/settings`. P3 NO interpreta los `WarningCode` (eso es vocabulario de P2) — solo los pinta:
	 * `message` (ya en español, accionable, P2 §5), `collection`/`field` si aplica, y el `path`
	 * (JSON Pointer) al fragmento del manifiesto que lo causó. Lista vacía ⇒ "sin avisos" (§4.1),
	 * nunca una sección en blanco. Scrolleable (`max-height`) para el caso límite "warnings a
	 * decenas" (§6.10) sin que la página crezca sin límite.
	 */
	import { getVegaContext } from '$lib/app-context';

	const ctx = getVegaContext();

	const warnings = $derived(ctx.model.warnings);
</script>

<section class="vega-warnings-list" aria-labelledby="vega-warnings-title">
	<h2 id="vega-warnings-title">{ctx.t('warnings.title')}</h2>

	{#if warnings.length === 0}
		<p class="vega-warnings-empty">{ctx.t('warnings.empty')}</p>
	{:else}
		<ul>
			{#each warnings as warning (warning.code + '|' + (warning.path ?? '') + '|' + (warning.field ?? ''))}
				<li class="vega-warnings-item">
					<p class="vega-warnings-message">{warning.message}</p>
					<p class="vega-warnings-meta">
						<code class="vega-warnings-code">{warning.code}</code>
						{#if warning.collection}<span>{warning.collection}</span>{/if}
						{#if warning.field}<span>{warning.field}</span>{/if}
						{#if warning.path}<code>{warning.path}</code>{/if}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.vega-warnings-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 60rem;
	}

	.vega-warnings-list h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-warnings-empty {
		margin: 0;
		color: var(--ink-2);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 20rem;
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 6px;
	}

	.vega-warnings-item {
		padding: 0.6rem 0.8rem;
		border-bottom: 1px solid var(--line);
	}

	.vega-warnings-item:last-child {
		border-bottom: none;
	}

	.vega-warnings-message {
		margin: 0 0 0.25rem;
		font-size: 0.9rem;
		color: var(--ink);
	}

	.vega-warnings-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.75rem;
		color: var(--ink-2);
	}

	.vega-warnings-meta code {
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
		background: var(--surface-2);
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.vega-warnings-code {
		font-weight: 600;
	}
</style>
