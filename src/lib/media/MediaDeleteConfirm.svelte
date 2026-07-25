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
	 *
	 * **Aviso de referencias (`#lote-integridad`, Fase A)**: mismo `createDeleteReferencesGuard`
	 * que `DeleteConfirm`, consultando la vía "url" del motor (`contains <filename>`, la única que
	 * aplica a un asset — ver cabecera de `references.ts`: el picker de media COPIA el binario, así
	 * que la vía "relation" casi nunca encuentra nada, pero corre igual por si algún esquema
	 * declarase una relación real hacia `vega_media`). `targetId`/`targetFileRef` son OPCIONALES
	 * (`null` de forma deliberada) porque este mismo componente sirve al borrado de la barra de
	 * selección de `/media`, que puede llevar N assets a la vez: comprobar una selección entera
	 * multiplica el coste por N y el contrato de esta fase no lo pide, así que ahí el aviso se omite
	 * y el diálogo se comporta EXACTAMENTE como antes del lote. Con la selección de UNO SOLO sí se
	 * pasan (fix de code-review): marcar un asset y borrarlo desde la barra es el mismo acto que
	 * borrarlo desde su detalle, y tener dos caminos para el mismo borrado con distinta protección es
	 * justo cómo se cuela el fallo que este lote existe para evitar.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { FileRef, RecordId } from '$lib/backend/types';
	import { createDeleteReferencesGuard } from '$lib/integrity/delete-guard.svelte';
	import ReferencesSummary from '$lib/integrity/ReferencesSummary.svelte';

	interface Props {
		/** `true` mientras se pide confirmar el borrado del asset abierto en `MediaDetail`. */
		open: boolean;
		/** `mediaDisplayName(item)` del asset a borrar (ver `media-item.ts`) — QUÉ se borra. */
		assetLabel: string;
		/** Título ya compuesto, para cuando el gesto NO es "un asset con nombre": la barra de
		 *  selección de `/media` borra N assets a la vez y necesita "¿Borrar 3 archivos…?" en vez de
		 *  «¿Borrar «{label}»?» (`assetLabel` entre comillas no sabe pluralizar). Ausente ⇒ el título
		 *  de siempre a partir de `assetLabel`, sin cambios para `MediaDetail`. */
		title?: string;
		/** Id del asset a borrar, o `null` en el borrado MÚLTIPLE (ver cabecera: sin id único no hay
		 *  contra qué comprobar referencias, el aviso se omite entero). */
		targetId?: RecordId | null;
		/** `FileRef` del asset a borrar (vía "url" del motor), o `null` — mismo criterio que
		 *  `targetId`. */
		targetFileRef?: FileRef | null;
		/** `true` mientras `ctx.port.delete` está en vuelo (ver cabecera de `DeleteConfirm`: NUNCA
		 *  `disabled` HTML, solo `aria-disabled`, para no vaciar el trap de foco). */
		deleting: boolean;
		/** Destino de foco si `previouslyFocused` ya no está en el documento al cerrar (ver
		 *  cabecera: el caso real es un borrado con éxito que se lleva `MediaDetail` por delante). */
		fallbackFocusEl: HTMLElement | null;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		assetLabel,
		title,
		targetId = null,
		targetFileRef = null,
		deleting,
		fallbackFocusEl,
		onConfirm,
		onCancel
	}: Props = $props();

	const ctx = getVegaContext();

	let dialogEl = $state<HTMLElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// ————— Aviso de referencias (ver cabecera) —————
	const guard = createDeleteReferencesGuard();
	let agreedDespiteReferences = $state(false);

	$effect(() => {
		void open;
		void targetId;
		void targetFileRef;
		agreedDespiteReferences = false;
		if (!open || targetId === null) {
			guard.reset();
			return;
		}
		guard.check(ctx, { collection: 'vega_media', id: targetId, fileRef: targetFileRef });
	});

	const blockedByReferences = $derived(guard.needsExplicitConfirm && !agreedDespiteReferences);

	/** Guard compartido de `deleting`/`blockedByReferences` (ver `DeleteConfirm`): no-op mientras el
	 *  borrado está en vuelo o falta el checkbox exigido. */
	function handleCancel(): void {
		if (deleting) return;
		onCancel();
	}

	function handleConfirm(): void {
		if (deleting || blockedByReferences) return;
		onConfirm();
	}

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>('button, input[type="checkbox"], a[href]')
		);
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
				{title ?? ctx.t('media.delete.confirmTitle', { label: assetLabel })}
			</h2>
			<p id="vega-media-delete-body">{ctx.t('media.delete.confirmBody')}</p>

			<!-- Aviso de referencias (ver cabecera): ausente entero en el borrado MÚLTIPLE
			     (`targetId === null`, `guard` se queda en `'idle'` por el `$effect` de arriba). -->
			{#if guard.status.kind === 'loading'}
				<p class="vega-media-delete-refs-checking" aria-live="polite">
					{ctx.t('integrity.deleteGuard.checking')}
				</p>
			{:else if guard.status.kind === 'error'}
				<p class="vega-media-delete-refs-failed">{ctx.t('integrity.deleteGuard.checkFailed')}</p>
			{:else if guard.status.kind === 'ready' && guard.needsExplicitConfirm}
				<div class="vega-media-delete-refs">
					<p class="vega-media-delete-refs-warning">{ctx.t('integrity.deleteGuard.warning')}</p>
					<ReferencesSummary report={guard.status.report} />
					<label class="vega-media-delete-refs-agree">
						<input type="checkbox" bind:checked={agreedDespiteReferences} />
						{ctx.t('integrity.deleteGuard.confirmCheckbox')}
					</label>
				</div>
			{/if}

			<div class="vega-media-delete-actions">
				<button type="button" aria-disabled={deleting} bind:this={cancelEl} onclick={handleCancel}>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-media-delete-confirm"
					aria-disabled={deleting || blockedByReferences}
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
		/* Mismo motivo que `DeleteConfirm`: el aviso de referencias puede traer una lista de
		   registros (caso límite "asset usado en 200 sitios"). */
		max-height: calc(100vh - 2 * var(--vega-space-gutter));
		overflow-y: auto;
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

	.vega-media-delete-refs-checking {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-media-delete-refs-failed {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-media-delete-refs {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.7rem;
		border: 1px solid var(--warning);
		border-radius: 8px;
		background: var(--warning-soft);
	}

	.vega-media-delete-refs-warning {
		margin: 0;
		color: var(--warning);
		font-weight: 600;
		font-size: 0.85rem;
	}

	.vega-media-delete-refs-agree {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-media-delete-refs-agree input {
		margin-top: 0.15rem;
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
