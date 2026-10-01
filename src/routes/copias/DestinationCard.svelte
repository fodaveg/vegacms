<script lang="ts">
	/**
	 * Tarjeta «Dónde se guardan» de `/copias` (lámina B4): en este servidor (estado de fábrica) o en
	 * un almacén externo S3 (`backups.s3`). Resumen de lo guardado con «Probar conexión»; «Cambiar»
	 * abre el formulario dentro de la propia tarjeta.
	 *
	 * La prueba vive en el resumen y no en el formulario porque PocketBase prueba lo GUARDADO, no lo
	 * que haya escrito en los campos. Un fallo de la prueba no es una excepción: es el texto crudo del
	 * servidor, que puede ser largo y se enseña como TEXTO en una caja con scroll, nunca como HTML.
	 *
	 * La clave secreta va siempre vacía: PocketBase no la devuelve y solo viaja si se escribe una
	 * nueva, así que guardar otro campo nunca la toca. No hay «quitarla»: PocketBase 0.39.9 no
	 * persiste ese borrado (el siguiente guardado la resucita, medido), y un botón que no cumple lo
	 * que dice es peor que no tenerlo; para dejar de usarla basta volver a «En este servidor», que
	 * conserva los datos de conexión.
	 *
	 * Al cambiar de destino, la lista de copias de arriba cambia (enseña las del destino activo) y las
	 * que ya había no se mueven: la nota del formulario lo dice solo cuando cambia la opción elegida.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type ServerSettings, type ServerSettingsPort } from '$lib/backend';
	import { buildServerSettingsPatch, isEmptyPatch } from '$lib/backend/server-settings-rules';
	import { fieldMessage, formatClock } from '$lib/admin/server-settings-ui';
	import '$lib/admin/admin.css';

	interface Props {
		settings: ServerSettings;
		section: ServerSettingsPort;
		/** `destinationChanged`: cambió dónde se guardan, así que la lista de copias hay que releerla. */
		onSaved: (next: ServerSettings, destinationChanged: boolean) => void;
	}

	let { settings, section, onSaved }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	type Choice = 'local' | 's3';
	type TestState =
		| { status: 'idle' }
		| { status: 'testing' }
		| { status: 'ok'; at: Date }
		| { status: 'failed'; message: string };
	type S3Field = 'endpoint' | 'bucket' | 'region' | 'accessKey' | 'secret';

	const S3_FIELDS: readonly S3Field[] = ['endpoint', 'bucket', 'region', 'accessKey', 'secret'];

	let editing = $state(false);
	let saving = $state(false);
	let test = $state<TestState>({ status: 'idle' });

	let choice = $state<Choice>('local');
	let endpoint = $state('');
	let bucket = $state('');
	let region = $state('');
	let accessKey = $state('');
	let secret = $state('');
	let pathStyle = $state(false);
	let errors = $state<Partial<Record<S3Field, string>>>({});
	let generalError = $state<string | null>(null);

	let changeButton = $state<HTMLButtonElement | null>(null);
	let firstControl = $state<HTMLInputElement | null>(null);

	const s3 = $derived(settings.backups.s3);
	const initialChoice = $derived<Choice>(s3.enabled ? 's3' : 'local');
	const testing = $derived(test.status === 'testing');

	async function open(): Promise<void> {
		if (testing) return;
		choice = initialChoice;
		endpoint = s3.endpoint;
		bucket = s3.bucket;
		region = s3.region;
		accessKey = s3.accessKey;
		secret = '';
		pathStyle = s3.forcePathStyle;
		errors = {};
		generalError = null;
		editing = true;
		await tick();
		firstControl?.focus();
	}

	async function close(): Promise<void> {
		editing = false;
		await tick();
		changeButton?.focus();
	}

	async function runTest(): Promise<void> {
		if (testing) return;
		test = { status: 'testing' };
		try {
			const outcome = await section.testS3();
			test = outcome.ok
				? { status: 'ok', at: new Date() }
				: { status: 'failed', message: outcome.message };
		} catch (err) {
			test = { status: 'idle' };
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al probar el almacén', err),
				{ action: 'backups:test-s3' }
			);
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		generalError = null;
		errors = {};

		const patch = buildServerSettingsPatch(settings, {
			backups: {
				s3:
					choice === 'local'
						? { enabled: false }
						: {
								enabled: true,
								endpoint: endpoint.trim(),
								bucket: bucket.trim(),
								region: region.trim(),
								accessKey: accessKey.trim(),
								forcePathStyle: pathStyle
							}
			},
			secrets: choice === 's3' ? { backupsS3Secret: { kind: 'set', value: secret } } : undefined
		});
		if (isEmptyPatch(patch)) {
			await close();
			return;
		}

		saving = true;
		try {
			const next = await section.update(patch);
			ctx.feedback.toast(ctx.t('admin.backups.dest.saved'), { kind: 'success' });
			saving = false;
			test = { status: 'idle' };
			onSaved(next, next.backups.s3.enabled !== settings.backups.s3.enabled);
			await close();
		} catch (err) {
			saving = false;
			if (err instanceof VegaError && err.kind === 'validation') {
				const next: Partial<Record<S3Field, string>> = {};
				for (const field of S3_FIELDS) {
					const message = fieldMessage(err, `backups.s3.${field}`);
					if (message) next[field] = ctx.t('admin.settings.fieldRejected', { message });
				}
				errors = next;
				generalError = ctx.t('admin.settings.rejected', { message: err.message });
			} else {
				ctx.feedback.reportError(
					err instanceof VegaError ? err : VegaError.backend('Error al guardar el destino', err),
					{ action: 'backups:destination' }
				);
			}
		}
	}

	const note = $derived(
		choice === initialChoice
			? null
			: choice === 's3'
				? ctx.t('admin.backups.dest.noteToExternal')
				: ctx.t('admin.backups.dest.noteToLocal')
	);
