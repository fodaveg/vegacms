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
	}

	let { id, size = 20, title }: Props = $props();

	const resolvedId = $derived(iconRegistry.has(id) ? id : 'generic');
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
	aria-label={title}
	focusable="false"
>
	{#if resolvedId === 'check'}
		<polyline points="5 13 9 17 19 7" />
	{:else if resolvedId === 'chevron'}
		<polyline points="9 6 15 12 9 18" />
	{:else if resolvedId === 'close'}
		<line x1="6" y1="6" x2="18" y2="18" />
		<line x1="18" y1="6" x2="6" y2="18" />
	{:else if resolvedId === 'document'}
		<path d="M6 2h7l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
		<polyline points="13 2 13 7 18 7" />
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
	{:else if resolvedId === 'plus'}
		<line x1="12" y1="5" x2="12" y2="19" />
		<line x1="5" y1="12" x2="19" y2="12" />
	{:else if resolvedId === 'search'}
		<circle cx="10" cy="10" r="6" />
		<line x1="21" y1="21" x2="15" y2="15" />
	{:else if resolvedId === 'settings'}
		<line x1="4" y1="7" x2="20" y2="7" />
		<circle cx="9" cy="7" r="2" />
		<line x1="4" y1="17" x2="20" y2="17" />
		<circle cx="15" cy="17" r="2" />
	{:else if resolvedId === 'update'}
		<!-- P8: flecha ascendente en círculo abierto, "hay algo nuevo" (banner/botón de
		     comprobación de actualizaciones de `/settings`), distinto del triángulo de aviso. -->
		<path d="M21 12a9 9 0 1 1-3.5-7.14" />
		<polyline points="21 3 21 9 15 9" />
	{:else if resolvedId === 'user'}
		<circle cx="12" cy="8" r="4" />
		<path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
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
