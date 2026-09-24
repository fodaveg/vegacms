<script lang="ts">
	/**
	 * `/copias`: copias de seguridad del servidor (lámina del audit, pieza 6). Crear, listar y
	 * descargar; restaurar y borrar no entran, así que no hay ninguna acción destructiva. Solo con
	 * `capabilities.administration`; un editor que llega por URL ve «Solo para superusuarios».
	 *
	 * Crear una copia deja la petición abierta hasta que el servidor termina (PocketBase no da
	 * progreso), así que mientras tanto hay una fila provisional con el tiempo real transcurrido,
	 * nunca un porcentaje. El anuncio para lectores de pantalla va aparte y dice el inicio y el
	 * final, no cada segundo. Si el servidor ya tiene otra copia o restauración en marcha
	 * (`'busy'`, medido en 0.39.6: 400 "Try again later"), el aviso lo dice con esas palabras encima
	 * de la lista, que sigue visible; cualquier otro fallo usa el mismo aviso con el mensaje del
	 * servidor.
	 *
	 * Descargar pide primero una URL autorizada (token de fichero de superusuario, válido unos
	 * minutos): mientras llega, el botón de esa fila dice «Preparando…».
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError, type BackupFile } from '$lib/backend';
	import Icon from '$lib/icons/Icon.svelte';
	import SuperuserGate from '$lib/admin/SuperuserGate.svelte';
	import { formatDayTime, formatElapsed } from '$lib/admin/format';
	import { formatFileSize } from '$lib/media/media-card';
	import { downloadFromUrl } from '$lib/transfer/download';
	import '$lib/admin/admin.css';

	const ctx = getVegaContext();
	const administration = $derived(
		ctx.port.capabilities.administration ? ctx.port.administration : undefined
	);

	type LoadStatus = 'loading' | 'ready' | 'error';
	type CreateError = { kind: 'busy' } | { kind: 'failed'; message: string };

	let status = $state<LoadStatus>('loading');
	let backups = $state<BackupFile[]>([]);

	async function load(showLoading = true): Promise<void> {
		const admin = administration;
		if (!admin) return;
		if (showLoading) status = 'loading';
		try {
			backups = await admin.listBackups();
			status = 'ready';
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error cargando las copias', err),
				{ action: 'backups:load' }
			);
			status = 'error';
		}
	}

	$effect(() => {
		if (!administration) return;
		void load();
	});

	// ————— Crear —————

	let creating = $state(false);
	let startedAt = $state(0);
	let now = $state(0);
	let createError = $state<CreateError | null>(null);
	/** Texto del anuncio para lectores de pantalla: inicio y final, nunca cada segundo. */
	let announcement = $state('');

	$effect(() => {
		if (!creating) return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});

	async function create(): Promise<void> {
		const admin = administration;
		if (creating || !admin) return;
		creating = true;
		createError = null;
		startedAt = Date.now();
		now = startedAt;
		announcement = ctx.t('admin.backups.announceStart');
		const before = new Set(backups.map((backup) => backup.key));
		try {
			const outcome = await admin.createBackup();
			if (outcome === 'busy') {
				createError = { kind: 'busy' };
				announcement = '';
				return;
			}
			await load(false);
			// La copia nueva es la que no estaba antes. Puede no aparecer si sustituyó a otra del
			// mismo segundo (PB nombra con resolución de segundos): entonces el aviso va sin tamaño.
			const added = backups.find((backup) => !before.has(backup.key)) ?? null;
			ctx.feedback.toast(
				added
					? ctx.t('admin.backups.createdToast', { size: formatFileSize(added.size, ctx.locale) })
					: ctx.t('admin.backups.createdToastNoSize'),
				{ kind: 'success' }
			);
			announcement = ctx.t('admin.backups.announceDone');
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('Error al crear la copia', err);
			createError = { kind: 'failed', message: vegaErr.message };
			announcement = '';
		} finally {
			creating = false;
		}
	}

	// ————— Descargar —————

	let preparingKey = $state<string | null>(null);

	async function download(backup: BackupFile): Promise<void> {
		const admin = administration;
		if (preparingKey !== null || !admin) return;
		preparingKey = backup.key;
		try {
			downloadFromUrl(await admin.backupDownloadUrl(backup.key), backup.key);
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend('Error al preparar la descarga', err),
				{ action: 'backups:download' }
			);
		} finally {
			preparingKey = null;
		}
	}

	const showTable = $derived(backups.length > 0 || creating);
</script>