</script>

<div class="vega-admin-card" data-backups-card="destination">
	<section class="vega-admin-state" aria-labelledby="{id}-title">
		<div class="vega-admin-subhead">
			<h2 id="{id}-title">{ctx.t('admin.backups.dest.title')}</h2>
			{#if !editing}
				{#if s3.enabled}
					<span class="vega-admin-tag" data-kind="pub">{ctx.t('admin.backups.dest.external')}</span>
				{/if}
				<span class="vega-admin-head-spacer"></span>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--sm"
					bind:this={changeButton}
					aria-disabled={testing}
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
				<fieldset class="vega-admin-choices">
					<legend class="vega-admin-sr-only">{ctx.t('admin.backups.dest.legend')}</legend>
					<label class="vega-admin-radio-card" data-checked={choice === 'local'}>
						<input
							type="radio"
							name="{id}-dest"
							value="local"
							bind:group={choice}
							bind:this={firstControl}
						/>
						<span
							><b>{ctx.t('admin.backups.dest.optLocal')}</b><span
								>{ctx.t('admin.backups.dest.optLocalHint')}</span
							></span
						>
					</label>
					<label class="vega-admin-radio-card" data-checked={choice === 's3'}>
						<input type="radio" name="{id}-dest" value="s3" bind:group={choice} />
						<span
							><b>{ctx.t('admin.backups.dest.optS3')}</b><span
								>{ctx.t('admin.backups.dest.optS3Hint')}</span
							></span
						>
					</label>
				</fieldset>

				{#if choice === 's3'}
					<div class="vega-admin-field">
						<label for="{id}-endpoint">{ctx.t('admin.backups.dest.endpoint')}</label>
						<input
							id="{id}-endpoint"
							class="vega-admin-input vega-admin-input--mono"
							type="url"
							bind:value={endpoint}
							oninput={() => (errors = { ...errors, endpoint: undefined })}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={errors.endpoint ? 'true' : undefined}
							aria-describedby="{id}-endpoint-{errors.endpoint ? 'error' : 'help'}"
						/>
						{#if errors.endpoint}
							<p class="vega-admin-field-error" id="{id}-endpoint-error">{errors.endpoint}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-endpoint-help">
								{ctx.t('admin.backups.dest.endpointHelp')}
							</p>
						{/if}
					</div>
					<div class="vega-admin-form-row">
						<div class="vega-admin-field">
							<label for="{id}-bucket">{ctx.t('admin.backups.dest.bucketLabel')}</label>
							<input
								id="{id}-bucket"
								class="vega-admin-input vega-admin-input--mono"
								type="text"
								bind:value={bucket}
								oninput={() => (errors = { ...errors, bucket: undefined })}
								spellcheck="false"
								autocapitalize="off"
								autocomplete="off"
								aria-invalid={errors.bucket ? 'true' : undefined}
								aria-describedby={errors.bucket ? `${id}-bucket-error` : undefined}
							/>
							{#if errors.bucket}
								<p class="vega-admin-field-error" id="{id}-bucket-error">{errors.bucket}</p>
							{/if}
						</div>
						<div class="vega-admin-field">
							<label for="{id}-region">{ctx.t('admin.backups.dest.region')}</label>
							<input
								id="{id}-region"
								class="vega-admin-input vega-admin-input--mono"
								type="text"
								bind:value={region}
								oninput={() => (errors = { ...errors, region: undefined })}
								spellcheck="false"
								autocapitalize="off"
								autocomplete="off"
								aria-invalid={errors.region ? 'true' : undefined}
								aria-describedby={errors.region ? `${id}-region-error` : undefined}
							/>
							{#if errors.region}
								<p class="vega-admin-field-error" id="{id}-region-error">{errors.region}</p>
							{/if}
						</div>
					</div>
					<div class="vega-admin-field">
						<label for="{id}-key">{ctx.t('admin.backups.dest.accessKey')}</label>
						<input
							id="{id}-key"
							class="vega-admin-input vega-admin-input--mono"
							type="text"
							bind:value={accessKey}
							oninput={() => (errors = { ...errors, accessKey: undefined })}
							spellcheck="false"
							autocapitalize="off"
							autocomplete="off"
							aria-invalid={errors.accessKey ? 'true' : undefined}
							aria-describedby={errors.accessKey ? `${id}-key-error` : undefined}
						/>
						{#if errors.accessKey}
							<p class="vega-admin-field-error" id="{id}-key-error">{errors.accessKey}</p>
						{/if}
					</div>
					<div class="vega-admin-field">
						<label for="{id}-secret">{ctx.t('admin.backups.dest.secret')}</label>
						<input
							id="{id}-secret"
							class="vega-admin-input"
							type="password"
							bind:value={secret}
							oninput={() => (errors = { ...errors, secret: undefined })}
							autocomplete="new-password"
							aria-invalid={errors.secret ? 'true' : undefined}
							aria-describedby="{id}-secret-{errors.secret ? 'error' : 'help'}"
						/>
						{#if errors.secret}
							<p class="vega-admin-field-error" id="{id}-secret-error">{errors.secret}</p>
						{:else}
							<p class="vega-admin-help" id="{id}-secret-help">
								{ctx.t('admin.backups.dest.secretHelp')}
							</p>
						{/if}
					</div>
					<label class="vega-admin-check">
						<input type="checkbox" bind:checked={pathStyle} />
						<span
							>{ctx.t('admin.backups.dest.pathStyle')}<span
								>{ctx.t('admin.backups.dest.pathStyleHint')}</span
							></span
						>
					</label>
				{/if}

				{#if note}
					<div class="vega-admin-notice vega-admin-notice--info" data-backups-note={choice}>
						<p class="vega-admin-notice-body">{note}</p>
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
		{:else if !s3.enabled}
			<p>{ctx.t('admin.backups.dest.local')}</p>
		{:else}
			<dl class="vega-admin-summary">
				<div>
					<dt>{ctx.t('admin.backups.dest.server')}</dt>
					<dd><code>{s3.endpoint}</code></dd>
				</div>
				<div>
					<dt>{ctx.t('admin.backups.dest.bucket')}</dt>
					<dd>
						<code>{s3.bucket}</code>{ctx.t('admin.backups.dest.regionJoin')}<code>{s3.region}</code>
					</dd>
				</div>
			</dl>
			<div class="vega-admin-test" data-backups-test={test.status}>
				<div class="vega-admin-form-actions">
					<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={testing}
						onclick={() => void runTest()}
					>
						{testing ? ctx.t('admin.settings.testing') : ctx.t('admin.settings.test')}
					</button>
					{#if test.status === 'testing'}
						<p class="vega-admin-result" aria-live="polite">
							<span class="vega-admin-saving">{ctx.t('admin.settings.testingStatus')}</span>
						</p>
					{/if}
				</div>
				{#if test.status === 'ok'}
					<p class="vega-admin-result" role="status">
						<span class="vega-admin-tag" data-kind="pub">{ctx.t('admin.settings.testOk')}</span>
						{ctx.t('admin.backups.dest.testOkAt', { time: formatClock(test.at, ctx.locale) })}
					</p>
				{:else if test.status === 'failed'}
					<div class="vega-admin-notice vega-admin-notice--danger" role="alert">
						<p class="vega-admin-notice-title">{ctx.t('admin.backups.dest.testFailTitle')}</p>
						<p class="vega-admin-notice-body">{ctx.t('admin.backups.dest.testFailBody')}</p>
						<pre class="vega-admin-output">{test.message}</pre>
						<div class="vega-admin-notice-actions">
							<button type="button" class="vega-admin-btn" onclick={() => void open()}>
								{ctx.t('admin.backups.dest.testFailChange')}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</section>
</div>
