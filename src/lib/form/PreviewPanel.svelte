<script lang="ts">
	/**
	 * `PreviewPanel.svelte` (lote "publicación", fase B, §"Preview endpoint" del contrato): panel
	 * lateral con el preview de BORRADOR embebido, alternativa a abrir otra pestaña — "se escribe
	 * y se ve al lado". `RecordForm.svelte` lo monta/desmonta con `{#if}` (nunca le pasa un prop
	 * `open`): así el temporizador de renovación de más abajo se limpia SOLO al desmontar
	 * (`onDestroy`), sin un segundo camino de limpieza ligado a un prop que mantener sincronizado.
	 *
	 * **Dónde vive (decisión del encargo)**: NO es una tarjeta más del aside (296px es demasiado
	 * estrecho para un iframe legible de una página real) ni sustituye nada — es un panel FIJO
	 * anclado al borde derecho del VIEWPORT (`position: fixed`, fuera de `.vega-editor-grid`), a
	 * pantalla partida con el formulario: el editor sigue completo y editable a la izquierda, el
	 * sitio se ve en vivo a la derecha. La alternativa (una cuarta columna en la rejilla
	 * raíl|tarjetas|aside) multiplicaría la matriz de breakpoints que ya documenta la cabecera de
	 * `RecordForm.svelte` (raíl×aside en 1180px/900px) por una capacidad que ni siquiera todos los
	 * proyectos declaran — un overlay fijo evita esa combinatoria sin tocar la rejilla existente.
	 *
	 * **Cuándo refresca**: NUNCA en cada tecla. Cada petición sí lleva el snapshot ACTUAL del
	 * registro y sus bloques, cifrado por el endpoint; se dispara al abrir, con "Actualizar", tras
	 * guardar y al renovar. Así una edición sin guardar aparece al actualizar sin convertir cada
	 * pulsación en una petición ni inventar un autoguardado.
	 *
	 * **Caducidad del token**: `PreviewToken.expiresAt` (`backend/preview-client.ts`) programa una
	 * renovación SILENCIOSA (pide un token nuevo, `<iframe src>` nuevo) un poco antes de que
	 * caduque — igual disciplina de limpieza que `pollBuildStatus` (`backend/build-client.ts`):
	 * `onDestroy` SIEMPRE cancela el temporizador pendiente. Si la propia renovación falla (el
	 * servidor de preview caído, token no renovable…), el panel pasa a estado de error EXPLÍCITO
	 * en vez de dejar el iframe viejo sirviendo contenido que ya no se puede refrescar con
	 * garantías — nunca un iframe mudo.
	 *
	 * **Qué NO hace**: un iframe cross-origin no se puede inspeccionar ni instrumentar desde aquí
	 * (política del navegador, y motivo explícito del encargo) — este componente solo escucha
	 * `load`/`error` del propio `<iframe>` para saber si el documento remoto terminó de cargar,
	 * nunca intenta leer su contenido, inyectarle nada, ni decidir si el sitio "realmente" renderizó
	 * bien (eso solo lo sabe el propio sitio, del otro lado del origen).
	 *
	 * **Responsive**: por debajo de 900px (mismo breakpoint que `.vega-editor-aside` deja de ser
	 * columna en `RecordForm.svelte`) el panel entero se oculta por CSS — un panel lateral fijo de
	 * 480px no tiene sitio en una pantalla de móvil sin tapar el propio formulario que se está
	 * editando. `RecordForm` oculta el botón que lo abre en el mismo punto de corte, así que en
	 * móvil la única afordancia de preview que queda es "Ver en el sitio" (degradación honesta:
	 * nada a medio pintar).
	 */
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import {
		createPreviewClient,
		type PreviewDraft,
		type PreviewToken
	} from '$lib/backend/preview-client';
	import Icon from '$lib/icons/Icon.svelte';

	interface Props {
		/** Base ABSOLUTA ya resuelta (`ctx.port.previewApiUrl`, resuelta en `session/backend.ts`). */
		apiBasePath: string;
		/** `type.name`: la colección del registro abierto. */
		collection: string;
		/** `model.recordId` YA no-nulo (`RecordForm` solo monta este panel en edición, con id real). */
		recordId: string;
		/** Registro y bloques tal como están AHORA en los formularios, no el baseline guardado. */
		draft: PreviewDraft;
		/** Sube en cada guardado con éxito (`RecordForm.savedCount`): dispara un refresco automático
		 *  mientras el panel sigue montado (ver cabecera, "Cuándo refresca"). */
		refreshToken: number;
		onClose: () => void;
	}

	let { apiBasePath, collection, recordId, draft, refreshToken, onClose }: Props = $props();

	const ctx = getVegaContext();
	// Capturado UNA vez (misma sesión durante toda la vida del panel), mismo criterio que
	// `PublishButton`/`createBuildClient`: el cliente es puro transporte, no cachea nada por su
	// cuenta — el estado/la renovación viven aquí. `untrack`: `apiBasePath` es un prop reactivo,
	// pero este panel se REMONTA entero (`{#if}` en `RecordForm`) si cambia el registro/proyecto,
	// así que solo hace falta su valor INICIAL (mismo patrón que `baseline`/`current` de
	// `RecordForm.svelte`).
	const client = createPreviewClient({
		apiUrl: untrack(() => apiBasePath),
		token: ctx.session.token
	});

	type PanelState =
		| { kind: 'loading' }
		| { kind: 'ready'; token: PreviewToken }
		| { kind: 'error'; message: string };

	let panelState: PanelState = $state({ kind: 'loading' });
	// `true` tras el evento `load` del iframe ACTUAL (ver cabecera, "Qué NO hace"): se resetea a
	// `false` en cada petición nueva — una URL nueva es un documento nuevo que hay que esperar a
	// que cargue, aunque el nodo `<iframe>` del DOM sea el mismo.
	let frameLoaded = $state(false);
	let renewTimer: ReturnType<typeof setTimeout> | null = null;
	let postForm = $state<HTMLFormElement | undefined>(undefined);
	const frameName = 'vega-preview-draft-frame';

	/** Margen de seguridad antes de `expiresAt` (ver cabecera): pedir el siguiente token con
	 *  antelación evita una ventana en la que el iframe sirve un token ya muerto. */
	const RENEW_BUFFER_MS = 15000;
	/** Techo del propio `setTimeout` (ES/Node/navegadores usan un entero de 32 bits para el
	 *  retraso): un `expiresAt` inusualmente lejano (proyecto mal configurado, o simplemente
	 *  generoso) desbordaría ese entero y el temporizador dispararía CASI DE INMEDIATO en vez de
	 *  esperar — la renovación resultante volvería a programarse con el mismo desborde, un bucle de
	 *  peticiones sin fin. Acotar aquí es puramente defensivo (P3-L3): en el caso normal (tokens de
	 *  minutos) nunca se alcanza este techo. */
	const MAX_RENEW_DELAY_MS = 2_147_483_647;

	function clearRenewTimer(): void {
		if (renewTimer) clearTimeout(renewTimer);
		renewTimer = null;
	}

	function scheduleRenew(token: PreviewToken): void {
		clearRenewTimer();
		const delay = Math.min(
			MAX_RENEW_DELAY_MS,
			Math.max(0, new Date(token.expiresAt).getTime() - Date.now() - RENEW_BUFFER_MS)
		);
		renewTimer = setTimeout(() => void requestPreview(), delay);
	}

	/** Contador de peticiones en vuelo. `requestPreview` se dispara por cuatro caminos distintos
	 *  (montaje, botón "Actualizar", guardado del registro y renovación programada) y nada impide
	 *  que se solapen: sin esta guarda, una respuesta LENTA iniciada antes pisa a una más reciente
	 *  y deja el panel con un token viejo —posiblemente a punto de caducar— y la renovación
	 *  reprogramada sobre él. Mismo patrón que `RequestSequencer` en `list/list-load.ts`. */
	let requestGeneration = 0;

	async function requestPreview(): Promise<void> {
		const generation = ++requestGeneration;
		panelState = { kind: 'loading' };
		frameLoaded = false;
		try {
			const token = await client.requestPreview(collection, recordId, draft);
			if (generation !== requestGeneration) return; // llegó tarde: manda la petición posterior
			panelState = { kind: 'ready', token };
			scheduleRenew(token);
			if (token.postToken) {
				await tick();
				if (generation !== requestGeneration) return;
				frameLoaded = false;
				postForm?.requestSubmit();
			}
		} catch (err) {
			if (generation !== requestGeneration) return;
			clearRenewTimer();
			panelState = {
				kind: 'error',
				message: err instanceof Error ? err.message : ctx.t('editor.preview.panel.genericError')
			};
		}
	}

	// Variable PLANA (no `$state`, mismo patrón que `loadedKey`/`syncedModel` de `RecordForm`): el
	// `$effect` de abajo la mantiene al día para no volver a pedir un token en CADA render, solo
	// cuando `refreshToken` de verdad cambia (un guardado nuevo). `untrack`: solo interesa el valor
	// INICIAL aquí, el propio `$effect` es quien reacciona a los cambios posteriores.
	let lastRefreshToken = untrack(() => refreshToken);

	$effect(() => {
		if (refreshToken === lastRefreshToken) return;
		lastRefreshToken = refreshToken;
		void requestPreview();
	});

	onMount(() => {
		void requestPreview(); // primera carga, al abrir el panel
	});

	onDestroy(clearRenewTimer);
