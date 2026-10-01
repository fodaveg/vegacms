<script lang="ts">
	/**
	 * Bloque «Pendientes» de la portada: una tarjeta por dato pendiente, con su número y, si el
	 * filtro cabe en la URL del listado, enlace a ese listado ya filtrado (`pending.ts` decide qué
	 * tarjetas existen y cuáles enlazan).
	 *
	 * - Las consultas salen todas a la vez al montar y cada tarjeta se resuelve por su cuenta. Una
	 *   que falla se retira; las demás se pintan.
	 * - Una tarjeta a cero SÍ se pinta, atenuada: el dato existe y vale cero.
	 * - «Cambios sin publicar en el sitio» solo existe si el proyecto anuncia `build`, y solo se
	 *   pinta cuando se sabe la respuesta (`loadUnpublishedChanges` puede decir «no lo sé»).
	 * - Sin ninguna tarjeta que pintar, el bloque entero no ocupa sitio (ni su rótulo).
	 *
	 * No hay lámina de estas tarjetas: usan la tarjeta del admin (borde `--line`, radio `--r`,
	 * fondo `--paper`, sombra `--shadow-card`, como `.vega-admin-card` y `.vega-list-card`) y la
	 * tipografía de cifras del resumen del listado (`--mono`).
	 */
	import { onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import {
		loadPendingCount,
		loadUnpublishedChanges,
		pendingCards,
		type PendingCard,
		type PendingKind
	} from './pending';

	const ctx = getVegaContext();

	const LABEL_KEY: Record<PendingKind, string> = {
		drafts: 'home.pending.drafts',
		scheduled: 'home.pending.scheduled',
		description: 'home.pending.description',
		'media-alt': 'home.pending.mediaAlt'
	};

	// Las tarjetas se deciden UNA vez al montar: dependen del modelo (que al cambiar remonta la
	// ruta) y de la hora, y recalcularlas a mitad dejaría números de una consulta bajo otra.
	const cards: PendingCard[] = pendingCards(ctx.model);
	const hasBuild = Boolean(ctx.port.buildApiUrl);

	/** Por clave de tarjeta: ausente = cargando, número = resuelta, `'failed'` = se retira. */
	let counts = $state<Record<string, number | 'failed'>>({});
	/** `'loading'` mientras se calcula; `null` = no se sabe o falló (la tarjeta no se pinta). */
	let unpublished = $state<'loading' | boolean | null>(hasBuild ? 'loading' : null);

	const visibleCards = $derived(cards.filter((card) => counts[card.key] !== 'failed'));
	const hasAnything = $derived(visibleCards.length > 0 || unpublished !== null);

	onMount(() => {
		let alive = true;
		for (const card of cards) {
			loadPendingCount(ctx.port, card).then(
				(count) => {
					if (alive) counts[card.key] = count;
				},
				() => {
					if (alive) counts[card.key] = 'failed';
				}
			);
		}
		if (hasBuild) {
			loadUnpublishedChanges(ctx.port, ctx.model, ctx.session.token).then(
				(result) => {
					if (alive) unpublished = result;
				},
				() => {
					if (alive) unpublished = null;
				}
			);
		}
		return () => {
			alive = false;
		};
	});

	function labelOf(card: PendingCard): string {
		return ctx.t(LABEL_KEY[card.kind], { label: card.typeLabel ?? '' });
	}
</script>

{#snippet cardBody(value: string, label: string)}
	<span class="vega-home-pending-value">{value}</span>
	<span class="vega-home-pending-label">{label}</span>
{/snippet}

{#if hasAnything}
	<section class="vega-home-block" aria-labelledby="vega-home-pending-title">
		<h2 id="vega-home-pending-title">{ctx.t('home.pending.title')}</h2>
		<ul class="vega-home-pending">
			{#each visibleCards as card (card.key)}
				{@const count = counts[card.key]}
				{@const loading = typeof count !== 'number'}
				{@const value = loading ? '…' : new Intl.NumberFormat(ctx.locale).format(count)}
				<li>
					{#if card.href !== null}
						<!-- `card.href` sale de `listStatusRoute` (`nav/routes.ts`), que ya antepone `base`. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a
							class="vega-home-pending-card"
							href={card.href}
							data-pending={card.key}
							data-zero={count === 0}
							aria-busy={loading}
						>
							{@render cardBody(value, labelOf(card))}
						</a>
					{:else}
						<div
							class="vega-home-pending-card"
							data-pending={card.key}
							data-zero={count === 0}
							aria-busy={loading}
						>
							{@render cardBody(value, labelOf(card))}
						</div>
					{/if}
				</li>
			{/each}
			{#if unpublished !== null}
				<li>
					<div
						class="vega-home-pending-card"
						data-pending="unpublished"
						data-zero={unpublished === false}
						aria-busy={unpublished === 'loading'}
					>
						{@render cardBody(
							unpublished === 'loading'
								? '…'
								: ctx.t(unpublished ? 'home.pending.unpublishedYes' : 'home.pending.unpublishedNo'),
							ctx.t('home.pending.unpublished')
						)}
					</div>
				</li>
			{/if}
		</ul>
	</section>
{/if}

<style>
	/* Bloque y rótulo: los de la portada (`routes/+page.svelte`, lámina 1 §2.1), repetidos aquí
	   porque el CSS de un componente Svelte no alcanza a sus hijos. */
	.vega-home-block {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	.vega-home-block > h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-2);
	}

	.vega-home-pending {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* En estrecho (mismo corte que la tabla del listado), dos por fila: de una en una empujaban
	   «Lo último que editaste» una pantalla entera hacia abajo. */
	@media (max-width: 640px) {
		.vega-home-pending {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.vega-home-pending > li {
		display: flex;
		min-width: 0;
	}

	.vega-home-pending-card {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		min-height: 44px;
		padding: 0.7rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		text-decoration: none;
	}

	a.vega-home-pending-card:hover {
		border-color: var(--line-strong);
	}

	a.vega-home-pending-card:hover .vega-home-pending-label {
		text-decoration: underline;
	}

	a.vega-home-pending-card:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.vega-home-pending-value {
		font-family: var(--mono);
		font-size: 1.3rem;
		font-weight: 600;
		line-height: 1.2;
		color: var(--ink-hi);
	}

	.vega-home-pending-label {
		font-size: 0.82em;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* A cero: el dato existe, pero no pide nada. Se apaga la tarjeta (sin fondo ni sombra) y la
	   cifra baja a `--ink-2`; no a `--ink-3`, que en claro no llega a contraste de texto. */
	.vega-home-pending-card[data-zero='true'] {
		background: transparent;
		box-shadow: none;
	}

	.vega-home-pending-card[data-zero='true'] .vega-home-pending-value {
		font-weight: 500;
		color: var(--ink-2);
	}
</style>
