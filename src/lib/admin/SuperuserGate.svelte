<script lang="ts">
	/**
	 * Tarjeta «Solo para superusuarios» de `/editores` y `/copias`: lo que ve un editor que llega a
	 * esas rutas por URL (la barra lateral ya no se las enseña). Mismo tratamiento que el aviso del
	 * manifiesto de `/settings` (`.vega-manifest-gate`): informa, no ofrece nada que vaya a fallar.
	 */
	import { getVegaContext } from '$lib/app-context';
	import './admin.css';

	let { body }: { body: string } = $props();

	const ctx = getVegaContext();
	const id = $props.id();
</script>

<section class="vega-admin-gate" aria-labelledby={id} data-admin-state="gated">
	<h1 {id} tabindex="-1">{ctx.t('admin.gate.title')}</h1>
	<p>{body}</p>
</section>
