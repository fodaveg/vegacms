<script lang="ts">
	/**
	 * `RecordBlocks.svelte` (capacidad `blocks`, lote "editor" Fase A, `ResolvedBlocksConfig`): la
	 * lista embebida de bloques de un registro — "una landing es una secuencia de secciones, y
	 * PocketBase no tiene repeaters" (enunciado del lote). Vive en `$lib/form/` (a diferencia de
	 * `EditorRail.svelte`, en `$lib/list/`: no pinta enlaces reales a otra ruta — los bloques no
	 * tienen ruta propia, se editan aquí mismo — así que no necesita la exención de
	 * `no-navigation-without-resolve`).
	 *
	 * **Se carga y se muta a sí mismo** (mismo reparto que `EditorRail`): pide/crea/reordena/borra
	 * los hijos por su cuenta contra `ctx.port`, sin pasar por el `onSubmit` del `RecordForm`
	 * padre. Motivo (ver también la cabecera de `BlockEditor.svelte`): `RecordInput`/`onSubmit`
	 * del padre son de UN registro (§4.3 del contrato de backend); escribir varios registros de
	 * una colección distinta en el mismo envío rompería ese contrato. `RecordForm` solo necesita
	 * saber SI hay algo sucio aquí abajo (`onDirtyChange`), no CÓMO se guarda.
	 *
	 * **Decisión 1 — cuándo se persiste el reorden (enunciado del lote, a justificar en código)**:
	 * inmediato, al soltar o al mover con teclado — NUNCA diferido al guardado del padre. Motivos:
	 * (a) es el ÚNICO precedente real en el repo (`RecordTable.svelte`/`computeReorder`, el reorder
	 * de listado ya escribe al soltar); reinventar un segundo modelo de persistencia para el mismo
	 * gesto sería inconsistente sin necesidad. (b) Diferir exigiría que ESTE componente mantuviera
	 * un `orderField` "sucio" por bloque desacoplado de sus propios registros — exactamente el tipo
	 * de estado paralelo que `dirty.ts` evita para el registro padre (compara contra un `baseline`
	 * inmutable); replicarlo aquí solo para el reorden no gana nada, porque el reorden no comparte
	 * ninguna otra pieza de estado con el padre. (c) Es la operación MÁS barata y MÁS reversible de
	 * las tres (crear/reordenar/borrar): si el resultado no gusta, se vuelve a arrastrar — mismo
	 * contrato de "reversible arrastrando otra vez" que ya tiene el listado, no una regresión.
	 * El precio, honesto: no participa del "descartar cambios" del formulario padre (como tampoco
	 * participa el reorder del listado). Documentado también en el warning de error de red más
	 * abajo (`handleReorder`, se auto-corrige recargando si la escritura falla a medias).
	 *
	 * **Decisión 2 — guard de cambios sin guardar (`dirty.ts`)**: un bloque EXPANDIDO con ediciones
	 * de campo propias sin guardar (`BlockEditor`, que reusa `dirty.ts`/`isDirty` sobre SU PROPIO
	 * baseline) cuenta como "sucio" para el padre. `handleBlockDirtyChange` mantiene el conjunto de
	 * ids sucios y el agregado ("¿hay AL MENOS uno?") sube por `onDirtyChange` hasta `RecordForm`,
	 * que lo OR-ea con su propio `isDirty(baseline, current)` — así el guard de salida
	 * (`beforeNavigate`/`beforeunload`) y el punto "sin guardar" de la barra ven el estado real
	 * aunque el campo que cambió no sea del registro padre. Reordenar/crear/borrar NUNCA marcan
	 * sucio (decisión 1: ya están persistidos en el momento en que ocurren).
	 *
	 * **Estado de cada bloque, siempre MONTADO**: `BlockEditor` de cada fila vive en el DOM aunque
	 * la fila esté plegada (`hidden`, no `{#if}`) — así plegar/desplegar nunca destruye un borrador
	 * a medio escribir (si se destruyera con `{#if}`, colapsar por error tiraría el trabajo sin
	 * avisar, justo lo que el guard de salida existe para evitar). El coste es aceptable: una
	 * landing "hecha de secciones" tiene, en la práctica, pocos bloques (el propio caso de uso del
	 * lote), nunca cientos.
	 *
	 * **Accesibilidad del reorden**: reusa `createReorderDndController`/`computeReorder`
	 * (`$lib/list/reorder-dnd`, `$lib/list/reorder`, el MISMO patrón de `RecordTable`) — el asa
	 * `<button draggable="true">` acepta tanto arrastre como `ArrowUp`/`ArrowDown` sin "agarrar"
	 * antes (mismo comportamiento que el listado). A diferencia de `RecordTable` (que no anuncia
	 * nada), aquí SÍ hay una región `aria-live` (`announce`) que anuncia la posición resultante tras
	 * CUALQUIER reorden (arrastre o teclado) — requisito explícito del lote ("anuncio del cambio de
	 * posición"): el arrastre por sí solo no es accesible sin un eco por voz de dónde ha quedado el
	 * bloque.
	 */
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { RecordId, VegaRecord } from '$lib/backend/types';
	import type { ResolvedContentType } from '$lib/model/types';
	import { VegaError } from '$lib/backend/errors';
	import { getVegaContext } from '$lib/app-context';
	import { describeCell } from '$lib/list/cell';
	import { normalizeListError, RequestSequencer, resolveTitleCellText } from '$lib/list/list-load';
	import { createReorderDndController, dropIndicatorEdge } from '$lib/list/reorder-dnd';
	import { computeReorder } from '$lib/list/reorder';
	import DeleteConfirm from '$lib/list/DeleteConfirm.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import BlockEditor from './BlockEditor.svelte';

	interface Props {
		/** El tipo padre que declara `blocks` (`ResolvedContentType.blocks`, ya validado por P2). */
		parentType: ResolvedContentType;
		/** `model.recordId`: `null` en `/new` — sin id de padre no hay a qué apuntar, ver `notice`
		 *  más abajo. */
		parentId: RecordId | null;
		/** Sube a `true` en cuanto AL MENOS un bloque tenga ediciones sin guardar (decisión 2). */
		onDirtyChange: (dirty: boolean) => void;
	}

	let { parentType, parentId, onDirtyChange }: Props = $props();

	const ctx = getVegaContext();
	// `untrack`: captura DELIBERADA del valor inicial de `parentType` (mismo patrón que
	// `RecordForm.svelte` con `model`/`type` — ver su cabecera, "Semilla inicial"). `parentType` no
	// cambia tras el montaje en la práctica (la ruta remonta este componente si cambia de tipo), y
	// `blocksConfig`/`childType` alimentan variables `$state`/lógica que asume una identidad
	// estable durante todo el ciclo de vida (p.ej. `structuralFields`, capturado igual de una vez).
	const blocksConfig = untrack(() => parentType.blocks) ?? null;
	/** El `ResolvedContentType` de la colección hija — ya en `ctx.model` (P2 lo resuelve para TODAS
	 *  las colecciones descubiertas, no solo la que se está editando). `undefined` no debería
	 *  pasar (P2 ya validó que `blocksConfig.collection` existe, `resolveBlocks`), pero L11 manda
	 *  degradar sin crashear: sin el tipo hijo no hay nada que pintar, la sección desaparece entera
	 *  (mismo criterio que `EditorRail` con un `port.list` que falla).
	 */
	const childType = ctx.model.types.find((t) => t.name === blocksConfig?.collection) ?? null;
	/** Campos estructurales del hijo (parentField + orderField): el mini-formulario nunca los
	 *  pinta, `RecordBlocks` es su único escritor. Array ESTABLE (no `$derived`): `blocksConfig` no
	 *  cambia tras el montaje (ver arriba), así que no hace falta recalcularlo por render. */
	const structuralFields = blocksConfig ? [blocksConfig.parentField, blocksConfig.orderField] : [];

	type BlocksStatus =
		{ kind: 'loading' } | { kind: 'ready'; records: VegaRecord[] } | { kind: 'error' };

	let status = $state<BlocksStatus>({ kind: 'loading' });
	const records = $derived(status.kind === 'ready' ? status.records : []);

	/** Ids de bloque EXPANDIDOS (fila desplegada). Fuera de este set, `hidden` (ver cabecera).
	 *  `SvelteSet` (reactivo POR MUTACIÓN, mismo criterio que `MediaGrid.svelte`/`FileInput.svelte`):
	 *  el template lo lee con `.has()`, así que basta con mutarlo in-place — reasignar un `Set`
	 *  plano nuevo en cada toggle también repintaría, pero copia el set entero por gesto y lo
	 *  prohíbe la regla `svelte/prefer-svelte-reactivity` del lint. */
	const expandedIds = new SvelteSet<string>();
	/** Ids de bloque con ediciones sin guardar (decisión 2, ver cabecera). Mismo criterio. */
	const dirtyIds = new SvelteSet<string>();
	let creating = $state(false);
	let pendingDelete = $state<VegaRecord | null>(null);
	let deleting = $state(false);
	/** Texto de la región `aria-live` (accesibilidad del reorden, ver cabecera). Se reasigna con un
	 *  string NUEVO en cada reorden (incluso si el texto final coincidiera) para que los lectores
	 *  de pantalla lo relean — mismo patrón que cualquier `aria-live` de una sola línea. */
	let announce = $state('');

	const sequencer = new RequestSequencer();
	let loadedKey: string | null = null;

	async function load(collection: string, id: RecordId): Promise<void> {
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			const result = await ctx.port.list(collection, {
				filter: { kind: 'cond', field: blocksConfig!.parentField, op: 'eq', value: id },
				sort: [{ field: blocksConfig!.orderField, dir: 'asc' }],
				page: 1,
				// Sin paginación real (§ cabecera): una landing "hecha de secciones" nunca se acerca al
				// máximo del puerto; pedir directamente el máximo evita una segunda página invisible.
				perPage: 200
			});
			if (!sequencer.isLatest(seq)) return;
			status = { kind: 'ready', records: result.items };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			if (vegaErr.kind === 'auth-expired') ctx.feedback.reportError(vegaErr);
			status = { kind: 'error' };
		}
	}

	$effect(() => {
		const key =
			blocksConfig && childType && parentId !== null ? `${childType.name}:${parentId}` : null;
		if (key === loadedKey) return;
		loadedKey = key;
		// Cambiar de registro padre NO remonta este componente: `/c/[type]/[id]/+page.svelte` no
		// envuelve `RecordForm` en un `{#key}`, solo cambia props. Sin esta limpieza, el estado por
		// bloque del padre ANTERIOR sobrevive: `dirtyIds` conservaría ids de otro registro y
		// `onDirtyChange` seguiría reportando "hay cambios sin guardar" para siempre (guard de
		// salida atascado), y `expandedIds` desplegaría bloques que ya no existen aquí.
		expandedIds.clear();
		dirtyIds.clear();
		pendingDelete = null;
		onDirtyChange(false);
		if (key !== null && childType) void load(childType.name, parentId!);
	});

	function blockTitle(record: VegaRecord): string {
		if (!childType || childType.titleField === null) return ctx.t('list.untitled');
		const field = childType.fields.find((f) => f.name === childType.titleField);
		if (!field) return ctx.t('list.untitled');
		const descriptor = describeCell(field, record.values[field.name] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	function toggle(id: string): void {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	function setDirty(id: string, dirty: boolean): void {
		if (dirtyIds.has(id) === dirty) return; // sin cambio real, evita recalcular el agregado
		if (dirty) dirtyIds.add(id);
		else dirtyIds.delete(id);
		onDirtyChange(dirtyIds.size > 0);
	}

	function handleBlockSaved(id: string, saved: VegaRecord): void {
		status =
			status.kind === 'ready'
				? { kind: 'ready', records: status.records.map((r) => (r.id === id ? saved : r)) }
				: status;
	}

	async function handleCreate(): Promise<void> {
		if (!blocksConfig || !childType || parentId === null || creating) return;
		creating = true;
		try {
			const maxOrder = records.reduce((max, r) => {
				const raw = r.values[blocksConfig.orderField];
				return typeof raw === 'number' && raw > max ? raw : max;
			}, -1);
			const created = await ctx.port.create(childType.name, {
				[blocksConfig.parentField]: parentId,
				[blocksConfig.orderField]: maxOrder + 1
			});
			status = { kind: 'ready', records: [...records, created] };
			// El bloque nuevo arranca DESPLEGADO: es lo que el usuario acaba de pedir, tiene sentido
			// que vea de inmediato sus campos para rellenarlos (mismo criterio que abrir un registro
			// recién creado en `/c/[type]/new`).
			expandedIds.add(created.id);
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo crear el bloque', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:create' });
		} finally {
			creating = false;
		}
	}

	async function confirmDelete(): Promise<void> {
		if (!blocksConfig || !childType || !pendingDelete || deleting) return;
		const id = pendingDelete.id;
		deleting = true;
		try {
			await ctx.port.delete(childType.name, id);
			status = { kind: 'ready', records: records.filter((r) => r.id !== id) };
			expandedIds.delete(id);
			setDirty(id, false); // un bloque borrado nunca puede seguir contando como sucio
			pendingDelete = null;
		} catch (err) {
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo borrar el bloque', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:delete' });
		} finally {
			deleting = false;
		}
	}

	/** Reorden (decisión 1, ver cabecera): reflejo LOCAL inmediato del nuevo orden (feedback visual
	 *  instantáneo, sin esperar la red) + persistencia de SOLO los `{id, value}` que cambian
	 *  (`computeReorder`, misma lógica que el listado) + anuncio de posición. Si la escritura falla
	 *  a medias, se recarga desde el backend en vez de dejar el array local desincronizado del
	 *  `orderField` real — autocorrección simple, sin intentar reconciliar manualmente. */
	async function handleReorder(fromIndex: number, toIndex: number): Promise<void> {
		if (!blocksConfig || !childType) return;
		const orderedIds = records.map((r) => r.id);
		const currentValues = Object.fromEntries(
			records.map((r) => {
				const raw = r.values[blocksConfig.orderField];
				return [r.id, typeof raw === 'number' ? raw : 0];
			})
		);
		const updates = computeReorder(orderedIds, currentValues, fromIndex, toIndex);
		if (updates.length === 0) return;

		const reordered = [...records];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, moved);
		status = { kind: 'ready', records: reordered };
		announce = ctx.t('editor.blocks.reorder.moved', {
			label: blockTitle(moved),
			position: toIndex + 1,
			total: reordered.length
		});

		try {
			await Promise.all(
				updates.map((u) =>
					ctx.port.update(childType.name, u.id, { [blocksConfig.orderField]: u.value })
				)
			);
			const byId = new Map(updates.map((u) => [u.id, u.value]));
			status = {
				kind: 'ready',
				records: reordered.map((r) =>
					byId.has(r.id)
						? { ...r, values: { ...r.values, [blocksConfig.orderField]: byId.get(r.id)! } }
						: r
				)
			};
		} catch (err) {
			const vegaErr =
				err instanceof VegaError
					? err
					: VegaError.backend('No se pudo guardar el nuevo orden', err);
			ctx.feedback.reportError(vegaErr, { action: 'blocks:reorder' });
			// El reorden NO es atómico: son N escrituras independientes y PocketBase no da
			// transacción para esto. Si falla una y otras ya se aplicaron, el backend queda a mitad
			// —y con `orderField` posiblemente REPETIDO entre dos bloques, no solo "en otro orden"—
			// hasta que este `load()` relee la verdad. Se acepta a cambio de que la divergencia
			// nunca sea silenciosa: el usuario ve el error y la lista se repinta con lo persistido.
			void load(childType.name, parentId!);
		}
	}

	// ————— Arrastre + teclado (reusa `reorder-dnd.ts`, ver cabecera) —————
	let dragState = $state<{ fromIndex: number | null; overIndex: number | null }>({
		fromIndex: null,
		overIndex: null
	});
	const dnd = createReorderDndController(
		(from, to) => void handleReorder(from, to),
		() => records.length,
		(state) => (dragState = state)
	);

	/** Destino de foco de reserva de `DeleteConfirm` (su cabecera: el nodo de la fila borrada ya no
	 *  existe tras un borrado con éxito) — la cabecera de la propia tarjeta, `tabindex="-1"`, mismo
	 *  truco que el `<h1>` oculto de `RecordForm`. */
	let headingEl = $state<HTMLElement | null>(null);

	const loading = $derived(status.kind === 'loading');
	const failed = $derived(status.kind === 'error');
	/** La sección entera desaparece si `blocks` no resuelve tipo hijo (defensivo, ver arriba) o si
	 *  la carga falló (misma degradación "ayuda de navegación, no contenido" que `EditorRail`). */
	const hidden = $derived(!blocksConfig || !childType || failed);
