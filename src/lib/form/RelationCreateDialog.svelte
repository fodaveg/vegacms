<script lang="ts">
	/** L12: creación independiente en un único modal, con el controlador/campos de P5. */
	import { tick, untrack } from 'svelte';
	import type { ResolvedContentType } from '$lib/model/types';
	import type { RecordInput, VegaRecord } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import RecordForm from './RecordForm.svelte';
	import {
		relationCreationModel,
		relationCreationUnavailable,
		canCreateRelationTarget
	} from './relation-create';
	import { isFieldValidationError } from './field-errors';
	import { candidatesFromPage, supportsTitleSearch } from './widgets/relation-search';

	interface Props {
		type: ResolvedContentType;
		canCreate: boolean;
		term: string;
		opener: HTMLElement | null;
		fallback: HTMLElement | null;
		onClose: () => void;
		/** false = creación confirmada pero imposible de incorporar al padre. */
		onCreated: (record: VegaRecord) => boolean;
	}
	let { type, canCreate, term, opener, fallback, onClose, onCreated }: Props = $props();
	const ctx = getVegaContext();
	const model = untrack(() => relationCreationModel(type, term));
	let form = $state<{ requestSubmit: () => void } | undefined>();
	let dirty = $state(false);
	let sending = $state(false);
	let formBusy = $state(false);
	const busy = $derived(sending || formBusy);
	let confirming = $state(false);
	let keepButton = $state<HTMLButtonElement | undefined>();
	let localError = $state<string | null>(null);
	let uncertain = $state(false);
	let validationFailed = $state(false);
	let confirmed = $state.raw<VegaRecord | null>(null);
	let reconciliation = $state<VegaRecord[]>([]);
	let searched = $state(false);
	let submitted = $state.raw<RecordInput>({});
	let reconcileField = $state<string | null>(null);
	const unavailable = $derived(relationCreationUnavailable(type));
	const params = $derived({ label: type.labelSingular });

	/** El portal saca el form hijo del form padre; al desmontar Svelte retira sus nodos. */
	let parentForm: HTMLFormElement | null = null;
	let parentWasInert = false;
	function finishClose(): void {
		if (parentForm) parentForm.inert = parentWasInert;
		onClose();
	}
	function portal(node: HTMLElement): { destroy: () => void } {
		parentForm = node.closest('form');
		if (parentForm) {
			parentWasInert = parentForm.inert;
			parentForm.inert = true;
		}
		document.body.appendChild(node);
		return {
			destroy: () => {
				if (parentForm) parentForm.inert = parentWasInert;
				node.remove();
			}
		};
	}

	async function close(): Promise<void> {
		if (busy) return;
		if ((dirty || uncertain) && !confirmed) {
			confirming = true;
			await tick();
			keepButton?.focus();
		} else finishClose();
	}

	async function keepEditing(): Promise<void> {
		confirming = false;
		await tick();
		const first = document.querySelector<HTMLElement>(
			'[data-relation-create] input:not([disabled]), [data-relation-create] textarea:not([disabled]), [data-relation-create] select:not([disabled])'
		);
		first?.focus();
	}

	async function submit(input: RecordInput): Promise<VegaRecord> {
		if (
			sending ||
			uncertain ||
			confirmed ||
			unavailable ||
			!canCreate ||
			!canCreateRelationTarget(type)
		)
			throw VegaError.backend('Creación bloqueada');
		sending = true;
		localError = null;
		validationFailed = false;
		reconciliation = [];
		searched = false;
		submitted = input;
		reconcileField = supportsTitleSearch(type) ? type.titleField : null;
		try {
			const saved = await ctx.port.create(type.name, input);
			// Conserva el éxito de red incluso si un gancho o la incorporación posterior fallan.
			confirmed = saved;
			return saved;
		} catch (error) {
			const err = error instanceof VegaError ? error : VegaError.backend('Error al crear', error);
			if (err.kind === 'network') uncertain = true;
			validationFailed = isFieldValidationError(err);
			if (
				isFieldValidationError(err) &&
				type.slugField &&
				err.fieldErrors?.[type.slugField] &&
				typeof submitted[type.slugField] === 'string'
			)
				reconcileField = type.slugField;
			if (!isFieldValidationError(err))
				localError = uncertain ? ctx.t('form.relation.createUncertain') : err.message;
			throw err; // RecordForm conserva valores, mapea campos y delega a feedback de P3.
		} finally {
			sending = false;
		}
	}

	function saved(record: VegaRecord): void {
		if (onCreated(record)) finishClose();
		else {
			confirmed = record;
			localError = ctx.t('form.relation.createPartial', params);
		}
	}

	/** Solo muestra registros que el puerto devuelve. Un listado vacío no prueba ausencia. */
	async function reconcile(): Promise<void> {
		if (busy) return;
		const title = reconcileField === null ? null : submitted[reconcileField];
		if (reconcileField !== null && typeof title !== 'string') return;
		sending = true;
		try {
			const page = await ctx.port.list(type.name, {
				filter:
					reconcileField !== null && typeof title === 'string'
						? { kind: 'cond', field: reconcileField, op: 'eq', value: title }
						: undefined,
				perPage: 20
			});
			reconciliation = page.items;
			searched = true;
		} catch (error) {
			ctx.feedback.reportError(
				error instanceof VegaError ? error : VegaError.backend('Error al buscar', error),
				{ action: 'relation:reconcile' }
			);
		} finally {
			sending = false;
		}
	}
