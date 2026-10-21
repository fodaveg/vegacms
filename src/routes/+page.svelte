<script lang="ts">
	/** Inicio de Vega (lámina `inicio-v2.html`): el modelo decide qué se puede crear; cada bloque
	 * carga de forma independiente para conservar las acciones cuando falla una consulta. */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { VegaError } from '$lib/backend/errors';
	import type { DictKey } from '$lib/i18n';
	import Icon from '$lib/icons/Icon.svelte';
	import { normalizeListError } from '$lib/list/list-load';
	import RevisionsOnboarding from '$lib/home/RevisionsOnboarding.svelte';
	import { isRevisionsOfferDismissed, shouldOfferRevisions } from '$lib/home/revisions-onboarding';
	import { backendInstallationKey } from '$lib/session/backend';
	import HomePending from '$lib/home/HomePending.svelte';
	import HomeRecentTable from '$lib/home/HomeRecentTable.svelte';
	import { creatableTypes } from '$lib/home/home-types';
	import { forgetRecentEdits, readRecentEdits } from '$lib/home/recent-edits-store';
	import { loadRecentRows, type RecentRow } from '$lib/home/recent-load';

	const ctx = getVegaContext();
	const hasNav = $derived(ctx.model.nav.groups.some((group) => group.items.length > 0));
	const createTypes = $derived(creatableTypes(ctx.model));
	const isAdmin = ctx.port.capabilities.schemaBootstrap;
	let offerDismissed = $state(isRevisionsOfferDismissed(backendInstallationKey()));
	const hasRevisionsOffer = $derived(!offerDismissed && shouldOfferRevisions(ctx.model, isAdmin));
	type RecentStatus =
		| { kind: 'loading' }
		| { kind: 'error'; error: VegaError }
		| { kind: 'ready'; rows: RecentRow[]; now: number };
	let recent = $state<RecentStatus>({ kind: 'loading' });
	let loadToken = 0;
	const today = new Date();
	const greetingPart =
		today.getHours() < 12 ? 'morning' : today.getHours() < 20 ? 'afternoon' : 'evening';

	/** Saludo con el nombre de la sesión resaltado (lámina: el único color de texto de la
	 *  cabecera). La frase la decide el diccionario; el nombre se marca partiendo la traducción
	 *  por un separador que no aparece en ningún texto. Sin nombre, el saludo sin él. */
	const greeting = $derived.by(() => {
		const name = ctx.session.user.name?.trim();
		if (!name)
			return { before: ctx.t(`home.greeting.${greetingPart}` as DictKey), name: null, after: '' };
		const marker = '\u0000';
		const [before, after = ''] = ctx
			.t(`home.greeting.${greetingPart}Named` as DictKey, { name: marker })
			.split(marker);
		return { before, name, after };
	});

	/** «Martes, 21 de octubre»: fecha larga del idioma activo con la inicial en mayúscula. */
	const dateLabel = (() => {
		const text = new Intl.DateTimeFormat(ctx.locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		}).format(today);
		return text.charAt(0).toLocaleUpperCase(ctx.locale) + text.slice(1);
	})();

	/** Releer la lista local y resolver sus registros actuales; descartar respuestas obsoletas. */
	async function loadRecent(): Promise<void> {
		const token = ++loadToken;
		const userId = ctx.session.user.id;
		const edits = readRecentEdits(userId);
		if (edits.length === 0) {
			recent = { kind: 'ready', rows: [], now: Date.now() };
			return;
		}
		recent = { kind: 'loading' };
		try {
			const result = await loadRecentRows(ctx.port, ctx.model, edits);
			if (token !== loadToken) return;
			forgetRecentEdits(userId, result.gone);
			recent = { kind: 'ready', rows: result.rows, now: Date.now() };
		} catch (err) {
			if (token !== loadToken) return;
			recent = { kind: 'error', error: normalizeListError(err) };
		}
	}

	onMount(() => {
		if (hasNav) void loadRecent();
		return () => {
			loadToken++;
		};
	});
</script>

