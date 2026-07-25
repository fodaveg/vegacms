<script lang="ts">
	/**
	 * `MediaGrid.svelte` (Fase P6·6b; rediseño al mockup `aquelarre-medios.html`): rejilla de assets
	 * de `vega_media`, componente TONTO a propósito (mismo reparto que `RecordTable`/`Pagination`,
	 * P4 §4c) — `+page.svelte`/`MediaPicker.svelte` son dueños de la carga/paginación/estados de
	 * `loading`/`error`/vacío; este componente asume `items.length > 0` y solo pinta.
	 *
	 * **Anatomía de la celda (mockup `.asset`)**: tarjeta `--paper` con borde `--line` y
	 * `--shadow-card`; dentro, una miniatura 4/3 (`.thumb`) con la badge de extensión arriba a la
	 * izquierda (`--mono`, valor canónico) y el círculo de selección arriba a la derecha; debajo,
	 * nombre (una línea con elipsis) y subtítulo en `--mono` con las medidas REALES del fichero
	 * ("2880×1800 · 1,2 MB", ver más abajo y `media-card.ts` para la cascada de degradación).
	 *
	 * **Medidas del fichero (`assetMetrics`)**: el registro de `vega_media` no las guarda (§4.4), así
	 * que se miden aquí, sin coste para el render:
	 * - las DIMENSIONES salen del `<img>` que la miniatura ya carga (`naturalWidth`/`naturalHeight`
	 *   en su `load`), así que no hay ni una petición extra;
	 * - el TAMAÑO, de un `HEAD` a la URL del fichero (`fetchAssetByteSize`) — cuerpo nunca
	 *   descargado, y en `memory` (demo/showcase) ni eso: el data-URI ya dice cuánto pesa.
	 *
	 * Tres invariantes de ese trabajo en segundo plano, por orden de importancia:
	 * 1. **Nunca bloquea ni rompe nada**: el subtítulo se pinta desde el primer frame con el texto de
	 *    respaldo y se sustituye cuando (y si) llegan las medidas; cualquier fallo es `null` en
	 *    silencio (ver `media-metrics.ts`).
	 * 2. **Se cancela**: un `AbortController` por lote, abortado en la limpieza del `$effect` — al
	 *    cambiar de página/filtro o desmontar, ninguna respuesta tardía escribe sobre la rejilla
	 *    nueva. El id vuelve a `pendingSizes` para que el siguiente lote pueda medirlo.
	 * 3. **Acotado**: solo los items VISIBLES (los que llegan por `items`), uno detrás de otro —
	 *    nunca la biblioteca entera ni 24 peticiones a la vez— y una sola vez por asset
	 *    (`pendingSizes`).
	 *
	 * **`loading` según el tipo de URL (no siempre `lazy`)**: con una URL http(s) —PocketBase real—
	 * `lazy` es justo lo que se quiere. Pero con un **data-URI** (adaptador `memory`: demo, escaparate
	 * y `MediaPicker` en tests) Chrome deja la imagen en `complete:false`/`naturalWidth:0` y NUNCA la
	 * decodifica aunque esté dentro del viewport: la miniatura se queda en blanco y, de rebote, las
	 * DIMENSIONES no se miden nunca (dependen del `load`, ver arriba) y el subtítulo se queda sin su
	 * `W×H`. Verificado en vivo: el mismo data-URI que la rejilla deja a 0×0 carga a 2880×1800 en
	 * cuanto se le pone `eager`. Por eso el atributo se decide por el esquema del `src`; un data-URI
	 * ya está en memoria, así que diferirlo no ahorraba nada de todos modos.
	 *
	 * **Miniatura con degradación (L-P6.4/D-P6.4)**: `resolveMediaGridSrc` (`media-thumb.ts`) ya
	 * decide thumb-vs-full según `ctx.port.capabilities.thumbs` — este componente NUNCA construye
	 * esa decisión, solo pinta el resultado. Un `<img>` cuyo `src` falle en runtime (extensión
	 * ambigua/incorrecta, mismo caso límite que el widget `file` de F5-f) degrada a icono vía
	 * `onerror` (`failedImages`, un `SvelteSet` — necesita reactividad de verdad para repintar al
	 * primer fallo, mismo criterio que `failedImages` de `FileInput.svelte`). Sin bitmap, la
	 * miniatura pinta el icono del TIPO (imagen/vídeo/documento) sobre uno de los cuatro degradados
	 * de rol del mockup, elegido de forma DETERMINISTA por id (`mediaThumbTone`).
	 *
	 * **a11y**: cada celda es un `<button>` (foco-able, activable por teclado) dentro de un `<li>`
	 * de una lista real — la rejilla es navegable con Tab como cualquier otra colección de
	 * controles. El `<img>` lleva `alt` = el `alt` del asset o, si está vacío, el nombre de fichero
	 * (`mediaImgAlt`, contrato P6 §6b) — nunca `alt=""` (sería la única pista para quien no ve la
	 * miniatura).
	 *
	 * **Dos modos de selección, un solo componente**:
	 * - `isSelected` a secas (picker, Fase P6·6e): el botón de la celda ES el toggle — click =
	 *   elegir/deselegir, con `aria-pressed` en él y el círculo como afordancia decorativa.
	 * - `isSelected` + `onToggleSelect` (biblioteca `/media`): el click de la celda mantiene su
	 *   gesto de siempre (abrir `MediaDetail`, contrato 6b/6d), así que el `aria-pressed` NO puede
	 *   vivir en ese botón — mentiría sobre lo que hace. La selección se opera con un botón PROPIO
	 *   (el círculo de la esquina), hermano del de la celda —nunca anidado, `<button>` dentro de
	 *   `<button>` es marcado inválido—, con su `aria-pressed` y su etiqueta accesible.
	 */
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import {
		classifyMediaAssetType,
		mediaCardSubtitle,
		mediaExtensionBadge,
		mediaThumbTone
	} from './media-card';
	import { fetchAssetByteSize, type MediaAssetMetrics } from './media-metrics';
	import { mediaDisplayName, mediaImgAlt, type MediaItemView } from './media-item';
	import { resolveMediaFileUrl, resolveMediaGridSrc } from './media-thumb';

	interface Props {
		items: MediaItemView[];
		/** Activación primaria de la celda: elegir (picker) o abrir el detalle (`/media`). */
		onSelect: (item: MediaItemView) => void;
		/** `true` si `item` está seleccionado. `undefined` = ninguna celda se marca. */
		isSelected?: (item: MediaItemView) => boolean;
		/** Presente ⇒ modo biblioteca: la selección se opera con el círculo de la esquina (ver
		 *  cabecera), no con el click de la celda. */
		onToggleSelect?: (item: MediaItemView) => void;
	}

	let { items, onSelect, isSelected, onToggleSelect }: Props = $props();

	const ctx = getVegaContext();

	// Ids de item cuyo `<img>` YA falló al cargar (ver cabecera): degrada esa celda a icono sin
	// volver a intentar `fileUrl`.
	const failedImages = new SvelteSet<string>();

	function srcFor(item: MediaItemView): string | null {
		if (failedImages.has(item.id)) return null;
		return resolveMediaGridSrc(ctx.port, item);
	}

	function handleImageError(id: string): void {
		failedImages.add(id);
	}

	// ————— Medidas reales del fichero (ver cabecera) —————

	/** Lo que el template lee para cada celda. `SvelteMap` (reactivo por mutación): cada `set`
	 *  repinta SOLO el subtítulo de esa tarjeta. Se conserva entre lotes — volver a una página ya
	 *  vista no vuelve a medir nada. */
	const assetMetrics = new SvelteMap<string, MediaAssetMetrics>();
	/** Ids cuyo tamaño ya se pidió (o se está pidiendo). Set PLANO y deliberadamente NO reactivo:
	 *  es contabilidad interna del efecto de abajo, nunca se lee en el template — y si fuera
	 *  reactivo, leerlo dentro del efecto que lo escribe crearía un ciclo. */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingSizes = new Set<string>();

	/** El `<img>` de la miniatura ya cargó: sus dimensiones NATURALES son las del original (el
	 *  adaptador puede haber servido un thumb recortado, en cuyo caso `capabilities.thumbs` es
	 *  `true` y lo que se mide es el thumb — asumido: es la imagen que el usuario está viendo).
	 *  `target` llega como `Element` genérico (así tipa Svelte el `currentTarget` de `onload`); el
	 *  emisor es SIEMPRE el `<img>` de este mismo marcado, mismo cast acotado que
	 *  `event.currentTarget as HTMLInputElement` en `MediaUpload`. */
	function handleImageLoad(id: string, target: EventTarget & Element): void {
		const img = target as HTMLImageElement;
		if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
		assetMetrics.set(id, {
			...assetMetrics.get(id),
			width: img.naturalWidth,
			height: img.naturalHeight
		});
	}

	/**
	 * Pide el tamaño de cada asset del lote, en SECUENCIA (ver invariante 3 de la cabecera).
	 *
	 * Ninguna lectura de `assetMetrics` ocurre antes del primer `await`: el efecto que llama a esta
	 * función solo debe depender de `items`, y una lectura síncrona del mapa que ella misma escribe
	 * lo convertiría en un bucle. Si algún día se reordena este cuerpo, mantener esa propiedad.
	 */
	async function measureSizes(batch: MediaItemView[], signal: AbortSignal): Promise<void> {
		for (const item of batch) {
			if (signal.aborted) return;
			if (pendingSizes.has(item.id)) continue;
			const url = resolveMediaFileUrl(ctx.port, item);
			pendingSizes.add(item.id);
			if (url === null) continue; // sin URL no hay nada que medir, y no lo habrá: no se reintenta
			const bytes = await fetchAssetByteSize(url, { signal });
			if (signal.aborted) {
				// Lote cancelado a mitad: este id vuelve a estar disponible para el lote siguiente.
				pendingSizes.delete(item.id);
				return;
			}
			if (bytes === null) continue; // medido y sin respuesta útil: no se insiste
			assetMetrics.set(item.id, { ...assetMetrics.get(item.id), bytes });
		}
	}

	$effect(() => {
		const batch = items;
		const controller = new AbortController();
		void measureSizes(batch, controller.signal);
		return () => controller.abort();
	});
