<script lang="ts">
	/**
	 * `RevisionsPanel.svelte` (`#lote-integridad`, Fase B §10.1): panel "Historial" del aside del
	 * editor — mismo patrón que `UsedInPanel.svelte` (Fase A): colapsado por defecto, la lista de
	 * revisiones solo se pide al expandir (`toggle()`), nunca en el render inicial del formulario.
	 *
	 * Montado en `RecordForm.svelte`, junto al panel "Se usa en" (ver su cabecera para el orden:
	 * "Historial" va justo encima, antes de la zona de peligro). Solo con un registro que ya existe
	 * (`existingRecordId !== null` en `RecordForm`): en `/new` no hay historial que mostrar.
	 *
	 * **`'unavailable'` vs `'error'`**: un `VegaError('not-found')` al listar `vega_revisions`
	 * significa "el proyecto no ha activado el historial todavía" (la colección no existe) — un
	 * mensaje HONESTO y distinto de "hubo un fallo, reintenta" (§4 del contrato: "la UI no debe
	 * mentir"). Cualquier otro error cae a `'error'` con reintento.
	 *
	 * Al elegir una revisión de la lista se monta `RevisionDiff.svelte` (diff + "Restaurar en el
	 * formulario"); `onRestore` es el mismo callback que recibe este panel de `RecordForm`, pasado
	 * tal cual — este componente no interpreta los valores restaurados, solo los transporta.
	 *
	 * **`refreshToken`**: mismo patrón que `EditorRail.reloadToken`/`PreviewPanel.refreshToken` —
	 * `RecordForm` lo cablea a su `savedCount` (sube en CADA guardado con éxito). Un guardado
	 * real es la única vez que este registro puede tener una revisión NUEVA (la acaba de crear el
	 * decorador `withRevisions` sobre el `update` que ese guardado disparó), así que invalida la
	 * lista cacheada — si el panel ya estaba ABIERTO, recarga EN SITIO (nunca lo colapsa: cerrar
	 * de golpe un panel que la persona tenía abierto justo al guardar sería una sorpresa
	 * desagradable); si estaba colapsado, solo marca la caché como stale para la PRÓXIMA apertura
	 * (sigue sin pagar la consulta si nadie la pide, misma ley que el resto del panel).
	 *
	 * **Etiqueta de cada entrada (fix de code-review, L11)**: `revisionLabel()` deriva el texto
	 * mostrado del `titleField` YA resuelto de `type` (un `ResolvedContentType`, disponible AQUÍ a
	 * diferencia de la capa que escribe `vega_revisions.label`, ver `record-label.ts`) — el `label`
	 * almacenado queda como reserva. La papelera de B2 reutilizará el mismo criterio.
	 */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { RecordId } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { RequestSequencer } from '$lib/list/list-load';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { FormInputValues } from '$lib/form/dirty';
	import { parseRevisionRecord, type RevisionRecord } from './revision';
	import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
	import RevisionDiff from './RevisionDiff.svelte';

	interface Props {
		type: ResolvedContentType;
		recordId: RecordId;
		onRestore: (values: FormInputValues) => void;
		/** Ver cabecera: sube en cada guardado con éxito (`RecordForm.savedCount`). Opcional para
		 *  no romper otros montajes futuros que no tengan ese contador a mano. */
		refreshToken?: number;
	}

	let { type, recordId, onRestore, refreshToken = 0 }: Props = $props();

	const ctx = getVegaContext();

	/** Tamaño de página del historial (§10.1 no fija un número; 20 basta para un panel lateral —
	 *  no hay paginación en B1, ver informe de la Fase). */
	const REVISIONS_PAGE_SIZE = 20;

	type Status = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

	let expanded = $state(false);
	let status = $state<Status>('idle');
	let revisions = $state<RevisionRecord[]>([]);
	/** Revisión abierta en `RevisionDiff` (`null` = se ve la lista). */
	let selected = $state<RevisionRecord | null>(null);

	// Anti-carrera, mismo motivo/mismo mecanismo que `UsedInPanel` (ver su cabecera: `load()` NUNCA
	// lee `status` de forma síncrona, así que el `RequestSequencer` no un simple guard de estado).
	const sequencer = new RequestSequencer();

	async function load(): Promise<void> {
		const seq = sequencer.next();
		status = 'loading';
		try {
			const page = await ctx.port.list(VEGA_REVISIONS_COLLECTION.name, {
				filter: {
					kind: 'group',
					combinator: 'and',
					nodes: [
						{ kind: 'cond', field: 'collection', op: 'eq', value: type.name },
						{ kind: 'cond', field: 'recordId', op: 'eq', value: recordId }
					]
				},
				sort: [{ field: 'created', dir: 'desc' }],
				perPage: REVISIONS_PAGE_SIZE
			});
			if (!sequencer.isLatest(seq)) return;
			revisions = page.items
				.map(parseRevisionRecord)
				.filter((r): r is RevisionRecord => r !== null);
			status = 'ready';
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			status = err instanceof VegaError && err.kind === 'not-found' ? 'unavailable' : 'error';
		}
	}

	function toggle(): void {
		expanded = !expanded;
		if (expanded && status === 'idle') void load();
	}

	// Reinicio por cambio de destino (mismo criterio que `UsedInPanel`): un raíl de hermanos puede
	// cambiar `recordId` sin desmontar `RecordForm`/este panel — nunca debe arrastrar el historial
	// del registro anterior. A diferencia del refresco de guardado (más abajo), este SÍ colapsa:
	// es un registro DISTINTO, no tiene sentido dejar abierto el historial de otro documento.
	$effect(() => {
		void type.name;
		void recordId;
		status = 'idle';
		revisions = [];
		selected = null;
		expanded = false;
	});

	// Refresco tras guardar (ver cabecera, `refreshToken`): invalida la caché SIN colapsar el
	// panel si ya estaba abierto — `untrack` sobre `expanded` a propósito: esta rama decide si
	// recarga EN SITIO, pero no debe convertirse en una dependencia más del efecto (un toggle
	// manual del usuario ya lo gestiona `toggle()`, no hace falta que este efecto reaccione
	// también a esa misma escritura).
	$effect(() => {
		void refreshToken;
		status = 'idle';
		selected = null;
		if (untrack(() => expanded)) void load();
	});

	function openRevision(revision: RevisionRecord): void {
		selected = revision;
	}

	function backToList(): void {
		selected = null;
	}

	function dateLabel(revision: RevisionRecord): string {
		if (revision.created === null) return ctx.t('revisions.panel.unknownDate');
		const parsed = new Date(revision.created);
		if (Number.isNaN(parsed.getTime())) return ctx.t('revisions.panel.unknownDate');
		return new Intl.DateTimeFormat(ctx.locale, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(parsed);
	}

	function authorLabel(revision: RevisionRecord): string {
		return revision.author !== '' ? revision.author : ctx.t('revisions.panel.unknownAuthor');
	}

	/**
	 * Etiqueta MOSTRADA de una entrada del historial (fix de code-review, §10.1/L11): a diferencia
	 * del `label` almacenado en el registro (heurístico ciego `guessRecordLabel`, capa P3 SIN
	 * `ContentModel` — ver la cabecera de `record-label.ts`), aquí sí tenemos el `titleField` YA
	 * resuelto (prop `type`, un `ResolvedContentType`) — un tipo cuyo campo título se llame p. ej.
	 * `headline` deja de enseñar el id crudo que `guessRecordLabel` habría devuelto. El `label`
	 * almacenado queda como RESERVA: sin `titleField` declarado, o si esta revisión concreta no
	 * trae un valor de texto usable en ese campo (esquema cambiado desde que se guardó). */
	function revisionLabel(revision: RevisionRecord): string {
		if (type.titleField !== null) {
			const raw = revision.values[type.titleField];
			if (typeof raw === 'string' && raw.trim() !== '') return raw;
		}
		return revision.label;
	}

	function handleRestore(values: FormInputValues): void {
		onRestore(values);
		selected = null;
		ctx.feedback.toast(ctx.t('revisions.restoredToast'));
	}
</script>

<div class="vega-revisions-panel" data-revisions-status={status}>
	<button type="button" class="vega-revisions-toggle" aria-expanded={expanded} onclick={toggle}>
		{ctx.t('revisions.panel.toggle')}
	</button>

	{#if expanded}
		<div class="vega-revisions-body">
			{#if status === 'loading'}
				<p class="vega-revisions-loading" aria-live="polite">
					{ctx.t('revisions.panel.loading')}
				</p>
			{:else if status === 'unavailable'}
				<p class="vega-revisions-unavailable">{ctx.t('revisions.panel.unavailable')}</p>
			{:else if status === 'error'}
				<p class="vega-revisions-error" role="alert">
					{ctx.t('revisions.panel.error')}
					<button type="button" onclick={() => void load()}>
						{ctx.t('revisions.panel.retry')}
					</button>
				</p>
			{:else if status === 'ready' && selected}
				<RevisionDiff
					{type}
					{recordId}
					revision={selected}
					onRestore={handleRestore}
					onBack={backToList}
				/>
			{:else if status === 'ready'}
				{#if revisions.length === 0}
					<p class="vega-revisions-empty">{ctx.t('revisions.panel.empty')}</p>
				{:else}
					<ul class="vega-revisions-list">
						{#each revisions as revision (revision.id)}
							<li>
								<button
									type="button"
									class="vega-revisions-item"
									onclick={() => openRevision(revision)}
								>
									<span class="vega-revisions-item-label">{revisionLabel(revision)}</span>
									<span class="vega-revisions-item-meta">
										<span class="vega-revisions-item-date">{dateLabel(revision)}</span>
										<span class="vega-revisions-item-author">{authorLabel(revision)}</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.vega-revisions-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-revisions-toggle {
		align-self: flex-start;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-revisions-toggle:hover {
		border-color: var(--line-strong);
		color: var(--ink);
	}

	.vega-revisions-toggle[aria-expanded='true'] {
		border-color: var(--accent-line);
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	.vega-revisions-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.vega-revisions-loading,
	.vega-revisions-empty,
	.vega-revisions-unavailable {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-revisions-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-revisions-error button {
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-revisions-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-revisions-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		width: 100%;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.82rem;
		text-align: left;
		cursor: pointer;
	}

	.vega-revisions-item:hover {
		border-color: var(--line-strong);
		background: var(--active);
	}

	.vega-revisions-item-label {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.vega-revisions-item-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
	}

	.vega-revisions-item-date {
		font-family: var(--mono);
		font-size: 0.78rem;
	}

	.vega-revisions-item-author {
		color: var(--ink-2);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}
</style>
