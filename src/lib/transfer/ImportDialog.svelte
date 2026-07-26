<script lang="ts">
	/**
	 * `ImportDialog.svelte` (§4 del contrato, ver la cabecera de `export-collection.ts`): diálogo
	 * modal que arranca desde el botón "Importar" de `/c/[type]/+page.svelte` — mismo patrón visual
	 * y estructural (backdrop + panel centrado, foco atrapado) que `ExportDialog`/`DeleteConfirm`,
	 * pero con más fases: un fichero `.vega.json` puede traer varias colecciones, y §4 exige
	 * validar → previsualizar → confirmar → escribir → informar, nunca saltarse un paso.
	 *
	 * ## Máquina de fases
	 * `phase: 'pick' | 'reading' | 'invalid' | 'preview' | 'running' | 'done'`.
	 * - `pick`: `<input type="file">` a la espera.
	 * - `reading`: parseando JSON + `validateTransferDocument` (§4.1, síncrono en la práctica, pero
	 *   se modela como fase propia para que un fichero gigante no bloquee el diálogo sin feedback).
	 * - `invalid`: §4.1 encontró algo que no casa — SOLO "Cerrar", nada se ha escrito (todo-o-nada,
	 *   ver `import-format.ts`).
	 * - `preview`: `buildImportPreview` ya resolvió existencia/relaciones/ficheros contra el puerto
	 *   (§4.2) — el corazón del diálogo. Con algún PISA, el botón "Importar" exige el checkbox de
	 *   confirmación aparte (§4.2: "nunca el default silencioso"); con TODO bloqueado, no hay nada
	 *   que escribir y el botón se deshabilita con una nota.
	 * - `running`: `runImport` en vuelo (§4.3/§4.4) — sin cancelación (a diferencia de exportar, no
	 *   pagina; el propio `allSettled` ya garantiza que termina en un tiempo acotado por el número
	 *   de registros, y cancelar A MITAD de unas escrituras sin transacción no evitaría nada).
	 * - `done`: el informe (§4.3: "nunca decir importado si algo falló") — cierre manual, para que
	 *   quien vea fallos tenga tiempo de leerlos antes de que el diálogo desaparezca solo.
	 *
	 * ## Por qué el diálogo NO recibe `contentType`
	 * A diferencia de `ExportDialog` (que exporta SIEMPRE la colección de la ruta actual), un
	 * `.vega.json` es multi-colección por formato (`TransferDocument.collections`, ver
	 * `transfer-format.ts`) y este diálogo procesa TODAS las que trae, existan o no en la colección
	 * desde la que se abrió — mismo criterio que §4.1 ("las colecciones DEL FICHERO existen en
	 * destino", plural, sin restringirlo a la de la ruta). `/c/[type]/+page.svelte` sigue siendo
	 * quien decide CUÁNDO ofrecer el botón (permiso + `capabilities.explicitRecordId`, ver su
	 * cabecera), pero una vez abierto, el diálogo es autónomo.
	 *
	 * ## `capabilities.explicitRecordId`, fallo cerrado
	 * El CREA de §4.3 escribe con `create(type, values, { id })`: sin `capabilities.
	 * explicitRecordId` cada `create` perdería el id original y rompería en silencio las relaciones
	 * que el propio fichero declara — el mismo motivo por el que la papelera de `#lote-integridad`
	 * oculta "Restaurar" sin esa capability. `+page.svelte` no ofrece el botón "Importar" sin ella
	 * (fallo cerrado, mismo criterio que el resto del `#lote-shell`); este diálogo no la vuelve a
	 * comprobar (confía en su único llamador, como `DeleteConfirm` confía en que solo se monta tras
	 * pedir confirmación).
	 */
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import {
		buildImportPreview,
		createCachingFileFetcher,
		runImport,
		type ImportPreview,
		type ImportReport
	} from './import-collection';
	import { validateTransferDocument, type ImportValidationError } from './import-format';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** Se llama tras `runImport` si escribió AL MENOS un registro (creado o actualizado), incluso
		 *  con fallos parciales — mismo criterio que `listState.reload()` tras un borrado/reorder con
		 *  éxito (`+page.svelte`): la tabla que quedó pintada antes de abrir este diálogo no sabe por
		 *  sí sola que sus datos cambiaron. Opcional (default no-op) para que un test de componente
		 *  que no la necesite no tenga que pasarla. */
		onImported?: () => void;
	}

	let { open, onClose, onImported = () => {} }: Props = $props();

	const ctx = getVegaContext();

	type Phase = 'pick' | 'reading' | 'invalid' | 'preview' | 'running' | 'done';
	let phase = $state<Phase>('pick');
	let fileName = $state('');
	let invalidErrors = $state<ImportValidationError[]>([]);
	let preview = $state<ImportPreview | null>(null);
	let overwriteConfirmed = $state(false);
	let report = $state<ImportReport | null>(null);

	// Un único fetcher CACHEADO por `url` para todo el ciclo de vida del fichero cargado (ver
	// cabecera de `import-collection.ts`): la vista previa (§4.2, ficheros `required`) y la
	// escritura (§4.4) comparten resultados, nunca traen el mismo binario dos veces.
	let fileFetcher = createCachingFileFetcher();

	// Reasienta TODO el estado en cada apertura (mismo criterio que `ExportDialog`/`DeleteConfirm`):
	// un diálogo reabierto nunca hereda el fichero/vista previa/informe de una importación anterior.
	$effect(() => {
		if (!open) return;
		phase = 'pick';
		fileName = '';
		invalidErrors = [];
		preview = null;
		overwriteConfirmed = false;
		report = null;
		fileFetcher = createCachingFileFetcher();
	});

	/** Recuento por estado a través de TODAS las colecciones de `preview` — lo que decide si el
	 *  botón "Importar" tiene algo que hacer y si exige el checkbox de PISA (§4.2). */
	const counts = $derived.by(() => {
		if (!preview) return { create: 0, overwrite: 0, blocked: 0 };
		let create = 0;
		let overwrite = 0;
		let blocked = 0;
		for (const collection of preview.collections) {
			for (const entry of collection.entries) {
				if (entry.status === 'create') create += 1;
				else if (entry.status === 'overwrite') overwrite += 1;
				else blocked += 1;
			}
		}
		return { create, overwrite, blocked };
	});

	const canImport = $derived(
		counts.create + counts.overwrite > 0 && (counts.overwrite === 0 || overwriteConfirmed)
	);

	/** `<input type="file">` onchange: lee, parsea y valida (§4.1) — NUNCA escribe nada aquí. */
	async function handleFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		fileName = file.name;
		phase = 'reading';

		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			invalidErrors = [{ kind: 'malformed' }];
			phase = 'invalid';
			return;
		}

		const validation = validateTransferDocument(parsed, ctx.model);
		if (!validation.ok) {
			invalidErrors = validation.errors;
			phase = 'invalid';
			return;
		}

		try {
			preview = await buildImportPreview(ctx.port, validation.collections, fileFetcher);
			phase = 'preview';
		} catch (err) {
			// Un fallo AQUÍ es de red/backend (resolver existencia contra el puerto, §4.2), no del
			// fichero — a diferencia de `invalid` (§4.1, problema DETERMINISTA del propio fichero),
			// el mismo reparto que usa `ExportDialog` para sus propios fallos de `ctx.port`.
			phase = 'pick';
			ctx.feedback.reportError(
				err instanceof VegaError ? err : VegaError.backend(ctx.t('list.import.error'), err)
			);
		}
	}

	/** Botón "Importar" de la fase `preview` (§4.3/§4.4): escribe y pasa a `done` con el informe. */
	async function startImport(): Promise<void> {
		if (!preview || !canImport) return;
		phase = 'running';
		report = await runImport(ctx.port, preview, { overwriteConfirmed }, fileFetcher);
		phase = 'done';
		if (report.createdCount + report.updatedCount > 0) onImported();
		if (report.success) {
			const total = report.createdCount + report.updatedCount;
			ctx.feedback.toast(
				ctx.t(total === 1 ? 'list.import.success.one' : 'list.import.success.many', {
					count: total
				}),
				{ kind: 'success' }
			);
		} else {
			ctx.feedback.toast(ctx.t('list.import.partial', { failed: report.failedCount }), {
				kind: 'error'
			});
		}
	}

	/** Esc / backdrop / botón "Cerrar": nunca se bloquea (a diferencia de `ExportDialog`, importar
	 *  no pagina — `running` dura lo que tardan los `create`/`update` en vuelo, no hay nada que
	 *  "cancelar a medias" de forma segura sin transacción, así que simplemente se deja terminar en
	 *  segundo plano si el usuario cierra). */
	function requestClose(): void {
		onClose();
	}

	function invalidErrorText(error: ImportValidationError): string {
		switch (error.kind) {
			case 'malformed':
				return ctx.t('list.import.invalid.malformed');
			case 'unrecognized-version':
				return ctx.t('list.import.invalid.unrecognizedVersion');
			case 'unknown-collection':
				return ctx.t('list.import.invalid.unknownCollection', { type: error.type });
			case 'unknown-field':
				return ctx.t('list.import.invalid.unknownField', { type: error.type, field: error.field });
		}
	}

	function blockedReasonText(
		reason: NonNullable<ImportPreview['collections'][number]['entries'][number]['reasons']>[number]
	): string {
		switch (reason.kind) {
			case 'no-create-permission':
				return ctx.t('list.import.blockedReason.noCreatePermission');
			case 'no-update-permission':
				return ctx.t('list.import.blockedReason.noUpdatePermission');
			case 'dangling-relation':
				return ctx.t('list.import.blockedReason.danglingRelation', { field: reason.field });
			case 'unreachable-required-file':
				return ctx.t('list.import.blockedReason.unreachableRequiredFile', { field: reason.field });
		}
	}

	// ————— Diálogo modal: foco atrapado + foco inicial (mismo patrón que ExportDialog/DeleteConfirm) —————
	let dialogEl = $state<HTMLElement | null>(null);
	let firstFocusEl = $state<HTMLElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function focusableItems(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(
			dialogEl.querySelectorAll<HTMLElement>('button, input:not([disabled])')
		).filter((el) => !el.hasAttribute('disabled'));
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			requestClose();
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
		firstFocusEl?.focus();
		document.addEventListener('keydown', handleKeydown, true);
		return () => {
			document.removeEventListener('keydown', handleKeydown, true);
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
		};
	});