<div class="vega-admin-page" data-admin-page="backups">
	{#if !administration}
		<SuperuserGate body={ctx.t('admin.backups.gateBody')} />
	{:else}
		<div class="vega-admin-head">
			<h1 tabindex="-1">{ctx.t('admin.backups.title')}</h1>
			{#if status === 'ready' && showTable}
				<span class="vega-admin-meta"><b>{backups.length}</b></span>
				<span class="vega-admin-head-spacer"></span>
				<button
					type="button"
					class="vega-admin-btn vega-admin-btn--primary"
					aria-disabled={creating}
					onclick={() => void create()}
				>
					{#if creating}
						{ctx.t('admin.backups.creating')}
					{:else}
						<Icon id="plus" size={14} />
						{ctx.t('admin.backups.create')}
					{/if}
				</button>
			{/if}
		</div>
		<p class="vega-admin-desc">{ctx.t('admin.backups.description')}</p>
		<p class="vega-admin-sr-only" aria-live="polite">{announcement}</p>

		{#if createError}
			<div
				class="vega-admin-notice vega-admin-notice--danger"
				role="alert"
				data-backups-error={createError.kind}
			>
				<p class="vega-admin-notice-title">{ctx.t('admin.backups.createErrorTitle')}</p>
				<p class="vega-admin-notice-body">
					{createError.kind === 'busy' ? ctx.t('admin.backups.busy') : createError.message}
				</p>
				<div class="vega-admin-notice-actions">
					<button
						type="button"
						class="vega-admin-btn"
						aria-disabled={creating}
						onclick={() => void create()}
					>
						{ctx.t('common.retry')}
					</button>
				</div>
			</div>
		{/if}

		{#if status === 'loading'}
			<div class="vega-admin-card">
				<div class="vega-admin-state" aria-live="polite" data-backups-state="loading">
					<p><span class="vega-admin-saving">{ctx.t('admin.backups.loading')}</span></p>
				</div>
			</div>
		{:else if status === 'error'}
			<div class="vega-admin-card">
				<div class="vega-admin-state" role="alert" data-backups-state="error">
					<p>{ctx.t('admin.backups.loadError')}</p>
					<button type="button" class="vega-admin-btn" onclick={() => void load()}>
						{ctx.t('common.retry')}
					</button>
				</div>
			</div>
		{:else if !showTable}
			<div class="vega-admin-card">
				<div class="vega-admin-state" data-backups-state="empty">
					<p class="vega-admin-state-title">{ctx.t('admin.backups.emptyTitle')}</p>
					<p>{ctx.t('admin.backups.emptyBody')}</p>
					<button
						type="button"
						class="vega-admin-btn vega-admin-btn--primary"
						onclick={() => void create()}
					>
						<Icon id="plus" size={14} />
						{ctx.t('admin.backups.create')}
					</button>
				</div>
			</div>
		{:else}
			<div class="vega-admin-card" data-backups-state="ready">
				<table class="vega-admin-table">
					<thead>
						<tr>
							<th scope="col">{ctx.t('admin.backups.col.name')}</th>
							<th scope="col" class="vega-admin-right">{ctx.t('admin.backups.col.size')}</th>
							<th scope="col" class="vega-admin-right">{ctx.t('admin.backups.col.date')}</th>
							<th scope="col">
								<span class="vega-admin-sr-only">{ctx.t('admin.backups.col.actions')}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{#if creating}
							<tr class="vega-admin-running" data-backups-running="">
								<td class="vega-admin-main" colspan="2">
									<span class="vega-admin-saving">
										{ctx.t('admin.backups.running', { elapsed: formatElapsed(now - startedAt) })}
									</span>
								</td>
								<td class="vega-admin-right vega-admin-mono vega-admin-meta-cell">
									{ctx.t('admin.backups.runningWhen')}
								</td>
								<td class="vega-admin-actions"></td>
							</tr>
						{/if}
						{#each backups as backup (backup.key)}
							<tr data-backup-key={backup.key}>
								<td class="vega-admin-main">
									<span class="vega-admin-title vega-admin-title--mono" title={backup.key}>
										{backup.key}
									</span>
								</td>
								<td class="vega-admin-right vega-admin-mono vega-admin-side">
									{formatFileSize(backup.size, ctx.locale)}
								</td>
								<td class="vega-admin-right vega-admin-mono vega-admin-meta-cell">
									{formatDayTime(backup.modified, ctx.locale)}
								</td>
								<td class="vega-admin-actions">
									<span class="vega-admin-row-actions">
										<button
											type="button"
											class="vega-admin-btn vega-admin-btn--sm"
											aria-label={ctx.t('admin.backups.downloadFor', { key: backup.key })}
											aria-disabled={preparingKey === backup.key}
											onclick={() => void download(backup)}
										>
											{preparingKey === backup.key
												? ctx.t('admin.backups.preparing')
												: ctx.t('admin.backups.download')}
										</button>
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>
