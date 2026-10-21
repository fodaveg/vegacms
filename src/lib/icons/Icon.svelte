<script lang="ts">
	/**
	 * `Icon.svelte` (§2.7 del contrato P3): renderiza el SVG inline del set empaquetado por P3
	 * (trazo propio, sin dependencia — eje 7 del checklist de diseño). `id` es deliberadamente
	 * `string` (no `IconId`): tanto la nav de P2 (`NavItem.icon`) como el `ManifestEditor` pueden
	 * pasar un id arbitrario del manifiesto de un proyecto; este componente hace la validación en
	 * RUNTIME contra `iconRegistry` y cae a `'generic'` si no lo reconoce (contrato §2.7:
	 * "Icono desconocido → el generic"), igual que `NavItem.icon === null`.
	 *
	 * `title` es la única superficie de a11y: si se pasa, el icono es informativo (`role="img"` +
	 * `aria-label`); si no, es decorativo (`aria-hidden`, fuera del árbol de accesibilidad) — el
	 * texto adyacente (label del botón/nav) ya lo describe, y duplicarlo confundiría a lectores
	 * de pantalla.
	 */
	import { iconRegistry } from './registry';

	interface Props {
		id: string;
		/** Lado del `viewBox` cuadrado, en px. Default 20 (encaja con el "aire" cómodo de C2). */
		size?: number;
		/** Presente ⇒ icono informativo con `aria-label`; ausente ⇒ decorativo (`aria-hidden`). */
		title?: string;
		/** Grosor del trazo en unidades del `viewBox`. Default 2; Inicio v2 y la edición en vivo
		 *  dibujan su chrome a 1.6 (láminas del 20 oct 2026). */
		strokeWidth?: number;
	}

	let { id, size = 20, title, strokeWidth = 2 }: Props = $props();

	const resolvedId = $derived(iconRegistry.has(id) ? id : 'generic');
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
	aria-label={title}
	focusable="false"
