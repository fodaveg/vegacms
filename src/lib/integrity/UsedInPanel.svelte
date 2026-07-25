<script lang="ts">
	/**
	 * `UsedInPanel.svelte` (`#lote-integridad`, Fase A): panel "Se usa en" — la superficie pasiva
	 * del motor de referencias (`references.ts`).
	 *
	 * Montado en dos sitios: `MediaDetail.svelte` (asset de `vega_media`, donde SÍ se pasa
	 * `targetFileRef` para habilitar la vía "url") y el aside de `RecordForm.svelte`, entre la
	 * tarjeta "Registro" y la zona de peligro — la información que hace falta justo antes de borrar.
	 * Ahí NUNCA se pasa `targetFileRef`: solo aplica a `vega_media`, que no se edita por `RecordForm`
	 * (tiene su propio detalle). Y solo con un registro que ya existe: en `/new` no hay id al que
	 * nadie pueda apuntar todavía.
	 *
	 * **Carga a demanda** (§2 del contrato: "nunca en el render inicial del formulario"): colapsado
	 * por defecto, `findReferences` solo corre al expandir (`toggle()`) — abrir un registro nunca
	 * paga el coste de N queries por nadie que no pida verlo. `autoLoad` invierte eso para el ÚNICO
	 * caso donde abrir el contenedor YA es la petición explícita: la confirmación de
	 * `MediaReplaceConfirm.svelte` ("esto es lo que usaba la URL actual, antes de reemplazarla").
	 *
	 * **Reinicio por cambio de destino**: si `targetCollection`/`targetId`/`targetFileRef` cambian
	 * mientras el panel sigue montado (p.ej. un raíl de hermanos que navega sin desmontar el
	 * formulario, `editorRail`), el `$effect` de abajo descarta el resultado anterior — nunca
	 * arrastra las referencias de OTRO registro.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { FileRef, RecordId } from '$lib/backend/types';
	import { RequestSequencer } from '$lib/list/list-load';
	import { findReferences, type ReferencesReport } from './references';
	import ReferencesSummary from './ReferencesSummary.svelte';

	interface Props {
		targetCollection: string;
		targetId: RecordId;
		/** Solo relevante cuando `targetCollection === 'vega_media'` (vía "url" del motor). */
		targetFileRef?: FileRef | null;
		/** `true` ⇒ arranca expandido y cargando ya al montar (ver cabecera: uso en
		 *  `MediaReplaceConfirm`, donde abrir el diálogo YA es la demanda explícita). Default
		 *  `false`: colapsado, el toggle es quien decide cargar. */
		autoLoad?: boolean;
	}

	let { targetCollection, targetId, targetFileRef = null, autoLoad = false }: Props = $props();

	const ctx = getVegaContext();

	type Status = 'idle' | 'loading' | 'ready' | 'error';

	// Arranca en `false`/`'idle'`: el `$effect` de más abajo fija el valor real (`autoLoad`) en su
	// primera pasada, que corre síncrona al montar — inicializar aquí desde el prop directamente
	// generaría el warning `state_referenced_locally` (solo capturaría el valor INICIAL de
	// `autoLoad`, que en la práctica nunca cambia tras montar, pero el propio `$effect` ya lo cubre
	// sin ambigüedad).
	let expanded = $state(false);
	let status = $state<Status>('idle');
	let report = $state<ReferencesReport | null>(null);

	// Anti-carrera (`RequestSequencer`, mismo mecanismo que `list-state.svelte.ts`/`media-list-
	// state.svelte.ts`, L-P4.10): imprescindible aquí por un motivo MÁS ALLÁ del anti-carrera de
	// siempre — `load()` NUNCA debe LEER `status` de forma síncrona. El `$effect` de más abajo
	// llama a `load()` directamente (`autoLoad`): si `load()` empezara con un guard tipo
	// `if (status === 'loading') return`, esa lectura ocurriría DENTRO de la ejecución síncrona
	// del propio `$effect`, convirtiendo `status` en una dependencia SUYA — y la escritura
	// `status = 'loading'` dos líneas más abajo, todavía dentro de esa misma ejecución síncrona,
	// dispararía el efecto A SÍ MISMO sin fin (`effect_update_depth_exceeded`, reproducido en
	// e2e con `autoLoad` real). El `RequestSequencer` resuelve el reentrada/anti-carrera sin
	// tocar ningún `$state` reactivo en el camino síncrono de `load()`.
	const sequencer = new RequestSequencer();

	async function load(): Promise<void> {
		const seq = sequencer.next();
		status = 'loading';
		try {
			// `ctx.model.types` (P2) tiene el MISMO cardinal que `listContentTypes()` (P1, incluidos
			// los ocultos, L6): `.schema` es el `ContentType` crudo que pide el motor, sin volver a
			// tocar la red para releer el esquema.
			const types = ctx.model.types.map((t) => t.schema);
			const result = await findReferences(
				types,
				{ collection: targetCollection, id: targetId, fileRef: targetFileRef },
				ctx.port.list
			);
			if (!sequencer.isLatest(seq)) return; // respuesta obsoleta: se descarta sin pisar el estado
			report = result;
			status = 'ready';
		} catch {
			// Defensivo (ver cabecera de `findReferences`: el motor aísla el fallo POR COLECCIÓN y
			// no debería rechazar nunca) — un fallo inesperado aquí degrada a "error reintentable",
			// nunca tumba el panel entero ni el formulario que lo contiene.
			if (!sequencer.isLatest(seq)) return;
			status = 'error';
		}
	}

	function toggle(): void {
		expanded = !expanded;
		if (expanded && status === 'idle') void load();
	}

	$effect(() => {
		// Dependencias explícitas: cualquier cambio de IDENTIDAD del destino reinicia el panel
		// entero (ver cabecera, "reinicio por cambio de destino") — nunca muestra el resultado de
		// un registro distinto al que la UI tiene abierto ahora mismo.
		void targetCollection;
		void targetId;
		void targetFileRef;
		status = 'idle';
		report = null;
		expanded = autoLoad;
		if (autoLoad) void load();
	});
</script>

<div class="vega-used-in" data-used-in-status={status}>
	{#if !autoLoad}
		<button type="button" class="vega-used-in-toggle" aria-expanded={expanded} onclick={toggle}>
			{ctx.t('integrity.usedIn.toggle')}
		</button>
	{/if}

	{#if expanded}
		<div class="vega-used-in-body">
			{#if status === 'loading'}
				<p class="vega-used-in-loading" aria-live="polite">{ctx.t('integrity.usedIn.loading')}</p>
			{:else if status === 'error'}
				<p class="vega-used-in-error" role="alert">
					{ctx.t('integrity.usedIn.error')}
					<button type="button" onclick={() => void load()}>
						{ctx.t('integrity.usedIn.retry')}
					</button>
				</p>
			{:else if status === 'ready' && report}
				{#if report.groups.length === 0}
					<p class="vega-used-in-empty">{ctx.t('integrity.usedIn.empty')}</p>
				{:else}
					<ReferencesSummary {report} />
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.vega-used-in {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-used-in-toggle {
		align-self: flex-start;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-used-in-toggle:hover {
		border-color: var(--line-strong);
		color: var(--ink);
	}

	.vega-used-in-toggle[aria-expanded='true'] {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-used-in-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.vega-used-in-loading,
	.vega-used-in-empty {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-used-in-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-used-in-error button {
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.8rem;
		cursor: pointer;
	}
</style>
