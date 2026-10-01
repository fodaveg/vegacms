<script lang="ts">
	/**
	 * Diálogo «Enlace» de la barra del texto enriquecido: sustituye al `window.prompt` de la URL.
	 * Dos modos:
	 * - «Página del sitio»: busca entre los registros de los tipos que tienen ruta
	 *   (`collections.<c>.page` en el manifiesto) y enlaza la RUTA de la elegida, no su id.
	 * - «Dirección externa»: un campo de texto que admite `http`, `https`, `mailto`, `tel` o una ruta
	 *   que empiece por `/` (`validateLinkHref`, `richtext-link.ts`).
	 *
	 * Se monta SOLO mientras está abierto (lo decide `EditorToolbar.svelte`), así que su estado
	 * inicial sale de las props una vez y no hay nada que reiniciar entre aperturas. No toca el
	 * editor: devuelve el `href` y el texto de respaldo por `onApply`, y quien lo abre decide si
	 * enlaza la selección o inserta ese texto.
	 *
	 * Estados de la búsqueda: cargando, sin resultados, error con «Reintentar», y sitio sin ningún
	 * tipo con ruta (se dice, y el modo externo sigue admitiendo una ruta escrita a mano). Una
	 * página sin ruta todavía se enseña, pero no se puede elegir: no hay nada que enlazar.
	 *
	 * El marco, el foco atrapado, `Esc` y la devolución del foco son de `AdminDialog.svelte`.
	 */
	import { onMount, untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend/errors';
	import AdminDialog from '$lib/admin/AdminDialog.svelte';
	import { RelationSearchSequencer } from './relation-search';
	import {
		buildPageSearchQuery,
		isInternalHref,
		pageCandidatesFromPage,
		pageTypesWithPath,
		validateLinkHref,
		type LinkHrefError,
		type PageLinkCandidate
	} from './richtext-link';

	interface Props {
		/** `href` del enlace sobre el que está el cursor, o `null` si se va a crear uno nuevo. */
		currentHref: string | null;
		/** `href` validado + texto que se inserta si no había nada seleccionado. */
		onApply: (link: { href: string; text: string }) => void;
		onRemove: () => void;
		onClose: () => void;
	}

	let { currentHref, onApply, onRemove, onClose }: Props = $props();

	const ctx = getVegaContext();
	const id = $props.id();

	type Mode = 'page' | 'external';
	type SearchStatus = 'loading' | 'ready' | 'error';

	const SEARCH_DEBOUNCE_MS = 250;

	const pageTypes = $derived(pageTypesWithPath(ctx.model));
	const severalTypes = $derived(pageTypes.length > 1);

	const initialHref = untrack(() => currentHref);
	const initialIsPage = untrack(
		() => pageTypes.length > 0 && (initialHref === null || isInternalHref(initialHref))
	);

	let mode = $state<Mode>(initialIsPage ? 'page' : 'external');
	let url = $state(initialHref ?? '');
	/** Ruta elegida en el modo de página. Al abrir sobre un enlace interno, la que ya tenía. */
	let selected = $state<{ path: string; title: string } | null>(
		initialHref !== null && isInternalHref(initialHref)
			? { path: initialHref, title: initialHref }
			: null
	);
	let error = $state<LinkHrefError | 'noPage' | null>(null);

	let searchTerm = $state('');
	let status = $state<SearchStatus>('loading');
	let candidates = $state<PageLinkCandidate[]>([]);
	let searchError = $state('');

	const sequencer = new RelationSearchSequencer();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let destroyed = false;

	async function runSearch(term: string): Promise<void> {
		if (pageTypes.length === 0) return;
		const seq = sequencer.next();
		status = 'loading';
		try {
			const types = pageTypes;
			const pages = await Promise.all(
				types.map((type) => ctx.port.list(type.name, buildPageSearchQuery(type, term)))
			);
			if (destroyed || !sequencer.isLatest(seq)) return;
			candidates = pages.flatMap((page, index) => pageCandidatesFromPage(types[index], page));
			status = 'ready';
		} catch (err) {
			if (destroyed || !sequencer.isLatest(seq)) return;
			candidates = [];
			searchError = err instanceof VegaError ? err.message : ctx.t('common.networkError');
			status = 'error';
		}
	}

	function handleSearchInput(event: Event): void {
		const raw = (event.currentTarget as HTMLInputElement).value;
		searchTerm = raw;
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void runSearch(raw);
		}, SEARCH_DEBOUNCE_MS);
	}

	onMount(() => {
		void runSearch('');
		return () => {
			destroyed = true;
			if (debounceTimer !== null) clearTimeout(debounceTimer);
		};
	});

	function choose(candidate: PageLinkCandidate): void {
		selected = { path: candidate.path, title: candidate.title };
		error = null;
	}

	function setMode(next: Mode): void {
		mode = next;
		error = null;
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (mode === 'page') {
			if (selected === null) {
				error = 'noPage';
				return;
			}
			onApply({ href: selected.path, text: selected.title });
			return;
		}
		const result = validateLinkHref(url);
		if (!result.ok) {
			error = result.reason;
			return;
		}
		onApply({ href: result.href, text: result.href });
	}
