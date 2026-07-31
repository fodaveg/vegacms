<script lang="ts">
	/**
	 * Contornos de selección del editor visual (tarea "contornos de selección", §"Visual editing
	 * bridge" de `docs/PROJECT-CONTRACT-v1.md`): pinta, ENCIMA del iframe de
	 * `VisualEditorScreen.svelte`, una caja por bloque que reporta el puente
	 * (`bridge-client.ts#VisualBlock`) más los estados que hay antes de que existan bloques que
	 * dibujar. Vive en un componente propio, y no dentro del `<iframe>`, por la misma razón que
	 * `bridge-client.ts` documenta en su cabecera: el marco es de OTRO origen, Vega no puede
	 * inyectar ni un nodo en su DOM — y aunque pudiera, el contorno heredaría (y ensuciaría) el
	 * CSS del sitio del cliente. Se dibuja fuera, con el `rect` que manda el puente.
	 *
	 * **`pointer-events: none` de arriba abajo, en el contenedor y en cada caja — es la pieza de
	 * diseño de este componente, no un detalle.** El lienzo tiene que poder hacer scroll con
	 * normalidad y el sitio tiene que seguir recibiendo los clics de sus propios enlaces y
	 * botones; si una sola caja capturase el puntero, las dos cosas se romperían. Consecuencia
	 * asumida: **nada de lo que pinta este componente es clicable**, así que no acepta ningún
	 * `onSelect` ni ningún otro manejador. La selección viaja SIEMPRE por el mensaje `select` del
	 * sitio, que escucha `VisualEditorScreen.svelte`, único dueño del id seleccionado (ver su
	 * cabecera). Se llegó a escribir aquí un prop `onSelect` «para no cambiar la firma cuando
	 * llegue el árbol de secciones» y se quitó: un prop OBLIGATORIO que no dispara nada le hace
	 * creer al siguiente que la vía está viva, y el árbol de secciones no va a seleccionar por
	 * aquí, sino por su propia lista.
	 *
	 * **El resalte por RATÓN queda fuera, y no es un olvido.** Mientras el puntero está sobre un
	 * iframe de otro origen, la ventana padre no recibe NINGÚN evento de ratón (ni `mousemove` ni
	 * `mouseover`: es la misma política de origen que le impide a Vega leer el DOM), y el
	 * protocolo `vega-visual-1` no tiene hoy un mensaje de `hover` del sitio a Vega (§"Site to
	 * Vega" del contrato: solo `ready`/`layout`/`select`/`error`). Capturar el puntero con este
	 * overlay para simularlo arreglaría la apariencia y rompería el scroll del lienzo, que es
	 * justo lo que la regla de arriba prohíbe. Entra cuando se escriba el puente del lado del
	 * sitio (`~/code/vega-astro`) y el contrato gane un mensaje nuevo. Lo que SÍ se pinta es
	 * `highlightedId`: el resalte que MANDA Vega (por ejemplo, al pasar el ratón por una fila del
	 * árbol de secciones de la tarea siguiente), nunca el que detecta.
	 *
	 * **Bloque que el sitio no sabe pintar.** El `type` de un bloque llega igual venga de un
	 * componente real o del fallback visible que `VegaBlocks` renderiza cuando no tiene uno
	 * (§"What the site must annotate" del contrato: "including on the visible fallback it renders
	 * for a block type the site has no component for") — el mensaje `ready`/`layout` no distingue
	 * los dos casos, así que `bridge-client.ts` no puede decirlo. El contraste sí existe, pero en
	 * OTRO sitio: el vocabulario de renderers que el propio sitio anuncia en discovery
	 * (`renderedBlockTypes`, la misma "promesa, no prueba" que `previewVisualEditing` — ver
	 * `backend/port.ts`), que es EXACTAMENTE lo que ya usa `model/load.ts#unsupportedBlockTypeWarnings`
	 * para el mismo contraste del lado del formulario. Por eso `renderedBlockTypes` es un prop de
	 * ESTE componente y no algo que el protocolo tenga que aprender a mandar. `null`/ausente (sin
	 * discovery, o proyecto legacy) = sin contraste posible: ningún bloque se marca, igual que el
	 * equivalente de `model/load.ts`.
	 *
	 * **Doble trazo, siempre — requisito, no adorno.** El contorno se pinta ENCIMA del sitio del
	 * cliente, cuyo fondo Vega no controla ni conoce (§"Visual editing bridge": "the site owns
	 * rendering"), así que un trazo de un solo color desaparece contra la mitad de los fondos
	 * posibles. La pareja de tokens `--paper`/`--ink-hi` da SIEMPRE un tono claro y uno oscuro, en
	 * cualquier tema y en cualquier modo (claro/oscuro) de la propia Vega — por definición la
	 * tinta de título tiene que leerse sobre el papel (§3 del vocabulario de temas), así que da
	 * igual cuál de los dos sea el claro en este modo: siempre hay uno de cada, y el par está
	 * MEDIDO, no afirmado (`['ink-hi', 'paper']` en `COMPONENT_CONTRAST_PAIRS`,
	 * `scripts/build-themes.mjs`, ≥4.5:1 en los 21 temas × 2 modos). Nunca un color a pelo
	 * (`scripts/check-theme-coverage.mjs` lo prohíbe fuera de `src/lib/themes/`). La ETIQUETA usa
	 * la misma pareja como fondo sólido en vez de trazo doble: un relleno opaco no necesita
	 * bracket, es inmune de por sí a lo que haya detrás. La unsoportada cambia de pareja
	 * (`--warning`/`--warning-soft`, también medida en el mismo gate) para separar "qué tipo es"
	 * de "está seleccionado", que es un eje aparte (color del contorno, ver CSS).
	 *
	 * **Decorativo para el lector de pantalla.** El grupo de cajas lleva `aria-hidden="true"`: la
	 * vía accesible de seleccionar será el árbol de secciones de la tarea siguiente, no este
	 * overlay — meter aquí un control real y enfocable dentro de un `aria-hidden` sería el
	 * antipatrón contrario (interactivo pero invisible para quien no usa ratón), y es justo lo que
	 * la regla de arriba evita. Los ESTADOS (cargando/sin bloques/bloques mal descritos) sí viven
	 * en su propia región `aria-live="polite"`, separada del grupo decorativo, porque esos sí son
	 * información y no adorno.
	 *
	 * Nada de insertar/reordenar/duplicar/borrar bloques: son tareas aparte. Este componente solo
	 * DIBUJA lo que el puente ya reportó.
	 */
	import { getVegaContext } from '$lib/app-context';
	import Icon from '$lib/icons/Icon.svelte';
	import type { VisualBlock } from './bridge-client';

	/**
	 * `'waiting'` mientras el puente no ha contestado al saludo con un `ready` (no hay bloques que
	 * puedan ser ciertos todavía); `'ready'` desde el primer `ready`, aunque `blocks` venga vacío.
	 * La diferencia entre "no ha contestado" y "contestó que no hay bloques" es la que separa el
	 * estado "Cargando" del estado "Sin bloques todavía" (§tarea) — ninguno de los dos se puede
	 * deducir solo de `blocks.length`, así que hace falta este prop aparte.
	 */
	type VisualOverlayStatus = 'waiting' | 'ready';

	interface Props {
		blocks: VisualBlock[];
		selectedId: string | null;
		highlightedId: string | null;
		/** Bloques que el sitio describió mal y `bridge-client.ts` descartó del array de arriba
		 *  (ver `parseBlocks`): se cuentan, no se esconden. */
		skippedBlocks: number;
		status: VisualOverlayStatus;
		/** Ver cabecera, "Bloque que el sitio no sabe pintar". `undefined`/`null` = sin
		 *  vocabulario de renderers que contrastar: ningún bloque se marca no soportado. */
		renderedBlockTypes?: readonly string[] | null;
	}

	let {
		blocks,
		selectedId,
		highlightedId,
		skippedBlocks,
		status,
		renderedBlockTypes = null
	}: Props = $props();

	const ctx = getVegaContext();

	/** `type` de cada bloque contra el vocabulario que el sitio anuncia (ver cabecera). Un `Set`
	 *  por render evita un `includes` lineal por bloque cuando la lista de renderers crece. */
	const decoratedBlocks = $derived.by(() => {
		const rendered = renderedBlockTypes ? new Set(renderedBlockTypes) : null;
		return blocks.map((block) => ({
			block,
			unsupported: rendered !== null && !rendered.has(block.type)
		}));
	});