</script>

{#if open}
	<div class="vega-import-backdrop">
		<div
			class="vega-import-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="vega-import-title"
			bind:this={dialogEl}
		>
			<h2 id="vega-import-title">{ctx.t('list.import.dialog.title')}</h2>

			{#if phase === 'pick' || phase === 'reading'}
				<p class="vega-import-hint">{ctx.t('list.import.pick.hint')}</p>
				<input
					type="file"
					accept=".json,application/json"
					aria-label={ctx.t('list.import.pick.label')}
					onchange={handleFileChange}
					disabled={phase === 'reading'}
					bind:this={firstFocusEl}
				/>
				{#if phase === 'reading'}
					<p aria-live="polite">{ctx.t('list.import.reading', { fileName })}</p>
				{/if}
				<div class="vega-import-actions">
					<button type="button" onclick={requestClose}>{ctx.t('common.cancel')}</button>
				</div>
			{:else if phase === 'invalid'}
				<div class="vega-import-invalid" role="alert">
					<h3>{ctx.t('list.import.invalid.title')}</h3>
					<ul>
						{#each invalidErrors as error, i (i)}
							<li>{invalidErrorText(error)}</li>
						{/each}
					</ul>
				</div>
				<div class="vega-import-actions">
					<button type="button" onclick={requestClose} bind:this={firstFocusEl}>
						{ctx.t('common.close')}
					</button>
				</div>
			{:else if phase === 'preview' && preview}
				<div class="vega-import-preview" aria-live="polite">
					<p class="vega-import-summary">
						{ctx.t('list.import.preview.summary', {
							create: counts.create,
							overwrite: counts.overwrite,
							blocked: counts.blocked
						})}
					</p>
					{#each preview.collections as collection (collection.type)}
						<details class="vega-import-collection" open={preview.collections.length === 1}>
							<summary>{collection.type} ({collection.entries.length})</summary>
							<ul class="vega-import-entries">
								{#each collection.entries as entry (entry.id)}
									<li class="vega-import-entry" data-status={entry.status}>
										<code>{entry.id}</code>
										<span class="vega-import-status">
											{ctx.t(`list.import.status.${entry.status}`)}
										</span>
										{#if entry.status === 'blocked'}
											<ul class="vega-import-reasons">
												{#each entry.reasons as reason, i (i)}
													<li>{blockedReasonText(reason)}</li>
												{/each}
											</ul>
										{/if}
									</li>
								{/each}
							</ul>
						</details>
					{/each}
					{#if counts.overwrite > 0}
						<label class="vega-import-confirm">
							<input
								type="checkbox"
								checked={overwriteConfirmed}
								onchange={(e) => (overwriteConfirmed = e.currentTarget.checked)}
								bind:this={firstFocusEl}
							/>
							{ctx.t('list.import.preview.confirmOverwrite', { count: counts.overwrite })}
						</label>
					{/if}
					{#if counts.create + counts.overwrite === 0}
						<p class="vega-import-nothing">{ctx.t('list.import.preview.nothingToImport')}</p>
					{/if}
				</div>
				<div class="vega-import-actions">
					<button type="button" onclick={requestClose}>{ctx.t('common.cancel')}</button>
					<button
						type="button"
						class="vega-import-confirm-button"
						disabled={!canImport}
						onclick={startImport}
					>
						{ctx.t('list.import.dialog.confirm')}
					</button>
				</div>
			{:else if phase === 'running'}
				<p aria-live="polite">{ctx.t('list.import.progress')}</p>
			{:else if phase === 'done' && report}
				<div class="vega-import-report" aria-live="polite">
					<p class="vega-import-summary">
						{ctx.t('list.import.report.summary', {
							created: report.createdCount,
							updated: report.updatedCount,
							failed: report.failedCount,
							skipped: report.skippedCount
						})}
					</p>
					{#if report.failedCount > 0}
						<details class="vega-import-collection" open>
							<summary>{ctx.t('list.import.report.failedTitle')}</summary>
							<ul class="vega-import-entries">
								{#each report.outcomes.filter((o) => o.status === 'failed') as outcome (outcome.type + outcome.id)}
									<li class="vega-import-entry" data-status="failed">
										<code>{outcome.type}/{outcome.id}</code>
										<span class="vega-import-status">{outcome.error}</span>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>
				<div class="vega-import-actions">
					<button type="button" onclick={requestClose} bind:this={firstFocusEl}>
						{ctx.t('common.close')}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.vega-import-backdrop {
		position: fixed;
		z-index: 70;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--vega-space-gutter);
		background: rgb(15 17 21 / 55%);
	}

	.vega-import-dialog {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 32rem;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
		padding: 1.5rem;
		border-radius: 10px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-card);
	}

	.vega-import-dialog h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-import-dialog h3 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
	}

	.vega-import-hint {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-import-invalid ul,
	.vega-import-reasons {
		margin: 0.25rem 0 0;
		padding-left: 1.2rem;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-import-summary {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ink-2);
	}

	.vega-import-collection {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
	}

	.vega-import-collection summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.vega-import-entries {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		max-height: 12rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.vega-import-entry {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
	}

	.vega-import-entry code {
		font-family: var(--mono);
	}

	.vega-import-status {
		color: var(--ink-2);
	}

	.vega-import-entry[data-status='blocked'] .vega-import-status,
	.vega-import-entry[data-status='failed'] .vega-import-status {
		color: var(--danger);
	}

	.vega-import-confirm {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-import-nothing {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-import-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.vega-import-actions button {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.vega-import-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.vega-import-confirm-button {
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
		font-weight: 600;
	}
</style>
