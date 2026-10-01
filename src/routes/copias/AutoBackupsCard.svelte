<script lang="ts">
	/**
	 * Tarjeta «Copias automáticas» de `/copias` (lámina B3): frecuencia y cuántas conservar
	 * (`backups.cron`, `backups.cronMaxKeep`). Resumen de lo guardado; «Cambiar» (o «Programar
	 * copias», si no hay ninguna programada) abre el formulario dentro de la propia tarjeta.
	 *
	 * La frecuencia son cuatro opciones en llano en un `select`; «Nunca» guarda la expresión vacía,
	 * que es como PocketBase desactiva las copias. Una expresión guardada que no es ninguna de las
	 * dos de la lista abre en «Personalizada» y se enseña literal. «Cuántas conservar» se retira con
	 * «Nunca»: sin copias automáticas no decide nada. Las horas se dicen en UTC, que es como las
	 * ejecuta el servidor, con la hora local al lado.
	 *
	 * El 0 (o vacío) lo para Vega al salir del campo y al guardar; la expresión la juzga el servidor
	 * al guardar y su mensaje va tal cual bajo el campo. Solo viaja lo que cambió
	 * (`buildServerSettingsPatch`): guardar nunca toca `backups.s3`.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ServerSettings, type ServerSettingsPort } from '$lib/backend';
	import {
		buildServerSettingsPatch,
		cronFor,
		frequencyOf,
		isEmptyPatch,
		isValidMaxKeep,
		type BackupFrequency
	} from '$lib/backend/server-settings-rules';
	import {
		fieldMessage,
		hasUnattributedFields,
		localClockOfUtcMidnight
	} from '$lib/admin/server-settings-ui';
	import '$lib/admin/admin.css';

	interface Props {
		settings: ServerSettings;
		section: ServerSettingsPort;
		onSaved: (next: ServerSettings) => void;
	}

	let { settings, section, onSaved }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	const FIELDS = ['backups.cron', 'backups.cronMaxKeep'] as const;

	let editing = $state(false);
	let saving = $state(false);
	let frequency = $state<BackupFrequency>('never');
	let customCron = $state('');
	let keep = $state<number | null>(null);
	let cronError = $state<string | null>(null);
	let keepError = $state<string | null>(null);
	let generalError = $state<string | null>(null);

	let changeButton = $state<HTMLButtonElement | null>(null);
	let frequencySelect = $state<HTMLSelectElement | null>(null);

	const savedFrequency = $derived(frequencyOf(settings.backups.cron));
	const clock = $derived(localClockOfUtcMidnight(new Date(), ctx.locale));

	/** « (las 2:00 aquí)»: vacío cuando la hora local es la UTC o cuando el día local ya no es el mismo. */
	function localClause(freq: BackupFrequency): string {
		if (clock.sameAsUtc) return '';
		if (freq === 'weekly' && clock.dayShifted) return '';
		return ` (${ctx.t('admin.settings.localTime', { time: clock.time })})`;
	}

	function localHelp(freq: BackupFrequency): string | null {
		if ((freq !== 'daily' && freq !== 'weekly') || clock.sameAsUtc) return null;
		if (freq === 'weekly' && clock.dayShifted) return null;
		return ctx.t('admin.backups.auto.localHelp', { time: clock.time });
	}

	async function open(): Promise<void> {
		frequency = savedFrequency;
		customCron = savedFrequency === 'custom' ? settings.backups.cron : '';
		keep = settings.backups.cronMaxKeep;
		cronError = keepError = generalError = null;
		editing = true;
		await tick();
		frequencySelect?.focus();
	}

	async function close(): Promise<void> {
		editing = false;
		await tick();
		changeButton?.focus();
	}

	function validateKeep(): boolean {
		keepError =
			frequency !== 'never' && !(keep !== null && isValidMaxKeep(keep))
				? ctx.t('admin.backups.auto.keepMin')
				: null;
		return keepError === null;
	}

	function validateCron(): boolean {
		cronError =
			frequency === 'custom' && customCron.trim() === ''
				? ctx.t('admin.backups.auto.cronRequired')
				: null;
		return cronError === null;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		generalError = null;
		const okCron = validateCron();
		const okKeep = validateKeep();
		if (!okCron || !okKeep) return;

		const patch = buildServerSettingsPatch(settings, {
			backups: {
				cron: cronFor(frequency, customCron),
				cronMaxKeep: frequency === 'never' ? undefined : (keep ?? undefined)
			}
		});
		if (isEmptyPatch(patch)) {
			await close();
			return;
		}
		saving = true;
		try {
			const next = await section.update(patch);
			ctx.feedback.toast(ctx.t('admin.backups.auto.saved'), { kind: 'success' });
			saving = false;
			onSaved(next);
			await close();
		} catch (err) {
			saving = false;
			if (err instanceof VegaError && err.kind === 'validation') {
				const cronMessage = fieldMessage(err, 'backups.cron');
				const keepMessage = fieldMessage(err, 'backups.cronMaxKeep');
				cronError = cronMessage
					? ctx.t('admin.backups.auto.cronRejected', { message: cronMessage })
					: null;
				keepError = keepMessage
					? ctx.t('admin.settings.fieldRejected', { message: keepMessage })
					: null;
				if (hasUnattributedFields(err, FIELDS) || (!cronMessage && !keepMessage)) {
					generalError = ctx.t('admin.settings.rejected', { message: err.message });
				}
			} else {
				ctx.feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('Error al guardar las copias', err),
					{ action: 'backups:settings' }
				);
			}
		}
	}
