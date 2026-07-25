<script lang="ts">
	/**
	 * `RevisionsSettings.svelte` (`#lote-integridad`, Fase B §6/§7/§10.4): sección "Historial y
	 * papelera" de `/settings` — bootstrap de `vega_revisions` (mismo gate de confirmación INLINE
	 * que el resto del Anexo A, ver `/media`) + los dos números de retención + cuántas revisiones
	 * hay ahora mismo. Montada por `/settings/+page.svelte` DENTRO del mismo `{#if isManifestEditable}`
	 * que `SchemaAuthoringPanel`/`ManifestEditor` (decisión de esta fase, no fijada por el
	 * contrato): bootstrapear una colección y reescribir el manifiesto son las dos operaciones que
	 * este componente hace, y las dos exigen `capabilities.schemaBootstrap` — un rol editor (L6c)
	 * nunca podría completar ninguna con éxito, así que ni se le ofrece.
	 *
	 * Como consecuencia de ese gate, `collectionState` (`computeRevisionsCollectionState`) NUNCA
	 * vale `'manual'` en la práctica (esa rama solo aparece sin `schemaBootstrap`, que aquí siempre
	 * es `true`) — se conserva de todos modos por si este componente se reutiliza algún día fuera
	 * de ese gate, mismo criterio defensivo que el resto del repo.
	 *
	 * Los números de retención se leen/escriben directamente sobre `manifestRaw` (tolerante, mismos
	 * defaults que `resolveRevisions`/`model/resolve.ts` — ver `retention.ts`), y el guardado
	 * reutiliza el `onSave` que YA usa `ManifestEditor` (`saveManifest` + refresco + toast en
	 * `/settings/+page.svelte#handleSave`): esta sección no reimplementa esa plomería, solo
	 * construye el manifiesto parcheado con `revisions` actualizado y delega.
	 *
	 * **Fix de code-review (dos escritores del manifiesto en `/settings`)**: la prop `manifestRaw`
	 * SOLO se usa para SEMBRAR los tres campos del formulario (`initialEnabled`/`initialKeepPerRecord`/
	 * `initialTrashDays`, al montar) — puede llevar desactualizada en cualquier momento (`ManifestEditor`
	 * es el OTRO escritor, vecino en la misma página). El patch que de verdad se guarda
	 * (`handleSaveRetention`) se construye sobre una lectura FRESCA del registro `vega` en el
	 * momento de guardar (`listManifestRecords`, la MISMA función que usa `load()` de
	 * `/settings/+page.svelte` — no una segunda forma de leerlo), nunca sobre la prop: así un
	 * guardado de retención no puede pisar una edición del textarea que se guardó DESPUÉS de que
	 * este componente montara, sea cual sea el orden en que la persona pulse los dos "Guardar". Si
	 * esa lectura fresca falla, `handleSaveRetention` NO guarda a ciegas sobre la prop rancia (ver
	 * su cabecera): perder el manifiesto de alguien por ahorrarse un error de red es peor que el
	 * error.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { BackendPort } from '$lib/backend/port';
	import type { ContentType, JsonValue } from '$lib/backend/types';
	import { VegaError } from '$lib/backend/errors';
	import { VEGA_COLLECTION } from '$lib/backend/collections';
	import { listManifestRecords } from '$lib/model/load';
	import {
		buildRevisionsBootstrapImportJson,
		computeRevisionsCollectionState,
		ensureRevisionsCollection,
		VEGA_REVISIONS_COLLECTION
	} from './revisions-collection';
	import { resetRevisionsLatch } from './with-revisions';
	import { DEFAULT_KEEP_PER_RECORD, DEFAULT_TRASH_RETENTION_DAYS } from './retention';

	/** Nombre del campo `json` del registro `vega` (P2 §6.1): duplicado a propósito, mismo criterio
	 *  que `/settings/+page.svelte`/`model/load.ts`/`with-revisions.ts` (ver la cabecera de este
	 *  módulo para el porqué de la lectura fresca que la usa). */
	const MANIFEST_FIELD = 'manifest';

	interface Props {
		port: BackendPort;
		/** Esquema descubierto (P1), refrescado por el padre tras `onSchemaChanged`. */
		types: ContentType[];
		manifestRaw: JsonValue | null;
		t: (key: string, params?: Record<string, string | number>) => string;
		/** El padre (`/settings`) re-lee `types` y `reloadModel()` tras un bootstrap real (MISMO
		 *  callback que `SchemaAuthoringPanel`). */
		onSchemaChanged: () => Promise<void>;
		/** El padre (`/settings`) valida+guarda+refresca+toastea (MISMO callback que
		 *  `ManifestEditor`). */
		onSave: (manifest: JsonValue) => Promise<void>;
	}

	let { port, types, manifestRaw, t, onSchemaChanged, onSave }: Props = $props();

	const ctx = getVegaContext();

	const collectionState = $derived(
		computeRevisionsCollectionState(types, port.capabilities.schemaBootstrap)
	);
	const bootstrapImportJson = $derived(
		collectionState === 'manual' ? buildRevisionsBootstrapImportJson() : null
	);

	// ————— Bootstrap (mismo gate INLINE que `/media`/§A.4.6) —————

	let confirmingCreate = $state(false);
	let creating = $state(false);

	function handleCreateClick(): void {
		confirmingCreate = true;
	}

	function handleCancelCreate(): void {
		confirmingCreate = false;
	}

	async function handleConfirmCreate(): Promise<void> {
		creating = true;
		try {
			await ensureRevisionsCollection(port);
			// §6: un bootstrap real invalida la latch/caché del decorador (podría haber quedado
			// "no disponible" de un intento previo a esta misma colección) — se resetea ANTES de
			// que la próxima escritura la vuelva a consultar.
			resetRevisionsLatch(port);
			await onSchemaChanged();
			confirmingCreate = false;
		} catch (err) {
			ctx.feedback.reportError(
				err instanceof VegaError
					? err
					: VegaError.backend('Error creando la colección "vega_revisions"', err),
				{ action: 'settings:ensureRevisionsCollection' }
			);
		} finally {
			creating = false;
		}
	}

	// ————— Recuento (§10.4: "cuántas revisiones hay ahora mismo") —————

	type CountStatus = 'idle' | 'loading' | 'ready' | 'error';
	let countStatus = $state<CountStatus>('idle');
	let count = $state(0);

	async function loadCount(): Promise<void> {
		countStatus = 'loading';
		try {
			const page = await port.list(VEGA_REVISIONS_COLLECTION.name, { perPage: 1 });
			count = page.totalItems;
			countStatus = 'ready';
		} catch {
			countStatus = 'error';
		}
	}

	$effect(() => {
		if (collectionState === 'present') void loadCount();
	});

	// ————— Retención (§7): lectura/escritura tolerante de `manifestRaw.revisions` —————

	function asPlainObject(value: JsonValue | null): Record<string, JsonValue> | null {
		return typeof value === 'object' && value !== null && !Array.isArray(value)
			? (value as Record<string, JsonValue>)
			: null;
	}

	function currentRevisionsRaw(): Record<string, JsonValue> {
		const doc = asPlainObject(manifestRaw);
		const revisionsRaw = doc ? asPlainObject(doc.revisions ?? null) : null;
		return revisionsRaw ?? {};
	}

	function initialEnabled(): boolean {
		const raw = currentRevisionsRaw().enabled;
		return typeof raw === 'boolean' ? raw : true;
	}

	function initialKeepPerRecord(): number {
		const raw = currentRevisionsRaw().keepPerRecord;
		return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
			? raw
			: DEFAULT_KEEP_PER_RECORD;
	}

	function initialTrashDays(): number {
		const raw = currentRevisionsRaw().trashDays;
		return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
			? raw
			: DEFAULT_TRASH_RETENTION_DAYS;
	}

	let enabled = $state(initialEnabled());
	let keepPerRecord = $state(initialKeepPerRecord());
	let trashDays = $state(initialTrashDays());
	let savingRetention = $state(false);
	let retentionError = $state<string | null>(null);

	function handleKeepPerRecordInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const n = Number(raw);
		if (raw !== '' && Number.isInteger(n) && n >= 0) keepPerRecord = n;
	}

	function handleTrashDaysInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const n = Number(raw);
		if (raw !== '' && Number.isInteger(n) && n >= 0) trashDays = n;
	}

	/**
	 * Lectura FRESCA del registro `vega` (ver cabecera del módulo): MISMO criterio que `load()` de
	 * `/settings/+page.svelte` (0 registros ⇒ `null`, se usa el primero si hay más de uno) vía
	 * `listManifestRecords`, sin duplicar esa lógica. `null` si la colección `vega` ni siquiera
	 * existe todavía (manifiesto ausente, caso válido — `onSave`/`saveManifest` la crean al vuelo).
	 * Cualquier fallo de RED se propaga tal cual: `handleSaveRetention` lo convierte en un mensaje
	 * claro, nunca sigue adelante guardando sobre una copia que podría estar obsoleta.
	 */
	async function readFreshManifestRaw(): Promise<JsonValue | null> {
		const vegaType = types.find((type) => type.name === VEGA_COLLECTION.name);
		if (!vegaType) return null;
		const page = await listManifestRecords(port, vegaType, 1);
		return page.items.length > 0 ? (page.items[0].values[MANIFEST_FIELD] ?? null) : null;
	}

	async function handleSaveRetention(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		savingRetention = true;
		retentionError = null;
		try {
			let freshManifestRaw: JsonValue | null;
			try {
				freshManifestRaw = await readFreshManifestRaw();
			} catch {
				// Mensaje propio (nunca el crudo de `VegaError`/red): ver cabecera del módulo — un
				// guardado que no puede confirmar el estado actual del manifiesto NO debe seguir
				// adelante sobre la prop rancia, así que aquí se corta ANTES de construir `patched`.
				throw new Error(t('revisions.settings.staleReadError'));
			}
			const base = asPlainObject(freshManifestRaw) ?? { schemaVersion: 1 };
			const patched: JsonValue = {
				...base,
				revisions: { enabled, keepPerRecord, trashDays }
			};
			await onSave(patched);
		} catch (err) {
			retentionError =
				err instanceof Error ? err.message : 'No se pudo guardar la retención del historial.';
		} finally {
			savingRetention = false;
		}
	}
