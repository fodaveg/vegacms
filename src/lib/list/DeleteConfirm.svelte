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
	 *
	 * **Aviso de referencias (`#lote-integridad`, Fase A)**: al abrirse, consulta el motor de
	 * referencias (`createDeleteReferencesGuard`, mismo estado reactivo que usa
	 * `MediaDeleteConfirm`) para `targetCollection`/`targetId`. Con algo que mostrar (referencias
	 * reales o un degradado parcial que no permite descartarlas, `guard.needsExplicitConfirm`), el
	 * botón "Borrar" exige ADEMÁS el checkbox de abajo — la "confirmación explícita adicional" del
	 * contrato — nunca lo bloquea de forma permanente: basta un click más. Un fallo TOTAL de la
	 * comprobación (`guard.status.kind === 'error'`, en la práctica solo por un bug defensivo, ver
	 * cabecera de `references.ts`) NUNCA añade esa fricción — el borrado sigue con su único
	 * `aria-disabled` de siempre (`deleting`), con un aviso de "no se pudo comprobar" en contexto.
	 *
	 * **La línea "restaurar no reconecta relaciones" (fix de code-review contra PocketBase 0.39.6)**:
	 * `hasRelationMatches(guard.status.report)` — MEDIDO, no supuesto: al borrar el destino de una
	 * relación, PB limpia ese campo en el acto (single→`''`, múltiple→quita el id del array), y
	 * restaurar el registro con su id original NUNCA lo reconecta (ver `docs/POCKETBASE-
	 * INTEGRATION.md`). Se pinta SOLO si hay al menos una coincidencia CONFIRMADA (`status:'ok'`)
	 * por la vía `'relation'` — un aviso de más sobre referencias por texto/URL (que sí se
	 * benefician del id vivo de nuevo) sería tan falso como no avisar nada.
	 *
	 * `targetCollection`/`targetId` son OPCIONALES (`''`/`null` por defecto = sin comprobación,
	 * comportamiento IDÉNTICO al de antes de este lote). Los TRES llamantes que borran un registro
	 * concreto los pasan siempre: `/c/[type]/+page.svelte` (fila del listado), `RecordForm.svelte`
	 * (registro abierto en el editor) y `RecordBlocks.svelte` (un bloque, cuya colección se lee del
	 * propio registro y no del padre — un bloque vive en la colección hija). Que sigan siendo
	 * opcionales no es deuda: `MediaDeleteConfirm.svelte` tiene un camino de selección MÚLTIPLE
	 * donde a propósito no se comprueba nada (ver su cabecera), y un `''`/`null` explícito es cómo
	 * se dice "aquí no preguntes" sin inventar un tercer prop.
	 *
	 * **La línea de la papelera (`#lote-integridad`, Fase B §4/§10.3)**: `isTrashAvailable(ctx.model)`
	 * (síncrono, sin red, ver su cabecera) decide entre "recuperable N días" (`ctx.model.revisions.
	 * trashDays`) y "este borrado será DEFINITIVO" — nunca promete papelera si el decorador
	 * (`with-revisions.ts`) no va a poder cumplirla. `hasFiles` (prop, opcional, `false` por
	 * defecto) añade la línea "los ficheros adjuntos no se recuperan" cuando el registro pendiente
	 * tiene campos `file` con valor: el llamador la calcula (ya tiene el `ResolvedContentType` y los
	 * valores del registro a mano) con `hasFileValues` (`revisions/restore.ts`) — este componente no
	 * conoce el esquema del registro que borra, solo pinta lo que le dicen.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { RecordId } from '$lib/backend/types';
	import { createDeleteReferencesGuard } from '$lib/integrity/delete-guard.svelte';
	import { hasRelationMatches } from '$lib/integrity/references';
	import ReferencesSummary from '$lib/integrity/ReferencesSummary.svelte';
	import { isTrashAvailable } from '$lib/revisions/trash-availability';

	interface Props {
		/** `true` mientras haya un registro pendiente de confirmar (lo decide `+page.svelte`). */
		open: boolean;
		/** Texto que identifica el registro a borrar (mismo `openText` de la fila, D-P4.11: "QUÉ se
		 *  borra"), o el fallback i18n `list.untitled` si no hay campo-título resoluble. */
		recordLabel: string;
		/** Colección del registro pendiente (`contentType.name`), o `''` para omitir la comprobación
		 *  de referencias entera (ver cabecera: caso de los llamantes aún sin actualizar). */
		targetCollection?: string;
		/** Id del registro pendiente, o `null` para omitir la comprobación (ver cabecera) — también
		 *  el valor mientras no hay ningún registro pendiente (`open` es la señal real de apertura). */
		targetId?: RecordId | null;
		/** `true` mientras `ctx.port.delete` está en vuelo: `aria-disabled` en ambos botones (evita
		 *  un doble envío, vía el guard de `handleCancel`/`handleConfirm`) y cambia el texto de
		 *  "Borrar" a "Borrando…". Deliberadamente NUNCA `disabled` HTML (ver cabecera: vaciaría el
		 *  trap de foco). */
		deleting: boolean;
		/** Destino de foco si `previouslyFocused` ya no está en el documento al cerrar (ver
		 *  cabecera: el caso real es un borrado con éxito que se llevó la fila por delante). */
		fallbackFocusEl: HTMLElement | null;
		/** `true` si el registro pendiente tiene campos `file` con valor (ver cabecera): añade el
		 *  aviso "los ficheros adjuntos no se recuperan". Default `false` (comportamiento previo). */
		hasFiles?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		recordLabel,
		targetCollection = '',
		targetId = null,
		deleting,
		fallbackFocusEl,
		hasFiles = false,
		onConfirm,
		onCancel
	}: Props = $props();

	const ctx = getVegaContext();

	// ————— La línea de la papelera (ver cabecera) —————
	const trashAvailable = $derived(isTrashAvailable(ctx.model));

	// ————— Diálogo modal cancelable: foco atrapado + foco inicial seguro (ver cabecera) —————
	let dialogEl = $state<HTMLElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// ————— Aviso de referencias (ver cabecera) —————
	const guard = createDeleteReferencesGuard();
	/** Checkbox de confirmación explícita adicional (`guard.needsExplicitConfirm`): se reasienta a
	 *  `false` en CADA apertura (ver `$effect` de abajo) — nunca hereda el "sí" de un borrado
	 *  anterior sobre otro registro. */
	let agreedDespiteReferences = $state(false);

	$effect(() => {
		// Dependencias explícitas: reabrir (o cambiar de registro pendiente) siempre reinicia el
		// checkbox y relanza la comprobación — nunca arrastra el resultado de OTRO registro.
		void open;
		void targetCollection;
		void targetId;
		agreedDespiteReferences = false;
		if (!open || targetId === null || targetCollection === '') {
			guard.reset();
			return;
		}
		guard.check(ctx, { collection: targetCollection, id: targetId });
	});

	/** `true` cuando el gate de referencias impide confirmar TODAVÍA (falta el checkbox) — nunca
	 *  cuando la comprobación está en vuelo o falló del todo (ver cabecera: eso NUNCA bloquea). */
	const blockedByReferences = $derived(guard.needsExplicitConfirm && !agreedDespiteReferences);

	/** Guard compartido de `deleting`/`blockedByReferences` (ver cabecera): el click/`Enter` en
	 *  cualquiera de los dos botones es un no-op mientras el borrado está en vuelo o falta el
	 *  checkbox exigido, en vez de sacarlos del `Tab`. */
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

			<!-- La línea de la papelera (§4/§10.3, ver cabecera): nunca promete lo que el decorador
			     no puede cumplir. -->
			<p class="vega-delete-trash-hint" data-trash-available={trashAvailable}>
				{trashAvailable
					? ctx.t('revisions.trash.deleteHint', { days: ctx.model.revisions.trashDays })
					: ctx.t('revisions.trash.deleteHintUnavailable')}
			</p>
			{#if hasFiles}
				<p class="vega-delete-trash-hint">{ctx.t('revisions.trash.deleteFilesHint')}</p>
			{/if}

			<!-- Aviso de referencias (ver cabecera del script): cuatro estados posibles, nunca un
			     quinto silencioso — comprobando / con algo que confirmar / degradado sin bloquear /
			     nada más que decir (guard sigue en 'ready' con needsExplicitConfirm false, sin marcado
			     propio). -->
			{#if guard.status.kind === 'loading'}
				<p class="vega-delete-refs-checking" aria-live="polite">
					{ctx.t('integrity.deleteGuard.checking')}
				</p>
			{:else if guard.status.kind === 'error'}
				<p class="vega-delete-refs-failed">{ctx.t('integrity.deleteGuard.checkFailed')}</p>
			{:else if guard.status.kind === 'ready' && guard.needsExplicitConfirm}
				<div class="vega-delete-refs">
					<p class="vega-delete-refs-warning">{ctx.t('integrity.deleteGuard.warning')}</p>
					<ReferencesSummary report={guard.status.report} />
					{#if hasRelationMatches(guard.status.report)}
						<p class="vega-delete-refs-relation-note">
							{ctx.t('integrity.deleteGuard.relationWarning')}
						</p>
					{/if}
					<label class="vega-delete-refs-agree">
						<input type="checkbox" bind:checked={agreedDespiteReferences} />
						{ctx.t('integrity.deleteGuard.confirmCheckbox')}
					</label>
				</div>
			{/if}

			<div class="vega-delete-actions">
				<button type="button" aria-disabled={deleting} bind:this={cancelEl} onclick={handleCancel}>
					{ctx.t('common.cancel')}
				</button>
				<button
					type="button"
					class="vega-delete-confirm"
					aria-disabled={deleting || blockedByReferences}
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
		/* El aviso de referencias (ver script) puede traer una lista de registros: sin este tope el
		   diálogo crecería más que el viewport en el caso límite "asset usado en 200 sitios". */
		max-height: calc(100vh - 2 * var(--vega-space-gutter));
		overflow-y: auto;
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

	/* La línea de la papelera (ver script): mismo tono que el resto del cuerpo, nunca --danger —
	   informa, no advierte (el aviso de referencias de abajo ya usa --warning para lo que sí lo
	   necesita). */
	.vega-delete-trash-hint {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.82rem;
	}

	.vega-delete-refs-checking {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-delete-refs-failed {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-delete-refs {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.7rem;
		border: 1px solid var(--warning);
		border-radius: 8px;
		background: var(--warning-soft);
	}

	.vega-delete-refs-warning {
		margin: 0;
		color: var(--warning);
		font-weight: 600;
		font-size: 0.85rem;
	}

	/* La línea "restaurar no reconecta relaciones" (ver script): mismo tono discreto que las líneas
	   informativas de fuera de la caja, dentro del recuadro de aviso. */
	.vega-delete-refs-relation-note {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.8rem;
	}

	.vega-delete-refs-agree {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-delete-refs-agree input {
		margin-top: 0.15rem;
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
