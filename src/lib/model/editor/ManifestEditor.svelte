<script lang="ts">
	/**
	 * Editor mínimo del manifiesto (§6.4 del contrato P2). Componente FINO: solo cablea UI ↔
	 * `editor-state.ts` (módulo puro). NO importa `$lib/backend/port` ni `pocketbase`; el único
	 * punto de contacto con el backend es la prop `onSave`, que P3 monta en `/settings` pasando
	 * algo que llame a `saveManifest(port, …)`.
	 *
	 * `collectionState` cubre el fallback normativo de §6.6 y el gate de confirmación del
	 * Anexo A §A.4.6 (P3 lo calcula, viendo el esquema descubierto y `capabilities`):
	 * - `'present'`: la colección `vega` ya existe → Guardar llama a `onSave` directo.
	 * - `'creatable'`: `vega` no existe pero el puerto puede crearla (`schemaBootstrap: true`)
	 *   → Guardar exige una confirmación INLINE explícita antes de llamar a `onSave` (el primer
	 *   guardado dispara `ensureCollections`, que crea la colección; §A.4.6 exige que la UI
	 *   pregunte, aunque el puerto en sí no lo haga).
	 * - `'manual'`: `vega` no existe y el puerto NO puede crearla (`schemaBootstrap: false`) →
	 *   guardado deshabilitado, se enseña el JSON de importación para el Admin de PocketBase
	 *   (generado por `buildBootstrapImportJson`, determinista a partir de `VEGA_COLLECTION`).
	 */
	import { untrack } from 'svelte';
	import type { ContentType, JsonValue } from '$lib/backend/types';
	import { computeEditorState, buildBootstrapImportJson, buildTemplate } from './editor-state';
	import manifestSchema from '../manifest-schema.json';

	interface Props {
		/** Esquema descubierto (P1), para el dry-run y la plantilla. */
		types: ContentType[];
		/** El manifiesto actual (campo `manifest` del registro `vega`), o `null` si no hay ninguno. */
		initialManifestRaw: JsonValue | null;
		/** Estado de la colección `vega` frente al bootstrap (§A.4.6, §6.6): lo calcula P3. */
		collectionState: 'present' | 'creatable' | 'manual';
		/** Guarda el manifiesto ya parseado. El componente NO habla con el puerto directamente. */
		onSave: (manifest: JsonValue) => Promise<void>;
		/** Iconos conocidos por el runtime (§4.8), para que el dry-run valide `icon` con la
		 *  misma paridad que `resolveContentModel` en producción. Sin esta prop, el dry-run no
		 *  valida iconos (comportamiento previo). */
		knownIcons?: readonly string[];
	}

	let { types, initialManifestRaw, collectionState, onSave, knownIcons }: Props = $props();

	type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

	/** Texto crudo del `<textarea>`, poblado UNA VEZ al montar con el manifiesto actual
	 *  pretty-printed (`untrack`: es una semilla inicial, no un espejo continuo — no queremos
	 *  pisar lo que el usuario está escribiendo si el padre vuelve a renderizar con nuevas
	 *  props). */
	let rawText = $state(
		untrack(() => JSON.stringify(initialManifestRaw ?? { schemaVersion: 1 }, null, 2))
	);
	/** `true` tras pulsar "Validar" (o "Insertar plantilla", o un intento de guardar): revela el
	 *  panel de errores/avisos. El botón "Guardar" NO depende de esto — su estado es siempre el
	 *  `canSave` en vivo, se haya pulsado "Validar" o no. */
	let showValidation = $state(false);
	let saveStatus = $state<SaveStatus>('idle');
	let saveErrorMessage = $state<string | null>(null);
	/** `true` mientras se muestra la confirmación inline del estado `'creatable'` (§A.4.6): el
	 *  usuario pulsó "Guardar" pero aún no confirmó "Crear y guardar". */
	let confirmingCreate = $state(false);

	/** Recalculado en cada tecla (puro y barato: sin red). Es la fuente de verdad del dry-run. */
	const editorState = $derived(computeEditorState(rawText, types, knownIcons));
	const canSave = $derived(
		editorState.canSave && collectionState !== 'manual' && saveStatus !== 'saving'
	);
	const bootstrapImportJson = $derived(
		collectionState === 'manual' ? buildBootstrapImportJson() : null
	);

	function handleValidate(): void {
		showValidation = true;
	}

	function handleInsertTemplate(): void {
		rawText = buildTemplate(types);
		showValidation = true;
		saveStatus = 'idle';
		saveErrorMessage = null;
	}

	function handleInput(): void {
		// Cualquier edición deja obsoleto el resultado de un guardado/error previo: el usuario
		// está escribiendo un borrador nuevo.
		if (saveStatus !== 'idle') {
			saveStatus = 'idle';
			saveErrorMessage = null;
		}
		// Y también la confirmación pendiente: si el usuario retoma la edición, que vuelva a
		// pasar por "Guardar" para reconfirmar sobre el texto actual.
		confirmingCreate = false;
	}

	function handleSaveClick(): void {
		if (!canSave) return;
		if (collectionState === 'creatable' && !confirmingCreate) {
			// §A.4.6: primer guardado sobre una colección `vega` inexistente pero creable —
			// pide confirmación explícita ANTES de invocar `onSave` (que disparará
			// `ensureCollections`). No se guarda nada todavía.
			confirmingCreate = true;
			return;
		}
		void doSave();
	}

	function handleCancelCreate(): void {
		confirmingCreate = false;
	}

	async function doSave(): Promise<void> {
		confirmingCreate = false;
		saveStatus = 'saving';
		saveErrorMessage = null;
		try {
			// Seguro: `canSave` exige `editorState.canSave`, que solo es `true` tras un
			// `JSON.parse` correcto seguido de `validateManifestStrict` en verde.
			const manifest = JSON.parse(rawText) as JsonValue;
			await onSave(manifest);
			saveStatus = 'saved';
			showValidation = true;
		} catch (err) {
			saveStatus = 'error';
			saveErrorMessage = err instanceof Error ? err.message : 'Error desconocido al guardar.';
		}
	}
