<script lang="ts">
	/** Bandejas descubiertas por forma; el constructor completo se descarga solo al abrirlo. */
	import { untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import { VegaError } from '$lib/backend';
	import type { ServerRateLimits } from '$lib/backend/server-settings';
	import type FormInboxDialog from './FormInboxDialog.svelte';
	import { isFormInbox } from './form-inbox';
	import { enableInboxRateLimit, inboxRateLimit } from './form-rate-limits';
	import { listRoute } from '$lib/nav/routes';
	let { baseReady, onChanged }: { baseReady: boolean; onChanged: () => Promise<void> } = $props();
	const ctx = getVegaContext();
	let Dialog = $state<typeof FormInboxDialog>();
	let open = $state(false);
	let opening = $state(false);
	let limits = $state<ServerRateLimits>();
	let error = $state(false);
	let loading = $state(true);
	let changing = $state('');
	let epoch = 0;
	const inboxes = $derived(ctx.model.types.filter((type) => isFormInbox(type.schema)));
	async function load() {
		const run = ++epoch;
		const token = ctx.session.token;
		loading = true;
		error = false;
		try {
			const value = await ctx.port.serverSettings?.get();
			if (run === epoch && token === ctx.session.token) limits = value?.rateLimits;
		} catch {
			if (run === epoch) error = true;
		} finally {
			if (run === epoch) loading = false;
		}
	}
	$effect(() => {
		const token = ctx.session.token;
		void token;
		untrack(() => {
			void load();
		});
	});
	async function show() {
		opening = true;
		try {
			Dialog = (await import('./FormInboxDialog.svelte')).default;
			open = true;
		} catch {
			error = true;
		} finally {
			opening = false;
		}
	}
	async function enable(name: string) {
		if (!ctx.port.serverSettings) return;
		changing = name;
		error = false;
		try {
			limits = await enableInboxRateLimit(ctx.port.serverSettings, name);
		} catch (err) {
			error = true;
			if (err instanceof VegaError && err.kind === 'auth-expired')
				ctx.feedback.reportError(err, { action: 'forms:rate-limit' });
		} finally {
			changing = '';
		}
	}
	async function changed() {
		await onChanged();
		await load();
	}
</script>

{#if ctx.port.capabilities.administration && ctx.port.administration && ctx.port.capabilities.schemaBootstrap}
	<section class="forms-card" aria-labelledby="forms-heading">
		<div class="forms-head">
			<h3 id="forms-heading">{ctx.t('forms.heading')}</h3>
			{#if baseReady}<button type="button" class="vega-admin-btn" onclick={show} disabled={opening}
					>{ctx.t(opening ? 'forms.loading' : 'forms.new')}</button
				>{:else}<p>{ctx.t('forms.needsBase')}</p>{/if}
		</div>
		<p>{ctx.t('forms.intro')}</p>
		{#if error}<p role="alert">{ctx.t('forms.rateError')}</p>
			<button type="button" class="vega-admin-btn" onclick={load}>{ctx.t('common.retry')}</button
			>{/if}
		{#if loading}<p role="status">{ctx.t('forms.loading')}</p>{/if}
		{#if inboxes.length === 0}<p>{ctx.t('forms.empty')}</p>{/if}
		<ul>
			{#each inboxes as type (type.name)}{@const rate = inboxRateLimit(limits, type.name)}
				<li>
					<div>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- listRoute ya incluye la base. --><a
							href={listRoute(type.name)}>{type.label}</a
						><code>{type.name}</code>
					</div>
					<span
						>{ctx.t(
							rate === undefined
								? 'forms.rateUnknown'
								: rate === null
									? 'forms.noRate'
									: 'forms.rate',
							rate ? { n: rate.maxRequests, seconds: rate.duration } : {}
						)}</span
					>{#if rate === null && ctx.port.capabilities.serverSettings && ctx.port.serverSettings}<button
							type="button"
							class="vega-admin-btn"
							disabled={changing !== ''}
							onclick={() => enable(type.name)}
							>{ctx.t(changing === type.name ? 'forms.loading' : 'forms.addRate')}</button
						>{/if}
				</li>{/each}
		</ul>
	</section>
	{#if open && Dialog}<Dialog
			onClose={() => {
				open = false;
			}}
			onChanged={changed}
		/>{/if}
{/if}

<style>
	.forms-card {
		margin-top: 1.5rem;
		border-top: 1px solid var(--line);
		padding-top: 1rem;
	}
	.forms-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	h3 {
		margin: 0;
	}
	p,
	code,
	span {
		font-size: 0.85rem;
	}
	p,
	span {
		color: var(--ink-2);
	}
	ul {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.75rem 0;
		border-top: 1px solid var(--line);
	}
	li div {
		flex: 1;
		min-width: 120px;
		overflow-wrap: anywhere;
	}
	code {
		display: block;
		color: var(--ink-2);
	}
	a {
		color: var(--ink);
	}
	button {
		min-height: 44px;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	@media (pointer: coarse) {
		a {
			display: inline-flex;
			min-height: 44px;
			align-items: center;
		}
	}
</style>
