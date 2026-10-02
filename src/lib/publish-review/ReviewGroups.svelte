<script lang="ts">
	/**
	 * `ReviewGroups.svelte` (lote 13, lámina «Revisión antes de publicar», decisiones 2, 4 y 5): la
	 * lista de GRUPOS de la revisión (SEO · Enlaces · Imágenes) con sus avisos. La misma pieza la
	 * montan la tarjeta del formulario (`ReviewCard.svelte`) y el popover del editor visual
	 * (`VisualPublishControl.svelte`); lo que cambia entre los dos es `surface`, que decide qué hace
	 * y cómo se rotula la acción de cada aviso.
	 *
	 * **Un grupo por comprobación que aplica** (`review.groups`, de `applicableChecks`), cada uno con
	 * su estado: «Sin avisos», «N avisos», «Comprobando…» (la carga sigue en curso y el grupo depende
	 * de ella: enlaces e imágenes; SEO sale ya, no lee nada) o «No comprobado» (`skipped`: la carga
	 * terminó y ese dato no se pudo leer, con su motivo y «Volver a comprobar»). Así un «0 avisos»
	 * nunca se confunde con «no se ha mirado». Si la carga FALLÓ (`phase === 'error'`), SEO se sigue
	 * enseñando y los otros dos grupos se sustituyen por una sola fila de error con «Reintentar»
	 * (lámina 1.7).
	 *
	 * **Hasta `MAX_VISIBLE` avisos por grupo y «Ver N más»** (decisión 5): una galería de nueve fotos
	 * sin alt daría nueve filas y sacaría el resto del aside pegajoso de la pantalla. Despliega en el
	 * sitio y pasa a «Ver menos»; el resumen de la cabecera (en `ReviewCard`) cuenta los nueve.
	 *
	 * **Una acción por aviso** (decisión 4), solo con `canAct` (sin permiso de editar los avisos se
	 * ven, pero el sitio sale como texto y no hay «Describir…», lámina 1.9):
	 *   - `surface === 'form'`: ir al campo («Descripción ›», nombre accesible «Ir al campo
	 *     Descripción») o al bloque («Bloque 2 · Texto rico › Contenido ›», que `RecordForm`
	 *     despliega y enfoca). Las dos son `onGo(finding)`.
	 *   - `surface === 'visual'`: un campo del registro abre el formulario con ese campo enfocado
	 *     («Abrir Descripción en el formulario ›»); un bloque se elige en el árbol («Bloque 2 ·
	 *     Texto rico ›»). También `onGo(finding)`: quien monta sabe adónde lleva cada cosa.
	 *   - `media.alt-missing`: ir al bloque no arregla nada (el alt vive en Medios), así que en las
	 *     dos superficies la acción es «Describir la imagen…» (`onDescribe(finding)`), con «Bloque 3 ·
	 *     Galería» como texto de dónde está.
	 *
	 * **Los valores del mensaje** (`{href}`, `{to}`, `{file}`) van en mono (`.vega-review-value`, el
	 * criterio de un valor canónico): el mensaje se traduce con marcadores en el sitio de cada
	 * `{param}` y se parte por ellos, sin armar HTML con el texto del catálogo. Solo los parámetros
	 * de texto; un número (`{length}`, `{max}`) se queda en prosa — DECISIÓN MÍA, la lámina solo
	 * dibuja rutas y ficheros en mono.
	 *
	 * Piezas y tokens: ningún token ni icono nuevo (cada regla del CSS cita de dónde sale). Los
	 * objetivos táctiles de 44 px con puntero basto (`scripts/check-touch-targets.mjs`).
	 */
	import { SvelteSet } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		CHECK_GROUP,
		type ReviewFinding,
		type ReviewGroup,
		type ReviewTarget
	} from './publish-review';
	import type { ReviewState } from './review-state.svelte';

	interface Props {
		review: ReviewState;
		/** Dónde se pinta: decide el rótulo y el destino de cada acción (ver cabecera). */
		surface: 'form' | 'visual';
		/** `false` sin permiso de editar: los avisos salen sin acciones. */
		canAct: boolean;
		/** Ir al campo o al bloque de un aviso (todo menos `media.alt-missing`). */
		onGo?: (finding: ReviewFinding) => void;
		/** «Describir la imagen…» de un `media.alt-missing`: abrir su ficha de Medios. */
		onDescribe?: (finding: ReviewFinding) => void;
	}

	let { review, surface, canAct, onGo, onDescribe }: Props = $props();

	const ctx = getVegaContext();

	/** Avisos visibles por grupo antes de «Ver N más» (decisión 5 de la lámina). */
	const MAX_VISIBLE = 3;

	/** Grupos desplegados con «Ver N más». Reactivo por mutación (`SvelteSet`, como `expandedIds`
	 *  de `blocks-state.svelte.ts`). */
	const expanded = new SvelteSet<ReviewGroup>();

	type GroupStatus = 'checking' | 'skipped' | 'warn' | 'ok';

	const skippedGroups = $derived(new Set(review.result.skipped.map((check) => CHECK_GROUP[check])));

	/** Con la carga fallida, enlaces e imágenes se sustituyen por la fila de error (ver cabecera). */
	const groups = $derived(
		review.phase === 'error' ? review.groups.filter((group) => group === 'seo') : review.groups
	);

	function findingsOf(group: ReviewGroup): ReviewFinding[] {
		return review.result.findings.filter((finding) => CHECK_GROUP[finding.check] === group);
	}

	function statusOf(group: ReviewGroup, findings: ReviewFinding[]): GroupStatus {
		if (group !== 'seo' && (review.phase === 'loading' || review.phase === 'idle')) {
			return 'checking';
		}
		if (skippedGroups.has(group)) return 'skipped';
		return findings.length > 0 ? 'warn' : 'ok';
	}

	function statusText(status: GroupStatus, count: number): string {
		switch (status) {
			case 'checking':
				return ctx.t('review.checking');
			case 'skipped':
				return ctx.t('review.group.skipped');
			case 'ok':
				return ctx.t('review.count.none');
			case 'warn':
				return ctx.t(count === 1 ? 'review.count.one' : 'review.count.many', { count });
		}
	}

	const TONE: Record<GroupStatus, 'warn' | 'ok' | 'muted'> = {
		checking: 'muted',
		skipped: 'muted',
		warn: 'warn',
		ok: 'ok'
	};

	function toggle(group: ReviewGroup): void {
		if (expanded.has(group)) expanded.delete(group);
		else expanded.add(group);
	}

	/** El mensaje partido en prosa y valores (ver cabecera): los valores de texto van en mono. */
	function messageParts(finding: ReviewFinding): Array<{ value: boolean; text: string }> {
		const names = Object.keys(finding.params);
		const marker = '\u0000';
		const marked = ctx.t(
			finding.messageKey,
			Object.fromEntries(names.map((name, index) => [name, `${marker}${index}${marker}`]))
		);
		return marked
			.split(marker)
			.map((piece, index) => {
				if (index % 2 === 0) return { value: false, text: piece };
				const raw = finding.params[names[Number(piece)]];
				return { value: typeof raw === 'string', text: String(raw) };
			})
			.filter((part) => part.text !== '');
	}

	/** Texto de la acción (o del sitio, sin permiso) de un aviso, y su nombre accesible. */
	function actionText(target: ReviewTarget): { text: string; a11y: string } {
		if (target.kind === 'field') {
			return surface === 'form'
				? {
						text: ctx.t('review.go.field', { label: target.label }),
						a11y: ctx.t('review.go.field.a11y', { label: target.label })
					}
				: {
						text: ctx.t('review.go.form', { label: target.label }),
						a11y: ctx.t('review.go.form', { label: target.label })
					};
		}
		const params = { position: target.position, block: target.blockLabel, label: target.label };
		return surface === 'form'
			? { text: ctx.t('review.go.block', params), a11y: ctx.t('review.go.block.a11y', params) }
			: {
					text: ctx.t('review.go.visualBlock', params),
					a11y: ctx.t('review.go.visualBlock.a11y', params)
				};
	}

	/** Dónde está un aviso cuando no hay acción que lo diga (imagen sin alt, o sin permiso). */
	function whereText(target: ReviewTarget): string {
		return target.kind === 'field'
			? target.label
			: ctx.t('review.where.block', { position: target.position, block: target.blockLabel });
	}