</script>

<ul class="vega-media-grid" data-media-grid>
	{#each items as item (item.id)}
		{@const src = srcFor(item)}
		{@const selected = isSelected?.(item) ?? false}
		{@const label = mediaDisplayName(item)}
		{@const type = classifyMediaAssetType(item.fileName)}
		{@const ext = mediaExtensionBadge(item.fileName)}
		{@const subtitle = mediaCardSubtitle(item, ctx.locale, assetMetrics.get(item.id))}
		<li class="vega-media-card" class:vega-media-card--selected={selected}>
			<button
				type="button"
				class="vega-media-cell"
				data-media-item={item.id}
				data-media-kind={src ? 'image' : 'other'}
				data-media-selected={selected ? 'true' : undefined}
				aria-pressed={isSelected && !onToggleSelect ? selected : undefined}
				onclick={() => onSelect(item)}
			>
				<span
					class="vega-media-thumb-wrap"
					class:vega-media-thumb-wrap--tone={!src}
					data-media-tone={src ? undefined : mediaThumbTone(item.id)}
				>
					{#if ext !== ''}
						<!-- Badge de extensión (mockup `.ext`): --mono, valor canónico del fichero. -->
						<span class="vega-media-ext">{ext}</span>
					{/if}
					{#if src}
						<img
							{src}
							alt={mediaImgAlt(item)}
							class="vega-media-thumb"
							loading={src.startsWith('data:') ? 'eager' : 'lazy'}
							onload={(event) => handleImageLoad(item.id, event.currentTarget)}
							onerror={() => handleImageError(item.id)}
						/>
					{:else if type === 'video'}
						<Icon id="video" size={30} title={mediaImgAlt(item)} />
					{:else if type === 'image'}
						<Icon id="media" size={30} title={mediaImgAlt(item)} />
					{:else}
						<Icon id="document" size={30} title={mediaImgAlt(item)} />
					{/if}
					{#if isSelected && !onToggleSelect}
						<!-- Modo picker: el toggle es el botón de la celda, así que el círculo es pura
						     afordancia visual (el tick se revela por color, ver CSS). -->
						<span class="vega-media-check" aria-hidden="true">
							<Icon id="check" size={12} />
						</span>
					{/if}
				</span>
				<span class="vega-media-meta">
					<span class="vega-media-name">{label}</span>
					<span class="vega-media-sub">{subtitle}</span>
				</span>
			</button>
			{#if onToggleSelect}
				<!-- Modo biblioteca: control REAL de selección, hermano del botón de la celda. -->
				<button
					type="button"
					class="vega-media-check vega-media-check--control"
					aria-pressed={selected}
					aria-label={ctx.t('media.selection.toggle', { label })}
					onclick={() => onToggleSelect(item)}
				>
					<Icon id="check" size={12} />
				</button>
			{/if}
		</li>
	{/each}
</ul>

<style>
	/* Rejilla (mockup `.media-grid`): columnas fluidas de 180px mínimo, con el gutter de densidad
	   del shell — nunca un gap fijo, para que `compact` apriete también aquí. */
	.vega-media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--vega-space-gutter);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Tarjeta (mockup `.asset`): el marco vive en el `<li>` (no en el botón) porque en modo
	   biblioteca hay DOS controles dentro — el de la celda y el círculo de selección. */
	.vega-media-card {
		position: relative;
		display: flex;
		background: var(--paper);
		border: 1px solid var(--line);
		border-radius: var(--r);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}

	.vega-media-card:hover {
		border-color: var(--line-strong);
	}

	.vega-media-cell {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	/* El foco se recorta contra el `overflow: hidden` de la tarjeta, así que el anillo va HACIA
	   DENTRO (offset negativo) en vez de por fuera. */
	.vega-media-cell:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.vega-media-cell:hover .vega-media-name {
		color: var(--accent-text);
	}

	/* Seleccionado (mockup `.asset.is-selected`): el borde sólido cede su sitio a un anillo de
	   `--sheen` (trazo espectral, mismo reparto que la fila activa de `RecordTable`). Técnica del
	   mockup: pseudo-elemento con el degradado de fondo RECORTADO a un anillo vía `mask` de dos
	   capas en XOR — `currentColor` en los gradientes de la máscara es solo un truco de opacidad
	   (100% alfa, cualquier color serviría), NO un color de pintura real, así que no es "color
	   crudo" a efectos de la barrera anti-parches (§5.4 del contrato P7). */
	.vega-media-card--selected {
		border-color: transparent;
	}

	.vega-media-card--selected::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.5px;
		background: var(--sheen);
		/* ORDEN CRÍTICO: los shorthands `mask`/`-webkit-mask` RESETEAN `mask-composite` a su valor
		   inicial (`add`), así que tienen que ir ANTES de él. Con el orden inverso las dos capas se
		   suman en vez de restarse y el degradado rellena la tarjeta ENTERA, tapando miniatura,
		   badge y nombre. El mockup trae justo ese orden inverso y su propia tarjeta seleccionada
		   sale rellena — es un bug DEL MOCKUP, no la intención (su comentario dice "anillo"), así
		   que aquí se corrige en vez de calcarlo. Verificado en vivo: `mask-composite` computa
		   `exclude` y el anillo sale de 1.5px. */
		-webkit-mask:
			linear-gradient(currentColor 0 0) content-box,
			linear-gradient(currentColor 0 0);
		mask:
			linear-gradient(currentColor 0 0) content-box,
			linear-gradient(currentColor 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
	}

	/* Miniatura (mockup `.thumb`): 4/3, hairline interna de separación y fondo de control. */
	.vega-media-thumb-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 4 / 3;
		border-bottom: 1px solid var(--line-soft);
		background: var(--btn);
		color: var(--ink-3);
		overflow: hidden;
	}

	/* Placeholders SOLO con tokens (mockup `.ph-a`…`.ph-d`): matiz por rol, elegido de forma
	   determinista por id (`mediaThumbTone`) — nunca al azar. */
	.vega-media-thumb-wrap--tone[data-media-tone='a'] {
		background: linear-gradient(140deg, var(--accent-soft), var(--surface-2));
		color: var(--accent-text);
	}

	.vega-media-thumb-wrap--tone[data-media-tone='b'] {
		background: linear-gradient(140deg, var(--info-soft), var(--surface-2));
		color: var(--info);
	}

	.vega-media-thumb-wrap--tone[data-media-tone='c'] {
		background: linear-gradient(140deg, var(--success-soft), var(--surface-2));
		color: var(--success);
	}

	.vega-media-thumb-wrap--tone[data-media-tone='d'] {
		background: linear-gradient(140deg, var(--warning-soft), var(--surface-2));
		color: var(--warning);
	}

	.vega-media-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.vega-media-ext {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--line-soft);
		border-radius: 4px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 0.68em;
		/* Explícito: el `line-height` del lienzo no viaja a un componente Svelte y la badge
		   quedaría descentrada dentro de sus 0.1rem de padding. */
		line-height: 1.4;
		letter-spacing: 0.05em;
	}

	/* Círculo de selección (mockup `.check`): sin seleccionar, el tick existe pero es transparente
	   (mismo hueco, sin salto al marcarlo). */
	.vega-media-check {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 50%;
		background: var(--surface-2);
		color: transparent;
	}

	.vega-media-check--control {
		cursor: pointer;
	}

	.vega-media-check--control:hover {
		border-color: var(--accent-line);
	}

	.vega-media-card--selected .vega-media-check {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-ink);
	}

	.vega-media-meta {
		display: block;
		padding: 0.55rem 0.7rem 0.65rem;
	}

	.vega-media-name {
		display: block;
		color: var(--ink);
		font-size: 0.88em;
		font-weight: 550;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Subtítulo: valor canónico (nombre de fichero o fecha) → `--mono` + cifras tabulares. */
	.vega-media-sub {
		display: block;
		margin-top: 1px;
		color: var(--ink-3);
		font-family: var(--mono);
		font-size: 0.72em;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Móvil (mockup): dos columnas fijas antes que columnas de 180px que ya no caben. */
	@media (max-width: 560px) {
		.vega-media-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
