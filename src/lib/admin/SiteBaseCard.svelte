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
	 *    diálogo enseña lo que va a crear y añadir (o por qué aborta). Nada se sustituye: las
	 *    entradas que se añaden al modelo de contenido van una a una y con su nombre, para que
	 *    quien borró una a propósito vea que vuelve, y lo que NO se puede añadir va en su grupo.
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
	 *
	 * MÓDULOS. Debajo de la base, la lista de lo que se puede añadir encima (blog, formulario de
	 * contacto: `SITE_BASE_MODULES`). Cada fila dice si el módulo está añadido —deducido de su parte
	 * del preflight— y «Añadir» abre el MISMO diálogo, con el plan de ese módulo: qué colecciones se
	 * crean y qué entradas se añaden al modelo de contenido. Dos reglas:
	 * - Un módulo solo se añade con la base al día. La base va en toda pasada del sembrado, así que
	 *   con algo suyo pendiente «Añadir» lo escribiría también; el diálogo dice «nada de lo que ya
	 *   existe se modifica» enseñando solo lo del módulo, y eso tiene que ser verdad.
	 * - El preflight de los módulos es UNA lectura con todos a la vez. Solo si esa aborta (una
	 *   colección con el nombre de la de un módulo y otra forma) se repite módulo a módulo, para
	 *   saber a cuál culpar sin dejar al otro sin poder añadirse.
	 * Quién puede: la tarjeta entera solo se monta para quien administra (`/settings` la pone bajo
	 * `capabilities.schemaBootstrap`); los módulos heredan ese criterio, no tienen uno propio.
	 */
	import { onMount, tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import {
		previewSiteSeed,
		seedSiteProject,
		type SiteSeedDivergence,
		type SiteSeedModule,
		type SiteSeedModulePlan,
		type SiteSeedModulesPreview,
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
		moduleDescription,
		moduleName,
		moduleNote,
		onlyModuleWrites,
		SITE_BASE_MODULES,
		siteBaseKind,
		siteBaseMode,
		siteModuleState,
		skippedNote,
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
	type ReadyPreview = Extract<SiteSeedModulesPreview, { status: 'ready' }>;
	/** Lo que el preflight dice de un módulo: su parte del plan, o por qué no se puede añadir. */
	type ModuleCheck =
		| { status: 'ready'; plan: SiteSeedModulePlan }
		| { status: 'blocked'; divergences: readonly SiteSeedDivergence[] };

	let phase = $state<Phase>('checking');
	let preview = $state<SiteSeedModulesPreview | null>(null);
	/** Por `id` de módulo. Vacío mientras a la base le falten colecciones: no hay nada que mirar. */
	let moduleChecks = $state<Record<string, ModuleCheck>>({});
	let result = $state<SiteSeedResult | null>(null);
	/** El último resultado es de añadir un módulo, no de preparar o actualizar la base. */
	let resultIsModule = $state(false);
	let dialog = $state<DialogState>('closed');
	/** El plan o las divergencias que enseña el diálogo: salen del preflight de justo antes. */
	let dialogPreview = $state<ReadyPreview | null>(null);
	let dialogDivergences = $state<readonly SiteSeedDivergence[]>([]);
	/**
	 * El módulo que se está añadiendo; `null` = el diálogo es el de la base. `$state.raw`: es el
	 * objeto del registro y va tal cual a `seedSiteProject`, que clona su fragmento con
	 * `structuredClone`; envuelto en el proxy de `$state` no se puede clonar.
	 */
	let dialogModule = $state.raw<SiteSeedModule | null>(null);
	let errorMessage = $state('');
	let startedAt = $state(0);
	let now = $state(0);
	let sectionEl = $state<HTMLElement | null>(null);
	/** Descarta la respuesta de un preflight superado por otro más reciente. */
	let checkSeq = 0;

	const kind = $derived(preview ? siteBaseKind(preview) : null);
	const mode = $derived(
		dialogModule ? 'add' : dialogPreview ? siteBaseMode(dialogPreview.plan) : 'update'
	);
	const planView = $derived<PlanView | null>(
		dialogPreview
			? buildPlanView(dialogPreview.plan, ctx.t, {
					modules: dialogPreview.modules,
					target: dialogModule?.id
				})
			: null
	);
	const divergenceViews = $derived(
		dialogDivergences.map((item) => describeDivergence(item, ctx.t))
	);
	const canLinkEditors = ctx.port.capabilities.administration;
	const dialogModuleName = $derived(dialogModule ? moduleName(ctx.t, dialogModule.id) : '');

	/**
	 * Por qué no se ofrece «Añadir» todavía: un módulo solo se añade con la base al día (ver la
	 * cabecera). `null` = se puede.
	 */
	const modulesGate = $derived(kind === null || kind === 'current' ? null : kind);
	const moduleRows = $derived(
		SITE_BASE_MODULES.map((module) => {
			const check = moduleChecks[module.id];
			return {
				module,
				name: moduleName(ctx.t, module.id),
				description: moduleDescription(ctx.t, module.id),
				note: moduleNote(ctx.t, module.id),
				state:
					check?.status === 'blocked'
						? ('blocked' as const)
						: check
							? siteModuleState(module, check.plan)
							: ('absent' as const)
			};
		})
	);

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

	/**
	 * La parte de cada módulo en el preflight. Con la base sin todas sus colecciones no se mira
	 * nada (ningún módulo puede estar añadido). Si no, una sola lectura con todos los módulos; solo
	 * si aborta se repite módulo a módulo, para atribuir la divergencia al que la tiene.
	 */
	async function checkModules(base: SiteSeedModulesPreview): Promise<Record<string, ModuleCheck>> {
		if (base.status !== 'ready' || base.plan.createdCollections.length > 0) return {};
		const all = await previewSiteSeed(ctx.port, { modules: SITE_BASE_MODULES });
		const checks: Record<string, ModuleCheck> = {};
		for (const module of SITE_BASE_MODULES) {
			const own =
				all.status === 'ready' ? all : await previewSiteSeed(ctx.port, { modules: [module] });
			const plan =
				own.status === 'ready' ? own.modules.find((item) => item.id === module.id) : null;
			if (own.status === 'blocked') {
				checks[module.id] = { status: 'blocked', divergences: own.divergences };
			} else if (plan) {
				checks[module.id] = { status: 'ready', plan };
			}
		}
		return checks;
	}

	/** Preflight. `quiet` no pasa por «Comprobando…» (refresco tras escribir). */
	async function check(quiet = false): Promise<SiteSeedModulesPreview | null> {
		const seq = ++checkSeq;
		if (!quiet) phase = 'checking';
		try {
			const next = await previewSiteSeed(ctx.port);
			if (seq !== checkSeq) return null;
			const checks = await checkModules(next);
			if (seq !== checkSeq) return null;
			preview = next;
			moduleChecks = checks;
			phase = 'ready';
			return next;
		} catch (err) {
			if (seq !== checkSeq) return null;
			reportReadError(err);
			preview = null;
			moduleChecks = {};
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
		dialogModule = null;
		if (next.status === 'blocked') {
			dialogDivergences = next.divergences;
			dialog = 'blocked';
		} else if (!next.plan.upToDate) {
			dialogPreview = next;
			dialog = 'plan';
		}
	}

	function showWhy(): void {
		if (preview?.status !== 'blocked') return;
		dialogModule = null;
		dialogDivergences = preview.divergences;
		dialog = 'blocked';
	}

	/**
	 * «Añadir» de un módulo y su «Reintentar»: preflight nuevo de la base más ESE módulo y, según
	 * salga, su plan o el aborto. Si entre tanto la base ha dejado de estar al día (o el módulo ya
	 * está añadido), no se abre nada: la tarjeta se vuelve a leer y lo enseña.
	 */
	async function openModuleDialog(module: SiteSeedModule): Promise<void> {
		dialog = 'closed';
		let next: SiteSeedModulesPreview;
		try {
			next = await previewSiteSeed(ctx.port, { modules: [module] });
		} catch (err) {
			reportReadError(err);
			return;
		}
		dialogModule = module;
		if (next.status === 'blocked') {
			moduleChecks = {
				...moduleChecks,
				[module.id]: { status: 'blocked', divergences: next.divergences }
			};
			dialogDivergences = next.divergences;
			dialog = 'blocked';
			return;
		}
		const base = next.modules[0];
		const own = next.modules.find((item) => item.id === module.id);
		if (
			!base ||
			!own ||
			!onlyModuleWrites(next.plan, base) ||
			siteModuleState(module, own) === 'added'
		) {
			await check(true);
			return;
		}
		dialogPreview = next;
		dialog = 'plan';
	}

	function showModuleWhy(module: SiteSeedModule): void {
		const found = moduleChecks[module.id];
		if (found?.status !== 'blocked') return;
		dialogModule = module;
		dialogDivergences = found.divergences;
		dialog = 'blocked';
	}

	function retry(): Promise<void> {
		return dialogModule ? openModuleDialog(dialogModule) : openDialog();
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
		const module = dialogModule;
		startedAt = Date.now();
		now = startedAt;
		dialog = 'running';
		try {
			const done = await seedSiteProject(ctx.port, {
				passwordResetUrl: absoluteResetUrl(),
				...(module ? { modules: [module] } : {})
			});
			result = done;
			resultIsModule = module !== null;
			dialog = 'closed';
			ctx.feedback.toast(
				module
					? ctx.t('settings.site.modules.toast.added', { name: moduleName(ctx.t, module.id) })
					: ctx.t(wasPrepare ? 'settings.site.toast.prepared' : 'settings.site.toast.updated'),
				{ kind: 'success' }
			);
			await notifyChanged();
			await check(true);
		} catch (err) {
			errorMessage = describeSeedError(err);
			dialog = 'error';
			await notifyChanged();
		}
	}

	/**
	 * Texto del diálogo de error. Un desajuste de reglas de una colección `auth` viaja con su código
	 * y sus parámetros para poder traducirlo; cualquier otro fallo (o parámetros ausentes o
	 * malformados) sigue enseñando `err.message`.
	 */
	function describeSeedError(err: unknown): string {
		if (err instanceof VegaError && err.kind === 'validation') {
			for (const fieldError of Object.values(err.fieldErrors ?? {})) {
				if (fieldError.code !== 'vega_collection_rules_mismatch') continue;
				const params = fieldError.params;
				const rules = params?.rules;
				if (typeof params?.collection !== 'string' || !Array.isArray(rules)) continue;
				return ctx.t(
					params.expectsOnlySuperusers === true
						? 'settings.site.error.rulesMismatchNull'
						: 'settings.site.error.rulesMismatchDeclared',
					{ collection: params.collection, rules: rules.join(', ') }
				);
			}
		}
		return err instanceof Error ? err.message : String(err);
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

	/** Las frases del diálogo que cambian según sea preparar, actualizar o añadir un módulo. */
	const MODE_KEYS = {
		prepare: {
			title: 'settings.site.dialog.prepareTitle',
			intro: 'settings.site.dialog.prepareIntro',
			running: 'settings.site.dialog.prepareRunning',
			go: 'settings.site.btn.prepare',
			going: 'settings.site.btn.preparing'
		},
		update: {
			title: 'settings.site.dialog.updateTitle',
			intro: 'settings.site.dialog.updateIntro',
			running: 'settings.site.dialog.updateRunning',
			go: 'settings.site.btn.update',
			going: 'settings.site.btn.updating'
		},
		add: {
			title: 'settings.site.modules.dialog.title',
			intro: 'settings.site.modules.dialog.intro',
			running: 'settings.site.modules.dialog.running',
			go: 'settings.site.modules.btn.add',
			going: 'settings.site.modules.btn.adding'
		}
	} as const;
	const modeKeys = $derived(MODE_KEYS[mode]);

	const dialogTitle = $derived(
		dialog === 'blocked'
			? dialogModule
				? ctx.t('settings.site.modules.blockedDialog.title', { name: dialogModuleName })
				: ctx.t('settings.site.blockedDialog.title')
			: ctx.t(modeKeys.title, { name: dialogModuleName })
	);
	const dialogDescription = $derived(
		dialog === 'plan'
			? ctx.t(modeKeys.intro)
			: dialog === 'blocked'
				? ctx.t('settings.site.blockedDialog.intro')
				: undefined
	);
	const resultNote = $derived(result ? invitationLinkNote(result, ctx.t) : null);
	const resultSkipped = $derived(result ? skippedNote(result, ctx.t) : null);
</script>

{#snippet planList(view: PlanView, prefix: string)}
	<div class="vega-plan">
		{#each view.groups as group, index (group.id)}
			<div>
				<h3 id="{prefix}-{index}">{group.heading}</h3>
				<ul aria-labelledby="{prefix}-{index}">
					{#each group.items as item (`${item.title}|${item.code ?? ''}`)}
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
				{#if group.note}
					<p class="vega-plan-rest">{group.note}</p>
				{/if}
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
				{#if canLinkEditors && !resultIsModule}
					{ctx.t('settings.site.result.next')}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={editorsRoute()} class="vega-admin-link">{ctx.t('nav.editors')}</a>.
				{/if}
			</p>
			{#if resultNote}
				<p class="vega-seed-desc">{resultNote}</p>
			{/if}
			{#if resultSkipped}
				<p class="vega-seed-desc" data-site-skipped>{resultSkipped}</p>
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

	{#if phase === 'ready' && preview}
		<!-- Lista de módulos. Caja y filas de `.vega-plan`, como la lista del plan del diálogo. -->
		<div class="vega-plan vega-seed-modules">
			<div>
				<h3 id="{headingId}-modules">{ctx.t('settings.site.modules.title')}</h3>
				<ul aria-labelledby="{headingId}-modules">
					{#each moduleRows as row (row.module.id)}
						<li
							class="vega-seed-module"
							data-site-module={row.module.id}
							data-module-state={row.state}
						>
							<b>{row.name}</b>
							{#if row.state === 'added'}
								<span class="vega-admin-tag" data-kind="pub">
									{ctx.t('settings.site.modules.state.added')}
								</span>
							{:else if row.state === 'incomplete'}
								<span class="vega-admin-tag" data-kind="other">
									{ctx.t('settings.site.modules.state.incomplete')}
								</span>
							{:else}
								<span data-module-status>
									{ctx.t(`settings.site.modules.state.${row.state}`)}
								</span>
							{/if}
							<span>{row.description}</span>
							{#if row.note}
								<span data-module-note>{row.note}</span>
							{/if}
							{#if row.state === 'blocked'}
								<button
									type="button"
									class="vega-admin-btn"
									aria-label="{ctx.t('settings.site.btn.why')}: {row.name}"
									onclick={() => showModuleWhy(row.module)}
								>
									{ctx.t('settings.site.btn.why')}
								</button>
							{:else if row.state !== 'added'}
								{#if modulesGate}
									<span data-module-gate>
										{ctx.t(`settings.site.modules.needsBase.${modulesGate}`)}
									</span>
								{:else}
									<button
										type="button"
										class="vega-admin-btn"
										aria-label={ctx.t('settings.site.modules.dialog.title', { name: row.name })}
										onclick={() => openModuleDialog(row.module)}
									>
										{ctx.t('settings.site.modules.btn.add')}
									</button>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</div>
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
					{ctx.t(modeKeys.running, { elapsed: formatElapsed(now - startedAt) })}
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
				onclick={retry}
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
				{ctx.t(running ? modeKeys.going : modeKeys.go)}
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

	.vega-seed > :global(.vega-admin-notice),
	.vega-seed-modules {
		align-self: stretch;
	}

	/* Fila de un módulo: nombre, estado, descripción y acción apilados (cabe igual a 390 px que en
	   ancho). Separación = la del rótulo de grupo de `.vega-plan h3`. */
	.vega-seed-module {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
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

	/* La etiqueta de estado de un módulo es un `span` con su propio color y tamaño. */
	.vega-plan li span:not(.vega-admin-tag) {
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

	/* La nota de un grupo, bajo su lista: misma separación que el rótulo sobre ella. */
	.vega-plan ul + .vega-plan-rest {
		margin-top: 0.35rem;
	}
</style>
