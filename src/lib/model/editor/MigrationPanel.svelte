<script lang="ts">
	import { onDestroy } from 'svelte';
	/**
	 * Muestra una migración JS ya calculada. `migrationState: 'applied'` conserva el flujo de
	 * `SchemaAuthoringPanel` (la operación contra PocketBase ya ocurrió); `'pending'` sirve al
	 * reconciliador de columnas de bloque (el fichero se generó, pero nadie lo aplicó). El
	 * componente sigue sin estado de red y solo ofrece copiar el artefacto.
	 */
	import type { GeneratedMigration } from '$lib/backend/migration';

	interface Props {
		migration: GeneratedMigration;
		t: (key: string, params?: Record<string, string | number>) => string;
		migrationState?: 'applied' | 'pending';
	}

	const { migration, t, migrationState = 'applied' }: Props = $props();

	const titleKey = $derived(
		migrationState === 'pending'
			? 'settings.schema.migration.pendingTitle'
			: 'settings.schema.migration.title'
	);
	const instructionsKey = $derived(
		migrationState === 'pending'
			? 'settings.schema.migration.pendingInstructions'
			: 'settings.schema.migration.instructions'
	);

	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	/** Best-effort (`navigator.clipboard` puede faltar permiso/HTTPS): sin portapapeles, el
	 *  operador siempre puede seleccionar el `<pre>` a mano — nunca es la única vía. */
	// Misma disciplina que `PreviewPanel`/`build-client` en este mismo lote: un `setTimeout` vivo
	// tras desmontar escribe en el `$state` de una instancia ya destruida.
	onDestroy(() => {
		if (copyTimeout) clearTimeout(copyTimeout);
		copyTimeout = null;
	});

	async function handleCopy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(migration.contents);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Sin permiso/API de portapapeles: no hay nada más que hacer desde aquí, el texto
			// sigue disponible para copiar a mano en el <pre> de abajo.
		}
	}
</script>

<div class="vega-migration-panel">
	<h4>{t(titleKey)}</h4>
	<p>{t(instructionsKey, { filename: migration.filename })}</p>
	<pre class="vega-migration-code">{migration.contents}</pre>
	<button type="button" onclick={handleCopy}>
		{copied ? t('settings.schema.migration.copied') : t('settings.schema.migration.copy')}
	</button>
</div>

<style>
	.vega-migration-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-migration-panel h4 {
		margin: 0;
		font-size: 0.85rem;
	}

	.vega-migration-panel p {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-2);
	}

	.vega-migration-code {
		max-height: 16rem;
		overflow: auto;
		margin: 0;
		padding: 0.5rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 4px;
		font-family: var(--mono);
		font-size: 0.78rem;
		white-space: pre;
	}

	.vega-migration-panel button {
		align-self: flex-start;
		padding: 0.35rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.8rem;
		cursor: pointer;
	}
</style>
