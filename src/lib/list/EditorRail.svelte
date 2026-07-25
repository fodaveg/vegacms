<script lang="ts">
	/**
	 * `EditorRail.svelte` (capacidad `editorRail`, mockup `aquelarre-detalle-post.html` `.rail`): el
	 * ÍNDICE de la colección que acompaña al editor — «la lista sigue presente mientras editas»,
	 * con el registro abierto marcado `aria-current="true"` (fondo `--accent-soft` + la barra
	 * `--sheen`, la MISMA firma que la fila activa de la tabla).
	 *
	 * Vive en `$lib/list/` y no en `$lib/form/` por dos motivos, los dos deliberados:
	 * 1. Es un LISTADO (deriva título/estado/fecha exactamente igual que `RecordTable.svelte`, con
	 *    `describeCell`/`classifyStatusBadge`/`resolveTitleCellText` — cero derivación propia).
	 * 2. `src/lib/list/**` es una de las cuatro capas exentas de `svelte/no-navigation-without-
	 *    resolve` (ver `eslint.config.js`): cada fila del raíl es un `href` REAL a
	 *    `recordRoute(type, id)`, igual que la celda-título de la tabla — nunca un `onclick` que
	 *    simule un enlace (se pierde abrir en pestaña nueva, y el foco/`Tab` deja de tener sentido).
	 *
	 * **Se carga a sí mismo** (mismo reparto que `Relation.svelte`, que también consulta el puerto
	 * por su cuenta para buscar candidatos): pedir estos registros a la ruta obligaría a atravesar
	 * `RecordForm` con una prop que solo sirve para pintar esta tarjeta, y las DOS rutas del editor
	 * (`/new` y `/[id]`) tendrían que duplicar la carga. Anti-carrera con el mismo
	 * `RequestSequencer` que `list-state.svelte.ts` (L-P4.10): cambiar de colección con una
	 * petición en vuelo no puede dejar pintados los hermanos de la colección anterior.
	 *
	 * **Degradación (eje 6 del checklist, "feedback del sistema")**: el raíl es una AYUDA de
	 * navegación, no el contenido de la página. Mientras carga pinta su cabecera con "Cargando…";
	 * si la carga falla, desaparece ENTERO en vez de meter un error rojo al lado del formulario que
	 * el usuario está editando (el editor sigue siendo perfectamente usable sin él). La única
	 * excepción es `auth-expired`, que SIEMPRE va al feedback global (§2.3): ese error no es "no
	 * pude listar", es "tu sesión ha caducado" y lo tapa el overlay de re-login.
	 *
	 * **Límite honesto**: se lista la PRIMERA página de la colección en su orden efectivo
	 * (`buildListQuery` con el `ViewState` vacío ⇒ respeta `defaultSort`/`orderField` del tipo, así
	 * que el raíl y el listado coinciden). Si el registro abierto cae fuera de esa página, ninguna
	 * fila queda marcada como actual — preferimos eso a inyectar el registro fuera de su orden, que
	 * daría un índice que no se parece al listado real. El contador de la cabecera es el TOTAL de
	 * la colección (`page.totalItems`), no el número de filas pintadas: mismo dato que el mockup.
	 */
	import { getVegaContext } from '$lib/app-context';
	import type { Page, VegaRecord } from '$lib/backend/types';
	import type { ResolvedContentType } from '$lib/model/types';
	import { recordRoute } from '$lib/nav/routes';
	import { classifyStatusBadge, describeCell } from './cell';
	import { normalizeListError, RequestSequencer, resolveTitleCellText } from './list-load';
	import { buildListQuery } from './search';

	interface Props {
		/** La colección que se está editando. El raíl lista SUS registros. */
		contentType: ResolvedContentType;
		/** Id del registro abierto (`aria-current="true"`), o `null` en creación (`/new`). */
		activeId: string | null;
		/** Contador que el editor incrementa tras CADA guardado con éxito: cualquier cambio de este
		 *  valor obliga a releer la colección. Sin él, renombrar el registro abierto dejaría el raíl
		 *  mintiendo con el título anterior hasta recargar la página. Es un token opaco (no se lee
		 *  su valor, solo se compara con el anterior), así que el editor no necesita saber NADA de
		 *  cómo carga el raíl. */
		reloadToken?: number;
	}

	let { contentType, activeId, reloadToken = 0 }: Props = $props();

	const ctx = getVegaContext();
	const sequencer = new RequestSequencer();

	type RailStatus =
		{ kind: 'loading' } | { kind: 'ready'; page: Page<VegaRecord> } | { kind: 'error' };

	let status = $state<RailStatus>({ kind: 'loading' });
	// Última carga ya pedida, como clave `colección:token` (variable PLANA, no `$state`, mismo
	// patrón que `loadedKey` de `/c/[type]/[id]`): así el `$effect` no depende de su propia
	// escritura de `status`. Navegar ENTRE hermanos de la misma colección no recarga (la lista es
	// la misma, solo cambia cuál va marcado); guardar sí, vía `reloadToken`.
	let loadedKey: string | null = null;

	async function load(type: ResolvedContentType): Promise<void> {
		const seq = sequencer.next();
		status = { kind: 'loading' };
		try {
			// `ViewState` vacío: sin búsqueda ni filtro, página 1 — el orden lo pone el propio tipo
			// (`defaultSort`/`orderField`), exactamente como arranca el listado sin query en la URL.
			const result = await ctx.port.list(
				type.name,
				buildListQuery(type, { q: '', status: null, sort: null, page: 1 })
			);
			if (!sequencer.isLatest(seq)) return;
			status = { kind: 'ready', page: result };
		} catch (err) {
			if (!sequencer.isLatest(seq)) return;
			const vegaErr = normalizeListError(err);
			// Ver cabecera: solo `auth-expired` sale de este componente (overlay global, §2.3).
			if (vegaErr.kind === 'auth-expired') ctx.feedback.reportError(vegaErr);
			status = { kind: 'error' };
		}
	}

	$effect(() => {
		const key = `${contentType.name}:${reloadToken}`;
		if (key === loadedKey) return;
		loadedKey = key;
		void load(contentType);
	});

	/** Campo-título ya resuelto (o `null` si el tipo no tiene ninguno representable). */
	const titleField = $derived(
		contentType.titleField !== null
			? (contentType.fields.find((f) => f.name === contentType.titleField) ?? null)
			: null
	);

	/** Campo de estado ya resuelto: alimenta el punto de color + la etiqueta de cada fila. */
	const statusField = $derived(
		contentType.statusField !== null
			? (contentType.fields.find((f) => f.name === contentType.statusField) ?? null)
			: null
	);

	/**
	 * Campo de FECHA de la línea secundaria (mockup: "hace 2 h"/"ayer"/"18 jul"), config-driven:
	 * el campo de `defaultSort` si el tipo declara uno y ES una fecha (el caso natural — un índice
	 * ordenado por "Actualizado ↓" quiere enseñar justo esa fecha), y si no el autodate `updated`.
	 * Sin ninguno de los dos, las filas no pintan fecha: nunca se elige "la primera fecha que
	 * haya" (sería un dato distinto en cada colección, imposible de interpretar de un vistazo).
	 */
	const dateField = $derived.by(() => {
		const sortName = contentType.defaultSort?.field ?? null;
		const sorted =
			sortName !== null ? contentType.fields.find((f) => f.name === sortName) : undefined;
		if (sorted && sorted.schema.type === 'date') return sorted;
		const updated = contentType.fields.find((f) => f.name === 'updated');
		return updated && updated.schema.type === 'date' ? updated : null;
	});

	/** Título de la fila: MISMA derivación que la celda-título de `RecordTable` (L-P4.15). */
	function railTitle(record: VegaRecord): string {
		if (!titleField) return ctx.t('list.untitled');
		const descriptor = describeCell(titleField, record.values[titleField.name] ?? null, ctx.locale);
		return resolveTitleCellText(descriptor, ctx.t('list.untitled'));
	}

	/** Valor CRUDO del estado de `record`, o `null` (sin `statusField`, o vacío en ese registro). */
	function railStatusValue(record: VegaRecord): string | null {
		if (!statusField) return null;
		const raw = record.values[statusField.name];
		return typeof raw === 'string' && raw !== '' ? raw : null;
	}

	/** Fecha de la fila ya formateada (relativa/absoluta, `describeCell`), o `null`. */
	function railDate(record: VegaRecord): string | null {
		if (!dateField) return null;
		const descriptor = describeCell(dateField, record.values[dateField.name] ?? null, ctx.locale);
		return descriptor.kind === 'date' ? descriptor.text : null;
	}

	// Snapshots reactivos del estado (mismo patrón que `readyPage` en `/c/[type]/+page.svelte`): el
	// marcado se apoya en estos `const` en vez de estrechar `status` dentro de bloques anidados.
	const railPage = $derived(status.kind === 'ready' ? status.page : null);
	const loading = $derived(status.kind === 'loading');
	const failed = $derived(status.kind === 'error');