</script>

<div class="vega-admin-card" data-backups-card="auto">
	<section class="vega-admin-state" aria-labelledby="{id}-title">
		<div class="vega-admin-subhead">
			<h2 id="{id}-title">{ctx.t('admin.backups.auto.title')}</h2>
			{#if !editing && savedFrequency !== 'never'}
				<span class="vega-admin-tag" data-kind="pub">{ctx.t('admin.backups.auto.on')}</span>
				<span class="vega-admin-head-spacer"></span>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--sm"
					bind:this={changeButton}
					onclick={() => void open()}
				>
					{ctx.t('admin.settings.change')}
				</button>
			{/if}
		</div>

		{#if editing}
			<form
				class="vega-admin-form vega-admin-form--inset"
				novalidate
				aria-busy={saving}
				onsubmit={submit}
			>
				<div class="vega-admin-field">
					<label for="{id}-freq">{ctx.t('admin.backups.auto.frequency')}</label>
					<select
						id="{id}-freq"
						class="vega-admin-input"
						bind:this={frequencySelect}
						bind:value={frequency}
						aria-describedby={frequency === 'never' || localHelp(frequency)
							? `${id}-freq-help`
							: undefined}
					>
						<option value="never">{ctx.t('admin.backups.auto.never')}</option>
						<option value="daily">{ctx.t('admin.backups.auto.daily')}</option>
						<option value="weekly">{ctx.t('admin.backups.auto.weekly')}</option>
						<option value="custom">{ctx.t('admin.backups.auto.custom')}</option>
					</select>
					{#if frequency === 'never'}
						<p class="vega-admin-help" id="{id}-freq-help">
							{ctx.t('admin.backups.auto.neverHelp')}
						</p>
					{:else if localHelp(frequency)}
						<p class="vega-admin-help" id="{id}-freq-help">{localHelp(frequency)}</p>
					{/if}
				</div>

				{#if frequency === 'custom'}
					<div class="vega-admin-field">
						<label for="{id}-cron">{ctx.t('admin.backups.auto.cron')}</label>
						<input
							id="{id}-cron"
							class="vega-admin-input vega-admin-input--mono"
							type="text"
							bind:value={customCron}
							oninput={() => (cronError = null)}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={cronError ? 'true' : undefined}
							aria-describedby={cronError ? `${id}-cron-error` : `${id}-cron-help`}
						/>
						{#if cronError}
							<p class="vega-admin-field-error" id="{id}-cron-error">{cronError}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-cron-help">
								{ctx.t('admin.backups.auto.cronHelpPre')}<code>0 3 * * 1</code>{ctx.t(
									'admin.backups.auto.cronHelpPost'
								)}
							</p>
						{/if}
					</div>
				{/if}

				{#if frequency !== 'never'}
					<div class="vega-admin-field">
						<label for="{id}-keep">{ctx.t('admin.backups.auto.keepLabel')}</label>
						<input
							id="{id}-keep"
							class="vega-admin-input vega-admin-input--short"
							type="number"
							min="1"
							step="1"
							bind:value={keep}
							oninput={() => (keepError = null)}
							onblur={validateKeep}
							aria-invalid={keepError ? 'true' : undefined}
							aria-describedby={keepError ? `${id}-keep-error` : `${id}-keep-help`}
						/>
						{#if keepError}
							<p class="vega-admin-field-error" id="{id}-keep-error">{keepError}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-keep-help">
								{ctx.t('admin.backups.auto.keepHelp')}
							</p>
						{/if}
					</div>
				{/if}

				{#if generalError}
					<p class="vega-admin-field-error" role="alert">{generalError}</p>
				{/if}

				<div class="vega-admin-form-actions">
					<button
						type="submit"
						class="vega-admin-btn vega-admin-btn--primary"
						aria-disabled={saving}
					>
						{saving ? ctx.t('admin.settings.saving') : ctx.t('admin.settings.save')}
					</button>
					<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={saving}
						onclick={() => !saving && void close()}
					>
						{ctx.t('common.cancel')}
					</button>
				</div>
			</form>
		{:else if savedFrequency === 'never'}
			<p>{ctx.t('admin.backups.auto.offBody')}</p>
			<button
				type="button"
				class="vega-admin-btn"
				bind:this={changeButton}
				onclick={() => void open()}
			>
				{ctx.t('admin.backups.auto.schedule')}
			</button>
		{:else}
			<dl class="vega-admin-summary">
				<div>
					<dt>{ctx.t('admin.backups.auto.frequency')}</dt>
					<dd>
						{#if savedFrequency === 'custom'}
							{ctx.t('admin.backups.auto.customSummary')} · <code>{settings.backups.cron}</code>
						{:else if savedFrequency === 'daily'}
							{ctx.t('admin.backups.auto.daily')}{localClause('daily')}
						{:else}
							{ctx.t('admin.backups.auto.weekly')}{localClause('weekly')}
						{/if}
					</dd>
				</div>
				<div>
					<dt>{ctx.t('admin.backups.auto.keep')}</dt>
					<dd>{ctx.t('admin.backups.auto.keepValue', { count: settings.backups.cronMaxKeep })}</dd>
				</div>
			</dl>
		{/if}
	</section>
</div>
