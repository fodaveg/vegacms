<script lang="ts">
	/**
	 * `MediaDetail.svelte` (Fase P6·6b): panel MODAL para editar los metadatos de un asset de
	 * `vega_media` (`alt`/`title`/`tags`) — NUNCA el motor `RecordForm` de P5 (ese es para registros
	 * de tipos de contenido de usuario, con validación por-campo/dirty-tracking/relaciones/foco de
	 * F5-g; aquí son 3 metadatos sin relaciones ni widgets dedicados, un panel ligero de propósito
	 * único basta — "sin sobre-ingeniería" del alcance de 6b). `file`/`created` NUNCA se editan
	 * (D-P6.1: `created` es autodate readonly; `file` no tiene UI de reemplazo hasta 6c/6d).
	 *
	 * **Diálogo modal**: mismo patrón visual/estructural que `ReloginModal.svelte`/
	 * `DeleteConfirm.svelte` (backdrop + panel centrado, foco atrapado, `Esc` cierra). `role="dialog"`
	 * (no `"alertdialog"`: no hay una decisión urgente que forzar, es un editor). Vive DENTRO del
	 * árbol de `/media/+page.svelte` (nieto de `#vega-app-shell`, no su hermano) — igual que
	 * `DeleteConfirm`, por eso NO se marca `inert` el resto de la app: el backdrop `fixed` + el
	 * atrapado de `Tab` ya bastan.
	 *
	 * **Cerrar sin guardar**: si hay cambios sin guardar (`dirty`), reutiliza el MISMO gesto/copy
	 * que el guard de salida de `RecordForm` (`editor.leaveConfirm`, `window.confirm`) en vez de
	 * inventar un segundo modal de confirmación para lo mismo — precedente ya asentado en el propio
	 * repo (P5, F5-g) para "salir con cambios sin guardar".
	 *
	 * **Guardar**: `ctx.port.update('vega_media', item.id, { alt, title, tags })`. Éxito → toast +
	 * `onSaved(nuevoView)` (el llamador refresca la celda del grid) + cierra. `VegaError kind
	 * 'validation'` → mensaje en contexto (record-level, `role="alert"`; estos 3 campos no tienen
	 * restricciones propias hoy, así que en la práctica solo se alcanzaría si el backend añadiera
	 * una regla nueva); cualquier otro kind → `ctx.feedback.reportError` (global, L-P4.4-alike).
	 *
	 * **Borrar (Fase P6·6d, D-P6.5/audit H3)**: botón "Borrar" en la fila de acciones → abre
	 * `MediaDeleteConfirm` (montado SIEMPRE, hermano del `{#if item}` de más abajo — ver su propia
	 * cabecera para el porqué) con el aviso HONESTO del modelo de media (copia de bytes, no
	 * referencia: borrar el original nunca rompe una copia ya insertada en un registro). Confirmar →
	 * `ctx.port.delete('vega_media', item.id)`; éxito → toast + `onDeleted(id)` (el llamador refresca
	 * el grid, la celda ya no existe) + cierra este panel; fallo → `ctx.feedback.reportError`
	 * (global, mismo reparto que el borrado de P4 en `/c/[type]`: el diálogo se cierra pero el asset
	 * NUNCA se quita de forma optimista, sigue en el grid). `dirty` (metadatos sin guardar) NO
	 * bloquea borrar: el registro entero va a desaparecer, esos drafts dejan de tener sentido.
	 *
	 * **Doble trampa de foco mientras `confirmingDelete`**: `handleKeydown` de ESTE componente tiene
	 * un guard (`if (confirmingDelete) return;`, primera línea) para quedar inerte mientras
	 * `MediaDeleteConfirm` está abierto — los dos instalan un listener de `keydown` en `document`
	 * (en captura), y sin este guard un `Escape` dispararía AMBOS handlers (`stopPropagation` no
	 * cancela un listener hermano en el mismo nodo). Ver la cabecera de `MediaDeleteConfirm.svelte`.
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import Icon from '$lib/icons/Icon.svelte';
	import { addTag, normalizeTagInput, removeTag, tagsEqual } from './media-tags';
	import { mediaDisplayName, mediaImgAlt, toMediaItemView, type MediaItemView } from './media-item';
	import { resolveMediaFullSrc } from './media-thumb';
	import MediaDeleteConfirm from './MediaDeleteConfirm.svelte';

	interface Props {
		/** `null` = diálogo cerrado. El grid nunca abre uno nuevo sin cerrar el anterior, pero este
		 *  componente no depende de esa disciplina: cada cambio de `item` reasienta los drafts. */
		item: MediaItemView | null;
		onClose: () => void;
		/** El registro `vega_media` YA actualizado (fuente de verdad tras `update`): el llamador
		 *  refresca su copia local (grid) con `toMediaItemView(saved)`, no con los drafts locales. */
		onSaved: (updated: MediaItemView) => void;
		/** Tras un borrado con ÉXITO (Fase 6d): el llamador refresca el grid (la celda ya no existe,
		 *  mismo mecanismo que `onSaved`). */
		onDeleted: (id: RecordId) => void;
		/** Destino de foco de reserva para `MediaDeleteConfirm` (ver su cabecera): el `<h1>` de
		 *  `/media/+page.svelte`, `tabindex="-1"` — estable frente a un borrado con éxito, que se
		 *  lleva por delante este panel ENTERO (y con él, el botón "Borrar" al que restauraría el
		 *  foco por defecto). */
		fallbackFocusEl: HTMLElement | null;
	}

	let { item, onClose, onSaved, onDeleted, fallbackFocusEl }: Props = $props();

	const ctx = getVegaContext();

	let altDraft = $state('');
	let titleDraft = $state('');
	let tagsDraft = $state<string[]>([]);
	let tagInput = $state('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	// ————— Borrado (Fase 6d) —————
	/** `true` mientras se pide confirmar el borrado del asset abierto (abre `MediaDeleteConfirm`). */
	let confirmingDelete = $state(false);
	/** `true` mientras `ctx.port.delete` está en vuelo (deshabilita el botón "Borrar" de aquí y pasa
	 *  a `MediaDeleteConfirm.deleting`, que evita un doble envío por su lado). */
	let deletingAsset = $state(false);

	let dialogEl = $state<HTMLElement | null>(null);
	let altInputEl = $state<HTMLInputElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// Reasienta los drafts (baseline fresco) cada vez que se abre para `item`: única fuente de
	// "abrir" es `item` pasando de `null` a un valor.
	$effect(() => {
		if (!item) return;
		altDraft = item.alt;
		titleDraft = item.title;
		tagsDraft = item.tags;
		tagInput = '';
		saveError = null;
	});

	const dirty = $derived(
		item !== null &&
			(altDraft !== item.alt || titleDraft !== item.title || !tagsEqual(tagsDraft, item.tags))
	);

	const fullSrc = $derived(item ? resolveMediaFullSrc(ctx.port, item) : null);

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>('button, input'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		// Ver cabecera del componente ("Doble trampa de foco"): mientras `MediaDeleteConfirm` está
		// abierto, ES SU trampa la que debe reaccionar a Esc/Tab, no la de este diálogo — ambos
		// listeners viven en `document`, así que sin este guard `Escape` dispararía los dos.
		if (confirmingDelete) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = focusableItems();
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	$effect(() => {
		if (!item) return;

		previouslyFocused = document.activeElement as HTMLElement | null;
		altInputEl?.focus();

		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
		};
	});

	/** Cierra el diálogo — con cambios sin guardar, reutiliza el guard de salida de P5 (ver
	 *  cabecera). Ignorado mientras `saving` está en vuelo (mismo guard que `DeleteConfirm`). */
	function requestClose(): void {
		if (saving) return;
		if (dirty && !window.confirm(ctx.t('editor.leaveConfirm'))) return;
		onClose();
	}

	function handleAddTag(): void {
		tagsDraft = addTag(tagsDraft, tagInput);
		tagInput = '';
	}

	/** `Enter`/`,` añaden el tag en curso en vez de enviar el formulario (el `<form>` de abajo SÍ
	 *  guarda con `Enter` en `alt`/`title` — es el gesto esperado en un formulario corto; aquí se
	 *  intercepta explícitamente para que "añadir etiqueta" no dispare un guardado a medio teclear). */
	function handleTagInputKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			handleAddTag();
		}
	}

	function handleRemoveTag(tag: string): void {
		tagsDraft = removeTag(tagsDraft, tag);
	}

	async function handleSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!item || saving) return;
		saving = true;
		saveError = null;
		try {
			// LANDMINE (Svelte 5, cazada en e2e): `tagsDraft` es un `$state<string[]>` — Svelte 5
			// proxifica los arrays reactivos, y el adaptador `memory` clona el registro escrito con
			// `structuredClone` (`toVegaRecord`), que NO sabe clonar un `Proxy` (`DataCloneError` en
			// runtime, silencioso salvo por el `catch` de abajo → `reportError` con un mensaje que no
			// apuntaba a la causa real). `[...tagsDraft]` desproxifica a un array plano ANTES de que
			// cruce la frontera del puerto — mismo criterio que `to-record-input.ts` documenta para
			// otros widgets de P5 (un `$state` nunca cruza tal cual al puerto).
			const saved: VegaRecord = await ctx.port.update('vega_media', item.id, {
				alt: altDraft,
				title: titleDraft,
				tags: [...tagsDraft]
			});
			ctx.feedback.toast(ctx.t('media.detail.saveSuccess'), { kind: 'success' });
			onSaved(toMediaItemView(saved));
			onClose();
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al guardar el medio', err);
			if (vegaErr.kind === 'validation') {
				saveError = vegaErr.message;
			} else {
				ctx.feedback.reportError(vegaErr, { action: 'media:detail:save' });
			}
		} finally {
			saving = false;
		}
	}

	/** Abre `MediaDeleteConfirm` (ver cabecera del componente). Guard defensivo (mismo criterio que
	 *  `requestDelete` de P4, `/c/[type]/+page.svelte`): con un guardado o un borrado YA en vuelo,
	 *  ignora la petición. */
	function requestDeleteAsset(): void {
		if (saving || deletingAsset) return;
		confirmingDelete = true;
	}

	/** "Cancelar" o `Esc` en `MediaDeleteConfirm`: no borra nada. */
	function cancelDeleteAsset(): void {
		if (deletingAsset) return; // ignora mientras el borrado está en vuelo
		confirmingDelete = false;
	}

	/**
	 * Confirma el borrado (ver cabecera del componente, D-P6.5/audit H3). `label` se captura ANTES
	 * del `await` (mismo motivo que `confirmDelete` de P4: el toast de éxito debe quedar correcto
	 * pase lo que pase con `item` mientras el borrado está en vuelo).
	 */
	async function confirmDeleteAsset(): Promise<void> {
		if (!item || deletingAsset) return;
		const { id } = item;
		const label = mediaDisplayName(item);
		deletingAsset = true;
		try {
			await ctx.port.delete('vega_media', id);
			ctx.feedback.toast(ctx.t('media.delete.success', { label }), { kind: 'success' });
			confirmingDelete = false;
			onDeleted(id);
			onClose();
		} catch (err) {
			// Cualquier `kind` (incluidos 'forbidden'/'network') va a `reportError` (global, nunca
			// pantalla blanca): el asset NUNCA se quita de forma optimista, sigue en el grid tras
			// cerrar este diálogo.
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al borrar el medio', err);
			ctx.feedback.reportError(vegaErr, { action: 'media:detail:delete' });
			confirmingDelete = false;
		} finally {
			deletingAsset = false;
		}
	}