</script>

<section class="manifest-editor">
	<header class="manifest-editor-header">
		<h2>Manifiesto de Vega</h2>
		<a href="https://vega.dev/manifest.schema.json" target="_blank" rel="noreferrer"
			>Documentación del schema ({manifestSchema.title})</a
		>
	</header>

	{#if collectionState === 'manual'}
		<div class="notice notice-bootstrap" role="alert">
			<p>
				La colección <code>vega</code> todavía no existe en este backend y no se puede crear automáticamente.
				El guardado está deshabilitado hasta que la crees a mano.
			</p>
			<p>
				En el Admin de PocketBase: <strong>Collections → Import collections</strong>, pega el
				siguiente JSON y confirma.
			</p>
			{#if bootstrapImportJson}
				<pre class="bootstrap-json">{bootstrapImportJson}</pre>
			{/if}
		</div>
	{/if}

	<div class="field">
		<label for="manifest-editor-textarea">JSON del manifiesto</label>
		<textarea
			id="manifest-editor-textarea"
			class="manifest-textarea"
			spellcheck="false"
			autocomplete="off"
			bind:value={rawText}
			oninput={handleInput}
			disabled={saveStatus === 'saving'}></textarea>
	</div>

	<div class="actions">
		<button type="button" onclick={handleValidate}>Validar</button>
		<button type="button" onclick={handleInsertTemplate}>Insertar plantilla</button>
		<button type="button" onclick={handleSaveClick} disabled={!canSave}>
			{#if saveStatus === 'saving'}
				Guardando…
			{:else}
				Guardar
			{/if}
		</button>
	</div>

	{#if confirmingCreate}
		<!-- §A.4.6: confirmación INLINE (nunca `window.confirm`, que bloquea) antes del primer
		     guardado sobre una colección `vega` inexistente pero creable. -->
		<div class="notice notice-confirm" role="alertdialog" aria-live="assertive">
			<p>Vega va a crear la colección <code>vega</code> en tu PocketBase. ¿Continuar?</p>
			<div class="actions">
				<button type="button" onclick={() => doSave()}>Crear y guardar</button>
				<button type="button" onclick={handleCancelCreate}>Cancelar</button>
			</div>
		</div>
	{/if}

	{#if showValidation}
		{#if editorState.parseError}
			<p class="message message-error" role="alert" aria-live="assertive">
				El texto no es JSON válido: {editorState.parseError.message}
			</p>
		{:else}
			<div class="validation-results" aria-live="polite">
				{#if editorState.strictErrors.length > 0}
					<div class="strict-errors" role="alert">
						<h3>Errores (no se puede guardar)</h3>
						<ul>
							{#each editorState.strictErrors as error (error.path + '|' + error.message)}
								<li><code>{error.path || '/'}</code> — {error.message}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if editorState.dryRunWarnings.length > 0}
					<div class="dry-run-warnings">
						<h3>Avisos contra el esquema real</h3>
						<ul>
							{#each editorState.dryRunWarnings as warning (warning.code + '|' + (warning.path ?? ''))}
								<li><code>{warning.code}</code> — {warning.message}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if editorState.strictErrors.length === 0 && editorState.dryRunWarnings.length === 0}
					<p class="message message-ok">El manifiesto es válido y no genera avisos.</p>
				{/if}
			</div>
		{/if}
	{/if}

	{#if saveStatus === 'saved'}
		<p class="message message-ok" role="status" aria-live="polite">
			Guardado.
			{#if editorState.dryRunWarnings.length > 0}
				Avisos resultantes arriba.
			{:else}
				Sin avisos.
			{/if}
		</p>
	{:else if saveStatus === 'error'}
		<p class="message message-error" role="alert" aria-live="assertive">
			Error al guardar: {saveErrorMessage}
		</p>
	{/if}
</section>

<style>
	/* Sin sistema de temas todavía (P7 lo trae): estilado neutro y autocontenido, sin tokens. */
	.manifest-editor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 60rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #1a1a1a;
	}

	.manifest-editor-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.manifest-editor-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.manifest-textarea {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.85rem;
		line-height: 1.4;
		min-height: 24rem;
		padding: 0.75rem;
		border: 1px solid #b0b0b0;
		border-radius: 4px;
		resize: vertical;
		tab-size: 2;
	}

	.manifest-textarea:disabled {
		background: #f2f2f2;
		color: #666;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		padding: 0.4rem 0.9rem;
		border: 1px solid #888;
		border-radius: 4px;
		background: #f5f5f5;
		cursor: pointer;
	}

	.actions button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.notice {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		border: 1px solid;
	}

	.notice-bootstrap {
		border-color: #b45309;
		background: #fffbeb;
		color: #7c2d12;
	}

	.notice-confirm {
		border-color: #1d4ed8;
		background: #eff6ff;
		color: #1e3a8a;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.notice-confirm .actions {
		margin: 0;
	}

	.bootstrap-json {
		max-height: 16rem;
		overflow: auto;
		padding: 0.5rem;
		background: #fff;
		border: 1px solid #d6d3d1;
		border-radius: 4px;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.8rem;
	}

	.validation-results {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.validation-results h3 {
		margin: 0 0 0.25rem;
		font-size: 0.9rem;
	}

	.validation-results ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
	}

	.strict-errors {
		color: #991b1b;
	}

	.dry-run-warnings {
		color: #92400e;
	}

	.message {
		margin: 0;
		font-size: 0.9rem;
	}

	.message-error {
		color: #991b1b;
	}

	.message-ok {
		color: #166534;
	}
</style>
