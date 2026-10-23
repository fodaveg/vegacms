<script lang="ts">
	/** Asistente cargado bajo demanda: esquema aditivo, preflight real y recuperación parcial. */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type JsonValue } from '$lib/backend';
	import { listManifestRecords } from '$lib/model/load';
	import {
		newFieldDraft,
		newSelectOptionDraft,
		type DraftFieldType
	} from '$lib/model/editor/field-draft';
	import { generateSchemaMigration, type GeneratedMigration } from '$lib/backend/migration';
	import { resolveProjectEditorCollection } from '$lib/backend/project-editor';
	import {
		previewSiteSeed,
		seedSiteProject,
		type SiteSeedModule,
		type SiteSeedModulesPreview
	} from '$lib/backend/site-seeding';
	import { onlyModuleWrites } from '$lib/admin/site-base';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import MigrationPanel from '$lib/model/editor/MigrationPanel.svelte';
	import { inboxRateLimit } from './form-rate-limits';
	import type { ServerRateLimitRule } from '$lib/backend/server-settings';
	import { buildFormInbox, formName, type FormInboxDraft } from './form-inbox';
	let { onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> } = $props();
	const ctx = getVegaContext();
	const id = $props.id();
	let input = $state<FormInboxDraft>({
		name: '',
		label: '',
		singular: '',
		fields: [
			{
				label: ctx.t('form.field.default.name'),
				longText: false,
				draft: { ...newFieldDraft(), name: 'name', required: true }
			}
		]
	});
	let nameEdited = $state(false);
	let phase = $state<'edit' | 'checking' | 'plan' | 'writing' | 'done' | 'error' | 'blocked'>(
		'edit'
	);
	let error = $state('');
	let module = $state.raw<SiteSeedModule>();
	let preview = $state.raw<SiteSeedModulesPreview>();
	let migration = $state.raw<GeneratedMigration>();
	let rulesConfirmed = $state(false);
	let existed = $state(false);
	let resultRate = $state<ServerRateLimitRule | null | undefined>();
	const own = $derived(
		preview?.status === 'ready' ? preview.modules.find((item) => item.id === module?.id) : undefined
	);
	const differences = $derived(own?.ruleDifferences ?? []);
	const busy = $derived(phase === 'checking' || phase === 'writing');
	const types: DraftFieldType[] = ['text', 'email', 'url', 'number', 'bool', 'select', 'date'];
	function message(err: unknown): string {
		if (err instanceof Error && err.message.startsWith('forms.')) return ctx.t(err.message);
		if (err instanceof VegaError && err.kind === 'auth-expired')
			ctx.feedback.reportError(err, { action: 'forms:create' });
		return ctx.t('forms.failed');
	}
	async function check(): Promise<void> {
		phase = 'checking';
		error = '';
		rulesConfirmed = false;
		try {
			if (
				!ctx.port.capabilities.administration ||
				!ctx.port.capabilities.schemaBootstrap ||
				!ctx.port.administration
			)
				throw new Error('forms.gate');
			const schemas = await ctx.port.listContentTypes();
			const vega = schemas.find((type) => type.name === 'vega');
			const manifest: JsonValue = vega
				? ((await listManifestRecords(ctx.port, vega, 1)).items[0]?.values.manifest ?? null)
				: null;
			module = buildFormInbox(input, manifest);
			existed = schemas.some((type) => type.name === module!.collections[0].name);
			preview = await previewSiteSeed(ctx.port, { modules: [module] });
			if (preview.status === 'blocked') {
				phase = 'blocked';
				return;
			}
			if (!onlyModuleWrites(preview.plan, preview.modules[0])) throw new Error('forms.needsBase');
			phase = 'plan';
		} catch (err) {
			error = message(err);
			phase = 'error';
		}
	}
	async function create(): Promise<void> {
		if (!module || phase !== 'plan' || (differences.length && !rulesConfirmed)) return;
		phase = 'writing';
		try {
			await seedSiteProject(ctx.port, {
				modules: [module],
				confirmRuleDifferences: rulesConfirmed ? [module.id] : []
			});
			migration = generateSchemaMigration({
				kind: 'create',
				specs: module.collections.map((spec) => resolveProjectEditorCollection(spec, ctx.port))
			});
			phase = 'done';
			try {
				resultRate = inboxRateLimit(
					(await ctx.port.serverSettings?.get())?.rateLimits,
					module.collections[0].name
				);
			} catch {
				resultRate = undefined;
			}
		} catch (err) {
			error = message(err);
			phase = 'error';
		} finally {
			try {
				await onChanged();
			} catch (err) {
				error = message(err);
				phase = 'error';
			}
		}
	}
