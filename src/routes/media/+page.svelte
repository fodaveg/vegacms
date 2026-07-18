<script lang="ts">
	/**
	 * `/media` (§2.4, §6.11 del contrato P3): placeholder honesto pre-P6 (P3-L10, "nada muere en
	 * silencio"). NADA de lógica de media aquí — grid, subida, picker son de P6; esta ruta solo
	 * fija el marco y el mensaje.
	 */
	import { getVegaContext } from '$lib/app-context';
	import RouteState from '$lib/shell/RouteState.svelte';

	const ctx = getVegaContext();
</script>

<RouteState
	kind="placeholder"
	title={ctx.t('media.placeholderTitle')}
	body={ctx.t('media.placeholderBody')}
/>
