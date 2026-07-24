<script lang="ts">
	/**
	 * `MediaGrid.svelte` (Fase P6·6b): rejilla de assets de `vega_media`, componente TONTO a
	 * propósito (mismo reparto que `RecordTable`/`Pagination`, P4 §4c) — `+page.svelte` es dueño de
	 * la carga/paginación/estados de `loading`/`error`/vacío; este componente asume `items.length >
	 * 0` y solo pinta.
	 *
	 * **Miniatura con degradación (L-P6.4/D-P6.4)**: `resolveMediaGridSrc` (`media-thumb.ts`) ya
	 * decide thumb-vs-full según `ctx.port.capabilities.thumbs` — este componente NUNCA construye
	 * esa decisión, solo pinta el resultado. Un `<img>` cuyo `src` falle en runtime (extensión
	 * ambigua/incorrecta, mismo caso límite que el widget `file` de F5-f) degrada a icono vía
	 * `onerror` (`failedSrcs`, un `SvelteSet` — necesita reactividad de verdad para repintar al
	 * primer fallo, mismo criterio que `failedImages` de `FileInput.svelte`).
	 *
	 * **No-imagen (pdf…)**: icono `document` en vez de un `<img>` roto — nunca se intenta resolver
	 * `fileUrl` para un item que `classifyMediaFile` no clasifica como `'image'` (ver `media-item.ts`).
	 *
	 * **a11y**: cada celda es un `<button>` (foco-able, activable por teclado) dentro de un
	 * `<li>` de una lista real (`role="list"` implícito del `<ul>`) — la rejilla es navegable con
	 * Tab como cualquier otra colección de controles. El `<img>` lleva `alt` = el `alt` del asset o,
	 * si está vacío, el nombre de fichero (`mediaImgAlt`, contrato P6 §6b) — nunca `alt=""` (sería
	 * la única pista para quien no ve la miniatura).
	 *
	 * **`isSelected` (Fase P6·6e, opcional, REUTILIZADO por `MediaPicker.svelte`)**: `/media/
	 * +page.svelte` (6b/6d) sigue sin pasarlo — cada click ahí abre `MediaDetail`, ninguna celda se
	 * marca "seleccionada". `MediaPicker.svelte` sí lo pasa (compone este mismo grid en vez de
	 * clonarlo, contrato P6): pinta `aria-pressed`/un borde de acento en la celda elegida, la
	 * afordancia de selección 1..N del picker.
	 */
	import { SvelteSet } from 'svelte/reactivity';
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import { mediaDisplayName, mediaImgAlt, type MediaItemView } from './media-item';
	import { resolveMediaGridSrc } from './media-thumb';

	interface Props {
		items: MediaItemView[];
		onSelect: (item: MediaItemView) => void;
		/** `true` si `item` está seleccionado (Fase P6·6e, ver cabecera). `undefined` = ninguna
		 *  celda se marca (comportamiento de 6b/6d, sin cambios). */
		isSelected?: (item: MediaItemView) => boolean;
	}

	let { items, onSelect, isSelected }: Props = $props();

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
</script>

<ul class="vega-media-grid" data-media-grid>
	{#each items as item (item.id)}
		{@const src = srcFor(item)}
		<li>
			<button
				type="button"
				class="vega-media-cell"
				data-media-item={item.id}
				data-media-kind={src ? 'image' : 'other'}
				data-media-selected={isSelected?.(item) ? 'true' : undefined}
				aria-pressed={isSelected ? isSelected(item) : undefined}
				onclick={() => onSelect(item)}
			>
				<span class="vega-media-thumb-wrap">
					{#if src}
						<img
							{src}
							alt={mediaImgAlt(item)}
							class="vega-media-thumb"
							loading="lazy"
							onerror={() => handleImageError(item.id)}
						/>
					{:else}
						<Icon id="document" size={28} title={mediaImgAlt(item)} />
					{/if}
				</span>
				<!-- --mono cuando la leyenda cae al nombre de FICHERO crudo (sin `title`/`alt`
					     editorial, ver `mediaDisplayName`): un nombre de fichero es un valor canónico,
					     mismo criterio que ids/slugs — un título/alt escrito a mano sigue en prosa normal. -->
				<span
					class="vega-media-caption"
					class:vega-media-caption--raw={item.title === '' && item.alt === ''}
				>
					{mediaDisplayName(item)}
				</span>
			</button>
		</li>
	{/each}
</ul>

<style>
	.vega-media-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vega-media-cell {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		cursor: pointer;
		text-align: left;
	}

	.vega-media-cell:hover {
		border-color: var(--line-strong);
	}

	/* Selección del picker (Fase P6·6e, ENRIQUECIDO — mockup aquelarre-medios.html): el borde
	   sólido de acento pasa a un anillo `--sheen` (mismo trazo espectral que la fila activa de
	   `RecordTable`/el item activo de nav). Técnica del mockup: un pseudo-elemento con el
	   degradado de fondo, RECORTADO a un anillo vía `mask` de dos capas en XOR — `currentColor` en
	   los gradientes de la máscara es solo un truco de opacidad (100% alfa, cualquier color
	   serviría), NO un color de pintura real, así que no es "color crudo" a efectos de la barrera
	   anti-parches (§5.4 del contrato P7). */
	.vega-media-cell[data-media-selected='true'] {
		border-color: transparent;
	}

	.vega-media-cell[data-media-selected='true']::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.5px;
		background: var(--sheen);
		-webkit-mask:
			linear-gradient(currentColor 0 0) content-box,
			linear-gradient(currentColor 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		mask:
			linear-gradient(currentColor 0 0) content-box,
			linear-gradient(currentColor 0 0);
		pointer-events: none;
	}

	.vega-media-thumb-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		border-radius: 6px;
		background: var(--surface-2);
		color: var(--ink-2);
		overflow: hidden;
	}

	.vega-media-thumb {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.vega-media-caption {
		font-size: 0.8rem;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vega-media-caption--raw {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-2);
	}
</style>