</script>

<AdminDialog open title={ctx.t('form.editor.linkDialog.title')} {onClose}>
	<form id="{id}-form" class="vega-admin-form" novalidate onsubmit={submit}>
		<fieldset class="vega-admin-choices">
			<legend class="vega-admin-sr-only">{ctx.t('form.editor.linkDialog.modeLabel')}</legend>
			<label class="vega-admin-radio-card" data-checked={mode === 'page'}>
				<input
					type="radio"
					name="{id}-mode"
					value="page"
					checked={mode === 'page'}
					onchange={() => setMode('page')}
				/>
				<span>
					<b>{ctx.t('form.editor.linkDialog.modePage')}</b>
					<span>{ctx.t('form.editor.linkDialog.modePageHint')}</span>
				</span>
			</label>
			<label class="vega-admin-radio-card" data-checked={mode === 'external'}>
				<input
					type="radio"
					name="{id}-mode"
					value="external"
					checked={mode === 'external'}
					onchange={() => setMode('external')}
				/>
				<span>
					<b>{ctx.t('form.editor.linkDialog.modeExternal')}</b>
					<span>{ctx.t('form.editor.linkDialog.modeExternalHint')}</span>
				</span>
			</label>
		</fieldset>

		{#if mode === 'page'}
			{#if pageTypes.length === 0}
				<div class="vega-admin-notice vega-admin-notice--info" data-link-pages="none">
					<p class="vega-admin-notice-body">{ctx.t('form.editor.linkDialog.noPageTypes')}</p>
				</div>
			{:else}
				<div class="vega-admin-field">
					<label for="{id}-search">{ctx.t('form.editor.linkDialog.searchLabel')}</label>
					<input
						id="{id}-search"
						class="vega-admin-input"
						type="search"
						autocomplete="off"
						value={searchTerm}
						placeholder={ctx.t('form.editor.linkDialog.searchPlaceholder')}
						oninput={handleSearchInput}
						data-autofocus=""
					/>
				</div>

				<div class="vega-rt-link-results" data-link-pages={status}>
					{#if status === 'loading'}
						<p class="vega-rt-link-status" role="status">
							{ctx.t('form.editor.linkDialog.loading')}
						</p>
					{:else if status === 'error'}
						<div class="vega-rt-link-error" role="alert">
							<p>{ctx.t('form.editor.linkDialog.loadError', { message: searchError })}</p>
							<button
								type="button"
								class="vega-admin-btn vega-admin-btn--sm"
								onclick={() => void runSearch(searchTerm)}
							>
								{ctx.t('common.retry')}
							</button>
						</div>
					{:else if candidates.length === 0}
						<p class="vega-rt-link-status" role="status">
							{ctx.t('form.editor.linkDialog.empty')}
						</p>
					{:else}
						<ul class="vega-rt-link-list">
							{#each candidates as candidate (candidate.key)}
								{@const linkable = isInternalHref(candidate.path)}
								<li>
									<button
										type="button"
										class="vega-rt-link-page"
										aria-pressed={linkable && selected?.path === candidate.path}
										aria-disabled={!linkable}
										onclick={() => linkable && choose(candidate)}
									>
										<span class="vega-rt-link-page-title">{candidate.title}</span>
										<span class="vega-rt-link-page-meta">
											{#if linkable}
												<span class="vega-rt-link-page-path">{candidate.path}</span>
											{:else}
												<span>{ctx.t('form.editor.linkDialog.noPath')}</span>
											{/if}
											{#if severalTypes}
												<span>· {candidate.typeLabel}</span>
											{/if}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if selected}
					<p class="vega-rt-link-selected" data-link-selected>
						{ctx.t('form.editor.linkDialog.selected')}
						<span class="vega-rt-link-page-path">{selected.path}</span>
					</p>
				{/if}
				{#if error === 'noPage'}
					<p class="vega-admin-field-error" role="alert">
						{ctx.t('form.editor.linkDialog.error.noPage')}
					</p>
				{/if}
			{/if}
		{:else}
			<div class="vega-admin-field">
				<label for="{id}-url">{ctx.t('form.editor.linkDialog.urlLabel')}</label>
				<input
					id="{id}-url"
					class="vega-admin-input"
					type="text"
					inputmode="url"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					bind:value={url}
					oninput={() => (error = null)}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? `${id}-url-error` : `${id}-url-help`}
					data-autofocus=""
				/>
				{#if error && error !== 'noPage'}
					<p class="vega-admin-field-error" id="{id}-url-error" role="alert">
						{ctx.t(`form.editor.linkDialog.error.${error}`)}
					</p>
				{:else}
					<p class="vega-admin-help" id="{id}-url-help">
						{ctx.t('form.editor.linkDialog.urlHelp')}
					</p>
				{/if}
			</div>
		{/if}
	</form>

	{#snippet actions()}
		{#if currentHref !== null}
			<button
				type="button"
				class="vega-admin-btn vega-admin-btn--danger vega-rt-link-remove"
				onclick={onRemove}
			>
				{ctx.t('form.editor.linkRemove')}
			</button>
		{/if}
		<button type="button" class="vega-admin-btn" onclick={onClose}>
			{ctx.t('common.cancel')}
		</button>
		{#if mode === 'external' || pageTypes.length > 0}
			<button type="submit" form="{id}-form" class="vega-admin-btn vega-admin-btn--primary">
				{ctx.t('form.editor.linkDialog.apply')}
			</button>
		{/if}
	{/snippet}
</AdminDialog>

<style>
	/* Hueco de resultados con alto mínimo: cargando, vacío y lista ocupan lo mismo, así el diálogo
	   no salta bajo el cursor mientras se escribe. */
	.vega-rt-link-results {
		min-height: 6rem;
	}

	.vega-rt-link-status,
	.vega-rt-link-error p {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-rt-link-error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.vega-rt-link-error p {
		color: var(--danger);
	}

	.vega-rt-link-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-height: 14rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	/* Fila de página: título arriba, ruta en mono debajo (la ruta es un valor canónico, mismo
	   criterio que ids y slugs en el resto de la app). */
	.vega-rt-link-page {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		width: 100%;
		min-height: 2.75rem;
		box-sizing: border-box;
		padding: 0.4rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: 0.88rem;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
	}

	.vega-rt-link-page:hover {
		border-color: var(--line-strong);
	}

	.vega-rt-link-page[aria-pressed='true'] {
		border-color: var(--accent-line);
		background: var(--accent-soft);
	}

	.vega-rt-link-page[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.vega-rt-link-page-title {
		color: var(--ink-hi);
		font-weight: 600;
	}

	.vega-rt-link-page-meta {
		color: var(--ink-2);
		font-size: 0.82rem;
	}

	.vega-rt-link-page-path {
		font-family: var(--mono);
		overflow-wrap: anywhere;
	}

	.vega-rt-link-selected {
		margin: 0;
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	/* «Quitar enlace» se separa a la izquierda: es la acción distinta, no una más de la fila. */
	.vega-rt-link-remove {
		margin-right: auto;
	}

	@media (pointer: coarse) {
		.vega-rt-link-page {
			min-height: 44px;
		}
	}
</style>