</script>

<aside class="vega-preview-panel" aria-label={ctx.t('editor.preview.panel.label')}>
	<div class="vega-preview-panel-head">
		<h2>{ctx.t('editor.preview.panel.title')}</h2>
		<div class="vega-preview-panel-actions">
			<button
				type="button"
				class="vega-preview-panel-button"
				disabled={panelState.kind === 'loading'}
				title={ctx.t('editor.preview.panel.refresh')}
				aria-label={ctx.t('editor.preview.panel.refresh')}
				onclick={() => void requestPreview()}
			>
				<Icon id="update" size={14} />
			</button>
			<button
				type="button"
				class="vega-preview-panel-button"
				aria-label={ctx.t('editor.preview.panel.close')}
				onclick={onClose}
			>
				<Icon id="close" size={14} />
			</button>
		</div>
	</div>

	<div class="vega-preview-panel-body">
		{#if panelState.kind === 'error'}
			<div class="vega-preview-panel-message" role="alert">
				<p>{panelState.message}</p>
				<button type="button" onclick={() => void requestPreview()}>
					{ctx.t('common.retry')}
				</button>
			</div>
		{:else}
			<div class="vega-preview-panel-frame-wrap">
				{#if panelState.kind === 'ready'}
					{#if panelState.token.postToken}
						<!-- Un form target permite que el ciphertext viaje en el BODY de un POST. La URL
						     queda limpia y el iframe sigue siendo cross-origin/opaco para Vega. -->
						<form
							class="vega-preview-panel-post"
							method="post"
							action={panelState.token.url}
							target={frameName}
							bind:this={postForm}
						>
							<input type="hidden" name="token" value={panelState.token.postToken} />
						</form>
					{/if}
					<!-- Cross-origin a propósito (ver cabecera, "Qué NO hace"): SOLO se escuchan
					     `load`/`error`, nunca se lee ni se toca el contenido del documento remoto. -->
					<iframe
						class="vega-preview-panel-frame"
						name={frameName}
						src={panelState.token.postToken ? 'about:blank' : panelState.token.url}
						title={ctx.t('editor.preview.panel.frameTitle')}
						referrerpolicy="no-referrer"
						onload={() => (frameLoaded = true)}
						onerror={() =>
							(panelState = { kind: 'error', message: ctx.t('editor.preview.panel.loadError') })}
					></iframe>
				{/if}
				{#if panelState.kind === 'loading' || (panelState.kind === 'ready' && !frameLoaded)}
					<div class="vega-preview-panel-overlay" aria-live="polite">
						<p>{ctx.t('editor.preview.panel.loading')}</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</aside>

<style>
	/* Panel FIJO anclado al viewport (ver cabecera, "Dónde vive"): NUNCA parte de
	   `.vega-editor-grid` — así no reflowa el editor ni multiplica su matriz de breakpoints.
	   `top: var(--topbar-h)` deja visible la topbar de la app por encima, mismo token que usa
	   `EditorRail.svelte` para su propio `max-height`. */
	.vega-preview-panel {
		position: fixed;
		top: var(--topbar-h);
		right: 0;
		bottom: 0;
		width: min(480px, 92vw);
		display: flex;
		flex-direction: column;
		min-width: 0;
		border-left: 1px solid var(--line);
		background: var(--paper);
		box-shadow: var(--shadow-card);
		/* Por encima del contenido del editor (barra pegajosa incl., z-index 9) y de las tarjetas
		   sticky del aside; por debajo de diálogos/toasts/overlays de sesión (70/60/80, ver
		   `DeleteConfirm`/`ToastHost`/`ReloginModal`) — un panel no-modal no debe taparlos. */
		z-index: 40;
	}

	.vega-preview-panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: var(--pad-card);
		border-bottom: 1px solid var(--line);
		flex-shrink: 0;
	}

	/* Mismo rótulo de tarjeta que `.vega-fsection h2` de `RecordForm.svelte` — REPINTADO aquí a
	   propósito (los estilos de Svelte están acotados al componente que los declara, no se
	   reutiliza la clase del otro componente). */
	.vega-preview-panel-head h2 {
		margin: 0;
		font-size: 0.76em;
		font-weight: 650;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
	}

	.vega-preview-panel-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.vega-preview-panel-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		cursor: pointer;
	}

	.vega-preview-panel-button:hover:not(:disabled) {
		border-color: var(--line-strong);
	}

	.vega-preview-panel-button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.vega-preview-panel-body {
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.vega-preview-panel-frame-wrap {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.vega-preview-panel-frame {
		width: 100%;
		height: 100%;
		border: 0;
		background: var(--surface);
	}

	.vega-preview-panel-post {
		display: none;
	}

	/* Skeleton honesto mientras carga (ver cabecera): cubre el iframe hasta el evento `load`, en
	   vez de dejarlo en blanco sin explicación. */
	.vega-preview-panel-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		background: var(--paper);
		color: var(--ink-2);
		font-size: 0.85rem;
	}

	.vega-preview-panel-message {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1.5rem;
		text-align: center;
		color: var(--danger);
		font-size: 0.85rem;
	}

	.vega-preview-panel-message button {
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: var(--r);
		background: var(--btn);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.vega-preview-panel-message button:hover {
		border-color: var(--line-strong);
	}

	/* Mismo breakpoint que `.vega-editor-aside` deja de ser columna lateral en `RecordForm.svelte`
	   (ver cabecera, "Responsive"): un panel FIJO de hasta 480px no tiene sitio en móvil. */
	@media (max-width: 900px) {
		.vega-preview-panel {
			display: none;
		}
	}
</style>
