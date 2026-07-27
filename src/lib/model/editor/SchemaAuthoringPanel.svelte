<script lang="ts">
	/**
	 * Autoría de esquema (lote "esquema", Fase 1): la UI de las dos operaciones ADITIVAS del
	 * puerto — crear una colección nueva (`port.ensureCollections`) y añadir campos a una
	 * colección ya existente (`port.addCollectionFields`). Vive junto a `ManifestEditor.svelte`
	 * en `/settings`, montada SOLO cuando el puerto ofrece la capability correspondiente (ley de
	 * capacidades, §5 del contrato: "lo no soportado se oculta con motivo, nunca muere en
	 * silencio") — `/settings/+page.svelte` ya gatea toda la sección tras
	 * `capabilities.schemaBootstrap` (L6c, mismo criterio que el editor del manifiesto), y este
	 * componente además comprueba `schemaFieldBootstrap` por su cuenta para "Añadir campos"
	 * (capability PROPIA, `backend/port.ts`).
	 *
	 * Vocabulario de campo DELIBERADAMENTE reducido frente a `CollectionFieldSpec` completo:
	 * texto/número/sí-no/fecha/JSON/relación. Fuera de esta UI (aunque el puerto SÍ los admite):
	 * - `file`: tiene su propio flujo dedicado (`vega_media`, P6/`/media`) con miniaturas y tipos
	 *   MIME — reintroducir esa complejidad aquí, para colecciones de contenido genéricas, es un
	 *   subsistema nuevo que este lote no pide.
	 * - `autodate`: concepto interno de bootstrap (Anexo A, "creado el"); un operador que quiera
	 *   un campo de fecha se cubre con el tipo `date` normal de esta UI.
	 * - `select`: el propio `CollectionFieldSpec` (`backend/collections.ts`) todavía no lo admite
	 *   porque necesita un contrato para validar sus opciones.
	 * `relation` sí se ofrece: el destino sale del esquema descubierto, nunca de texto libre.
	 *
	 * Cada envío EXITOSO (colección creada, o al menos un campo añadido) genera y muestra la
	 * migración JS correspondiente (`generateSchemaMigration`, `MigrationPanel.svelte`) y llama a
	 * `onSchemaChanged` para que `/settings` refresque `types` — así "Añadir campos" ve de
	 * inmediato la colección recién creada, y el editor del manifiesto ve el campo nuevo.
	 */
	import type { BackendPort, CollectionFieldSpec, CollectionSpec, ContentType } from '$lib/backend';
	import {
		isReservedCollectionName,
		isUserAuthorableCollectionName,
		VegaError
	} from '$lib/backend';
	import { generateSchemaMigration, type GeneratedMigration } from '$lib/backend/migration';
	import MigrationPanel from './MigrationPanel.svelte';

	interface Props {
		port: BackendPort;
		/** Esquema descubierto (P1), refrescado por el padre tras cada `onSchemaChanged`. */
		types: ContentType[];
		t: (key: string, params?: Record<string, string | number>) => string;
		/** El padre (`/settings`) re-lee `types` (y, si aplica, `reloadModel`) tras un cambio real. */
		onSchemaChanged: () => Promise<void>;
	}

	const { port, types, t, onSchemaChanged }: Props = $props();

	type DraftFieldType = 'text' | 'number' | 'bool' | 'date' | 'json' | 'relation';
	type RelationDeleteMode = 'unlink' | 'cascade';

	interface FieldDraft {
		id: string;
		name: string;
		type: DraftFieldType;
		required: boolean;
		/** Solo se usa para `type === 'text'`: cadena cruda del input, `''` = sin límite. */
		max: string;
		/** Solo para `relation`: nombre de una colección presente en `types`. */
		relationTarget: string;
		relationMultiple: boolean;
		relationDeleteMode: RelationDeleteMode;
	}

	function newFieldDraft(): FieldDraft {
		return {
			id: crypto.randomUUID(),
			name: '',
			type: 'text',
			required: false,
			max: '',
			relationTarget: '',
			relationMultiple: false,
			relationDeleteMode: 'unlink'
		};
	}

	/** `null` si la fila no tiene nombre (fila en blanco descartada al enviar, nunca un error). */
	function draftToSpec(draft: FieldDraft): CollectionFieldSpec | null {
		const name = draft.name.trim();
		if (!name) return null;
		switch (draft.type) {
			case 'text': {
				const max = Number(draft.max);
				return {
					name,
					type: 'text',
					required: draft.required,
					max: Number.isFinite(max) && max > 0 ? max : undefined
				};
			}
			case 'number':
				return { name, type: 'number', required: draft.required };
			case 'bool':
				return { name, type: 'bool', required: draft.required };
			case 'date':
				return { name, type: 'date', required: draft.required };
			case 'json':
				return { name, type: 'json' };
			case 'relation':
				if (!draft.relationTarget) return null;
				return {
					name,
					type: 'relation',
					target: draft.relationTarget,
					required: draft.required,
					multiple: draft.relationMultiple,
					cascadeDelete: draft.relationDeleteMode === 'cascade'
				};
		}
	}

	function draftsAreValid(drafts: FieldDraft[]): boolean {
		return drafts.every(
			(draft) => !draft.name.trim() || draft.type !== 'relation' || draft.relationTarget.length > 0
		);
	}

	function errorMessage(err: unknown): string {
		return err instanceof VegaError ? err.message : 'Error desconocido.';
	}

	type OpStatus = 'idle' | 'saving' | 'done' | 'error';

	// ————— Crear colección —————

	let createName = $state('');
	let createFields = $state<FieldDraft[]>([newFieldDraft()]);
	let createStatus = $state<OpStatus>('idle');
	let createError = $state<string | null>(null);
	let createMigration = $state<GeneratedMigration | null>(null);
	/** `true` tras un envío que devolvió la colección en `skipped` (ya existía): no es un error,
	 *  pero tampoco generó migración (no se tocó nada) — mensaje propio, ver markup. */
	let createAlreadyExisted = $state(false);
	/** Nombre de la colección recién creada, capturado ANTES de limpiar el formulario: sin esto el
	 *  mensaje de éxito se quedaría sin `{name}` (el `<input>` ya se vació). */
	let createdName = $state<string | null>(null);

	/** Destinos relation: tipos escribibles descubiertos. PocketBase no permite que una colección
	 *  base relacione hacia una view (`readonly`). Excluye además la plomería `vega`/`vega_*`,
	 *  salvo `vega_media`: enlazar assets es precisamente uno de los casos de uso. */
	const relationTargetCollections = $derived(
		types.filter(
			(type) =>
				!type.readonly && (!isReservedCollectionName(type.name) || type.name === 'vega_media')
		)
	);
	const createNameValid = $derived(
		createName.trim().length > 0 && isUserAuthorableCollectionName(createName.trim())
	);
	const createFieldsValid = $derived(draftsAreValid(createFields));

	function addCreateFieldRow(): void {
		createFields = [...createFields, newFieldDraft()];
	}

	function removeCreateFieldRow(id: string): void {
		createFields = createFields.filter((f) => f.id !== id);
	}

	async function handleCreateSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!createNameValid || !createFieldsValid || createStatus === 'saving') return;

		const name = createName.trim();
		const fields = createFields
			.map(draftToSpec)
			.filter((f): f is CollectionFieldSpec => f !== null);
		const spec: CollectionSpec = { name, fields };

		createStatus = 'saving';
		createError = null;
		createMigration = null;
		createAlreadyExisted = false;
		createdName = null;
		try {
			const result = await port.ensureCollections([spec]);
			if (result.created.includes(name)) {
				createMigration = generateSchemaMigration({ kind: 'create', specs: [spec] });
				createdName = name;
				createName = '';
				createFields = [newFieldDraft()];
				await onSchemaChanged();
			} else {
				createAlreadyExisted = true;
			}
			createStatus = 'done';
		} catch (err) {
			createStatus = 'error';
			createError = errorMessage(err);
		}
	}

	// ————— Añadir campos —————

	/** Colecciones propias (el namespace interno `vega`/`vega_*` no se ofrece como destino: son
	 *  plomería de Vega, no contenido del operador — mismo criterio de exclusión que
	 *  `buildTemplate`). */
	const targetCollections = $derived(types.filter((ty) => !isReservedCollectionName(ty.name)));

	let addTarget = $state('');
	let addFields = $state<FieldDraft[]>([newFieldDraft()]);
	let addStatus = $state<OpStatus>('idle');
	let addError = $state<string | null>(null);
	let addMigration = $state<GeneratedMigration | null>(null);
	let addResultMessage = $state<string | null>(null);
	const addFieldsValid = $derived(draftsAreValid(addFields));

	function addAddFieldRow(): void {
		addFields = [...addFields, newFieldDraft()];
	}

	function removeAddFieldRow(id: string): void {
		addFields = addFields.filter((f) => f.id !== id);
	}

	async function handleAddSubmit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!addTarget || !addFieldsValid || addStatus === 'saving') return;

		const specs = addFields.map(draftToSpec).filter((f): f is CollectionFieldSpec => f !== null);
		if (specs.length === 0) return;

		addStatus = 'saving';
		addError = null;
		addMigration = null;
		addResultMessage = null;
		try {
			const result = await port.addCollectionFields(addTarget, specs);
			if (result.added.length > 0) {
				const addedSpecs = specs.filter((s) => result.added.includes(s.name));
				addMigration = generateSchemaMigration({
					kind: 'add-fields',
					collection: addTarget,
					fields: addedSpecs
				});
				addResultMessage = t('settings.schema.addFields.success', {
					count: result.added.length,
					collection: addTarget
				});
				addFields = [newFieldDraft()];
				await onSchemaChanged();
			} else {
				addResultMessage = t('settings.schema.addFields.noneAdded', { collection: addTarget });
			}
			addStatus = 'done';
		} catch (err) {
			addStatus = 'error';
			addError = errorMessage(err);
		}
	}