>
	{#if resolvedId === 'archive'}
		<!-- Caja de archivo con tapa (copias de seguridad, `/copias`), trazo de la lámina del audit:
		     `box` ya significa contenido y `upload` significa subir, ninguno dice «copia guardada». -->
		<rect x="3" y="4" width="18" height="5" rx="1" />
		<path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
		<line x1="10" y1="13" x2="14" y2="13" />
	{:else if resolvedId === 'arrow-down'}
		<!-- Bajar un bloque (edición en vivo, `i-dn`): flecha con asta, no el chevron de menú. -->
		<path d="M12 5v14M6 13l6 6 6-6" />
	{:else if resolvedId === 'arrow-up'}
		<!-- Subir un bloque (edición en vivo, `i-up`). -->
		<path d="M12 19V5M6 11l6-6 6 6" />
	{:else if resolvedId === 'arrow-up-right'}
		<!-- Flecha ↗ de los tiles enlazables de Inicio v2 (`i-arrow`): «ir al listado». -->
		<path d="M7 17 17 7M9 7h8v8" />
	{:else if resolvedId === 'back'}
		<!-- Volver (barra del editor, `i-back`): chevron a la izquierda. -->
		<path d="M15 6l-6 6 6 6" />
	{:else if resolvedId === 'box'}
		<!-- Caja/cubo isométrico (nav de contenido, p.ej. "Proyectos"), calcado del mockup
		     aquelarre-dark.html (`.nav-item` de Proyectos). -->
		<path d="M12 3 4 7v10l8 4 8-4V7l-8-4z" />
		<path d="M4 7l8 4 8-4M12 11v10" />
	{:else if resolvedId === 'check'}
		<polyline points="5 13 9 17 19 7" />
	{:else if resolvedId === 'chevron'}
		<polyline points="9 6 15 12 9 18" />
	{:else if resolvedId === 'close'}
		<line x1="6" y1="6" x2="18" y2="18" />
		<line x1="18" y1="6" x2="6" y2="18" />
	{:else if resolvedId === 'copy'}
		<!-- Duplicar (tarea "acciones estructurales desde el editor visual"): dos rectángulos
		     superpuestos, la hoja de detrás asomando arriba-izquierda — mismo lenguaje que
		     cualquier icono de "copiar" sin depender de un set externo (§2.7). -->
		<rect x="8" y="8" width="12" height="12" rx="2" />
		<path d="M4 16V6a2 2 0 0 1 2-2h10" />
	{:else if resolvedId === 'desktop'}
		<!-- Escritorio (selector de dispositivo del editor, `i-desk`). -->
		<rect x="3" y="4" width="18" height="12" rx="2" />
		<path d="M8 20h8M12 16v4" />
	{:else if resolvedId === 'document'}
		<path d="M6 2h7l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
		<polyline points="13 2 13 7 18 7" />
	{:else if resolvedId === 'eye'}
		<!-- Lote "publicación" fase B: ojo abierto clásico, botón "Vista previa" del panel embebido
		     de `RecordForm.svelte` (`PreviewPanel.svelte`) — distinto del icono `document` (que ya
		     representa "un registro"), para no confundir "abrir el registro" con "ver cómo queda". -->
		<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
		<circle cx="12" cy="12" r="3" />
	{:else if resolvedId === 'gear'}
		<!-- Engranaje (Ajustes de Vega en el menú lateral y el de cuenta, `i-gear`): distinto de
		     `settings` (deslizadores), que queda para el singleton «Ajustes del sitio». -->
		<circle cx="12" cy="12" r="3" />
		<path
			d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
		/>
	{:else if resolvedId === 'keyboard'}
		<!-- Teclado (atajos del editor, `i-kbd`). -->
		<rect x="3" y="6" width="18" height="12" rx="2" />
		<path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
	{:else if resolvedId === 'link'}
		<!-- Cadena: enlace en las barras de richtext y Markdown, mismo trazo que el set. -->
		<path
			d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
		/>
	{:else if resolvedId === 'list'}
		<line x1="8" y1="6" x2="21" y2="6" />
		<line x1="8" y1="12" x2="21" y2="12" />
		<line x1="8" y1="18" x2="21" y2="18" />
		<line x1="3" y1="6" x2="3" y2="6" />
		<line x1="3" y1="12" x2="3" y2="12" />
		<line x1="3" y1="18" x2="3" y2="18" />
	{:else if resolvedId === 'logout'}
		<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
		<polyline points="16 17 21 12 16 7" />
		<line x1="21" y1="12" x2="9" y2="12" />
	{:else if resolvedId === 'media'}
		<rect x="3" y="4" width="18" height="16" rx="2" />
		<circle cx="8.5" cy="9.5" r="1.5" />
		<polyline points="4 17 9 12 13 16 16 13 20 17" />
	{:else if resolvedId === 'menu'}
		<line x1="4" y1="6" x2="20" y2="6" />
		<line x1="4" y1="12" x2="20" y2="12" />
		<line x1="4" y1="18" x2="20" y2="18" />
	{:else if resolvedId === 'mobile'}
		<!-- Móvil (selector de dispositivo del editor, `i-mob`). -->
		<rect x="7" y="2" width="10" height="20" rx="2" />
		<path d="M11 18h2" />
	{:else if resolvedId === 'more'}
		<!-- «Más acciones» (lámina 7 del Lote 12, el único icono nuevo del lote): tres puntos en el
		     mismo lienzo de 24. Círculos de radio 1 (4 px de punto con el trazo), que es el peso al
		     que se leen junto a los demás; como trazos de longitud cero quedaban finos. -->
		<circle cx="5" cy="12" r="1" />
		<circle cx="12" cy="12" r="1" />
		<circle cx="19" cy="12" r="1" />
	{:else if resolvedId === 'news'}
		<!-- Noticia (modelo de contenido, `i-news`): periódico con columna. -->
		<path d="M4 5h13v14H6a2 2 0 0 1-2-2z" />
		<path d="M17 9h3v8a2 2 0 0 1-2 2" />
		<path d="M8 9h5M8 13h5M8 17h5" />
	{:else if resolvedId === 'pages'}
		<!-- Páginas (modelo de contenido, `i-pages`): hoja con renglones. -->
		<rect x="4" y="3" width="16" height="18" rx="2" />
		<path d="M8 8h8M8 12h8M8 16h5" />
	{:else if resolvedId === 'pen'}
		<!-- Lápiz (editar en la página, `i-pen`). -->
		<path d="M4 20h4l10-10-4-4L4 16z" />
		<path d="m12.5 7.5 4 4" />
	{:else if resolvedId === 'plus'}
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	{:else if resolvedId === 'project'}
		<!-- Proyecto (modelo de contenido, `i-proj`): edificio con puerta. -->
		<path d="M3 21h18M5 21V8l7-5 7 5v13" />
		<path d="M10 21v-6h4v6" />
	{:else if resolvedId === 'publish'}
		<!-- Cohete: publicar contenido o reconstruir el sitio; upload conserva subir ficheros.
		     Trazo de la lámina de Inicio v2 (`i-rocket`, glifo del sitio vacío). -->
		<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
		<path d="M9 15 15 9" />
		<path d="M9 15 6 12c1-3 3-6 6-8 3-1 6-1 7 0 1 1 1 4 0 7-2 3-5 5-8 6z" />
		<circle cx="15" cy="9" r="1.5" />
	{:else if resolvedId === 'search'}
		<circle cx="10" cy="10" r="6" />
		<line x1="21" y1="21" x2="15" y2="15" />
	{:else if resolvedId === 'settings'}
		<line x1="4" y1="7" x2="20" y2="7" />
		<circle cx="9" cy="7" r="2" />
		<line x1="4" y1="17" x2="20" y2="17" />
		<circle cx="15" cy="17" r="2" />
	{:else if resolvedId === 'tablet'}
		<!-- Tableta (selector de dispositivo del editor, `i-tab`). -->
		<rect x="4" y="3" width="16" height="18" rx="2" />
		<path d="M11 17h2" />
	{:else if resolvedId === 'tag'}
		<!-- Etiqueta (nav de contenido, p.ej. "Etiquetas"), calcado del mockup aquelarre-dark.html. -->
		<path d="M20 12l-8 8-8-8 8-8 3 3" />
		<circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none" />
	{:else if resolvedId === 'team'}
		<!-- Equipo / personas (modelo de contenido, `i-team`): dos siluetas. -->
		<circle cx="9" cy="8" r="3.5" />
		<path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
		<circle cx="17" cy="9" r="2.5" />
		<path d="M16 15.5a5 5 0 0 1 5.5 4.5" />
	{:else if resolvedId === 'trash'}
		<!-- `#lote-integridad` Fase B (§10.2): papelera de registros/assets borrados — cubo clásico
		     con tapa y dos rayas verticales, distinto del icono `close`/`warning` de peligro (esto es
		     navegación, no una advertencia). -->
		<polyline points="4 7 20 7" />
		<path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
		<path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
		<line x1="10" y1="11" x2="10" y2="17" />
		<line x1="14" y1="11" x2="14" y2="17" />
	{:else if resolvedId === 'update'}
		<!-- P8: flecha ascendente en círculo abierto, "hay algo nuevo" (banner/botón de
		     comprobación de actualizaciones de `/settings`), distinto del triángulo de aviso. -->
		<path d="M21 12a9 9 0 1 1-3.5-7.14" />
		<polyline points="21 3 21 9 15 9" />
	{:else if resolvedId === 'upload'}
		<!-- P6 (biblioteca de medios): flecha ascendente sobre una base — "meter algo aquí"
		     (botón "Subir archivos" y banda de arrastre), calcado del mockup aquelarre-medios.html. -->
		<path d="M12 16V4" />
		<polyline points="8 8 12 4 16 8" />
		<path d="M4 20h16" />
	{:else if resolvedId === 'user'}
		<circle cx="12" cy="8" r="4" />
		<path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
	{:else if resolvedId === 'video'}
		<!-- P6 (biblioteca de medios): cuerpo de cámara + lente triangular, la miniatura de un asset
		     de vídeo cuando no hay bitmap que enseñar (mockup aquelarre-medios.html). -->
		<rect x="3" y="5" width="13" height="14" rx="2" />
		<path d="m16 10 5-3v10l-5-3" />
	{:else if resolvedId === 'warning'}
		<path d="M12 3 22 20H2z" />
		<line x1="12" y1="9" x2="12" y2="14" />
		<line x1="12" y1="17" x2="12" y2="17.01" />
	{:else}
		<!-- 'generic': fallback para id === null, id desconocido, o el propio 'generic' (§2.7). -->
		<circle cx="12" cy="12" r="9" />
		<line x1="12" y1="8" x2="12" y2="13" />
		<line x1="12" y1="16" x2="12" y2="16.01" />
	{/if}
</svg>
