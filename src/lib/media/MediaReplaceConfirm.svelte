<script lang="ts">
	/**
	 * `MediaReplaceConfirm.svelte` (`#lote-integridad`, Fase A, punto 4 del contrato): confirmación
	 * OBLIGATORIA antes de `ctx.port.update('vega_media', id, { file })` — mismo reparto TONTO que
	 * `MediaDeleteConfirm`/`DeleteConfirm`: `MediaDetail.svelte` es el DUEÑO (abre/cierra según
	 * `open`, llama a `ctx.port.update` en `onConfirm`), este componente solo pinta y avisa.
	 *
	 * **Premisa CORREGIDA (leer antes de tocar el copy)**: PocketBase renombra el fichero guardado
	 * con un sufijo aleatorio — subir un binario nuevo NUNCA conserva la URL directa del anterior,
	 * ni aunque el fichero de origen se llame igual (verificado con un test de contrato real,
	 * `tests/contract/pocketbase.contract.test.ts`, "premisa reemplazar sin conservar la URL"). Lo
	 * que SÍ se conserva es el id del registro y sus metadatos (`alt`/`title`/`tags`), así que
	 * `warningIdentity` y `warningUrl` son DOS mensajes separados, nunca uno que insinúe que "todo
	 * sigue igual" — y ninguno menciona caché (no aplica: la URL cambia de NOMBRE, no de valor
	 * cacheado).
	 *
	 * **`UsedInPanel` con `autoLoad`** (§4 del contrato: "quién usaba la vieja"): a diferencia del
	 * panel pasivo de un registro/asset normal, aquí abrir ESTE diálogo YA es la petición explícita
	 * de ver las referencias — así que arranca expandido y cargando, sin un toggle de por medio.
	 * Consulta la vía "url" del motor contra el `FileRef` VIEJO (`targetFileRef`, el que está a
	 * punto de dejar de resolver): es la lista de quien pegó esa URL a mano y va a quedarse con un
	 * enlace roto tras confirmar.
	 *
	 * **Doble trampa de foco** (mismo patrón que `MediaDeleteConfirm`/`MediaDetail`): este diálogo
	 * es hermano de `MediaDetail` y de `MediaDeleteConfirm`, montado SIEMPRE; `MediaDetail`
	 * silencia su propio `handleKeydown` mientras cualquiera de los otros dos está abierto (guard
	 * `if (confirmingDelete || confirmingReplace) return;`).
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { FileRef, RecordId } from '$lib/backend/types';
	import UsedInPanel from '$lib/integrity/UsedInPanel.svelte';

	interface Props {
		/** `true` mientras se pide confirmar el reemplazo del fichero elegido. */
		open: boolean;
		/** `mediaDisplayName(item)` del asset cuyo fichero se va a reemplazar. */
		assetLabel: string;
		/** `File.name` del fichero YA elegido (validado) — para que la persona confirme QUÉ va a
		 *  subir, no solo QUÉ va a perder. */
		newFileName: string;
		/** Id del asset (mismo registro tras el reemplazo, ver cabecera). */
		targetId: RecordId;
		/** `FileRef` VIEJO del asset — alimenta la vía "url" del motor de referencias de abajo. */
		targetFileRef: FileRef | null;
		/** `true` mientras `ctx.port.update` está en vuelo (ver `DeleteConfirm`: NUNCA `disabled`
		 *  HTML, solo `aria-disabled`, para no vaciar el trap de foco). */
		replacing: boolean;
		/** Destino de foco si `previouslyFocused` ya no está en el documento al cerrar (mismo
		 *  criterio que `MediaDeleteConfirm`: un reemplazo con éxito cierra `MediaDetail` entero). */
		fallbackFocusEl: HTMLElement | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		assetLabel,
		newFileName,
		targetId,
		targetFileRef,
		replacing,
		fallbackFocusEl,
		onConfirm,
		onCancel
	}: Props = $props();

	const ctx = getVegaContext();

	let dialogEl = $state<HTMLElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function handleCancel(): void {
		if (replacing) return;
		onCancel();
	}

	function handleConfirm(): void {
		if (replacing) return;
		onConfirm();
	}

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>('button, a[href]'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			handleCancel();
			return;
		}
		if (event.key !== 'Tab') return;
		const items = focusableItems();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		cancelEl?.focus();

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			} else {
				fallbackFocusEl?.focus();
			}
		};
	});
</script>

{#if open}
	<div class="vega-media-replace-backdrop">
		<div
			class="vega-media-replace-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="vega-media-replace-title"
			aria-describedby="vega-media-replace-body"
			bind:this={dialogEl}
		>
			<h2 id="vega-media-replace-title">
				{ctx.t('media.replace.confirmTitle', { label: assetLabel })}
			</h2>
			<div id="vega-media-replace-body" class="vega-media-replace-body">
				<p class="vega-media-replace-new-file">{newFileName}</p>
				<p>{ctx.t('media.replace.warningIdentity')}</p>
				<p class="vega-media-replace-url-warning">{ctx.t('media.replace.warningUrl')}</p>
				<div class="vega-media-replace-used-in">
					<p class="vega-media-replace-used-in-lead">{ctx.t('media.replace.usedInIntro')}</p>
					<UsedInPanel targetCollection="vega_media" {targetId} {targetFileRef} autoLoad />
				</div>
			</div>

			<div class="vega-media-replace-actions">
				<button type="button" aria-disabled={replacing} bind:this={cancelEl} onclick={handleCancel}>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-media-replace-confirm"
					aria-disabled={replacing}
					onclick={handleConfirm}
				>
					{replacing ? ctx.t('media.replace.replacing') : ctx.t('media.replace.confirm')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.vega-media-replace-backdrop {
		/* Por encima del backdrop de `MediaDetail` (z-index 70, mismo criterio que
		   `MediaDeleteConfirm`): hermano posterior en el DOM, cubre por completo el diálogo de
		   detalle mientras está abierto. */
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		background: rgb(15 17 21 / 55%);
	}

	.vega-media-replace-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		max-width: 26rem;
		max-height: calc(100vh - 2 * var(--vega-space-gutter));
		overflow-y: auto;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-media-replace-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-media-replace-body {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.vega-media-replace-body p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.vega-media-replace-new-file {
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	/* La URL SÍ cambia (a diferencia de la identidad del registro): mismo tratamiento de aviso que
	   el resto de la app (`--warning`), nunca `--danger` — no es un fallo, es la premisa corregida. */
	.vega-media-replace-url-warning {
		color: var(--warning);
		font-weight: 600;
	}

	.vega-media-replace-used-in {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.vega-media-replace-used-in-lead {
		font-weight: 600;
		color: var(--ink);
	}

	.vega-media-replace-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.vega-media-replace-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-media-replace-actions button[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	/* Selector compuesto (en vez de `.vega-media-replace-confirm` suelto): con la misma
	   especificidad que `.vega-media-replace-actions button` de arriba (1 clase + 1 elemento vs.
	   2 clases) esta regla perdería el empate de cascada y `border-color` se quedaría en `--line`. */
	.vega-media-replace-actions .vega-media-replace-confirm {
		border-color: var(--accent-line);
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}
</style>