</script>

<AdminDialog open title={ctx.t('forms.new')} {busy} {onClose}>
	{#snippet actions()}
		{#if phase === 'edit'}<button type="button" class="vega-admin-btn" onclick={check}
				>{ctx.t('forms.preview')}</button
			>
		{:else if phase === 'plan'}<button
				type="button"
				class="vega-admin-btn"
				onclick={() => {
					phase = 'edit';
				}}>{ctx.t('forms.back')}</button
			><button
				type="button"
				class="vega-admin-btn"
				aria-disabled={differences.length > 0 && !rulesConfirmed}
				onclick={create}>{ctx.t('forms.create')}</button
			>
		{:else if phase === 'error' || phase === 'blocked'}<button
				type="button"
				class="vega-admin-btn"
				onclick={() => {
					phase = 'edit';
				}}>{ctx.t('forms.back')}</button
			><button type="button" class="vega-admin-btn" onclick={check}>{ctx.t('common.retry')}</button>
		{:else if phase === 'done'}<button type="button" class="vega-admin-btn" onclick={onClose}
				>{ctx.t('forms.close')}</button
			>{/if}
	{/snippet}
	{#if phase === 'edit'}
		<label for={`${id}-label`}>{ctx.t('forms.title')}</label><input
			id={`${id}-label`}
			class="vega-admin-input"
			data-autofocus
			bind:value={input.label}
			oninput={(event) => {
				if (!nameEdited) input.name = formName(event.currentTarget.value);
			}}
		/>
		<label for={`${id}-singular`}>{ctx.t('forms.singular')}</label><input
			id={`${id}-singular`}
			class="vega-admin-input"
			bind:value={input.singular}
		/>
		<label for={`${id}-collection`}>{ctx.t('forms.collection')}</label><input
			id={`${id}-collection`}
			class="vega-admin-input"
			bind:value={input.name}
			oninput={() => {
				nameEdited = true;
			}}
		/>
		{#each input.fields as row, index (row.draft.id)}
			<fieldset>
				<legend>{ctx.t('forms.field', { n: index + 1 })}</legend>
				<label for={`${id}-${index}-label`}>{ctx.t('forms.fieldLabel')}</label><input
					id={`${id}-${index}-label`}
					class="vega-admin-input"
					bind:value={row.label}
				/>
				<label for={`${id}-${index}-name`}>{ctx.t('forms.fieldName')}</label><input
					id={`${id}-${index}-name`}
					class="vega-admin-input"
					bind:value={row.draft.name}
				/>
				<label for={`${id}-${index}-type`}>{ctx.t('forms.type')}</label><select
					id={`${id}-${index}-type`}
					class="vega-admin-input"
					bind:value={row.draft.type}
					>{#each types as type (type)}<option value={type}>{ctx.t(`forms.type.${type}`)}</option
						>{/each}</select
				>
				<label class="check"
					><input type="checkbox" bind:checked={row.draft.required} />{ctx.t(
						'forms.requiredField'
					)}</label
				>
				{#if row.draft.type === 'text'}<label class="check"
						><input type="checkbox" bind:checked={row.longText} />{ctx.t('forms.longText')}</label
					>{/if}
				{#if row.draft.type === 'number' && row.draft.required}<p>{ctx.t('forms.zero')}</p>{/if}
				{#if row.draft.type === 'bool' && row.draft.required}<p>{ctx.t('forms.consent')}</p>{/if}
				{#if row.draft.type === 'select'}<label class="check"
						><input type="checkbox" bind:checked={row.draft.selectMultiple} />{ctx.t(
							'forms.multiple'
						)}</label
					>{#each row.draft.selectOptions as option, i (option.id)}<label
							for={`${id}-${index}-option-${i}`}>{ctx.t('forms.option', { n: i + 1 })}</label
						><input
							id={`${id}-${index}-option-${i}`}
							class="vega-admin-input"
							bind:value={option.value}
						/>{/each}<button
						type="button"
						class="vega-admin-btn"
						onclick={() => {
							row.draft.selectOptions = [...row.draft.selectOptions, newSelectOptionDraft()];
						}}>{ctx.t('forms.addOption')}</button
					>{/if}
				<button
					type="button"
					class="vega-admin-btn"
					onclick={() => {
						input.fields = input.fields.filter((item) => item.draft.id !== row.draft.id);
					}}>{ctx.t('forms.removeField')}</button
				>
			</fieldset>
		{/each}
		<button
			type="button"
			class="vega-admin-btn"
			onclick={() => {
				input.fields = [...input.fields, { label: '', longText: false, draft: newFieldDraft() }];
			}}>{ctx.t('forms.addField')}</button
		>
		<p>{ctx.t('forms.serverNote')}</p>
	{:else if busy}<p role="status">
			{ctx.t(phase === 'checking' ? 'forms.checking' : 'forms.writing')}
		</p>
	{:else if phase === 'blocked' && preview?.status === 'blocked'}<div role="alert">
			<h3>{ctx.t('forms.blocked')}</h3>
			{#each preview.divergences as divergence (divergence.piece)}<p>
					<code>{divergence.piece}</code>: {divergence.actual} → {divergence.expected}
				</p>{/each}
		</div>
	{:else if phase === 'error'}<p role="alert">{error}</p>
		<p>{ctx.t('forms.partial')}</p>
	{:else if phase === 'plan' && module}
		{#if existed}<p>{ctx.t('forms.exists')}</p>{/if}
		<h3>{ctx.t('forms.preview')}</h3>
		<ul>
			{#each own?.createdCollections ?? [] as name (name)}<li>
					{ctx.t('forms.willCreate', { name })}
				</li>{/each}{#each own?.manifestEntries ?? [] as entry (entry)}<li>
					{ctx.t('forms.willAdd', { name: entry })}
				</li>{/each}
		</ul>
		<pre>{JSON.stringify(module.collections[0], null, 2)}</pre>
		{#if differences.length}<h3>{ctx.t('forms.ruleDifferences')}</h3>
			{#each differences as difference (`${difference.collection}.${difference.rule}`)}<p>
					<code>{difference.collection}.{difference.rule}</code>: {JSON.stringify(
						difference.actual
					)} → {JSON.stringify(difference.expected)}
				</p>{/each}<label class="check"
				><input type="checkbox" bind:checked={rulesConfirmed} />{ctx.t('forms.keepRules')}</label
			>{/if}
		<p>{ctx.t('forms.serverNote')}</p>
	{:else if phase === 'done'}<p role="status">{ctx.t('forms.created', { name: input.label })}</p>
		<p>
			{ctx.t(
				resultRate === undefined
					? 'forms.rateUnknown'
					: resultRate === null
						? 'forms.noRate'
						: 'forms.rate',
				resultRate ? { n: resultRate.maxRequests, seconds: resultRate.duration } : {}
			)}
		</p>
		<p>{ctx.t('forms.serverNote')}</p>
		{#if migration}<MigrationPanel {migration} t={ctx.t} />{/if}
	{/if}
</AdminDialog>

<style>
	pre {
		max-width: 100%;
		max-height: 24rem;
		overflow: auto;
		padding: 0.75rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: var(--r);
		font: 0.78rem/1.5 var(--mono);
	}
	p {
		overflow-wrap: anywhere;
	}
	input:not([type='checkbox']),
	select,
	button {
		min-height: 44px;
	}
	label {
		display: block;
		margin-top: 0.75rem;
		font-size: 0.85rem;
	}
	fieldset {
		margin: 1rem 0;
		border: 1px solid var(--line);
		border-radius: var(--r);
		padding: 0.75rem;
		min-width: 0;
	}
	fieldset button {
		margin-top: 0.5rem;
	}
	.check {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 44px;
	}
	.check input {
		min-width: 20px;
		min-height: 20px;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 16rem;
		overflow: auto;
		background: var(--surface-2);
		padding: 0.75rem;
		font-size: 0.75rem;
	}
	.vega-admin-input {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
	}
	button {
		min-height: 44px;
	}
	p {
		overflow-wrap: anywhere;
	}
	input:focus-visible,
	select:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>
