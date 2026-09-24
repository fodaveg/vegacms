<script lang="ts">
	/**
	 * Marco modal de los diálogos de `/editores` (alta, cambio de contraseña, quitar acceso): velo,
	 * panel de 26 rem, título, cierre y foco atrapado. El contenido y los botones los pone quien lo
	 * usa; este componente no toca el puerto ni decide nada.
	 *
	 * Mismo comportamiento que `DeleteConfirm.svelte` (ver su cabecera para el porqué de cada punto):
	 * - Foco atrapado con `Tab`/`Shift+Tab` y `Esc` para cerrar. Sin `inert` en el resto de la app:
	 *   el diálogo vive dentro del árbol de la página y se inertaría a sí mismo.
	 * - Foco inicial en el control marcado con `data-autofocus` (el campo que se va a escribir, o
	 *   «Cancelar» en una confirmación destructiva); si no hay ninguno, el primero enfocable.
	 * - Mientras `busy`, cerrar es un no-op, pero nada se saca del recorrido de `Tab`: quien lo usa
	 *   marca sus botones con `aria-disabled`, nunca con `disabled`, para no vaciar la trampa.
	 * - Al cerrar, el foco vuelve a lo que lo tenía al abrir si sigue en el documento; si no (la fila
	 *   se fue con un borrado), a `fallbackFocusEl`.
	 */
	import { tick, type Snippet } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import './admin.css';

	interface Props {
		open: boolean;
		title: string;
		/** `'alertdialog'` para una confirmación destructiva (quitar acceso). */
		role?: 'dialog' | 'alertdialog';
		/** Operación en vuelo: `Esc` y el botón de cerrar no hacen nada. */
		busy?: boolean;
		/** `false` en una confirmación: se sale por «Cancelar», como en `DeleteConfirm`. */
		showClose?: boolean;
		fallbackFocusEl?: HTMLElement | null;
		onClose: () => void;
		/** Texto que explica la decisión; se enlaza con `aria-describedby` (confirmaciones). */
		description?: string;
		children?: Snippet;
		actions: Snippet;
	}

	let {
		open,
		title,
		role = 'dialog',
		busy = false,
		showClose = true,
		fallbackFocusEl = null,
		onClose,
		description,
		children,
		actions
	}: Props = $props();

	const ctx = getVegaContext();
	const titleId = $props.id();
	const descriptionId = `${titleId}-description`;

	let dialogEl = $state<HTMLElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function requestClose(): void {
		if (busy) return;
		onClose();
	}

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button, input:not([disabled]), select, textarea, a[href]'
			)
		);
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			requestClose();
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

	function focusInitial(): void {
		const initial =
			dialogEl?.querySelector<HTMLElement>('[data-autofocus]') ?? focusableItems()[0] ?? null;
		initial?.focus();
	}

	$effect(() => {
		if (!open) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		// Tras `tick()`: el panel (y su `bind:this`) ya está en el DOM, y leer `dialogEl` fuera del
		// cuerpo síncrono del efecto evita que el efecto se repita cuando la referencia cambia.
		void tick().then(() => {
			if (open) focusInitial();
		});

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
	<div class="vega-admin-dialog-backdrop">
		<div
			class="vega-admin-dialog"
			{role}
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={description ? descriptionId : undefined}
			bind:this={dialogEl}
		>
			<div class="vega-admin-dialog-head">
				<h2 id={titleId}>{title}</h2>
				{#if showClose}
					<button
						type="button"
						class="vega-admin-icon-btn"
						aria-label={ctx.t('common.close')}
						aria-disabled={busy}
						onclick={requestClose}
					>
						<Icon id="close" size={16} />
					</button>
				{/if}
			</div>
			{#if description}
				<p class="vega-admin-dialog-text" id={descriptionId}>{description}</p>
			{/if}
			{@render children?.()}
			<div class="vega-admin-dialog-actions">
				{@render actions()}
			</div>
		</div>
	</div>
{/if}

<style>
	.vega-admin-dialog-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Velo independiente del tema (§3 no tiene token de velo), allowlisted en
		   check-theme-coverage.mjs, igual que el de `DeleteConfirm.svelte`. */
		background: rgb(15 17 21 / 55%);
	}
</style>