</script>

{#if !hidden}
	{@const type = childType!}
	<section class="vega-blocks">
		<div class="vega-blocks-head">
			<h2 bind:this={headingEl} tabindex="-1">
				{type.label}{#if status.kind === 'ready'}<span class="vega-blocks-count"
						>{records.length}</span
					>{/if}
			</h2>
			{#if parentId !== null}
				<button type="button" class="vega-blocks-add" disabled={creating} onclick={handleCreate}>
					{ctx.t('editor.blocks.add', { label: type.labelSingular })}
				</button>
			{/if}
		</div>

		<div aria-live="polite" class="vega-visually-hidden-live">{announce}</div>

		{#if parentId === null}
			<p class="vega-blocks-notice">
				{ctx.t('editor.blocks.notice.saveParentFirst', { label: type.label })}
			</p>
		{:else if loading}
			<p class="vega-blocks-notice" aria-live="polite">{ctx.t('common.loading')}</p>
		{:else if records.length === 0}
			<p class="vega-blocks-notice">{ctx.t('editor.blocks.empty', { label: type.label })}</p>
		{:else}
			<ul class="vega-blocks-list">
				{#each records as record, i (record.id)}
					{@const title = blockTitle(record)}
					{@const expanded = expandedIds.has(record.id)}
					{@const dropEdge =
						dragState.overIndex === i
							? dropIndicatorEdge(dragState.fromIndex, dragState.overIndex)
							: null}
					<li
						class="vega-block-row"
						class:vega-block-row--dragging={dragState.fromIndex === i}
						class:vega-block-row--drop-before={dropEdge === 'before'}
						class:vega-block-row--drop-after={dropEdge === 'after'}
						ondragover={(event) => dnd.handleDragOver(event, i)}
						ondrop={(event) => dnd.handleDrop(event, i)}
					>
						<div class="vega-block-header">
							<button
								type="button"
								class="vega-block-handle"
								aria-label={ctx.t('list.reorder.handleLabel', { label: title })}
								draggable="true"
								ondragstart={(event) => dnd.handleDragStart(event, i)}
								ondragend={dnd.handleDragEnd}
								onkeydown={(event) => dnd.handleHandleKeydown(event, i)}
							>
								<span aria-hidden="true">⠿</span>
							</button>
							<button
								type="button"
								class="vega-block-toggle"
								aria-expanded={expanded}
								aria-controls={`vega-block-body-${record.id}`}
								onclick={() => toggle(record.id)}
							>
								<Icon id="chevron" size={14} />
								<span class="vega-block-title">{title}</span>
								{#if dirtyIds.has(record.id)}
									<span class="vega-block-dirty" title={ctx.t('editor.dirty')}>
										<span class="vega-visually-hidden">{ctx.t('editor.dirty')}</span>
									</span>
								{/if}
								<span class="vega-visually-hidden">
									{expanded
										? ctx.t('editor.blocks.collapseLabel', { label: title })
										: ctx.t('editor.blocks.expandLabel', { label: title })}
								</span>
							</button>
							<button
								type="button"
								class="vega-block-delete"
								aria-label={ctx.t('list.delete.rowButtonLabel', { label: title })}
								onclick={() => (pendingDelete = record)}
							>
								{ctx.t('list.delete.rowButton')}
							</button>
						</div>
						<!-- SIEMPRE montado (ver cabecera): `hidden`, no `{#if}` — un borrador a medio
						     escribir sobrevive a plegar/desplegar la fila. -->
						<div id={`vega-block-body-${record.id}`} class="vega-block-body" hidden={!expanded}>
							<BlockEditor
								childType={type}
								{record}
								{structuralFields}
								onSubmit={(input) => ctx.port.update(type.name, record.id, input)}
								onSaved={(saved) => handleBlockSaved(record.id, saved)}
								onDirtyChange={(dirty) => setDirty(record.id, dirty)}
							/>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- `targetCollection`/`targetId` (`#lote-integridad`, Fase A): el bloque a borrar es un registro
	     de la colección HIJA, así que la colección se lee del propio registro (`record.type`) y no de
	     `parentType` — borrar un bloque puede romper referencias igual que borrar cualquier otro
	     registro. -->
	<DeleteConfirm
		open={pendingDelete !== null}
		recordLabel={pendingDelete ? blockTitle(pendingDelete) : ''}
		targetCollection={pendingDelete?.type ?? ''}
		targetId={pendingDelete?.id ?? null}
		{deleting}
		fallbackFocusEl={headingEl}
		onConfirm={confirmDelete}
		onCancel={() => (pendingDelete = null)}
	/>
{/if}

<style>
	.vega-blocks {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		padding: var(--pad-card);
		min-width: 0;
	}

	.vega-blocks-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* Mismo rótulo de tarjeta que `.vega-fsection h2` (`RecordForm.svelte`): versalita tenue, un
	   solo criterio de cabecera de tarjeta en todo el editor. */
	.vega-blocks-head h2 {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}

	.vega-blocks-count {
		font-family: var(--mono);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	.vega-blocks-add {
		flex-shrink: 0;
		height: 32px;
		padding: 0 0.75rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		font-size: 0.8em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-blocks-add:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-blocks-add:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-blocks-notice {
		margin: 0;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-blocks-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-block-row {
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--surface);
		position: relative;
	}

	/* Indicador de destino del arrastre (mismo lenguaje que `.vega-row-drop-*` de `RecordTable`):
	   un hueco de color en el borde de la fila sobrevolada, ANTES o DESPUÉS según el sentido. */
	.vega-block-row--drop-before::before,
	.vega-block-row--drop-after::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
	}

	.vega-block-row--drop-before::before {
		top: -0.35rem;
	}

	.vega-block-row--drop-after::after {
		bottom: -0.35rem;
	}

	.vega-block-row--dragging {
		opacity: 0.5;
	}

	.vega-block-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.6rem;
	}

	.vega-block-handle {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink-3);
		cursor: grab;
		touch-action: none;
	}

	.vega-block-handle:hover {
		background: var(--active);
		color: var(--ink);
	}

	.vega-block-handle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.vega-block-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		padding: 0.2rem 0.3rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.vega-block-toggle:hover {
		background: var(--active);
	}

	.vega-block-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* El set de iconos apunta a la derecha (mismo motivo que `.vega-editor-back` de `RecordForm`):
	   plegado apunta a la derecha, desplegado gira 90° hacia abajo. */
	.vega-block-toggle :global(svg) {
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.vega-block-toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(90deg);
	}

	.vega-block-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 550;
	}

	.vega-block-dirty {
		flex-shrink: 0;
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warning);
		overflow: hidden;
	}

	.vega-block-delete {
		flex-shrink: 0;
		height: 1.8rem;
		padding: 0 0.6rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--danger);
		font: inherit;
		font-size: 0.78em;
		font-weight: 600;
		cursor: pointer;
	}

	.vega-block-delete:hover {
		background: var(--danger-soft);
	}

	.vega-block-body {
		padding: 0 0.75rem 0.75rem 2.3rem;
	}

	/* Región `aria-live` del anuncio de reorden (ver cabecera): SIEMPRE en el árbol de
	   accesibilidad, invisible en pantalla — misma técnica `.vega-visually-hidden` que el resto
	   del editor, pero con un nombre propio: esta clase, a diferencia de las demás de este
	   fichero, se aplica a un elemento que NUNCA debe verse ni ocupar espacio. */
	.vega-visually-hidden-live {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.vega-visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
