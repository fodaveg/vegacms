<script lang="ts">
	/**
	 * `GlobalSearch.svelte`: el buscador global de la topbar (R1 del rediseño C2 para la caja;
	 * `#lote-shell` para la búsqueda de verdad detrás de ella).
	 *
	 * Hasta `#lote-shell` este componente era deliberadamente NO funcional —la caja estaba, el
	 * atajo `/` enfocaba, y escribir no disparaba nada— porque Vega no tenía forma de buscar
	 * cruzando tipos de contenido. Ya la tiene: `global-search.svelte.ts` consulta una vez por
	 * colección buscable y `global-search.ts` decide cuáles, con qué `Query` y cómo se titula cada
	 * acierto (reutilizando la MISMA búsqueda y la MISMA derivación de título que el listado).
	 *
	 * Lo que este fichero aporta encima de eso es solo la interfaz:
	 *
	 * - **Atajos ⌘K/Ctrl+K y `/`**: ambos enfocan la caja; `/` solo actúa FUERA de un
	 *   campo editable. Dentro de un `<input>`/`<textarea>`/contenteditable (incluido este
	 *   mismo buscador) el `/` se escribe con normalidad.
	 * - **Patrón combobox (APG)**: la caja es `role="combobox"` con `aria-expanded`/`aria-controls`/
	 *   `aria-activedescendant`, y el panel un `role="listbox"` con un `role="option"` por acierto.
	 *   El activo se mueve con ↓/↑ (vuelta circular), se abre con Enter y se cierra con Escape (que
	 *   con el panel ya cerrado vacía la caja). El foco NUNCA sale de la caja mientras se navega la
	 *   lista: eso es justo lo que compra `aria-activedescendant` frente a mover el foco real.
	 * - **Cada acierto es un `<a href>` REAL** (`recordRoute`), no un `onclick` que simule un enlace:
	 *   Cmd/Ctrl+click abre en pestaña nueva y el menú contextual del navegador funciona. El click
	 *   normal se intercepta para navegar por `ctx.nav.toRecord` (exit-guard de formulario sucio
	 *   incluido), mismo reparto que el menú de usuario de `Topbar.svelte`.
	 * - **"Ver todos"** por grupo cuando hay más coincidencias que aciertos pintados: lleva al
	 *   listado de esa colección con el término ya aplicado (`listSearchRoute`). El panel es un
	 *   atajo de navegación; la lista completa —con su paginación— sigue siendo del listado.
	 *
	 * **Sin ninguna colección buscable, el componente no se pinta** (ni la caja): era la petición
	 * literal del backlog ("mientras no exista, valorar esconderlo"), y una caja que no puede
	 * encontrar nada se lee como app rota, no como funcionalidad ausente. Ocurre, por ejemplo, en un
	 * proyecto cuyas colecciones visibles no tengan ningún campo de texto elegible.
	 *
	 * **`floating`**: sin barra donde vivir (el editor visual sustituye la barra de la app por la
	 * suya, ver `AppShell.svelte`), el buscador no se pinta hasta que ⌘K/Ctrl+K o `/` lo abren;
	 * entonces aparece como capa centrada arriba, con el mismo combobox, y se vuelve a ocultar al
	 * salir de él con la caja vacía (o con Escape). Así el atajo global no se pierde en esa ruta.
	 */
	import { tick } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import { listSearchRoute, recordRoute } from '$lib/nav/routes';
	import { createGlobalSearchState } from './global-search.svelte';
	import { globalSearchTypes, GLOBAL_SEARCH_MIN_CHARS } from './global-search';
	import { isEditableTarget } from './keyboard';

	/** Ver cabecera, "`floating`". */
	let { floating = false }: { floating?: boolean } = $props();

	const ctx = getVegaContext();
	const search = createGlobalSearchState(ctx);

	let inputEl = $state<HTMLInputElement | null>(null);
	let rootEl = $state<HTMLElement | null>(null);
	let toggleEl = $state<HTMLButtonElement | null>(null);
	/** El panel se pinta solo si la caja tiene el foco (o acaba de usarse): escribir, salir a otra
	 *  parte de la app y volver no debe reabrir un panel que el usuario ya había dejado atrás. */
	let focused = $state(false);

	/** Sin colecciones buscables no hay buscador (ver cabecera). Se recalcula con el modelo: un
	 *  `reloadModel()` que añada una colección con campos de texto lo hace aparecer. */
	const searchable = $derived(globalSearchTypes(ctx.model).length > 0);

	const status = $derived(search.status);
	const groups = $derived(status.kind === 'ready' ? status.groups : []);
	const failedCount = $derived(status.kind === 'ready' ? status.failedCount : 0);
	const open = $derived(focused && status.kind !== 'idle');

	const LISTBOX_ID = 'vega-global-search-results';

	/** Id del `role="option"` activo, para `aria-activedescendant` (null = ninguno). */
	const activeOptionId = $derived(
		search.activeIndex >= 0 ? optionId(search.activeIndex) : undefined
	);

	function optionId(index: number): string {
		return `vega-global-search-option-${index}`;
	}

	/** Índice GLOBAL (dentro de `search.hits`) del acierto `hitIndex` del grupo `groupIndex`: los
	 *  grupos se pintan en orden y `flattenHits` los concatena en ese mismo orden, así que el
	 *  desplazamiento es la suma de los tamaños de los grupos anteriores. */
	function globalIndex(groupIndex: number, hitIndex: number): number {
		let offset = 0;
		for (let i = 0; i < groupIndex; i += 1) offset += groups[i].hits.length;
		return offset + hitIndex;
	}

	/** Móvil (lámina Inicio v2): la caja se pliega en una lupa de la barra y se despliega bajo
	 *  ella. En escritorio la caja siempre está y esta bandera no cambia nada visible. */
	let expanded = $state(false);

	/** Despliega (en móvil) y enfoca la caja. El foco espera a que la caja deje de estar oculta. */
	async function openAndFocus(): Promise<void> {
		expanded = true;
		await tick();
		inputEl?.focus();
	}

	function handleGlobalKeydown(event: KeyboardEvent): void {
		const command =
			event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.altKey;
		const slash =
			event.key === '/' &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!isEditableTarget(event.target);
		if (!command && !slash) return;
		event.preventDefault();
		expanded = true;
		inputEl?.focus();
		// En móvil la caja estaba plegada (oculta): se enfoca cuando ya se pinta.
		if (document.activeElement !== inputEl) void tick().then(() => inputEl?.focus());
	}

	$effect(() => {
		document.addEventListener('keydown', handleGlobalKeydown);
		return () => {
			document.removeEventListener('keydown', handleGlobalKeydown);
			search.dispose();
		};
	});

	function handleInput(event: Event): void {
		search.setInput((event.currentTarget as HTMLInputElement).value);
	}

	/** Teclas del combobox (APG): ↓/↑ mueven el activo sin mover el foco real, Enter abre el activo,
	 *  Escape cierra el panel y —si ya estaba cerrado— vacía la caja. Tab NO se intercepta: sale del
	 *  buscador con normalidad y el `focusout` cierra el panel. */
	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!open) return;
			event.preventDefault();
			search.moveActive(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Enter') {
			const hit = search.activeHit();
			if (!hit) return;
			event.preventDefault();
			goToHit(hit.type, hit.id);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			if (open) {
				focused = false;
				// El foco se queda en la caja a propósito (no se pierde): Escape descarta el panel,
				// no la intención de buscar. Un segundo Escape ya sí vacía lo escrito.
				return;
			}
			if (search.input === '' && expanded) {
				// Caja ya vacía: en móvil, Escape la vuelve a plegar en la lupa con el foco en ella.
				// Flotante no hay lupa a la vista: se cierra la capa y el foco vuelve a `<main>`.
				expanded = false;
				if (floating) document.getElementById('vega-main-content')?.focus();
				else toggleEl?.focus();
				return;
			}
			search.clear();
		}
	}

	/** Navega a un acierto y deja el buscador limpio (panel cerrado y caja vacía): al volver a la
	 *  topbar tras abrir un registro, una caja con la búsqueda anterior escrita y sin panel sería un
	 *  estado a medias. */
	function goToHit(type: string, id: string): void {
		focused = false;
		search.clear();
		inputEl?.blur();
		ctx.nav.toRecord(type, id);
	}

	/** Click en un acierto: un click normal navega por `ctx.nav` (exit-guard incluido); uno
	 *  modificado (Cmd/Ctrl/Shift/central) sigue el `href` real y abre en pestaña/ventana nueva.
	 *  Mismo patrón que `Topbar.handleSettingsClick`/`Sidebar.handleFixedClick`. */
	function handleHitClick(event: MouseEvent, type: string, id: string): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		goToHit(type, id);
	}

	/** "Ver todos" de un grupo: al listado de esa colección con el término ya aplicado. */
	function handleSeeAllClick(event: MouseEvent, type: string): void {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		event.preventDefault();
		const term = search.searchedTerm;
		focused = false;
		search.clear();
		inputEl?.blur();
		// `toList(type, { q })` (§2.2, aditivo de `#lote-shell`): navegación por `NavApi` — con su
		// exit-guard — a la MISMA URL que lleva el `href` del enlace, no una composición aparte.
		ctx.nav.toList(type, { q: term });
	}

	/** El foco sale de la caja o del panel (Tab, o un click en otra parte): cierra. `relatedTarget`
	 *  `null` (foco a la nada / fuera de la ventana) también cierra. */
	function handleFocusOut(event: FocusEvent): void {
		const next = event.relatedTarget as Node | null;
		if (next && rootEl?.contains(next)) return;
		focused = false;
		// Plegada de nuevo salvo que quede algo escrito (volver a la lupa lo perdería de vista).
		// Flotante se oculta siempre: una capa abierta sin foco taparía la barra del editor.
		if (floating || search.input.trim() === '') expanded = false;
	}