</script>

<section class="vega-revisions-settings" aria-labelledby="vega-revisions-settings-title">
	<h2 id="vega-revisions-settings-title">{t('revisions.settings.title')}</h2>
	<p class="vega-revisions-settings-description">{t('revisions.settings.description')}</p>

	{#if collectionState === 'present'}
		<p class="vega-revisions-settings-count">
			{#if countStatus === 'ready'}
				{t('revisions.settings.count', { count })}
			{:else if countStatus === 'error'}
				{t('revisions.settings.countError')}
			{:else}
				{t('common.loading')}
			{/if}
		</p>

		<form class="vega-revisions-settings-form" onsubmit={(e) => void handleSaveRetention(e)}>
			<label class="vega-revisions-settings-checkbox">
				<input
					type="checkbox"
					checked={enabled}
					onchange={(e) => (enabled = e.currentTarget.checked)}
				/>
				{t('revisions.settings.enabled')}
			</label>
			<label class="vega-revisions-settings-field">
				<span>{t('revisions.settings.keepPerRecord')}</span>
				<input
					type="number"
					min="0"
					step="1"
					value={keepPerRecord}
					oninput={handleKeepPerRecordInput}
				/>
			</label>
			<label class="vega-revisions-settings-field">
				<span>{t('revisions.settings.trashDays')}</span>
				<input type="number" min="0" step="1" value={trashDays} oninput={handleTrashDaysInput} />
			</label>
			{#if retentionError}
				<p class="vega-revisions-settings-error" role="alert">{retentionError}</p>
			{/if}
			<button type="submit" disabled={savingRetention}>
				{savingRetention ? t('revisions.settings.saving') : t('revisions.settings.save')}
			</button>
		</form>
	{:else if collectionState === 'creatable'}
		<div class="notice notice-bootstrap" data-revisions-settings-state="creatable">
			<p>{t('revisions.settings.creatableBody')}</p>
			<button type="button" onclick={handleCreateClick} disabled={creating}>
				{t('revisions.settings.create')}
			</button>
		</div>

		{#if confirmingCreate}
			<div class="notice notice-confirm" role="alertdialog" aria-live="assertive">
				<p>{t('revisions.settings.confirmBody')}</p>
				<div class="actions">
					<button type="button" onclick={() => void handleConfirmCreate()} disabled={creating}>
						{creating ? t('revisions.settings.creating') : t('revisions.settings.confirm')}
					</button>
					<button type="button" onclick={handleCancelCreate} disabled={creating}>
						{t('common.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{:else}
		<div class="notice notice-bootstrap" data-revisions-settings-state="manual">
			<p>{t('revisions.settings.manualBody')}</p>
			{#if bootstrapImportJson}
				<pre class="vega-revisions-settings-json">{bootstrapImportJson}</pre>
			{/if}
		</div>
	{/if}
</section>

<style>
	.vega-revisions-settings {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-revisions-settings h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.vega-revisions-settings-description,
	.vega-revisions-settings-count {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-revisions-settings-count {
		font-family: var(--mono);
	}

	.vega-revisions-settings-form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.65rem;
	}

	.vega-revisions-settings-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-revisions-settings-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.82rem;
		color: var(--ink-2);
	}

	.vega-revisions-settings-field input {
		width: 8rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
	}

	.vega-revisions-settings-error {
		margin: 0;
		color: var(--danger);
		font-size: 0.82rem;
	}

	.vega-revisions-settings-form button,
	.notice-bootstrap button,
	.actions button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.vega-revisions-settings-form button:disabled,
	.notice-bootstrap button:disabled,
	.actions button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.notice {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid;
	}

	.notice-bootstrap {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
		border-color: var(--warning);
		background: var(--warning-soft);
		color: var(--warning);
	}

	.notice-confirm {
		border-color: var(--info);
		background: var(--info-soft);
		color: var(--info);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notice p {
		margin: 0;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.vega-revisions-settings-json {
		max-height: 16rem;
		overflow: auto;
		padding: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 4px;
		font-family: var(--mono);
		font-size: 0.8rem;
	}
</style>
