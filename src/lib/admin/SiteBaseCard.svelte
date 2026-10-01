<script lang="ts">
	/**
	 * Tarjeta «Base del sitio» de `/settings` (solo superusuario): prepara o actualiza el PocketBase
	 * con `seedSiteProject`, que hasta ahora solo llamaban los tests. Diseño fijado en
	 * `design/mockups/2026-10-01-ajustes-y-sembrado/A-preparar-el-sitio.html`.
	 *
	 * Flujo (cada paso es una escritura que NO se deshace, así que ninguna ocurre sin confirmar):
	 * 1. Al montar, preflight de solo lectura (`previewSiteSeed`): la tarjeta dice si falta algo, si
	 *    todo está al día o si el preflight abortaría (divergencia) sin tocar nada.
	 * 2. El botón REPITE el preflight antes de abrir el diálogo, para no enseñar un plan viejo, y el
	 *    diálogo enseña lo que va a crear, añadir o sustituir (o por qué aborta).
	 * 3. Confirmar ejecuta `seedSiteProject`. Mientras corre no se puede cerrar ni cancelar y solo
	 *    se muestra el tiempo transcurrido: el sembrado no avisa de por dónde va.
	 * 4. Un fallo deja el diálogo con la salida del servidor; «Reintentar» vuelve al paso 2.
	 *
	 * `passwordResetUrl` sale del origen de la SPA. Que ese origen sea de fiar para dejarlo escrito
	 * en la plantilla del correo lo decide el puerto (`'foreign-origin'` si no): aquí se cuenta en el
	 * resultado, no es un error.
	 *
	 * El adaptador de PocketBase no se puede preflightar para `vega_editors` (ver la cabecera de
	 * `site-seeding.ts`): el plan lo dice con «si ya existe, se deja como está».
	 */
	import { onMount, tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import {
		previewSiteSeed,
		seedSiteProject,
		type SiteSeedDivergence,
		type SiteSeedPlanSummary,
		type SiteSeedPreview,
		type SiteSeedResult
	} from '$lib/backend/site-seeding';
	import Icon from '$lib/icons/Icon.svelte';
	import { editorsRoute, passwordResetRoute } from '$lib/nav/routes';
	import AdminDialog from './AdminDialog.svelte';
	import { formatElapsed } from './format';
	import {
		buildPlanView,
		describeCardPlan,
		describeDivergence,
		divergencesText,
		invitationLinkNote,
		siteBaseKind,
		siteBaseMode,
		summarizeResult,
		type PlanView
	} from './site-base';
	import './admin.css';

	interface Props {
		/** Tras escribir (también si falló a medias): que la página refresque tipos y modelo. */
		onChanged?: () => void | Promise<void>;
	}

	let { onChanged }: Props = $props();

	const ctx = getVegaContext();
	const headingId = $props.id();

	type Phase = 'checking' | 'ready' | 'error';
	type DialogState = 'closed' | 'plan' | 'blocked' | 'running' | 'error';

	let phase = $state<Phase>('checking');
	let preview = $state<SiteSeedPreview | null>(null);
	let result = $state<SiteSeedResult | null>(null);
	let dialog = $state<DialogState>('closed');
	/** El plan o las divergencias que enseña el diálogo: salen del preflight de justo antes. */
	let dialogPlan = $state<SiteSeedPlanSummary | null>(null);
	let dialogDivergences = $state<readonly SiteSeedDivergence[]>([]);
	let errorMessage = $state('');
	let startedAt = $state(0);
	let now = $state(0);
	let sectionEl = $state<HTMLElement | null>(null);
	/** Descarta la respuesta de un preflight superado por otro más reciente. */
	let checkSeq = 0;

	const kind = $derived(preview ? siteBaseKind(preview) : null);
	const mode = $derived(dialogPlan ? siteBaseMode(dialogPlan) : 'update');
	const planView = $derived<PlanView | null>(dialogPlan ? buildPlanView(dialogPlan, ctx.t) : null);
	const divergenceViews = $derived(
		dialogDivergences.map((item) => describeDivergence(item, ctx.t))
	);
	const canLinkEditors = ctx.port.capabilities.administration;

	/**
	 * `AdminDialog` solo coloca el foco al ABRIR. Al pasar de «en curso» a «error» dentro del mismo
	 * diálogo, el botón enfocado («Cancelar») desaparece y el foco caería al `body`: este gancho lo
	 * lleva al botón nuevo.
	 */
	function focusWhenShown(node: HTMLElement): void {
		void tick().then(() => node.focus());
	}

	function reportReadError(err: unknown): void {
		ctx.feedback.reportError(
			err instanceof VegaError
				? err
				: VegaError.backend('Error comprobando la base del sitio', err),
			{ action: 'settings:siteBase' }
		);
	}

	/** Preflight. `quiet` no pasa por «Comprobando…» (refresco tras escribir). */
	async function check(quiet = false): Promise<SiteSeedPreview | null> {
		const seq = ++checkSeq;
		if (!quiet) phase = 'checking';
		try {
			const next = await previewSiteSeed(ctx.port);
			if (seq !== checkSeq) return null;
			preview = next;
			phase = 'ready';
			return next;
		} catch (err) {
			if (seq !== checkSeq) return null;
			reportReadError(err);
			preview = null;
			phase = 'error';
			return null;
		}
	}

	onMount(() => {
		void check();
	});

	async function recheck(): Promise<void> {
		result = null;
		await check();
	}

	/** El botón principal y «Reintentar»: preflight nuevo y, según salga, el plan o el aborto. */
	async function openDialog(): Promise<void> {
		dialog = 'closed';
		const next = await check();
		if (!next) return;
		if (next.status === 'blocked') {
			dialogDivergences = next.divergences;
			dialog = 'blocked';
		} else if (!next.plan.upToDate) {
			dialogPlan = next.plan;
			dialog = 'plan';
		}
	}

	function showWhy(): void {
		if (preview?.status !== 'blocked') return;
		dialogDivergences = preview.divergences;
		dialog = 'blocked';
	}

	function absoluteResetUrl(): string {
		return new URL(passwordResetRoute(), window.location.origin).toString();
	}

	async function notifyChanged(): Promise<void> {
		try {
			await onChanged?.();
		} catch (err) {
			reportReadError(err);
		}
	}

	async function confirm(): Promise<void> {
		if (dialog !== 'plan') return;
		const wasPrepare = mode === 'prepare';
		startedAt = Date.now();
		now = startedAt;
		dialog = 'running';
		try {
			const done = await seedSiteProject(ctx.port, { passwordResetUrl: absoluteResetUrl() });
			result = done;
			dialog = 'closed';
			ctx.feedback.toast(
				ctx.t(wasPrepare ? 'settings.site.toast.prepared' : 'settings.site.toast.updated'),
				{ kind: 'success' }
			);
			await notifyChanged();
			await check(true);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err);
			dialog = 'error';
			await notifyChanged();
		}
	}

	function closeDialog(): void {
		if (dialog === 'running') return;
		const afterError = dialog === 'error';
		dialog = 'closed';
		// Tras un fallo a medias el sitio ya no está como estaba: la tarjeta lo vuelve a leer.
		if (afterError) void check(true);
	}

	async function copyDetail(): Promise<void> {
		try {
			await navigator.clipboard.writeText(divergencesText(dialogDivergences));
			ctx.feedback.toast(ctx.t('settings.site.copied'), { kind: 'success' });
		} catch {
			ctx.feedback.toast(ctx.t('settings.site.copyFailed'), { kind: 'error' });
		}
	}

	$effect(() => {
		if (dialog !== 'running') return;
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(timer);
	});

	const dialogTitle = $derived(
		dialog === 'blocked'
			? ctx.t('settings.site.blockedDialog.title')
			: ctx.t(
					mode === 'prepare'
						? 'settings.site.dialog.prepareTitle'
						: 'settings.site.dialog.updateTitle'
				)
	);
	const dialogDescription = $derived(
		dialog === 'plan'
			? ctx.t(
					mode === 'prepare'
						? 'settings.site.dialog.prepareIntro'
						: 'settings.site.dialog.updateIntro'
				)
			: dialog === 'blocked'
				? ctx.t('settings.site.blockedDialog.intro')
				: undefined
	);
	const resultNote = $derived(result ? invitationLinkNote(result, ctx.t) : null);