</script>

{#snippet fieldRow(draft: FieldDraft, onRemove: (id: string) => void)}
	<div class="vega-field-row">
		<input
			type="text"
			placeholder={t('settings.schema.fields.namePlaceholder')}
			aria-label={t('settings.schema.fields.nameLabel')}
			bind:value={draft.name}
		/>
		<select aria-label={t('settings.schema.fields.typeLabel')} bind:value={draft.type}>
			<option value="text">{t('settings.schema.fields.type.text')}</option>
			<option value="number">{t('settings.schema.fields.type.number')}</option>
			<option value="bool">{t('settings.schema.fields.type.bool')}</option>
			<option value="date">{t('settings.schema.fields.type.date')}</option>
			<option value="json">{t('settings.schema.fields.type.json')}</option>
			<option value="relation">{t('settings.schema.fields.type.relation')}</option>
		</select>
		{#if draft.type !== 'json'}
			<label class="vega-field-checkbox">
				<input type="checkbox" bind:checked={draft.required} />
				{t('settings.schema.fields.requiredLabel')}
			</label>
		{/if}
		{#if draft.type === 'text'}
			<input
				type="number"
				min="0"
				class="vega-field-max"
				placeholder={t('settings.schema.fields.maxLabel')}
				aria-label={t('settings.schema.fields.maxLabel')}
				bind:value={draft.max}
			/>
		{/if}
		{#if draft.type === 'relation'}
			<div class="vega-field-relation-options">
				<label>
					<span>{t('settings.schema.fields.relation.targetLabel')}</span>
					<select
						class="vega-field-relation-target"
						aria-invalid={draft.name.trim() && !draft.relationTarget ? 'true' : undefined}
						bind:value={draft.relationTarget}
					>
						<option value="" disabled>
							{relationTargetCollections.length > 0
								? t('settings.schema.fields.relation.targetPlaceholder')
								: t('settings.schema.fields.relation.targetEmpty')}
						</option>
						{#each relationTargetCollections as type (type.name)}
							<option value={type.name}>{type.name}</option>
						{/each}
					</select>
				</label>
				<label class="vega-field-checkbox">
					<input type="checkbox" bind:checked={draft.relationMultiple} />
					{t('settings.schema.fields.relation.multipleLabel')}
				</label>
				<label>
					<span>{t('settings.schema.fields.relation.onDeleteLabel')}</span>
					<select bind:value={draft.relationDeleteMode}>
						<option value="unlink">{t('settings.schema.fields.relation.onDeleteUnlink')}</option>
						<option value="cascade">{t('settings.schema.fields.relation.onDeleteCascade')}</option>
					</select>
				</label>
			</div>
			{#if draft.name.trim() && !draft.relationTarget}
				<p class="vega-schema-field-error">
					{t('settings.schema.fields.relation.targetRequired')}
				</p>
			{/if}
			{#if draft.relationDeleteMode === 'cascade'}
				<p class="vega-field-warning">
					{t('settings.schema.fields.relation.cascadeWarning')}
				</p>
			{/if}
		{/if}
		<button
			type="button"
			class="vega-field-remove"
			onclick={() => onRemove(draft.id)}
			aria-label={t('settings.schema.fields.removeRow')}
		>
			✕
		</button>
		{#if draft.type === 'number' && draft.required}
			<p class="vega-field-warning">{t('settings.schema.fields.numberRequiredWarning')}</p>
		{/if}
	</div>
{/snippet}

<section class="vega-schema-authoring" aria-labelledby="vega-schema-authoring-title">
	<h2 id="vega-schema-authoring-title">{t('settings.schema.title')}</h2>
	<p class="vega-schema-description">{t('settings.schema.description')}</p>

	{#if port.capabilities.schemaBootstrap}
		<div class="vega-schema-card">
			<h3>{t('settings.schema.create.title')}</h3>
			<form onsubmit={handleCreateSubmit}>
				<div class="field">
					<label for="vega-schema-create-name">{t('settings.schema.create.nameLabel')}</label>
					<input
						id="vega-schema-create-name"
						type="text"
						placeholder={t('settings.schema.create.namePlaceholder')}
						aria-invalid={createName.length > 0 && !createNameValid ? 'true' : undefined}
						bind:value={createName}
					/>
					{#if createName.length > 0 && !createNameValid}
						<!-- Dos mensajes, no uno: a quien escribe "vega_algo" decirle que "debe empezar por
						     una letra" es mentira y no le dice cómo salir del error. -->
						<p class="vega-schema-field-error">
							{isReservedCollectionName(createName.trim())
								? t('settings.schema.create.nameReserved')
								: t('settings.schema.create.nameInvalid')}
						</p>
					{/if}
				</div>

				{#each createFields as draft (draft.id)}
					{@render fieldRow(draft, removeCreateFieldRow)}
				{/each}
				<button type="button" class="vega-schema-add-row" onclick={addCreateFieldRow}>
					+ {t('settings.schema.fields.addRow')}
				</button>

				<button
					type="submit"
					class="vega-schema-submit"
					disabled={!createNameValid || !createFieldsValid || createStatus === 'saving'}
				>
					{createStatus === 'saving'
						? t('settings.schema.create.submitting')
						: t('settings.schema.create.submit')}
				</button>
			</form>

			<!-- Confirmación simétrica a la de "Añadir campos": sin ella, crear una colección solo
			     limpiaba el formulario y aparecía el panel de migración, que no dice "salió bien". -->
			{#if createdName !== null}
				<p class="vega-schema-notice" role="status">
					{t('settings.schema.create.success', { name: createdName })}
				</p>
			{/if}
			{#if createAlreadyExisted}
				<p class="vega-schema-notice" role="status">
					{t('settings.schema.create.alreadyExists', { name: createName || '' })}
				</p>
			{/if}
			{#if createStatus === 'error'}
				<p class="vega-schema-error" role="alert">
					{t('settings.schema.error', { message: createError ?? '' })}
				</p>
			{/if}
			{#if createMigration}
				<MigrationPanel migration={createMigration} {t} />
			{/if}
		</div>
	{/if}

	{#if port.capabilities.schemaFieldBootstrap}
		<div class="vega-schema-card">
			<h3>{t('settings.schema.addFields.title')}</h3>
			{#if targetCollections.length === 0}
				<p class="vega-schema-notice" role="status">{t('settings.schema.addFields.empty')}</p>
			{:else}
				<form onsubmit={handleAddSubmit}>
					<div class="field">
						<label for="vega-schema-add-target">{t('settings.schema.addFields.targetLabel')}</label>
						<select id="vega-schema-add-target" bind:value={addTarget}>
							<option value="" disabled>{t('settings.schema.addFields.targetPlaceholder')}</option>
							{#each targetCollections as ty (ty.name)}
								<option value={ty.name}>{ty.name}</option>
							{/each}
						</select>
					</div>

					{#each addFields as draft (draft.id)}
						{@render fieldRow(draft, removeAddFieldRow)}
					{/each}
					<button type="button" class="vega-schema-add-row" onclick={addAddFieldRow}>
						+ {t('settings.schema.fields.addRow')}
					</button>

					<button
						type="submit"
						class="vega-schema-submit"
						disabled={!addTarget || !addFieldsValid || addStatus === 'saving'}
					>
						{addStatus === 'saving'
							? t('settings.schema.addFields.submitting')
							: t('settings.schema.addFields.submit')}
					</button>
				</form>

				{#if addStatus === 'done' && addResultMessage}
					<p class="vega-schema-notice" role="status">{addResultMessage}</p>
				{/if}
				{#if addStatus === 'error'}
					<p class="vega-schema-error" role="alert">
						{t('settings.schema.error', { message: addError ?? '' })}
					</p>
				{/if}
				{#if addMigration}
					<MigrationPanel migration={addMigration} {t} />
				{/if}
			{/if}
		</div>
	{/if}
</section>

<style>
	.vega-schema-authoring {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-schema-authoring h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-schema-description {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-schema-card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}

	.vega-schema-card h3 {
		margin: 0;
		font-size: 0.95rem;
	}

	.vega-schema-card form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.field input,
	.field select {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 0.9rem;
		background: var(--surface);
		color: var(--ink);
	}

	.field input[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-schema-field-error {
		margin: 0;
		font-size: 0.78rem;
		color: var(--danger);
	}

	.vega-field-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border: 1px solid var(--line-soft);
		border-radius: 6px;
	}

	.vega-field-row input[type='text'],
	.vega-field-row select {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 0.85rem;
		background: var(--surface);
		color: var(--ink);
	}

	.vega-field-row input[type='text'] {
		flex: 1 1 10rem;
	}

	.vega-field-max {
		width: 8rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		font-size: 0.85rem;
		background: var(--surface);
		color: var(--ink);
	}

	.vega-field-checkbox {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--ink-2);
		white-space: nowrap;
	}

	.vega-field-remove {
		margin-left: auto;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink-2);
		width: 1.8rem;
		height: 1.8rem;
		cursor: pointer;
	}

	.vega-field-warning {
		flex-basis: 100%;
		margin: 0.25rem 0 0;
		font-size: 0.75rem;
		color: var(--warning);
	}

	.vega-field-relation-options {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto minmax(14rem, 1fr);
		flex-basis: 100%;
		align-items: end;
		gap: 0.65rem;
		padding-top: 0.25rem;
		border-top: 1px solid var(--line-soft);
	}

	.vega-field-relation-options > label:not(.vega-field-checkbox) {
		display: grid;
		gap: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ink-2);
	}

	.vega-field-relation-options select {
		width: 100%;
	}

	.vega-field-relation-options select[aria-invalid='true'] {
		border-color: var(--danger);
	}

	.vega-schema-authoring :is(input, select, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-schema-add-row {
		align-self: flex-start;
		padding: 0.3rem 0.7rem;
		border: 1px dashed var(--line-strong);
		border-radius: 6px;
		background: none;
		color: var(--ink-2);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.vega-schema-submit {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		border: 1px solid var(--accent);
		border-radius: 6px;
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-schema-submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-schema-notice {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-2);
	}

	.vega-schema-error {
		margin: 0;
		font-size: 0.82rem;
		color: var(--danger);
	}

	@media (max-width: 700px) {
		.vega-field-relation-options {
			grid-template-columns: 1fr;
			align-items: start;
		}
	}
</style>