</script>

{#if !failed}
	<nav class="vega-rail" aria-label={ctx.t('editor.rail.label')}>
		<div class="vega-rail-head">
			{contentType.label}
			{#if railPage}
				<span class="vega-rail-count">{railPage.totalItems}</span>
			{/if}
		</div>
		{#if loading}
			<p class="vega-rail-loading" aria-live="polite">{ctx.t('common.loading')}</p>
		{:else if railPage}
			<div class="vega-rail-items">
				{#each railPage.items as record (record.id)}
					{@const statusValue = railStatusValue(record)}
					{@const date = railDate(record)}
					<a
						href={recordRoute(contentType.name, record.id)}
						aria-current={record.id === activeId ? 'true' : undefined}
					>
						<span class="vega-rail-title">{railTitle(record)}</span>
						<span class="vega-rail-meta">
							{#if statusValue !== null}
								<span
									class="vega-rail-dot"
									data-status-kind={classifyStatusBadge(statusValue)}
									aria-hidden="true"
								></span>
								{contentType.statusLabels?.[statusValue] ?? statusValue}
							{/if}
							{#if date !== null}
								<span class="vega-rail-date">{date}</span>
							{/if}
						</span>
					</a>
				{/each}
			</div>
		{/if}
	</nav>
{/if}

<style>
	/* Tarjeta del raíl (mockup `.rail`): mismo papel/borde/sombra que el resto de tarjetas del
	   editor, pegajosa bajo la barra de acciones. `overflow: hidden` para que la primera/última
	   fila respeten el radio de la tarjeta. */
	.vega-rail {
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: var(--r);
		box-shadow: var(--shadow-card);
		overflow: hidden;
		position: sticky;
		/* El scroll vive en `.vega-main` (AppShell), que arranca JUSTO bajo la topbar — por eso el
		   offset es solo el alto de la barra pegajosa del editor (el mockup, cuyo scroll es el del
		   documento, suma además `var(--topbar-h)`). */
		top: 58px;
		display: flex;
		flex-direction: column;
		/* Casos límite de contenido real (eje 5): una colección con la página entera (30 registros)
		   haría una tarjeta más alta que la ventana, y lo pegajoso dejaría de funcionar. Se acota a
		   la altura visible y scrollea por dentro. */
		max-height: calc(100dvh - var(--topbar-h) - 5rem);
	}

	.vega-rail-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-shrink: 0;
		padding: 0.65rem 0.9rem;
		border-bottom: 1px solid var(--line-strong);
		font-size: 0.78em;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}

	/* Contador = VALOR canónico ⇒ `--mono` (misma regla que ids/slugs/fechas del resto del rediseño). */
	.vega-rail-count {
		margin-left: auto;
		font-family: var(--mono);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: var(--ink-3);
	}

	.vega-rail-loading {
		margin: 0;
		padding: 0.6rem 0.9rem;
		font-size: 0.86em;
		color: var(--ink-3);
	}

	.vega-rail-items {
		overflow-y: auto;
		min-height: 0;
	}

	.vega-rail a {
		display: block;
		padding: 0.6rem 0.9rem;
		text-decoration: none;
		border-bottom: 1px solid var(--line-soft);
		position: relative;
	}

	.vega-rail a:last-child {
		border-bottom: 0;
	}

	.vega-rail a:hover {
		background: var(--active);
	}

	.vega-rail-title {
		display: block;
		color: var(--ink);
		font-weight: 550;
		font-size: 0.9em;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-rail-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.2rem;
		font-size: 0.76em;
		color: var(--ink-3);
	}

	/* Fecha = valor canónico ⇒ `--mono` + tabular, empujada al borde derecho (mockup `.m .d`). */
	.vega-rail-date {
		margin-left: auto;
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Punto de estado (mockup `.dot.pub`/`.dra`/`.pro`): MISMA clasificación que la insignia de la
	   tabla (`classifyStatusBadge`), aquí reducida a color — la palabra ya va al lado. */
	.vega-rail-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--ink-3);
	}

	.vega-rail-dot[data-status-kind='pub'] {
		background: var(--success);
	}

	.vega-rail-dot[data-status-kind='draft'] {
		background: var(--ink-3);
	}

	.vega-rail-dot[data-status-kind='other'] {
		background: var(--info);
	}

	/* Registro abierto: fondo tenue de marca + barra `--sheen` a la izquierda — la MISMA firma que
	   la fila activa/sobrevolada de `RecordTable` (un `box-shadow` no admite gradiente, de ahí el
	   pseudo-elemento). */
	.vega-rail a[aria-current='true'] {
		background: var(--accent-soft);
	}

	.vega-rail a[aria-current='true'] .vega-rail-title {
		color: var(--ink-hi);
	}

	.vega-rail a[aria-current='true']::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2.5px;
		background: var(--sheen);
	}
</style>
