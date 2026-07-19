<script lang="ts">
	/**
	 * `DeleteConfirm.svelte` (Fase 4e del contrato P4, L-P4.11/D-P4.7): confirmación OBLIGATORIA
	 * antes de cualquier `port.delete` — ningún borrado dispara sin pasar por aquí. `+page.svelte`
	 * es el DUEÑO del diálogo (abre/cierra según `pendingDelete`, llama a `ctx.port.delete` en
	 * `onConfirm`); este componente es TONTO a propósito, mismo reparto que `Pagination.svelte`/
	 * `ListToolbar.svelte`: no toca el puerto, no navega, solo pinta y avisa.
	 *
	 * Diseño elegido (D-P4.7 lo deja abierto): diálogo MODAL flotante, mismo patrón visual y
	 * estructural que `ReloginModal.svelte` (backdrop + panel centrado, foco atrapado, foco
	 * inicial en un control del formulario) — a diferencia de aquel, este SÍ es cancelable
	 * (`Esc`, botón "Cancelar"): no hay nada "obligatorio" que proteger aquí, lo obligatorio es
	 * pasar por ALGÚN diálogo antes de borrar, no impedir salir de él.
	 *
	 * - **`role="alertdialog"`** (no `"dialog"` a secas): es exactamente el caso de uso que ARIA
	 *   describe para ese rol — un mensaje que exige una decisión inmediata del usuario antes de
	 *   una acción destructiva, con `aria-describedby` apuntando al cuerpo que dice QUÉ se borra.
	 * - **Foco inicial en "Cancelar" (el control SEGURO), nunca en "Borrar"**: si el usuario
	 *   confirma sin querer con un `Enter` reflejo (p.ej. tras teclear en otro campo y pulsar Intro
	 *   por costumbre), aterriza en la acción que NO borra nada. El botón "Borrar" solo se alcanza
	 *   deliberadamente (click o Tab explícito).
	 * - **Foco atrapado** (mismo `Tab`/`Shift+Tab` que `ReloginModal`): el resto de la app queda
	 *   fuera del recorrido de foco mientras el diálogo está abierto. A diferencia de
	 *   `ReloginModal`, NO se marca `inert` el resto de la app: este diálogo vive DENTRO del árbol
	 *   de `+page.svelte` (nieto de `#vega-app-shell`, no su hermano), así que `inert`-arlo se
	 *   inertaría a sí mismo. El backdrop `fixed` de pantalla completa + el atrapado de `Tab` ya
	 *   bastan para que nada de fuera sea alcanzable ni por click ni por teclado.
	 * - **Botón "Borrar" en rol `danger`** (L-P4.11): tokens `--vega-color-danger`/`-danger-bg`,
	 *   mismo par que ya usa el resto del shell (`GlobalBanner`/`ToastHost`/`WarningsBadge`) para
	 *   estados de error — aquí en positivo, como acción, no como aviso.
	 * - **`deleting` NUNCA vacía el trap (fix de code-review de 4e)**: mientras `ctx.port.delete`
	 *   está en vuelo, los botones NO llevan `disabled` HTML — eso los sacaría del recorrido de
	 *   `Tab` (`focusableItems()` filtraría por `button:not([disabled])`) y, con los DOS botones
	 *   fuera, `handleKeydown` no tendría nada que atrapar: `Tab` escaparía al árbol de
	 *   `+page.svelte`, que a propósito NO está `inert` (ver arriba). En su lugar: `aria-disabled`
	 *   (visual + semántica de "no disponible ahora", sin sacarlo del foco) + un guard al inicio de
	 *   `handleCancel`/`handleConfirm` (`if (deleting) return`) que hace el doble-envío un no-op.
	 *   El diálogo SIEMPRE tiene al menos dos controles tabbable mientras está abierto.
	 * - **Foco al cerrar (fix de code-review de 4e)**: `previouslyFocused` es el botón "Borrar" de
	 *   LA FILA que se pidió borrar. Si el cierre es por cancelar/`Esc`, esa fila sigue en el DOM
	 *   (nada cambió) y restaurar el foco ahí es correcto. Si el cierre es por un borrado con
	 *   ÉXITO, `+page.svelte` ya hizo `reload()`: esa fila (y su botón) YA NO EXISTE, así que
	 *   `.focus()` sobre un nodo desconectado es un no-op silencioso y el foco caería a `<body>`.
	 *   `fallbackFocusEl` (el `<h1>` del listado, `tabindex="-1"`, pasado por `+page.svelte`) es el
	 *   destino cuando `previouslyFocused` ya no está en el documento — sin que este componente
	 *   necesite saber POR QUÉ se cerró, solo si su foco original sigue siendo válido.
	 */
	import { getVegaContext } from '$lib/app-context';

	interface Props {
		/** `true` mientras haya un registro pendiente de confirmar (lo decide `+page.svelte`). */
		open: boolean;
		/** Texto que identifica el registro a borrar (mismo `openText` de la fila, D-P4.11: "QUÉ se
		 *  borra"), o el fallback i18n `list.untitled` si no hay campo-título resoluble. */
		recordLabel: string;
		/** `true` mientras `ctx.port.delete` está en vuelo: `aria-disabled` en ambos botones (evita
		 *  un doble envío, vía el guard de `handleCancel`/`handleConfirm`) y cambia el texto de
		 *  "Borrar" a "Borrando…". Deliberadamente NUNCA `disabled` HTML (ver cabecera: vaciaría el
		 *  trap de foco). */
		deleting: boolean;
		/** Destino de foco si `previouslyFocused` ya no está en el documento al cerrar (ver
		 *  cabecera: el caso real es un borrado con éxito que se llevó la fila por delante). */
		fallbackFocusEl: HTMLElement | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, recordLabel, deleting, fallbackFocusEl, onConfirm, onCancel }: Props = $props();

	const ctx = getVegaContext();

	// ————— Diálogo modal cancelable: foco atrapado + foco inicial seguro (ver cabecera) —————
	let dialogEl = $state<HTMLElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	/** Guard compartido de `deleting` (ver cabecera): el click/`Enter` en cualquiera de los dos
	 *  botones es un no-op mientras el borrado está en vuelo, en vez de sacarlos del `Tab`. */
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
			// Ver cabecera ("Foco al cerrar"): restaura ahí SOLO si ese nodo sigue en el documento
			// (cancelar/Esc); si un borrado con éxito se lo llevó por delante, cae al fallback.
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			} else {
				fallbackFocusEl?.focus();
			}
		};
	});
</script>

{#if open}
	<div class="vega-delete-backdrop">
		<div
			class="vega-delete-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="vega-delete-title"
			aria-describedby="vega-delete-body"
			bind:this={dialogEl}
		>
			<h2 id="vega-delete-title">{ctx.t('list.delete.confirmTitle')}</h2>
			<p id="vega-delete-body">{ctx.t('list.delete.confirmBody', { label: recordLabel })}</p>

			<div class="vega-delete-actions">
				<button type="button" aria-disabled={deleting} bind:this={cancelEl} onclick={handleCancel}>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-delete-confirm"
					aria-disabled={deleting}
					onclick={handleConfirm}
				>
					{deleting ? ctx.t('list.delete.deleting') : ctx.t('list.delete.confirm')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.vega-delete-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-delete-dialog {
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

	.vega-delete-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-delete-dialog p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.9rem;
	}

	.vega-delete-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.vega-delete-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	/* `aria-disabled`, NUNCA `disabled` HTML (ver cabecera del script: el trap de foco necesita
	   que los botones sigan siendo tabbable mientras `deleting`). */
	.vega-delete-actions button[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-delete-confirm {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
		font-weight: 600;
	}
</style>
