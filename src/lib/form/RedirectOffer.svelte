<script lang="ts">
	/**
	 * `RedirectOffer.svelte` (lámina C del 1 oct 2026, «Redirección al cambiar la ruta»): banner EN
	 * LÍNEA, no modal, en el hueco del banner de registro de `RecordForm.svelte` (junto a
	 * `ConflictNotice`). Enseña qué se hará con las redirecciones cuando se guarde una página
	 * PUBLICADA cuya ruta ha cambiado. No decide ni escribe nada: el plan (`planRedirect`) y las
	 * escrituras viven en `$lib/model/redirect-plan` y `./redirect-sync`; aquí solo se pinta el
	 * plan y se recogen las dos elecciones (`choice`).
	 *
	 * **Estados** (los de la lámina; el color sube solo cuando hace falta una decisión):
	 *   - oferta normal (neutra): casilla marcada por defecto «Crear una redirección de X a Y».
	 *     Desmarcada, la frase dice la consecuencia («página no encontrada») sin subir el tono.
	 *   - cadena (`--info`): hay redirecciones que llevaban a la ruta vieja. NO se pregunta: se dice
	 *     que pasarán a llevar a la nueva (una sola en una frase, varias en lista).
	 *   - conflicto (`--warning`): ya existe una redirección DESDE la ruta vieja. `from` es único,
	 *     así que no hay casilla sino dos frases completas (por defecto, cambiarla). No bloquea
	 *     «Guardar».
	 *   - bucle (caso añadido a la lámina, misma voz): una redirección cuyo `from` es la ruta viva
	 *     se borrará al guardar, también con la casilla desmarcada. Va como un párrafo más del
	 *     banner, o como único contenido (neutro) si no hay nada que crear.
	 *   - fallo (`--danger`, `role="alert"`): la página se guardó y la redirección no. Se queda aquí
	 *     con «Reintentar»; no es un toast que se va.
	 *
	 * Reutiliza `.vega-record-form-notice` (la caja neutra, replicada aquí porque el CSS con ámbito
	 * de Svelte no cruza componentes), los tonos y el botón de `ConflictNotice.svelte`. Sin tokens
	 * nuevos. Las rutas van en `<code>` y parten por cualquier carácter (`overflow-wrap`).
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		hasRedirectConflict,
		type RedirectChoice,
		type RedirectPlan
	} from '$lib/model/redirect-plan';

	interface Props {
		/** Plan vigente, o `null` si no hay nada que enseñar (salvo un fallo). */
		plan: RedirectPlan | null;
		/** Elecciones; el anfitrión las lee al guardar. */
		choice: RedirectChoice;
		/** La segunda escritura falló tras guardar la página: sustituye al resto de estados. */
		failure?: { from: string; message: string } | null;
		/** Reintento en curso: deshabilita el botón. */
		retrying?: boolean;
		/** El formulario está guardando: las elecciones quedan inertes. */
		disabled?: boolean;
		onRetry?: () => void;
	}

	let {
		plan,
		choice = $bindable(),
		failure = null,
		retrying = false,
		disabled = false,
		onRetry
	}: Props = $props();

	const ctx = getVegaContext();
	const uid = $props.id();

	interface Segment {
		text: string;
		code: boolean;
	}

	/** Traduce `key` y devuelve el texto partido: lo interpolado (rutas) en `code`, el resto llano.
	 *  Las rutas se marcan con centinelas del área de uso privado de Unicode, que no aparecen en una ruta. */
	function rich(
		key: string,
		params: Record<string, string | number> = {},
		plain: readonly string[] = []
	): Segment[] {
		const marked = Object.fromEntries(
			Object.entries(params).map(([k, v]) => [
				k,
				typeof v === 'number' || plain.includes(k) ? String(v) : `\uE000${v}\uE001`
			])
		);
		return ctx
			.t(key, marked)
			.split(/(\uE000[^\uE001]*\uE001)/)
			.filter((part) => part !== '')
			.map((part) =>
				part.startsWith('\uE000')
					? { text: part.slice(1, -1), code: true }
					: { text: part, code: false }
			);
	}

	const conflict = $derived(plan !== null && hasRedirectConflict(plan));
	const offered = $derived(plan !== null && plan.create && !conflict);
	const chainActive = $derived(
		plan !== null &&
			plan.repoint.length > 0 &&
			(conflict ? choice.conflict === 'repoint' : choice.createOffered)
	);
	const removal = $derived(plan?.remove[0] ?? null);
