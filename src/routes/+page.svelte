<script lang="ts">
	/**
	 * `/`: la PORTADA («Inicio»; láminas del lote 12, n.º 1, y «portada con pendientes» del lote
	 * 13). Hasta el 1 oct 2026 esta ruta no tenía pantalla: pintaba «Cargando…» y saltaba al
	 * primer elemento del menú. Ahora se queda aquí y enseña, de arriba abajo:
	 *
	 * 1. **Crear**: un acceso por tipo en el que la sesión puede crear, en el orden del menú
	 *    lateral (`creatableTypes`). Sin permiso en ninguno, el bloque no se pinta. Sale del
	 *    modelo, que ya está cargado: no espera a nada.
	 * 2. **Pendientes** (`HomePending`): tarjetas con un número. Sin tarjetas, no ocupa sitio.
	 * 3. **Lo último que editaste**: hasta 8 registros, de una lista guardada EN ESTE NAVEGADOR
	 *    (`$lib/home/recent-edits.ts`; decisión de David: no sale del historial de revisiones, que
	 *    solo ven los superusuarios, así que no sigue a la persona a otro dispositivo). Al abrir se
	 *    resuelven contra el servidor (`loadRecentRows`) para pintar su título y estado de ahora; lo
	 *    que ya no existe o ya no se puede ver no se pinta y se quita de la lista local.
	 *
	 * Un fallo al cargar la lista se queda en SU tarjeta, con «Reintentar»: los accesos a crear y
	 * los pendientes siguen funcionando, y el menú lateral también. Nadie se queda sin entrada.
	 *
	 * Se llega al entrar y, más adelante, desde la marca «Vega» de la barra superior. El menú
	 * lateral NO tiene entrada «Inicio» (lámina 1, nota).
	 *
	 * Sitio sin colecciones (menú vacío): se conserva el estado de siempre, con la guía a Ajustes
	 * para quien administra y el aviso de hablar con quien administra para quien edita (caso límite
	 * §6.1 del contrato P3; es también el de la semilla de demo/e2e).
	 *
	 * Solo se monta dentro de una ruta protegida (guard de `+layout.svelte`): `getVegaContext()`
	 * siempre tiene `model`/`session` listos aquí.
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import type { VegaError } from '$lib/backend/errors';
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

	// «Administrador» = el mismo criterio que `/settings` (`capabilities.schemaBootstrap`): solo
	// quien puede preparar el sitio recibe la guía a Ajustes; quien edita, la de hablar con quien
	// administra.
	const isAdmin = ctx.port.capabilities.schemaBootstrap;
	let offerDismissed = $state(isRevisionsOfferDismissed(backendInstallationKey()));
	const hasRevisionsOffer = $derived(!offerDismissed && shouldOfferRevisions(ctx.model, isAdmin));

	type RecentStatus =
		| { kind: 'loading' }
		| { kind: 'error'; error: VegaError }
		| { kind: 'ready'; rows: RecentRow[]; now: number };

	let recent = $state<RecentStatus>({ kind: 'loading' });
	/** Descarta la respuesta de una carga que ya no es la última (o que llega tras desmontar). */
	let loadToken = 0;

	/**
	 * Carga la lista: lee lo guardado en este navegador y lo resuelve contra el servidor. Con la
	 * lista local vacía (o `localStorage` inservible) no hay nada que pedir: estado vacío directo.
	 */
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
	<div class="vega-empty-nav">
		<h1>{ctx.t('nav.emptyTitle')}</h1>
		{#if isAdmin}
			<p>{ctx.t('nav.emptyBody')}</p>
			{#if !hasRevisionsOffer}<button type="button" onclick={() => ctx.nav.toSettings()}
					>{ctx.t('nav.emptyCta')}</button
				>{/if}
			<RevisionsOnboarding
				onDismiss={() => {
					offerDismissed = true;
				}}
			/>
		{:else}
			<p>{ctx.t('nav.emptyBodyEditor')}</p>
		{/if}
	</div>
{:else}
	<div class="vega-home">
		<div class="vega-list-header"><h1>{ctx.t('home.title')}</h1></div>

		{#if createTypes.length > 0}
			<section class="vega-home-block" aria-labelledby="vega-home-create-title">
				<h2 id="vega-home-create-title">{ctx.t('home.create.title')}</h2>
				<div class="vega-home-create">
					{#each createTypes as type (type.name)}
						<button
							type="button"
							class="vega-list-export-button"
							data-create-type={type.name}
							aria-label={ctx.t('home.create.button', { label: type.labelSingular })}
							onclick={() => ctx.nav.toNew(type.name)}
						>
							<Icon id="plus" size={14} />
							{type.labelSingular}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<RevisionsOnboarding />
		<HomePending />

		<section class="vega-home-block" aria-labelledby="vega-home-recent-title">
			<h2 id="vega-home-recent-title">{ctx.t('home.recent.title')}</h2>
			<div class="vega-list-card">
				{#if recent.kind === 'loading'}
					<p class="vega-list-card-pad" data-home-recent="loading" aria-live="polite">
						{ctx.t('common.loading')}
					</p>
				{:else if recent.kind === 'error'}
					<div class="vega-list-error vega-list-card-pad" data-home-recent="error" role="alert">
						<h3>{ctx.t('home.recent.errorTitle')}</h3>
						<p>{ctx.t('home.recent.errorBody', { message: recent.error.message })}</p>
						<button type="button" class="vega-home-retry" onclick={() => loadRecent()}>
							{ctx.t('common.retry')}
						</button>
					</div>
				{:else if recent.rows.length === 0}
					<!-- El estado vacío del listado, sin botón: los accesos a crear están justo encima. -->
					<div class="vega-list-empty vega-list-card-pad" data-home-recent="empty">
						<span class="vega-list-empty-glyph" aria-hidden="true">
							<Icon id="document" size={20} />
						</span>
						<h3>{ctx.t('home.recent.emptyTitle')}</h3>
						<p>{ctx.t('home.recent.emptyBody')}</p>
					</div>
				{:else}
					<div data-home-recent="ready">
						<HomeRecentTable rows={recent.rows} now={recent.now} />
					</div>
				{/if}
			</div>
		</section>
	</div>
{/if}

<style>
	.vega-empty-nav {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 30rem;
	}

	.vega-empty-nav h1 {
		margin: 0;
		font-size: 1.2rem;
	}

	.vega-empty-nav button {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	/* ——— Portada (lámina 1 del lote 12, `lamina.css` §2.1) ——— */

	/* Misma columna que `.vega-list-page`. */
	.vega-home {
		display: flex;
		flex-direction: column;
		gap: calc(var(--vega-space-gutter) * 1.5);
	}

	.vega-home-block {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	/* Rótulo de bloque: el de `.vega-fsection h2` (RecordForm), con `--ink-2` porque aquí va sobre
	   el papel de la página y no dentro de una tarjeta (mismo motivo que `.vega-field-help`). */
	.vega-home-block > h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-2);
	}

	/* Fila de accesos a crear: mismo reparto que `.vega-list-toolbar`. */
	.vega-home-create {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	/* ——— Piezas del listado (`routes/c/[type]/+page.svelte`), con sus mismos valores: cabecera,
	   botón secundario, tarjeta y estados de carga, vacío y error. El CSS de aquella ruta es de
	   ámbito de componente y no llega aquí. ——— */

	.vega-list-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.vega-list-header h1 {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--ink-hi);
		letter-spacing: -0.01em;
	}

	.vega-list-export-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		background: var(--btn);
		color: var(--ink);
		border-radius: var(--r);
		padding: 0.45rem 1rem;
		font-size: 0.8125rem;
		font-weight: 550;
		cursor: pointer;
		white-space: nowrap;
	}

	.vega-list-export-button:hover {
		border-color: var(--line-strong);
	}

	.vega-list-card {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-list-card-pad {
		padding: 2rem 1.5rem;
		margin: 0;
	}

	p.vega-list-card-pad {
		color: var(--ink-2);
	}

	.vega-list-error,
	.vega-list-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		max-width: 32rem;
	}

	.vega-list-empty-glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent-text);
	}

	/* `h3` y no el `h2` del listado: aquí cuelgan del rótulo del bloque, que ya es `h2`. */
	.vega-list-error h3,
	.vega-list-empty h3 {
		margin: 0;
		font-size: 1rem;
	}

	.vega-list-error p,
	.vega-list-empty p {
		margin: 0;
	}

	.vega-home-retry {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		cursor: pointer;
	}

	/* Objetivo táctil de 44 px con puntero basto. */
	@media (pointer: coarse) {
		.vega-list-export-button,
		.vega-home-retry {
			min-height: 44px;
		}
	}
</style>