</script>

{#if searchable}
	<div
		class="vega-search-root"
		class:expanded
		class:floating
		hidden={floating && !expanded}
		bind:this={rootEl}
		onfocusout={handleFocusOut}
		role="search"
	>
		<!-- Lupa de la barra móvil (lámina): despliega la caja; en escritorio no se pinta. -->
		<button
			type="button"
			class="vega-search-toggle"
			bind:this={toggleEl}
			aria-label={ctx.t('topbar.search.ariaLabel')}
			aria-expanded={expanded}
			onclick={() => void openAndFocus()}
		>
			<Icon id="search" size={16} strokeWidth={1.6} />
		</button>
		<div class="vega-search-box">
			<label class="vega-search">
				<Icon id="search" size={16} strokeWidth={1.6} />
				<input
					bind:this={inputEl}
					type="search"
					role="combobox"
					aria-expanded={open}
					aria-controls={LISTBOX_ID}
					aria-autocomplete="list"
					aria-activedescendant={activeOptionId}
					autocomplete="off"
					placeholder={ctx.t('topbar.search.placeholder')}
					aria-label={ctx.t('topbar.search.ariaLabel')}
					value={search.input}
					oninput={handleInput}
					onkeydown={handleKeydown}
					onfocus={() => (focused = true)}
				/>
				<span class="vega-search-keys" aria-hidden="true"><kbd>⌘</kbd><kbd>K</kbd></span>
			</label>

			<!-- El listbox existe SIEMPRE en el DOM (vacío mientras no hay panel) porque
		     `aria-controls` de la caja apunta a él: un id que no resuelve deja la relación rota
		     para el lector de pantalla. -->
			<div
				id={LISTBOX_ID}
				class="vega-search-panel"
				class:is-open={open}
				role="listbox"
				aria-label={ctx.t('topbar.search.results')}
			>
				{#if open}
					{#if status.kind === 'searching'}
						<p class="vega-search-note" aria-live="polite">{ctx.t('topbar.search.searching')}</p>
					{:else if status.kind === 'error'}
						<p class="vega-search-note is-error" aria-live="polite">
							{ctx.t('topbar.search.error')}
						</p>
					{:else if groups.length === 0}
						<p class="vega-search-note" aria-live="polite">
							{ctx.t('topbar.search.empty', { q: search.searchedTerm })}
						</p>
					{:else}
						{#each groups as group, groupIndex (group.type)}
							<div class="vega-search-group">
								<p class="vega-search-group-head">
									{#if group.icon}
										<Icon id={group.icon} size={13} />
									{/if}
									<span>{group.label}</span>
									<span class="vega-search-count">{group.totalItems}</span>
								</p>
								{#each group.hits as hit, hitIndex (hit.id)}
									{@const index = globalIndex(groupIndex, hitIndex)}
									<a
										id={optionId(index)}
										class="vega-search-hit"
										role="option"
										tabindex="-1"
										aria-selected={index === search.activeIndex}
										href={recordRoute(hit.type, hit.id)}
										onclick={(event) => handleHitClick(event, hit.type, hit.id)}
										onmousemove={() => search.setActive(index)}
									>
										<span class="vega-search-hit-title">{hit.title}</span>
										{#if hit.statusLabel !== null}
											<span class="vega-search-hit-status">
												<span
													class="vega-search-dot"
													data-status-kind={hit.statusKind}
													aria-hidden="true"
												></span>
												{hit.statusLabel}
											</span>
										{/if}
									</a>
								{/each}
								{#if group.totalItems > group.hits.length}
									<a
										class="vega-search-more"
										tabindex="-1"
										href={listSearchRoute(group.type, search.searchedTerm)}
										onclick={(event) => handleSeeAllClick(event, group.type)}
									>
										{ctx.t('topbar.search.seeAll', {
											count: group.totalItems - group.hits.length
										})}
									</a>
								{/if}
							</div>
						{/each}
						{#if failedCount > 0}
							<p class="vega-search-note is-partial">
								{ctx.t('topbar.search.partial', { count: failedCount })}
							</p>
						{/if}
					{/if}
				{/if}
			</div>

			<!-- Pista del mínimo de caracteres: fuera del listbox (no es una opción) y solo mientras la
		     caja tiene foco con algo escrito por debajo del umbral. -->
			{#if focused && search.input.trim() !== '' && status.kind === 'idle'}
				<p class="vega-search-panel is-open vega-search-hint">
					{ctx.t('topbar.search.minChars', { count: GLOBAL_SEARCH_MIN_CHARS })}
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Ancla del panel flotante: hereda el hueco elástico que antes tenía `.vega-search` en la
	   topbar (`flex:1` topado + `margin-inline:auto`), porque ahora el que es hijo directo del
	   `flex` de la topbar es este contenedor, no la caja. */
	.vega-search-root {
		position: relative;
		flex: 0 1 560px;
		/* Fix code-review (lote-1, 🟡): piso propio — sin esto, `flex:1` deja que el resto de la
		   topbar (wordmark/acciones, ambos `flex-shrink:0`) le pase TODO el squeeze en 769-900px
		   y el input se queda casi sin área de escritura. Ver también el `min-width` acotado del
		   wordmark en `Topbar.svelte` para ese mismo rango. */
		min-width: 8rem;
		/* Match 1:1 con el mockup (`aquelarre-dark.html` `.topbar-search`, `margin-inline: auto`):
		   antes quedaba pegado a la izquierda, justo tras el wordmark, porque solo `.vega-topbar-
		   actions` llevaba `margin-left:auto` (empujándose a sí misma a la derecha, sin centrar
		   nada más). Con `flex:1` topado en `max-width`, el hueco que le sobra a ese crecimiento
		   se reparte entre los DOS márgenes automáticos — quedando centrado en la topbar salvo que
		   el wordmark y las acciones difieran mucho de ancho (mismo trade-off que asume el propio
		   mockup, no una limitación nueva de este componente). */
		margin-inline: auto;
	}

	/* La lupa solo existe en la barra móvil (ver el bloque de 768 px). */
	.vega-search-toggle {
		display: none;
	}

	/* Capa del atajo cuando no hay barra (ver cabecera, "`floating`"): centrada arriba, sobre todo
	   lo demás, a cualquier ancho. Las reglas llevan dos clases para ganar a las del bloque móvil. */
	.vega-search-root.floating {
		position: fixed;
		z-index: 70;
		top: var(--sp-3);
		left: 50%;
		width: min(560px, calc(100vw - 2 * var(--sp-4)));
		min-width: 0;
		margin: 0;
		transform: translateX(-50%);
	}

	.vega-search-root.floating .vega-search-toggle {
		display: none;
	}

	.vega-search-root.floating .vega-search-box {
		display: block;
		position: static;
		padding: 0;
		border: 0;
		background: none;
	}

	/* Píldora de 38 px de la lámina (`.cmd`); en densidad compacta (barra de 44 px) baja lo justo
	   para que el contorno de foco quepa dentro de la ventana. El borde es `ink-2`, no la hairline
	   de la lámina: es el límite de un campo y el audit UX12 lo exige a ≥3:1. */
	.vega-search {
		display: flex;
		align-items: center;
		gap: 10px;
		height: min(38px, calc(var(--topbar-h) - 12px));
		box-sizing: border-box;
		padding: 0 10px 0 14px;
		background: var(--surface);
		border: 1px solid var(--ink-2);
		border-radius: var(--r-pill);
		color: var(--ink-2);
		font-size: var(--fs-13);
		box-shadow: var(--shadow-card);
		transition:
			box-shadow 0.15s,
			border-color 0.15s;
	}

	/* Anillo tenue de acento al pasar o escribir (lámina `.cmd:hover`), con tokens: sin
	   `color-mix` fuera de `src/lib/themes/` (check-theme-coverage). */
	.vega-search:hover:not(:focus-within) {
		box-shadow: 0 0 0 4px var(--accent-soft);
	}

	/* Escribiendo manda el contorno de foco (`:has(input:focus-visible)`, abajo): sin el anillo
	   tenue, que rebajaría el contraste del contorno (UX12 en `a11y-smoke.spec.ts`). */
	.vega-search:focus-within {
		box-shadow: var(--shadow-raised);
	}

	.vega-search:has(input:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}

	.vega-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font: inherit;
		color: var(--ink);
	}

	.vega-search input::placeholder {
		color: var(--ink-2);
		opacity: 1;
	}

	.vega-search input:focus {
		outline: none;
	}

	.vega-search-keys {
		display: inline-flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.vega-search kbd {
		font-family: var(--mono);
		font-size: 11px;
		line-height: 1.45;
		color: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 1px 6px;
		background: var(--btn);
	}

	/* El panel de resultados: misma tarjeta flotante que el menú de usuario de la topbar
	   (`--surface`/`--line`/`--shadow-card`), a lo ancho del buscador. Cerrado NO se pinta (pero el
	   elemento sigue en el DOM, ver el marcado: `aria-controls` necesita que su id resuelva). */
	.vega-search-panel {
		display: none;
	}

	.vega-search-panel.is-open {
		display: block;
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		z-index: 10;
		max-height: min(26rem, 60vh);
		overflow-y: auto;
		padding: 0.35rem;
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	.vega-search-note {
		margin: 0;
		padding: 0.5rem 0.6rem;
		font-size: 0.82rem;
		color: var(--ink-2);
	}

	.vega-search-note.is-error {
		color: var(--danger);
	}

	.vega-search-note.is-partial {
		border-top: 1px solid var(--line);
		color: var(--ink-2);
		font-size: 0.75rem;
	}

	.vega-search-group + .vega-search-group {
		border-top: 1px solid var(--line);
		margin-top: 0.25rem;
		padding-top: 0.25rem;
	}

	/* Cabecera de grupo: el nombre de la colección + su total de coincidencias. Tenue y pequeña —
	   es un rótulo de sección, no un resultado. */
	.vega-search-group-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		padding: 0.35rem 0.6rem 0.2rem;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
	}

	.vega-search-count {
		margin-left: auto;
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-2);
	}

	.vega-search-hit {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		color: var(--ink);
		font-size: 0.85rem;
		text-decoration: none;
	}

	/* El activo del teclado y el hover comparten tratamiento a propósito: es el MISMO estado
	   ("este es el que se abre si pulsas Enter / sueltas el click"), y tenerlo pintado de dos
	   formas distintas obligaría al usuario a aprender dos afordancias para una sola cosa. */
	.vega-search-hit:hover,
	.vega-search-hit[aria-selected='true'] {
		background: var(--active);
		color: var(--ink-hi);
	}

	.vega-search-hit-title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-search-hit-status {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		font-size: 0.72rem;
		color: var(--ink-2);
	}

	/* Punto de estado: MISMOS tokens que el de `EditorRail`/`RecordTable` (`describeStatusBadge`
	   decide el `data-status-kind`, nunca a partir de la etiqueta). */
	.vega-search-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--ink-3);
	}

	.vega-search-dot[data-status-kind='pub'] {
		background: var(--success);
	}

	.vega-search-dot[data-status-kind='draft'] {
		background: var(--ink-3);
	}

	.vega-search-dot[data-status-kind='other'] {
		background: var(--info);
	}

	.vega-search-dot[data-status-kind='scheduled'] {
		background: var(--accent);
	}

	.vega-search-dot[data-status-kind='overdue'] {
		background: var(--warning);
	}

	.vega-search-more {
		display: block;
		padding: 0.3rem 0.6rem 0.45rem;
		font-size: 0.75rem;
		color: var(--accent-text);
		text-decoration: none;
	}

	.vega-search-more:hover {
		text-decoration: underline;
	}

	/* La pista del mínimo comparte tarjeta con el panel, así que su relleno propio completa el del
	   panel (0.35rem) hasta el mismo hueco que un `.vega-search-note` (0.5rem × 0.6rem). */
	.vega-search-hint {
		margin: 0;
		padding: 0.15rem 0.25rem;
		font-size: 0.78rem;
		color: var(--ink-2);
	}

	/* Móvil (mismo punto de colapso de 768 px que Topbar/Sidebar/ConnectionStatus): la lámina
	   pliega el buscador en una lupa de la barra; desplegado, la caja baja bajo la barra a todo
	   el ancho y el panel conserva combobox, foco y navegación. */
	@media (max-width: 768px) {
		.vega-search-root {
			position: static;
			flex: none;
			min-width: 0;
			margin: 0 0 0 auto;
		}

		.vega-search-toggle {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			padding: 0;
			border: 1px solid transparent;
			border-radius: var(--r-pill);
			background: transparent;
			color: var(--ink-2);
			cursor: pointer;
		}

		.vega-search-toggle:hover,
		.expanded .vega-search-toggle {
			background: var(--btn);
			color: var(--ink);
		}

		.vega-search-box {
			display: none;
		}

		.expanded .vega-search-box {
			display: block;
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			padding: var(--sp-2) var(--sp-3);
			border-bottom: 1px solid var(--line);
			/* Opaco: un cristal anidado en la barra no desenfoca (ver el menú de cuenta). */
			background: var(--surface);
		}

		.vega-search {
			height: 44px;
		}

		.vega-search-keys {
			display: none;
		}

		.vega-search-panel.is-open {
			left: var(--sp-3);
			right: var(--sp-3);
		}
	}

	@media (pointer: coarse) {
		.vega-search-toggle {
			width: 44px;
			height: 44px;
			min-width: 44px;
			min-height: 44px;
		}
	}

	.vega-search-hit:hover .vega-search-hit-status,
	.vega-search-hit[aria-selected='true'] .vega-search-hit-status {
		color: var(--ink);
	}
</style>