</script>

{#snippet text(segments: Segment[])}
	{#each segments as segment, i (i)}{#if segment.code}<code>{segment.text}</code
			>{:else}{segment.text}{/if}{/each}
{/snippet}

{#snippet chain(p: RedirectPlan)}
	{#if p.repoint.length === 1}
		<p class="vega-redirect-body">
			{@render text(
				rich('editor.redirect.chainOne', {
					source: p.repoint[0].from,
					target: p.from,
					to: p.to
				})
			)}
		</p>
	{:else}
		<p class="vega-redirect-body">
			{@render text(rich('editor.redirect.chainMany', { count: p.repoint.length, to: p.to }))}
		</p>
		<ul class="vega-redirect-list">
			{#each p.repoint as ref (ref.id)}
				<li><code>{ref.from}</code></li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet removalNote(p: RedirectPlan)}
	{#if removal}
		<p class="vega-redirect-body" data-redirect-removal>
			{@render text(
				removal.to === p.from
					? rich('editor.redirect.removeLoop', { live: p.to, old: p.from })
					: rich('editor.redirect.removeShadow', { live: p.to, target: removal.to })
			)}
		</p>
	{/if}
{/snippet}

{#if failure}
	<div class="vega-redirect vega-redirect--danger" role="alert" data-redirect-state="failed">
		<p class="vega-redirect-title">
			<Icon id="warning" size={16} />
			<span>{ctx.t('editor.redirect.failed.title')}</span>
		</p>
		<p class="vega-redirect-body">
			{@render text(
				rich('editor.redirect.failed.body', { from: failure.from, message: failure.message }, [
					'message'
				])
			)}
		</p>
		<div class="vega-redirect-actions">
			<button
				type="button"
				class="vega-redirect-btn"
				disabled={retrying}
				aria-disabled={retrying ? 'true' : undefined}
				onclick={() => onRetry?.()}
			>
				{ctx.t('common.retry')}
			</button>
		</div>
	</div>
{:else if plan && conflict && plan.existing}
	<div
		class="vega-redirect vega-redirect--warning"
		role="group"
		aria-labelledby="vega-redirect-title-{uid}"
		data-redirect-state="conflict"
	>
		<p class="vega-redirect-title" id="vega-redirect-title-{uid}">
			<Icon id="warning" size={16} />
			<span>{@render text(rich('editor.redirect.conflict.title', { from: plan.from }))}</span>
		</p>
		<p class="vega-redirect-body">
			{@render text(rich('editor.redirect.conflict.body', { target: plan.existing.to }))}
		</p>
		<fieldset class="vega-redirect-choices" {disabled}>
			<legend class="vega-redirect-hidden">{ctx.t('editor.redirect.conflict.legend')}</legend>
			<label>
				<input
					type="radio"
					name="vega-redirect-conflict-{uid}"
					checked={choice.conflict === 'repoint'}
					onchange={() => (choice.conflict = 'repoint')}
				/>
				<span>{@render text(rich('editor.redirect.conflict.repoint', { to: plan.to }))}</span>
			</label>
			<label>
				<input
					type="radio"
					name="vega-redirect-conflict-{uid}"
					checked={choice.conflict === 'keep'}
					onchange={() => (choice.conflict = 'keep')}
				/>
				<span
					>{@render text(
						rich('editor.redirect.conflict.keep', { from: plan.from, target: plan.existing.to })
					)}</span
				>
			</label>
		</fieldset>
		{#if chainActive}{@render chain(plan)}{/if}
		{@render removalNote(plan)}
	</div>
{:else if plan && offered}
	<div
		class="vega-redirect"
		class:vega-redirect--info={chainActive}
		role="group"
		aria-label={ctx.t('editor.redirect.groupLabel')}
		data-redirect-state={chainActive ? 'chain' : choice.createOffered ? 'offer' : 'declined'}
	>
		<label class="vega-redirect-check">
			<input type="checkbox" bind:checked={choice.createOffered} {disabled} />
			<span>{@render text(rich('editor.redirect.offer', { from: plan.from, to: plan.to }))}</span>
		</label>
		{#if chainActive}
			{@render chain(plan)}
		{:else if choice.createOffered}
			<p class="vega-redirect-body">{ctx.t('editor.redirect.offerBody')}</p>
		{:else}
			<p class="vega-redirect-body">
				{@render text(rich('editor.redirect.declinedBody', { from: plan.from }))}
			</p>
		{/if}
		{@render removalNote(plan)}
	</div>
{:else if plan && removal}
	<div
		class="vega-redirect"
		role="group"
		aria-label={ctx.t('editor.redirect.groupLabel')}
		data-redirect-state="removal"
	>
		{@render removalNote(plan)}
	</div>
{/if}

<style>
	/* Caja neutra = `.vega-record-form-notice` de `RecordForm`; con tono = `ConflictNotice`
	   (aviso/peligro) y su gemelo informativo con `--info`/`--info-soft`. Sin tokens nuevos. */
	.vega-redirect {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface-2);
	}

	.vega-redirect--info {
		border-color: var(--info);
		background: var(--info-soft);
	}

	.vega-redirect--warning {
		border-color: var(--warning);
		background: var(--warning-soft);
	}

	.vega-redirect--danger {
		border-color: var(--danger);
		background: var(--danger-soft);
	}

	.vega-redirect p {
		margin: 0;
	}

	.vega-redirect code {
		font-family: var(--mono);
		font-size: 0.92em;
		overflow-wrap: anywhere;
	}

	.vega-redirect-check,
	.vega-redirect-title {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		font-weight: 600;
		color: var(--ink-hi);
		overflow-wrap: anywhere;
	}

	.vega-redirect-check {
		cursor: pointer;
	}

	.vega-redirect-check input {
		flex-shrink: 0;
		margin-top: 0.25rem;
		accent-color: var(--accent);
	}

	.vega-redirect-check > span,
	.vega-redirect-title > span {
		min-width: 0;
	}

	.vega-redirect-title :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.vega-redirect--warning .vega-redirect-title :global(svg) {
		color: var(--warning);
	}

	.vega-redirect--danger .vega-redirect-title :global(svg) {
		color: var(--danger);
	}

	/* `--ink`, no `--ink-2`: sobre un fondo suave el gris secundario no llega a 4,5:1. */
	.vega-redirect-body {
		font-size: 0.84rem;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.vega-redirect-list {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.84rem;
		color: var(--ink);
	}

	.vega-redirect-choices {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.vega-redirect-choices label {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		font-size: 0.88rem;
		color: var(--ink);
		cursor: pointer;
		overflow-wrap: anywhere;
	}

	.vega-redirect-choices label > span {
		min-width: 0;
	}

	.vega-redirect-choices input {
		flex-shrink: 0;
		margin-top: 0.2rem;
		accent-color: var(--accent);
	}

	/* La leyenda existe para lectores de pantalla; la pregunta ya la hace el título. */
	.vega-redirect-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.vega-redirect-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	/* Botón de barra neutro (`--btn`), el de `ConflictNotice` (`.vega-conflict-btn`). */
	.vega-redirect-btn {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 550;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-redirect-btn:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-redirect-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-redirect-btn:focus-visible,
	.vega-redirect-check input:focus-visible,
	.vega-redirect-choices input:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.vega-redirect-check,
		.vega-redirect-choices label {
			min-height: 44px;
			align-items: center;
		}

		.vega-redirect-check input,
		.vega-redirect-choices input {
			width: 1.25rem;
			height: 1.25rem;
			margin-top: 0;
		}

		.vega-redirect-btn {
			min-height: 44px;
		}
	}
</style>