</script>

{#if item}
	<div class="vega-media-detail-backdrop">
		<div
			class="vega-media-detail-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-media-detail-title"
			bind:this={dialogEl}
		>
			<div class="vega-media-detail-header">
				<h2 id="vega-media-detail-title">{ctx.t('media.detail.title')}</h2>
				<button
					type="button"
					class="vega-media-detail-close"
					onclick={requestClose}
					aria-label={ctx.t('common.close')}
				>
					<Icon id="close" />
				</button>
			</div>

			<div class="vega-media-detail-preview">
				{#if fullSrc}
					<img src={fullSrc} alt={mediaImgAlt(item)} class="vega-media-detail-image" />
				{:else}
					<Icon id="document" size={48} title={mediaImgAlt(item)} />
				{/if}
			</div>

			<form onsubmit={handleSubmit} novalidate>
				{#if saveError}
					<p class="vega-media-detail-error" role="alert">{saveError}</p>
				{/if}

				<div class="vega-media-detail-field">
					<label for="vega-media-detail-alt">{ctx.t('media.detail.alt')}</label>
					<input
						id="vega-media-detail-alt"
						type="text"
						bind:value={altDraft}
						bind:this={altInputEl}
						disabled={saving}
					/>
				</div>

				<div class="vega-media-detail-field">
					<label for="vega-media-detail-title">{ctx.t('media.detail.titleLabel')}</label>
					<input
						id="vega-media-detail-title"
						type="text"
						bind:value={titleDraft}
						disabled={saving}
					/>
				</div>

				<div class="vega-media-detail-field">
					<span id="vega-media-detail-tags-label">{ctx.t('media.detail.tags')}</span>
					{#if tagsDraft.length > 0}
						<ul class="vega-media-detail-tags" aria-labelledby="vega-media-detail-tags-label">
							{#each tagsDraft as tag (tag)}
								<li class="vega-media-tag">
									{tag}
									<button
										type="button"
										onclick={() => handleRemoveTag(tag)}
										disabled={saving}
										aria-label={ctx.t('media.detail.removeTag', { tag })}
									>
										×
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<div class="vega-media-detail-tag-input">
						<input
							type="text"
							bind:value={tagInput}
							onkeydown={handleTagInputKeydown}
							disabled={saving}
							placeholder={ctx.t('media.detail.tagPlaceholder')}
							aria-label={ctx.t('media.detail.tagInputLabel')}
						/>
						<button
							type="button"
							onclick={handleAddTag}
							disabled={saving || normalizeTagInput(tagInput) === ''}
						>
							{ctx.t('media.detail.addTag')}
						</button>
					</div>
				</div>

				<div class="vega-media-detail-actions">
					<button
						type="button"
						class="vega-media-detail-delete"
						onclick={requestDeleteAsset}
						disabled={saving || deletingAsset}
					>
						{ctx.t('media.detail.delete')}
					</button>
					<div class="vega-media-detail-actions-primary">
						<button type="button" onclick={requestClose} disabled={saving}>
							{ctx.t('common.cancel')}
						</button>
						<button type="submit" disabled={saving}>
							{saving ? ctx.t('editor.saving') : ctx.t('editor.save')}
						</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Montado SIEMPRE (nunca dentro del `{#if item}` de arriba) — ver la cabecera de
     `MediaDeleteConfirm.svelte`: un borrado con éxito cierra ESTE panel entero en el mismo tick en
     que se cierra el diálogo de confirmación, y ambos deben poder completar su propia limpieza de
     foco sin que uno destruya al otro a mitad de esa carrera. -->
<MediaDeleteConfirm
	open={confirmingDelete}
	assetLabel={item ? mediaDisplayName(item) : ''}
	deleting={deletingAsset}
	{fallbackFocusEl}
	onConfirm={confirmDeleteAsset}
	onCancel={cancelDeleteAsset}
/>

<style>
	.vega-media-detail-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		/* Scrim theme-independiente (§3 no tiene token de velo) — allowlisted en
		   check-theme-coverage.mjs, mismo criterio que DeleteConfirm/ReloginModal/Sidebar. */
		background: rgb(15 17 21 / 55%);
	}

	.vega-media-detail-dialog {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
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

	.vega-media-detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.vega-media-detail-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-media-detail-close {
		border: none;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		padding: 0.2rem;
	}

	.vega-media-detail-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 8rem;
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--ink-2);
		overflow: hidden;
	}

	.vega-media-detail-image {
		max-width: 100%;
		max-height: 16rem;
		object-fit: contain;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.vega-media-detail-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.9rem;
	}

	.vega-media-detail-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.vega-media-detail-field label,
	.vega-media-detail-field > span {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.vega-media-detail-field input[type='text'] {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-media-detail-field input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.vega-media-detail-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-media-tag {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 0.8rem;
	}

	.vega-media-tag button {
		border: none;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0;
	}

	.vega-media-detail-tag-input {
		display: flex;
		gap: 0.4rem;
	}

	.vega-media-detail-tag-input input {
		flex: 1;
	}

	.vega-media-detail-tag-input button {
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-media-detail-tag-input button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-detail-actions {
		display: flex;
		/* "Borrar" (danger) a la izquierda, Cancelar/Guardar agrupados a la derecha (D-P6.5/6d): la
		   acción destructiva vive separada del par cancelar/guardar, nunca adyacente a "Guardar". */
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.vega-media-detail-actions-primary {
		display: flex;
		gap: 0.5rem;
	}

	.vega-media-detail-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-media-detail-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-media-detail-actions button[type='submit'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
	}

	/* Rol `danger` (mismos tokens que `DeleteConfirm`/P4, L-P4.11-alike). */
	.vega-media-detail-delete {
		border-color: var(--danger);
		background: var(--danger-soft);
		color: var(--danger);
		font-weight: 600;
	}
</style>
