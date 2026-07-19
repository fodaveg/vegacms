<script lang="ts">
	/**
	 * `MediaDeleteConfirm.svelte` (Fase P6·6d, D-P6.5/audit H3): confirmación OBLIGATORIA antes de
	 * `port.delete('vega_media', id)` — mismo reparto TONTO que `$lib/list/DeleteConfirm.svelte`
	 * (P4, Fase 4e): `MediaDetail.svelte` es el DUEÑO (abre/cierra según `confirmingDelete`, llama a
	 * `ctx.port.delete` en `onConfirm`), este componente solo pinta y avisa.
	 *
	 * **Por qué un componente dedicado y no reutilizar `DeleteConfirm.svelte`**: la API estructural
	 * es casi idéntica (backdrop + `alertdialog` + foco atrapado + `danger`), pero el COPY es
	 * deliberadamente distinto y no genérico — `DeleteConfirm` habla de "borrado permanente, no se
	 * puede deshacer" (cierto para un registro de tipo de contenido); aquí el aviso tiene que ser el
	 * matiz concreto de D-P6.5: el modelo de media es COPIA de bytes, no referencia
	 * (`filePerRecord`), así que borrar el original NUNCA rompe una copia ya insertada en un
	 * registro — pero SÍ podría romper una URL pegada a mano en un campo `text`/`url` (audit H3),
	 * así que el aviso nombra específicamente "las copias insertadas por la biblioteca", nunca "nada
	 * se ve afectado". Forzar ese copy dentro de `DeleteConfirm` (con un `body` genérico
	 * parametrizable) mezclaría dos dominios (registros de contenido vs. assets de media) en un
	 * componente que ya documenta su contrato en términos de "registro" — más limpio mantenerlos
	 * separados que generalizar `DeleteConfirm` para un caso de uso.
	 *
	 * **Montado SIEMPRE, nunca dentro de `{#if item}`** (mismo criterio que `DeleteConfirm` en
	 * `+page.svelte`, P4): `MediaDetail.svelte` lo renderiza como HERMANO del `{#if item}` de su
	 * propio diálogo, controlado solo por `open` — si viviera DENTRO de ese bloque, un borrado con
	 * éxito destruiría este componente Y `MediaDetail` en el mismo tick, dejando el `$effect` de
	 * limpieza de foco (ver abajo) corriendo en una carrera con el desmontaje del padre. Montado
	 * siempre, su propio ciclo de vida (`open` true→false) es independiente de `item`.
	 *
	 * **Doble trampa de foco (`MediaDetail` + este componente) mientras `open`**: `MediaDetail`
	 * mantiene su PROPIO listener de `keydown` en `document` mientras su diálogo está abierto (para
	 * su Esc/Tab), y este componente instala el suyo cuando `open` pasa a `true` — ambos en el MISMO
	 * nodo (`document`), en captura. Sin coordinación, un `Escape` dispararía los DOS handlers (el
	 * `stopPropagation` de uno no cancela al otro: ambos están en el mismo nodo, no en la cadena de
	 * propagación). `MediaDetail.handleKeydown` tiene un guard `if (confirmingDelete) return;` como
	 * primera línea — mientras este diálogo está abierto, el de `MediaDetail` queda inerte y SOLO el
	 * de aquí reacciona. Ver la cabecera de `MediaDetail.svelte`.
	 *
	 * **`fallbackFocusEl`**: mismo problema y misma solución que `DeleteConfirm` (P4, fix de
	 * code-review de 4e) — un borrado con ÉXITO cierra `MediaDetail` (su `item` pasa a `null`) casi
	 * en el mismo tick en que este diálogo se cierra (`open` a `false`); el botón "Borrar" de
	 * `MediaDetail` que tenía el foco al abrir este diálogo puede no sobrevivir esa carrera. El
	 * `<h1>` de `/media/+page.svelte` (`tabindex="-1"`), pasado a través de `MediaDetail`, es el
	 * destino estable cuando `previouslyFocused` ya no está en el documento.
	 */
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		/** `true` mientras se pide confirmar el borrado del asset abierto en `MediaDetail`. */
		open: boolean;
		/** `mediaDisplayName(item)` del asset a borrar (ver `media-item.ts`) — QUÉ se borra. */
		assetLabel: string;
		/** `true` mientras `ctx.port.delete` está en vuelo (ver cabecera de `DeleteConfirm`: NUNCA
		 *  `disabled` HTML, solo `aria-disabled`, para no vaciar el trap de foco). */
		deleting: boolean;
		/** Destino de foco si `previouslyFocused` ya no está en el documento al cerrar (ver
		 *  cabecera: el caso real es un borrado con éxito que se lleva `MediaDetail` por delante). */
		fallbackFocusEl: HTMLElement | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, assetLabel, deleting, fallbackFocusEl, onConfirm, onCancel }: Props = $props();

	const ctx = getVegaContext();

	let dialogEl = $state<HTMLElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	/** Guard compartido de `deleting` (ver `DeleteConfirm`): no-op mientras el borrado está en vuelo. */
	function handleCancel(): void {
		if (deleting) return;
		onCancel();
	}

	function handleConfirm(): void {
		if (deleting) return;
		onConfirm();
	}

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>('button'));
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
	<div class="vega-media-delete-backdrop">
		<div
			class="vega-media-delete-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="vega-media-delete-title"
			aria-describedby="vega-media-delete-body"
			bind:this={dialogEl}
		>
			<h2 id="vega-media-delete-title">
				{ctx.t('media.delete.confirmTitle', { label: assetLabel })}
			</h2>
			<p id="vega-media-delete-body">{ctx.t('media.delete.confirmBody')}</p>

			<div class="vega-media-delete-actions">
				<button type="button" aria-disabled={deleting} bind:this={cancelEl} onclick={handleCancel}>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-media-delete-confirm"
					aria-disabled={deleting}
					onclick={handleConfirm}
				>
					{deleting ? ctx.t('media.delete.deleting') : ctx.t('media.delete.confirm')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.vega-media-delete-backdrop {
		position: fixed;
		/* Por encima del backdrop de `MediaDetail` (z-index 70, mismo valor): al pintarse DESPUÉS en
		   el DOM (hermano posterior), su capa gana el mismo empate de apilamiento — cubre por
		   completo el diálogo de detalle, así que nada de debajo es alcanzable ni por click ni por
		   teclado mientras este está abierto. */
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs, mismo criterio que DeleteConfirm/ReloginModal/MediaDetail. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-media-delete-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		max-width: 24rem;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-media-delete-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-media-delete-dialog p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.vega-media-delete-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.vega-media-delete-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	/* `aria-disabled`, NUNCA `disabled` HTML (mismo motivo que `DeleteConfirm`: el trap de foco
	   necesita que los dos botones sigan siendo tabbable mientras `deleting`). */
	.vega-media-delete-actions button[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-delete-confirm {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
		font-weight: 600;
	}
</style>
