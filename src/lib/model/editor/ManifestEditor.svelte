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
	 *
	 * **R8 del rediseño C2 «Cabina»**: las acciones ("Insertar plantilla"/"Validar (dry-run)"/
	 * "Guardar") se mudan a una `EditTopBar` compartida con el editor de registro (R7,
	 * `RecordForm.svelte`) — crumb "Ajustes / manifiesto" sin acción (esta pantalla YA ES
	 * `/settings`, no hay a dónde "volver" desde el crumb, a diferencia del editor de registro). El
	 * `<textarea>` + el panel de resultados del dry-run pasan a `.manif`: grid de 2 columnas
	 * (`minmax(0,1fr) 320px`, mockup), textarea a la izquierda y `<aside class="warnpanel">` con un
	 * `.warnitem` por cada `strictError`/`dryRunWarning`/"todo OK" a la derecha — ANTES vivían
	 * apilados en una lista `<ul>` de texto plano. Es una fase puramente de MARKUP/estilo: `rawText`,
	 * `editorState`, `canSave`, `confirmingCreate`, `saveStatus` y sus handlers NO cambian una
	 * línea. Los strings en español de este componente (a diferencia de `RecordForm.svelte`) siguen
	 * SIN pasar por `ctx.t(...)` — ya era así antes de esta fase (fuera de alcance, ver instrucción
	 * del rediseño) y el gate ya lo acepta tal cual.
	 */
	import { untrack } from 'svelte';
	import type { ContentType, JsonValue } from '$lib/backend/types';
	import EditTopBar from '$lib/shell/EditTopBar.svelte';
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

	<!-- R8 del rediseño C2: mismo `EditTopBar` que el editor de registro (R7), crumb sin acción
	     (esta pantalla YA ES `/settings`, no hay a dónde "volver" desde aquí). -->
	<EditTopBar>
		{#snippet crumb()}
			<span class="manifest-crumb"><b>Ajustes</b> / manifiesto</span>
		{/snippet}
		{#snippet actions()}
			<button type="button" class="btn btn-quiet" onclick={handleInsertTemplate}>
				Insertar plantilla
			</button>
			<button type="button" class="btn" onclick={handleValidate}>Validar (dry-run)</button>
			<button type="button" class="btn btn-primary" onclick={handleSaveClick} disabled={!canSave}>
				{#if saveStatus === 'saving'}
					Guardando…
				{:else}
					Guardar
				{/if}
			</button>
		{/snippet}
	</EditTopBar>

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

	<!-- `.manif` (R8, mockup): textarea a la izquierda + panel de resultados a la derecha. El
	     `<aside>` solo existe tras `showValidation` (MISMO gate que antes) — sin él, la columna
	     derecha queda vacía (nunca un hueco con borde/sombra fantasma). -->
	<div class="manif">
		<textarea
			id="manifest-editor-textarea"
			class="manif-textarea"
			aria-label="JSON del manifiesto"
			spellcheck="false"
			autocomplete="off"
			bind:value={rawText}
			oninput={handleInput}
			disabled={saveStatus === 'saving'}></textarea>

		{#if showValidation}
			<aside class="warnpanel" aria-label="Resultado del dry-run" aria-live="polite">
				<h3>Resultado del dry-run</h3>
				{#if editorState.parseError}
					<div class="warnitem warnitem-err" role="alert">
						<span class="code">JSON inválido</span>
						<p>{editorState.parseError.message}</p>
					</div>
				{:else}
					{#each editorState.strictErrors as error (error.path + '|' + error.message)}
						<div class="warnitem warnitem-err" role="alert">
							<span class="code">{error.path || '/'}</span>
							<p>{error.message}</p>
						</div>
					{/each}
					{#each editorState.dryRunWarnings as warning (warning.code + '|' + (warning.path ?? ''))}
						<div class="warnitem warnitem-warn">
							<span class="code">{warning.code}</span>
							<p>{warning.message}</p>
							{#if warning.path}<span class="path">{warning.path}</span>{/if}
						</div>
					{/each}
					{#if editorState.strictErrors.length === 0 && editorState.dryRunWarnings.length === 0}
						<div class="warnitem warnitem-ok">
							<span class="code">OK</span>
							<p>El manifiesto es válido y no genera avisos.</p>
						</div>
					{/if}
				{/if}
			</aside>
		{/if}
	</div>

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
	/* Recoloreado a F7w-c: consume el vocabulario de rol §3 (`theme-tokens.ts`), igual que el
	   resto de la app tras F7w-a/b — ya no pinta con hex crudo. */
	.manifest-editor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 60rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: var(--ink);
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

	/* Crumb del `EditTopBar` (R8, mockup `.edit-top .crumb`): sin acción, texto plano — a
	   diferencia del crumb de `RecordForm.svelte` (R7), aquí no hay a dónde "volver". */
	.manifest-crumb {
		font-family: var(--mono);
		font-size: 0.75rem;
		color: var(--ink-3);
	}

	.manifest-crumb b {
		color: var(--ink);
		font-weight: 600;
	}

	/* Botones de la barra (mockup `.btn`/`.btn.quiet`/`.btn.primary`), namespaced a este componente
	   (mismo criterio que `RecordForm.svelte`/`.vega-list-new-button`: cada marco define los suyos). */
	.btn {
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn:hover {
		background: var(--active);
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.btn-quiet {
		border-color: transparent;
		background: none;
		color: var(--ink-2);
	}

	.btn-quiet:hover {
		background: var(--active);
		color: var(--ink-hi);
	}

	.btn-primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	/* Layout de 2 columnas (R8, mockup `.manif`): textarea a la izquierda, panel del dry-run a la
	   derecha. `align-items: start` para que el panel (normalmente más corto) no se estire a la
	   altura del textarea. */
	.manif {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: 1.25rem;
		align-items: start;
	}

	/* Responsive (R8): el mockup colapsa `.manif` a 1 columna en su `@media (max-width: 940px)`
	   (mismo breakpoint que las fichas del editor en `FieldRow.svelte`) — el panel del dry-run cae
	   BAJO el textarea en vez de mantener su columna fija de 320px en pantallas estrechas. */
	@media (max-width: 940px) {
		.manif {
			grid-template-columns: 1fr;
		}
	}

	.manif-textarea {
		width: 100%;
		min-height: 25rem;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.85rem;
		line-height: 1.4;
		padding: 0.75rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		resize: vertical;
		tab-size: 2;
	}

	/* El mockup añade un halo `color-mix(...)` alrededor del borde: prohibido fuera de
	   `src/lib/themes/` por `check-theme-coverage.mjs` (mismo motivo que `GlobalSearch.svelte`) —
	   el cambio de `border-color` + el `:focus-visible` global (`--ring`, `theme/base.css`) ya
	   dan foco visible, sin reconstruir el halo. */
	.manif-textarea:focus {
		border-color: var(--accent);
	}

	.manif-textarea:disabled {
		background: var(--active);
		color: var(--ink-3);
	}

	/* Panel de resultados (R8, mockup `.warnpanel`/`.warnitem`): MISMA tarjeta que `.vega-fsection`
	   de `RecordForm.svelte` (borde/radio/fondo/sombra), cabecera mono/uppercase a juego. */
	.warnpanel {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.warnpanel h3 {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
		padding: 0.65rem 1rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--line);
	}

	.warnitem {
		padding: 0.85rem 1rem;
		border-bottom: 1px solid var(--line-soft);
		font-size: 0.8125rem;
	}

	.warnitem:last-child {
		border-bottom: 0;
	}

	.warnitem p {
		margin: 0.35rem 0 0;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	.warnitem .code {
		display: inline-block;
		font-family: var(--mono);
		font-size: 0.65rem;
		font-weight: 700;
		border-radius: 4px;
		padding: 0.1rem 0.45rem;
		overflow-wrap: anywhere;
	}

	.warnitem .path {
		display: block;
		margin-top: 0.25rem;
		font-family: var(--mono);
		font-size: 0.6875rem;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	.warnitem-err .code {
		background: var(--danger-soft);
		color: var(--danger);
	}

	.warnitem-warn .code {
		background: var(--warning-soft);
		color: var(--warning);
	}

	.warnitem-ok .code {
		background: var(--success-soft);
		color: var(--success);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		background: var(--btn);
		color: var(--ink);
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

	.notice-confirm .actions {
		margin: 0;
	}

	.bootstrap-json {
		max-height: 16rem;
		overflow: auto;
		padding: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 4px;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 0.8rem;
	}

	.message {
		margin: 0;
		font-size: 0.9rem;
	}

	.message-error {
		color: var(--danger);
	}

	.message-ok {
		color: var(--success);
	}
</style>
