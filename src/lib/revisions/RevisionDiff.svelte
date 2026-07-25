<script lang="ts">
	/**
	 * `RevisionDiff.svelte` (`#lote-integridad`, Fase B §9/§8·B1): diff de UNA revisión contra la
	 * versión VIVA del registro (§2 del contrato: "el diff siempre es revisión ↔ versión viva,
	 * nunca revisión ↔ revisión" — la versión viva NUNCA está en `vega_revisions`). Montado por
	 * `RevisionsPanel.svelte` cuando la persona abre una entrada del historial.
	 *
	 * Carga la versión viva con `ctx.port.get` (un solo `get`, no hay lista que paginar) y calcula
	 * el diff con `diffRecordValues` (módulo puro). Para PINTAR cada valor reutiliza
	 * `describeCell` (`$lib/list/cell.ts`, §9 del contrato: "no inventes un segundo formateador de
	 * valores") — `cellText` de aquí abajo solo aplana el `CellDescriptor` resultante a una cadena
	 * corta, el mismo tipo de aplanado que ya hace `RecordTable.svelte` para su columna-título.
	 *
	 * "Restaurar en el formulario" (§8·B1): llama a `onRestore(revision.values)` — el CAMINO que
	 * `RecordForm.svelte` expone (`applyRestoredValues`, ver su cabecera) para cargar esos valores
	 * en el formulario como cambios SIN GUARDAR. Este componente no escribe nada al puerto.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import { describeCell, type CellDescriptor } from '$lib/list/cell';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { FormInputValues } from '$lib/form/dirty';
	import { diffRecordValues, type FieldDiff } from './diff';
	import type { RevisionRecord } from './revision';

	interface Props {
		type: ResolvedContentType;
		recordId: RecordId;
		revision: RevisionRecord;
		onRestore: (values: FormInputValues) => void;
		onBack: () => void;
	}

	let { type, recordId, revision, onRestore, onBack }: Props = $props();

	const ctx = getVegaContext();

	type Status = 'loading' | 'ready' | 'error';

	let status = $state<Status>('loading');
	let diffs = $state<FieldDiff[]>([]);

	async function load(): Promise<void> {
		status = 'loading';
		try {
			const live: VegaRecord = await ctx.port.get(type.name, recordId);
			diffs = diffRecordValues(
				type.fields.map((f) => f.schema),
				revision.values,
				live.values
			);
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	// Reinicio por cambio de destino (misma landmine que `UsedInPanel`, ver su cabecera): si
	// `revision`/`recordId` cambian mientras el componente sigue montado, nunca debe arrastrarse
	// el diff de la revisión/registro anterior.
	$effect(() => {
		void revision.id;
		void recordId;
		void load();
	});

	/** Etiqueta legible del campo (§9: se pinta con el mismo `label` que el formulario), o el
	 *  nombre crudo si por lo que sea el campo ya no existe en el tipo actual (esquema cambiado
	 *  desde que se guardó la revisión — L11, degradar sin crashear). */
	function fieldLabel(name: string): string {
		return type.fields.find((f) => f.name === name)?.label ?? name;
	}

	/** Aplana un `CellDescriptor` a texto corto (ver cabecera): mismo vocabulario de `kind` que
	 *  `RecordTable.svelte`, sin sus ramas de miniatura/enlace (aquí no hay `record`/`fileUrl` que
	 *  resolver, solo un valor de comparación). */
	function cellText(descriptor: CellDescriptor): string {
		switch (descriptor.kind) {
			case 'empty':
				return ctx.t('revisions.diff.empty');
			case 'text':
			case 'richtext':
			case 'mono':
			case 'number':
			case 'date':
				return descriptor.text;
			case 'bool':
				return descriptor.value ? ctx.t('list.cell.yes') : ctx.t('list.cell.no');
			case 'select-multi':
				return descriptor.values.length > 0
					? descriptor.values.join(', ')
					: ctx.t('revisions.diff.empty');
			case 'relation':
				return ctx.t('revisions.diff.relationCount', { count: descriptor.count });
			case 'file':
				return descriptor.refs.length > 0
					? descriptor.refs.join(', ')
					: ctx.t('revisions.diff.empty');
		}
	}

	/** `undefined` (campo ausente en ese lado, §9) se pinta como "no existía" — distinto de un
	 *  valor vacío de verdad (`revisions.diff.empty`, "—"), para no confundir "faltaba el campo"
	 *  con "el campo estaba vacío". */
	function sideText(diff: FieldDiff, side: 'before' | 'after'): string {
		const value = side === 'before' ? diff.before : diff.after;
		if (value === undefined) return ctx.t('revisions.diff.absent');
		const field = type.fields.find((f) => f.name === diff.field);
		if (!field) return ctx.t('revisions.diff.absent');
		return cellText(describeCell(field, value, ctx.locale));
	}

	const changedDiffs = $derived(diffs.filter((d) => d.status !== 'same'));
</script>

<div class="vega-revision-diff">
	<button type="button" class="vega-revision-diff-back" onclick={onBack}>
		{ctx.t('revisions.diff.back')}
	</button>

	{#if status === 'loading'}
		<p aria-live="polite">{ctx.t('revisions.diff.loading')}</p>
	{:else if status === 'error'}
		<p class="vega-revision-diff-error" role="alert">
			{ctx.t('revisions.diff.error')}
			<button type="button" onclick={() => void load()}>{ctx.t('revisions.diff.retry')}</button>
		</p>
	{:else if changedDiffs.length === 0}
		<p class="vega-revision-diff-empty">{ctx.t('revisions.diff.noChanges')}</p>
	{:else}
		<ul class="vega-revision-diff-list">
			{#each changedDiffs as diff (diff.field)}
				<li class="vega-revision-diff-row" data-diff-status={diff.status}>
					<span class="vega-revision-diff-label">{fieldLabel(diff.field)}</span>
					<span class="vega-revision-diff-values">
						<span class="vega-revision-diff-before">{sideText(diff, 'before')}</span>
						<span class="vega-revision-diff-arrow" aria-hidden="true">→</span>
						<span class="vega-revision-diff-after">{sideText(diff, 'after')}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		class="vega-revision-diff-restore"
		disabled={status !== 'ready'}
		onclick={() => onRestore(revision.values)}
	>
		{ctx.t('revisions.diff.restore')}
	</button>
</div>

<style>
	.vega-revision-diff {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.vega-revision-diff-back {
		align-self: flex-start;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--accent-text);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-revision-diff-back:hover {
		text-decoration: underline;
	}

	.vega-revision-diff-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-revision-diff-empty {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-revision-diff-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-revision-diff-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-revision-diff-label {
		font-weight: 600;
		font-size: 0.82rem;
		color: var(--ink);
	}

	.vega-revision-diff-values {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.35rem;
		font-family: var(--mono);
		font-size: 0.78rem;
		overflow-wrap: anywhere;
	}

	.vega-revision-diff-before {
		color: var(--danger);
		text-decoration: line-through;
	}

	.vega-revision-diff-arrow {
		color: var(--ink-3);
	}

	.vega-revision-diff-after {
		color: var(--ok);
	}

	.vega-revision-diff-restore {
		align-self: flex-start;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--accent-line);
		border-radius: 6px;
		background: var(--accent-soft);
		color: var(--accent-text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-revision-diff-restore:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