</script>

<div use:portal data-relation-create>
	<AdminDialog
		open={true}
		title={ctx.t(confirming ? 'form.relation.createDiscard' : 'form.relation.createTitle', params)}
		{busy}
		returnFocusEl={opener}
		fallbackFocusEl={fallback}
		onClose={() => {
			if (confirming) void keepEditing();
			else void close();
		}}
	>
		<div hidden={confirming}>
			<p class="vega-admin-dialog-text">{ctx.t('form.relation.createPersistence', params)}</p>
			{#if !canCreate && !confirmed}<p class="vega-admin-dialog-text" role="status">
					{ctx.t('form.relation.createContextChanged')}
				</p>{/if}
			{#if unavailable}
				<p role="alert">{ctx.t('form.relation.createUnavailable')}</p>
			{/if}
			<RecordForm
				{type}
				{model}
				typeReadonly={type.readonly || confirmed !== null}
				presentation="relation"
				submitBlocked={uncertain || unavailable || busy || !canCreate || confirmed !== null}
				onSubmit={submit}
				onSaved={saved}
				onCancel={() => void close()}
				onStateChange={(state) => {
					dirty = state.dirty;
					formBusy = state.busy;
				}}
				bind:this={form}
			/>
			{#if localError}<p class="vega-admin-dialog-text" role="alert">{localError}</p>{/if}
			{#if confirmed}<p class="vega-admin-dialog-text">{confirmed.id}</p>{/if}
			{#if !confirmed && (uncertain || validationFailed)}
				<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={busy}
					onclick={() => void reconcile()}>{ctx.t('form.relation.createReconcile')}</button
				>
			{/if}
			{#if searched}<p class="vega-admin-dialog-text">
					{ctx.t('form.relation.createSearchLimit')}
				</p>{/if}
			{#each candidatesFromPage({ items: reconciliation, page: 1, perPage: 20, totalPages: 1, totalItems: reconciliation.length }, type.titleField) as candidate (candidate.id)}
				<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={busy}
					onclick={() => {
						if (!busy) saved(reconciliation.find((record) => record.id === candidate.id)!);
					}}>{ctx.t('form.relation.createUseExisting', { name: candidate.title })}</button
				>
			{/each}
		</div>
		{#if confirming}<p class="vega-admin-dialog-text">
				{ctx.t('form.relation.createDiscardBody', params)}{uncertain
					? ` ${ctx.t('form.relation.createUncertain')}`
					: ''}
			</p>{/if}
		{#snippet actions()}
			{#if confirming}
				<button
					type="button"
					class="vega-admin-btn"
					data-autofocus
					bind:this={keepButton}
					onclick={() => void keepEditing()}>{ctx.t('form.relation.createKeepEditing')}</button
				>
				<button type="button" class="vega-admin-btn" onclick={finishClose}
					>{ctx.t('form.relation.createDiscardConfirm')}</button
				>
			{:else}
				<button
					type="button"
					class="vega-admin-btn"
					aria-disabled={busy}
					onclick={() => void close()}>{ctx.t('common.cancel')}</button
				>
				{#if !confirmed}<button
						type="button"
						class="vega-admin-btn vega-admin-btn--primary"
						aria-disabled={busy || uncertain || unavailable || !canCreate}
						onclick={() => {
							if (!busy && !uncertain && !unavailable && canCreate) form?.requestSubmit();
						}}>{ctx.t(busy ? 'form.relation.creating' : 'form.relation.createSelect')}</button
					>{/if}
			{/if}
		{/snippet}
	</AdminDialog>
</div>

<style>
	[data-relation-create] :global(.vega-admin-btn) {
		min-height: 44px;
		height: auto;
		white-space: normal;
	}
	[data-relation-create] :global(.vega-admin-icon-btn) {
		min-width: 44px;
		min-height: 44px;
	}
	[data-relation-create] :global(.vega-record-form) {
		margin-top: var(--gap-field);
	}
	@media (max-width: 600px) {
		[data-relation-create] :global(.vega-admin-dialog-actions) {
			flex-direction: column-reverse;
		}
		[data-relation-create] :global(.vega-admin-dialog-actions button) {
			width: 100%;
		}
	}
</style>