{#if !hasNav}
	<div class="vega-home-empty vega-empty-nav" class:editor={!isAdmin}>
		<div class="glyph">
			<Icon id={isAdmin ? 'publish' : 'document'} size={22} strokeWidth={1.6} />
		</div>
		<h1>{ctx.t('nav.emptyTitle')}</h1>
		{#if isAdmin}
			<p>{ctx.t('nav.emptyBody')}</p>
			<!-- La lámina deja «Ir a Ajustes» visible también junto a la oferta de historial. -->
			<button type="button" class="primary" onclick={() => ctx.nav.toSettings()}
				>{ctx.t('nav.emptyCta')}</button
			>
			{#if hasRevisionsOffer}
				<div class="offer">
					<RevisionsOnboarding
						onDismiss={() => {
							offerDismissed = true;
						}}
					/>
				</div>
			{/if}
		{:else}
			<p>{ctx.t('nav.emptyBodyEditor')}</p>
		{/if}
	</div>
{:else}
	<div class="vega-home">
		<header class="hero">
			<div>
				<h1>
					{greeting.before}{#if greeting.name}<em>{greeting.name}</em>{greeting.after}{/if}
				</h1>
				<p class="sub">
					<span>{dateLabel}</span><span aria-hidden="true">·</span><span>{ctx.model.site.name}</span
					>
				</p>
			</div>
			{#if createTypes.length > 0}
				<section class="create" aria-label={ctx.t('home.create.title')}>
					<span class="create-label">{ctx.t('home.create.title')}</span>
					{#each createTypes as type (type.name)}
						<button
							type="button"
							class="chip"
							data-create-type={type.name}
							aria-label={ctx.t('home.create.button', { label: type.labelSingular })}
							onclick={() => ctx.nav.toNew(type.name)}
						>
							<span class="chip-icon"
								><Icon id={type.icon ?? 'document'} size={14} strokeWidth={1.6} /></span
							>{type.labelSingular}
						</button>
					{/each}
				</section>
			{/if}
		</header>

		<RevisionsOnboarding />
		<HomePending />

		<section class="recent" aria-labelledby="vega-home-recent-title">
			<div class="recent-head">
				<h2 id="vega-home-recent-title">{ctx.t('home.recent.title')}</h2>
				{#if recent.kind === 'ready' && recent.rows.length > 0}<span class="count"
						>{recent.rows.length}</span
					>{/if}
				<span class="hint">{ctx.t('home.recent.localHint')}</span>
			</div>
			{#if recent.kind === 'loading'}
				<div
					class="skeletons"
					data-home-recent="loading"
					aria-label={ctx.t('common.loading')}
					aria-busy="true"
				>
					{#each [80, 60, 90, 55] as width (width)}<div class="skeleton">
							<div class="sk sk-thumb"></div>
							<div class="sk-body">
								<span class="sk" style:width="{width}%" style:height="14px"></span>
								<span class="sk sk-meta"></span>
							</div>
						</div>{/each}
				</div>
			{:else if recent.kind === 'error'}
				<div class="state" data-home-recent="error" role="alert">
					<div class="state-glyph"><Icon id="generic" size={16} strokeWidth={1.6} /></div>
					<h3>{ctx.t('home.recent.errorTitle')}</h3>
					<p>{ctx.t('home.recent.errorBody', { message: recent.error.message })}</p>
					<button type="button" onclick={() => loadRecent()}
						><Icon id="update" size={16} strokeWidth={1.6} />{ctx.t('common.retry')}</button
					>
				</div>
			{:else if recent.rows.length === 0}
				<div class="state" data-home-recent="empty">
					<div class="state-glyph"><Icon id="document" size={16} strokeWidth={1.6} /></div>
					<h3>{ctx.t('home.recent.emptyTitle')}</h3>
					<p>{ctx.t('home.recent.emptyBody')}</p>
				</div>
			{:else}
				<div data-home-recent="ready"><HomeRecentTable rows={recent.rows} now={recent.now} /></div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.vega-home {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		max-width: 1160px;
		margin: 0 auto;
	}
	.hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--sp-5);
		padding-top: var(--sp-3);
	}
	h1 {
		margin: 0;
		font: 600 var(--fs-44) / 1.02 var(--display);
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.035em;
		color: var(--ink-hi);
	}
	h1 em {
		font-style: normal;
		color: var(--accent-text);
	}
	.sub {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin: 10px 0 0;
		color: var(--ink-2);
		font-size: var(--fs-14);
	}
	.create {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.create-label {
		margin-right: 2px;
		color: var(--ink-2);
		font-size: var(--fs-13);
		font-weight: 500;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		height: 38px;
		box-sizing: border-box;
		padding: 0 14px 0 6px;
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		box-shadow: var(--shadow-card);
		color: var(--ink-hi);
		font: 500 var(--fs-13) var(--sans);
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--accent-line);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}
	.chip-icon {
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent-text);
	}
	.recent {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.recent-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.recent-head h2 {
		margin: 0;
		font: 600 var(--fs-22) / 1.2 var(--display);
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.025em;
		color: var(--ink-hi);
	}
	.count {
		padding: 1px 8px;
		border-radius: var(--r-pill);
		background: var(--btn);
		color: var(--ink-2);
		font: var(--fs-12) var(--mono);
	}
	.hint {
		margin-left: auto;
		color: var(--ink-2);
		font-size: var(--fs-12);
	}

	/* ————— Estados dentro de tarjeta (`.cstate` de la lámina) ————— */
	.state {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-2);
		box-sizing: border-box;
		padding: var(--sp-8) var(--sp-6);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	.state > * {
		max-width: 48ch;
	}
	.state-glyph {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		margin-bottom: 4px;
		border-radius: 12px;
		background: var(--btn);
		color: var(--ink-2);
	}
	.state[role='alert'] .state-glyph {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.state h3 {
		margin: 0;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--ink-hi);
	}
	.state p {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-13);
	}
	.state button,
	.vega-home-empty button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		margin-top: 6px;
		padding: 0 var(--sp-4);
		border: 1px solid var(--line);
		border-radius: var(--r-pill);
		background: var(--surface);
		color: var(--ink-hi);
		font: 500 var(--fs-13) var(--sans);
		white-space: nowrap;
		cursor: pointer;
	}
	.state button:hover {
		background: var(--btn);
		border-color: var(--line-strong);
	}

	/* ————— Esqueleto de «Lo último» con brillo ————— */
	.skeletons {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--sp-4);
	}
	.skeleton {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}
	.sk {
		position: relative;
		display: block;
		overflow: hidden;
		height: 12px;
		border-radius: 6px;
		background: var(--btn);
	}
	.sk::after {
		content: '';
		position: absolute;
		inset: 0;
		transform: translateX(-100%);
		background: linear-gradient(90deg, transparent, var(--surface), transparent);
		animation: vega-home-recent-shimmer 1.4s infinite;
	}
	.sk-thumb {
		height: auto;
		aspect-ratio: 16 / 10;
		border-radius: 0;
	}
	.sk-body {
		display: grid;
		gap: var(--sp-2);
		padding: 12px 14px 14px;
	}
	.sk-meta {
		width: 50%;
	}
	@keyframes vega-home-recent-shimmer {
		to {
			transform: translateX(100%);
		}
	}

	/* ————— Sitio vacío ————— */
	.vega-home-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 10px;
		max-width: 560px;
		margin: var(--sp-10) auto 0;
	}
	.vega-home-empty .glyph {
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		margin-bottom: 6px;
		border-radius: var(--r-md);
		background: var(--accent-fill);
		color: var(--accent-ink);
		box-shadow: var(--shadow-brand);
	}
	.vega-home-empty.editor .glyph {
		background: var(--btn);
		color: var(--ink-2);
		box-shadow: none;
	}
	.vega-home-empty h1 {
		font-size: var(--fs-36);
		line-height: 1.05;
		letter-spacing: -0.03em;
	}
	.vega-home-empty p {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-15);
	}
	.vega-home-empty button.primary {
		margin-top: var(--sp-2);
		border-color: transparent;
		background: var(--accent-fill);
		color: var(--accent-ink);
	}
	.vega-home-empty button.primary:hover {
		filter: brightness(1.06);
	}
	.offer {
		width: 100%;
		margin-top: var(--sp-5);
	}

	@media (max-width: 1180px) {
		.skeletons {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.skeleton:last-child {
			display: none;
		}
	}
	@media (max-width: 900px) {
		.skeletons {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.skeleton:nth-child(3) {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.vega-home {
			gap: var(--sp-5);
		}
		h1 {
			font-size: var(--fs-36);
		}
		.chip {
			height: 42px;
		}
		.hint {
			display: none;
		}
		.skeletons {
			grid-template-columns: minmax(0, 1fr);
			gap: 10px;
		}
		.skeleton {
			flex-direction: row;
		}
		.skeleton:nth-child(n) {
			display: flex;
		}
		.sk-thumb {
			flex: none;
			width: 96px;
			aspect-ratio: auto;
		}
		.sk-body {
			flex: 1;
		}
		.vega-home-empty {
			margin-top: var(--sp-4);
		}
		.vega-home-empty h1 {
			font-size: var(--fs-28);
		}
	}
	@media (pointer: coarse) {
		.chip,
		.state button,
		.vega-home-empty button {
			min-height: 44px;
		}
	}
</style>