</script>

<!-- `pointer-events: none` INLINE (`style:`), no solo en el `<style>` de abajo (ver cabecera,
     "pointer-events: none de arriba abajo"): un estilo en línea gana a cualquier regla externa
     por especificidad, así que ni una clase modificadora futura ni un tema puede reintroducir el
     puntero por accidente — la regla más importante del componente no depende de que nadie
     recuerde no tocarla en el CSS de más abajo. -->
<div class="vega-visual-overlay-root" style:pointer-events="none">
	<!-- Decorativo (ver cabecera): el propio grupo de cajas, aparte de la región de estados de
	     abajo. -->
	<div class="vega-visual-overlay-boxes" aria-hidden="true">
		{#each decoratedBlocks as { block, unsupported } (block.id)}
			<div
				class="vega-visual-overlay-box"
				class:vega-visual-overlay-box--selected={block.id === selectedId}
				class:vega-visual-overlay-box--highlighted={block.id === highlightedId}
				data-vega-block-id={block.id}
				style:pointer-events="none"
				style:top="{block.rect.top}px"
				style:left="{block.rect.left}px"
				style:width="{block.rect.width}px"
				style:height="{block.rect.height}px"
			>
				<span
					class="vega-visual-overlay-label"
					class:vega-visual-overlay-label--unsupported={unsupported}
				>
					{block.type}
					{#if unsupported}
						<Icon id="warning" size={12} />
						<span>({ctx.t('editor.visual.overlay.unsupported')})</span>
					{/if}
				</span>
			</div>
		{/each}
	</div>

	<!-- Informativo, NO decorativo (ver cabecera): estados que sí hay que anunciar. -->
	<div class="vega-visual-overlay-status" aria-live="polite">
		{#if status === 'waiting'}
			<p>{ctx.t('editor.visual.overlay.waiting')}</p>
		{:else if blocks.length === 0}
			<p>{ctx.t('editor.visual.overlay.empty')}</p>
		{/if}
		{#if status === 'ready' && skippedBlocks > 0}
			<p class="vega-visual-overlay-status--warning">
				{ctx.t('editor.visual.overlay.skipped', { count: skippedBlocks })}
			</p>
		{/if}
	</div>
</div>

<style>
	/* Cubre exactamente el mismo hueco que el `<iframe>` (`.vega-visual-canvas` de
	   `VisualEditorScreen.svelte` es `position: relative`, sin padding, así que `inset: 0` cae
	   sobre la misma caja de contenido que el marco: mismas coordenadas que `rect`, sin offset que
	   corregir). `overflow: hidden` recorta contra ESTE contenedor (ver cabecera de la tarea, "un
	   bloque más alto que el lienzo tiene parte del contorno fuera de vista") en vez de depender
	   solo del `overflow: hidden` que ya tiene `.vega-visual-canvas` — así el componente se recorta
	   solo aunque algún día viva dentro de otro contenedor. */
	.vega-visual-overlay-root {
		position: absolute;
		inset: 0;
		overflow: hidden;
		/* `pointer-events: none` va INLINE (`style:`, ver el marcado): aquí solo el resto de la
		   caja. */
	}

	.vega-visual-overlay-boxes {
		position: absolute;
		inset: 0;
	}

	/* Doble trazo `--paper`/`--ink-hi` (ver cabecera, "Doble trazo, siempre"): el primer
	   `box-shadow` es el anillo INTERIOR (pegado al borde del `rect`), el segundo el EXTERIOR —
	   entre los dos, un píxel de cada tono, así que uno de los dos siempre se lee contra
	   cualquier fondo del sitio. `--accent` de en medio en highlighted/selected es solo el color de
	   ESTADO: si desapareciera contra un fondo dado, el bracket claro/oscuro sigue marcando el
	   borde igual. */
	.vega-visual-overlay-box {
		position: absolute;
		/* `pointer-events: none` también INLINE aquí (ver el marcado): la instrucción es "en el
		   contenedor Y en las cajas", explícito en las dos, no heredado de una — así una caja no
		   se rompe si algún día se mueve fuera de este árbol. */
		border-radius: calc(var(--r) / 2);
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--ink-hi);
	}

	.vega-visual-overlay-box--highlighted {
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 2px var(--accent),
			0 0 0 3px var(--ink-hi);
	}

	/* Seleccionada gana sobre resaltada si algún día coinciden (mismo bloque en las dos): un
	   anillo más grueso, no un color distinto — la etiqueta ya dice el tipo, el grosor dice
	   "esta es la que tienes abierta". */
	.vega-visual-overlay-box--selected {
		box-shadow:
			0 0 0 1px var(--paper),
			0 0 0 3px var(--accent),
			0 0 0 4px var(--ink-hi);
	}

	/* Relleno OPACO (ver cabecera): no necesita bracket, un fondo sólido ya es inmune a lo que
	   haya detrás. `--ink-hi`/`--paper` es el mismo par medido ≥4.5:1 que el contorno, aquí como
	   fondo/tinta en vez de trazo. */
	.vega-visual-overlay-label {
		position: absolute;
		top: 0;
		left: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		max-width: calc(100% - 0.5rem);
		padding: 0.1rem 0.4rem;
		border-radius: var(--r);
		background: var(--ink-hi);
		color: var(--paper);
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Par `warning`/`warning-soft`, mismo gate (ver cabecera): separa "tipo no soportado" del eje
	   de selección, que vive en el contorno de arriba, no aquí. */
	.vega-visual-overlay-label--unsupported {
		background: var(--warning-soft);
		color: var(--warning);
	}

	/* Franja de estados (ver cabecera, "Informativo, NO decorativo"): flota en la esquina en vez
	   de empujar el lienzo, mismo criterio que `.vega-visual-overlay` (skeleton del token) de
	   `VisualEditorScreen.svelte` — cubre información, no bloquea la lectura del sitio detrás
	   salvo en la esquina que ocupa. Vacía (nada que decir) no pinta nada visible: los `<p>` de
	   dentro son los únicos con fondo. */
	.vega-visual-overlay-status {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		max-width: calc(100% - 1.5rem);
	}

	.vega-visual-overlay-status p {
		margin: 0;
		padding: 0.35rem 0.6rem;
		border-radius: var(--r);
		background: var(--surface-2);
		box-shadow: var(--shadow-card);
		color: var(--ink);
		font-size: 0.8125rem;
	}

	.vega-visual-overlay-status--warning {
		color: var(--warning);
	}
</style>