</script>

{#snippet planList(view: PlanView, prefix: string)}
	<div class="vega-plan">
		{#each view.groups as group, index (group.id)}
			<div>
				<h3 id="{prefix}-{index}">{group.heading}</h3>
				<ul aria-labelledby="{prefix}-{index}">
					{#each group.items as item (item.title)}
						<li>
							<b>{item.title}</b>
							<span>
								{#if item.code && item.codeFirst}<code>{item.code}</code> ·
								{/if}
								{item.text}
								{#if item.code && !item.codeFirst}
									{#if item.text}·{/if}
									<code>{item.code}</code>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
		{#if view.rest}
			<p class="vega-plan-rest">{view.rest}</p>
		{/if}
	</div>
{/snippet}

<section
	class="vega-seed"
	aria-labelledby={headingId}
	data-site-state={phase === 'ready' ? kind : phase}
	bind:this={sectionEl}
	tabindex="-1"
>
	<div class="vega-admin-subhead">
		<h2 id={headingId}>{ctx.t('settings.site.title')}</h2>
		{#if phase === 'ready' && (kind === 'unprepared' || kind === 'update')}
			<span class="vega-admin-tag" data-kind="other">
				{ctx.t(kind === 'unprepared' ? 'settings.site.tag.unprepared' : 'settings.site.tag.update')}
			</span>
		{:else if phase === 'ready' && kind === 'current'}
			<span class="vega-admin-tag" data-kind="pub">{ctx.t('settings.site.tag.current')}</span>
		{/if}
	</div>

	{#if phase === 'checking'}
		<p class="vega-seed-desc" aria-live="polite">
			<span class="vega-admin-saving">{ctx.t('settings.site.checking')}</span>
		</p>
	{:else if phase === 'error'}
		<p class="vega-seed-desc" role="alert">{ctx.t('settings.site.loadError')}</p>
		<button type="button" class="vega-admin-btn" onclick={recheck}>{ctx.t('common.retry')}</button>
	{:else if preview?.status === 'blocked'}
		<div class="vega-admin-notice vega-admin-notice--warning">
			<p class="vega-admin-notice-title">{ctx.t('settings.site.blocked.title')}</p>
			<p class="vega-admin-notice-body">
				{preview.divergences.length === 1
					? ctx.t('settings.site.blocked.bodyOne')
					: ctx.t('settings.site.blocked.body', { count: preview.divergences.length })}
			</p>
			<div class="vega-admin-notice-actions">
				<button type="button" class="vega-admin-btn" onclick={showWhy}>
					{ctx.t('settings.site.btn.why')}
				</button>
				<button type="button" class="vega-admin-btn" onclick={recheck}>
					{ctx.t('settings.site.btn.recheck')}
				</button>
			</div>
		</div>
	{:else if preview?.status === 'ready' && kind === 'current'}
		{#if result}
			<p class="vega-seed-desc" role="status">
				{summarizeResult(result, ctx.t)}
				{#if canLinkEditors}
					{ctx.t('settings.site.result.next')}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={editorsRoute()} class="vega-admin-link">{ctx.t('nav.editors')}</a>.
				{/if}
			</p>
			{#if resultNote}
				<p class="vega-seed-desc">{resultNote}</p>
			{/if}
		{:else}
			<p class="vega-seed-desc">{ctx.t('settings.site.desc.current')}</p>
		{/if}
		<button type="button" class="vega-admin-btn" onclick={recheck}>
			{ctx.t('settings.site.btn.recheck')}
		</button>
	{:else if preview?.status === 'ready'}
		<p class="vega-seed-desc">{describeCardPlan(preview.plan, ctx.t)}</p>
		<button type="button" class="vega-admin-btn vega-admin-btn--primary" onclick={openDialog}>
			{#if kind === 'update'}<Icon id="update" size={14} />{/if}
			{ctx.t(kind === 'update' ? 'settings.site.btn.update' : 'settings.site.btn.prepare')}
		</button>
	{/if}
</section>

<AdminDialog
	open={dialog !== 'closed'}
	title={dialogTitle}
	description={dialogDescription}
	busy={dialog === 'running'}
	fallbackFocusEl={sectionEl}
	onClose={closeDialog}
>
	{#if (dialog === 'plan' || dialog === 'running') && planView}
		{@render planList(planView, `${headingId}-plan`)}
		{#if dialog === 'plan'}
			<p class="vega-admin-dialog-text">{ctx.t('settings.site.dialog.irreversible')}</p>
		{:else}
			<p class="vega-admin-dialog-text" aria-live="polite">
				<span class="vega-admin-saving">
					{ctx.t(
						mode === 'prepare'
							? 'settings.site.dialog.prepareRunning'
							: 'settings.site.dialog.updateRunning',
						{ elapsed: formatElapsed(now - startedAt) }
					)}
				</span>
			</p>
		{/if}
	{:else if dialog === 'blocked'}
		<div class="vega-plan">
			<div>
				<h3 id="{headingId}-why">{ctx.t('settings.site.blockedDialog.group')}</h3>
				<ul aria-labelledby="{headingId}-why">
					{#each divergenceViews as view, index (index)}
						<li>
							<b>{view.title}</b>
							<span>{view.body}</span>
							<details>
								<summary class="vega-admin-link">{ctx.t('settings.site.detail')}</summary>
								<pre class="vega-admin-output">{view.detail}</pre>
							</details>
						</li>
					{/each}
				</ul>
			</div>
		</div>
		<p class="vega-admin-dialog-text">{ctx.t('settings.site.blockedDialog.fix')}</p>
	{:else if dialog === 'error'}
		<div class="vega-admin-notice vega-admin-notice--danger" role="alert">
			<p class="vega-admin-notice-title">{ctx.t('settings.site.error.title')}</p>
			<p class="vega-admin-notice-body">{ctx.t('settings.site.error.body')}</p>
			<pre class="vega-admin-output">{errorMessage}</pre>
		</div>
	{/if}
	{#snippet actions()}
		{#if dialog === 'blocked'}
			<button type="button" class="vega-admin-btn" onclick={copyDetail}>
				{ctx.t('settings.site.btn.copy')}
			</button>
			<button type="button" class="vega-admin-btn" data-autofocus onclick={closeDialog}>
				{ctx.t('common.close')}
			</button>
		{:else if dialog === 'error'}
			<button type="button" class="vega-admin-btn" onclick={closeDialog}>
				{ctx.t('common.close')}
			</button>
			<button
				type="button"
				class="vega-admin-btn vega-admin-btn--primary"
				data-autofocus
				use:focusWhenShown
				onclick={openDialog}
			>
				{ctx.t('common.retry')}
			</button>
		{:else}
			{@const running = dialog === 'running'}
			<button
				type="button"
				class="vega-admin-btn"
				data-autofocus
				aria-disabled={running}
				onclick={closeDialog}
			>
				{ctx.t('common.cancel')}
			</button>
			<button
				type="button"
				class="vega-admin-btn vega-admin-btn--primary"
				aria-disabled={running}
				onclick={confirm}
			>
				{running
					? ctx.t(mode === 'prepare' ? 'settings.site.btn.preparing' : 'settings.site.btn.updating')
					: ctx.t(mode === 'prepare' ? 'settings.site.btn.prepare' : 'settings.site.btn.update')}
			</button>
		{/if}
	{/snippet}
</AdminDialog>

<style>
	/* Misma tarjeta que sus vecinas (`.vega-appearance`, `.vega-about`): mismos números. */
	.vega-seed {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.2rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
	}

	.vega-seed:focus {
		outline: none;
	}

	.vega-seed-desc {
		max-width: 46rem; /* `.vega-admin-desc` */
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-2);
	}

	.vega-seed > :global(.vega-admin-notice) {
		align-self: stretch;
	}

	/* Lista del plan dentro del diálogo. Caja y filas de `.vega-admin-radio-card`; rótulo de grupo
	   = `thead th` de `.vega-admin-table`. */
	.vega-plan {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.vega-plan h3 {
		margin: 0 0 0.35rem;
		font-size: 0.6875rem;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
	}

	.vega-plan ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
	}

	.vega-plan li {
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--line);
		font-size: 0.88rem;
	}

	.vega-plan li:last-child {
		border-bottom: 0;
	}

	.vega-plan li b {
		display: block;
		color: var(--ink-hi);
		font-weight: 600;
	}

	.vega-plan li span {
		color: var(--ink-2);
		font-size: 0.82rem;
		overflow-wrap: anywhere;
	}

	.vega-plan code {
		font-family: var(--mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	.vega-plan-rest {
		margin: 0;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
</style>