</script>

<ul class="vega-review-groups">
	{#each groups as group (group)}
		{@const findings = findingsOf(group)}
		{@const status = statusOf(group, findings)}
		{@const open = expanded.has(group)}
		{@const visible = open ? findings : findings.slice(0, MAX_VISIBLE)}
		<li class="vega-review-group" data-review-group={group} data-review-status={status}>
			<p class="vega-review-group-head">
				<span>{ctx.t(`review.group.${group}`)}</span>
				<span class="vega-review-status" data-tone={TONE[status]}>
					{#if status === 'ok'}<Icon id="check" size={12} />{/if}
					{statusText(status, findings.length)}
				</span>
			</p>
			{#if status === 'skipped'}
				<!-- El motivo vale para los dos casos que el cargador confunde en `null`: que la lectura
				     falle y que el modelo no diga de dónde salen las páginas (lámina 1.4). -->
				<p class="vega-review-skipped">
					<span>{ctx.t(`review.skipped.${group}`)}</span>
					<button type="button" class="vega-review-more" onclick={() => void review.reload()}>
						{ctx.t('review.recheck')}
					</button>
				</p>
			{:else if status === 'warn'}
				<ul class="vega-review-items">
					{#each visible as finding (finding.id)}
						{@const describes = finding.check === 'media.alt-missing'}
						{@const action = actionText(finding.target)}
						<li class="vega-review-item" data-review-check={finding.check}>
							<Icon id="warning" size={14} />
							<p>
								{#each messageParts(finding) as part, i (i)}
									{#if part.value}<span class="vega-review-value">{part.text}</span
										>{:else}{part.text}{/if}
								{/each}
							</p>
							<div class="vega-review-meta">
								{#if canAct && describes}
									<span class="vega-review-where">{whereText(finding.target)}</span>
									<button
										type="button"
										class="vega-review-go"
										onclick={() => onDescribe?.(finding)}
									>
										{ctx.t('review.describeImage')}
									</button>
								{:else if canAct}
									<button
										type="button"
										class="vega-review-go"
										aria-label={action.a11y}
										onclick={() => onGo?.(finding)}
									>
										{action.text}
										<Icon id="chevron" size={12} />
									</button>
								{:else if finding.target.kind === 'field' || describes}
									<span class="vega-review-where">{whereText(finding.target)}</span>
								{:else}
									<span class="vega-review-where">{action.text}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if findings.length > MAX_VISIBLE}
					<button
						type="button"
						class="vega-review-more"
						aria-expanded={open}
						onclick={() => toggle(group)}
					>
						{open
							? ctx.t('review.less')
							: ctx.t('review.more', { count: findings.length - MAX_VISIBLE })}
					</button>
				{/if}
			{/if}
		</li>
	{/each}
	{#if review.phase === 'error'}
		<!-- `loadReviewData` rechaza solo si fallan los bloques: SEO sigue arriba, esto sustituye a
		     enlaces e imágenes. Rojo y «Reintentar», lo mismo que el fallo de «Se usa en». -->
		<li class="vega-review-group" data-review-group="error">
			<p class="vega-review-error" role="alert">
				{ctx.t('review.loadError')}
				<button type="button" class="vega-review-retry" onclick={() => void review.reload()}>
					{ctx.t('common.retry')}
				</button>
			</p>
		</li>
	{/if}
</ul>

<style>
	/* Grupos (SEO · Enlaces · Imágenes): separados por la hairline de `.vega-editor-kv` (`--line-soft`). */
	.vega-review-groups {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-review-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.65rem 0;
		border-top: 1px solid var(--line-soft);
		min-width: 0;
	}

	.vega-review-group:first-child {
		padding-top: 0;
		border-top: 0;
	}

	.vega-review-group:last-child {
		padding-bottom: 0;
	}

	/* Rótulo de grupo: el de `.vega-field-row > label` (0.82em, 650, `--ink-2`). */
	.vega-review-group-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.82em;
		font-weight: 650;
		letter-spacing: 0.03em;
		color: var(--ink-2);
	}

	/* Estado del grupo: icono + texto, a la derecha. Las mismas tres parejas que la píldora de
	   `.vega-editor-tag` (`warn` = overdue, `ok` = pub, `muted` = draft). */
	.vega-review-status {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		font-weight: 600;
		letter-spacing: 0;
	}

	.vega-review-status[data-tone='ok'] {
		color: var(--success);
	}

	.vega-review-status[data-tone='warn'] {
		color: var(--warning);
	}

	.vega-review-status[data-tone='muted'] {
		color: var(--ink-2);
		font-weight: 500;
	}

	.vega-review-items {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Un aviso: el icono `warning` de 14 px que ya usa `.vega-visual-publish-error`, y el texto. */
	.vega-review-item {
		display: grid;
		grid-template-columns: 14px minmax(0, 1fr);
		gap: 0.15rem 0.45rem;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.vega-review-item > :global(svg) {
		margin-top: 0.15rem;
		color: var(--warning);
	}

	.vega-review-item p {
		margin: 0;
	}

	/* Valores del mensaje (`{href}`, `{to}`, `{file}`): mono, el criterio de `.vega-field-row--slug`
	   para un valor canónico. Rompen donde haga falta: una ruta larga no desborda los 296 px. */
	.vega-review-value {
		font-family: var(--mono);
		font-size: 0.92em;
		color: var(--ink-hi);
		overflow-wrap: anywhere;
	}

	/* Pie del aviso: dónde está y qué se puede hacer. */
	.vega-review-meta {
		grid-column: 2;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.15rem 0.6rem;
	}

	/* Dónde está, cuando no es un enlace: la tipografía de `.vega-field-help`. */
	.vega-review-where {
		font-size: 0.82em;
		color: var(--ink-2);
	}

	/* La acción: el enlace de `.vega-refs-sample a` (ReferencesSummary), en botón. */
	.vega-review-go {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--accent-text);
		font: inherit;
		font-size: 0.82em;
		font-weight: 550;
		text-align: left;
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.vega-review-go:hover {
		text-decoration-color: currentColor;
	}

	/* «Ver 4 más» y «Volver a comprobar»: el botón-enlace de `.vega-schedule-link`. */
	.vega-review-more {
		align-self: flex-start;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink-2);
		font: inherit;
		font-size: 0.82em;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.vega-review-more:hover {
		color: var(--ink-hi);
	}

	.vega-review-go:focus-visible,
	.vega-review-more:focus-visible,
	.vega-review-retry:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	/* «No comprobado»: el motivo, en la tipografía de `.vega-field-help`, con su salida al lado. */
	.vega-review-skipped {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin: 0;
		font-size: 0.82em;
		color: var(--ink-2);
	}

	.vega-review-skipped .vega-review-more {
		font-size: 1em;
	}

	/* Fallo de lectura: `.vega-used-in-error` y su botón, los de los paneles del aside. */
	.vega-review-error {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-review-retry {
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--danger);
		border-radius: 6px;
		background: var(--danger-soft);
		color: var(--danger);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	/* Objetivo táctil de 44 px (`scripts/check-touch-targets.mjs`), solo con puntero basto. */
	@media (pointer: coarse) {
		.vega-review-go,
		.vega-review-more,
		.vega-review-retry {
			min-height: 44px;
		}
	}
</style>
