<script lang="ts">
	/**
	 * `PublishButton.svelte` (lote "publicación", fase A): el puente "guardado → publicado" para
	 * proyectos `output: 'static'` (Astro y similares) que hoy dependen de que un humano corra el
	 * build a mano. Vive en la topbar, junto a `ConnectionStatus` (la densidad vive en el menú de cuenta).
	 *
	 * **Ausencia = "cero pintar nada"** (P3-L3, decisión ya tomada en el encargo): si el proyecto
	 * conectado no declaró `build` en su discovery, `ctx.port.buildApiUrl` es `null`/`undefined`
	 * (ver `BackendPort.buildApiUrl`, `backend/port.ts`) y este componente no renderiza NADA, ni
	 * siquiera un botón deshabilitado — no hay funcionalidad que anunciar.
	 *
	 * **Estados reales** (nunca solo color: el texto del botón ES el estado, dentro de un
	 * `role="status"` para que un cambio ASÍNCRONO del sondeo de fondo —no un click del usuario—
	 * también se anuncie a lectores de pantalla sin que el foco tenga que estar ahí):
	 *  - `loading`: aún no se conoce el estado real (primer `fetchStatus()` en vuelo). Deshabilitado.
	 *  - `unavailable`: la PRIMERA consulta falló y aún no hay ningún estado que enseñar. Dice por
	 *    qué, distinguiendo «sin permiso» (401/403, `BuildRequestError`) de «no se llega al servidor»
	 *    (el `fetch` rechaza, u otro estado HTTP): en vez de quedarse eternamente en «Cargando». El
	 *    sondeo sigue reintentando con back-off y, si responde, el estado real sustituye a este.
	 *    Deshabilitado. Una vez conocido un estado, un fallo posterior NO vuelve a este (se conserva
	 *    el último estado visto, como siempre).
	 *  - `running`: build en curso (`BuildStatus.state === 'running'`, sondeado con
	 *    `pollBuildStatus`). Deshabilitado (evita disparos duplicados).
	 *  - `no-changes`: nada editado desde `lastPublishedAt`. Dice «Sitio al día» si el último build
	 *    terminó bien; en otro caso, «Sin cambios». Sigue accionable para reconstruir el sitio.
	 *  - `ok`: el último build terminó bien pero hay cambios pendientes o no se pueden comprobar;
	 *    dice «Publicar de nuevo» y sigue accionable.
	 *  - `failed`: el último build falló. Accionable (reintentar); si el estado trae `detail`, el
	 *    motivo se pinta al lado COMO TEXTO (nodo de texto, nunca HTML: viene de un sistema externo)
	 *    y si trae `logUrl`, un enlace aparte abre el registro en una pestaña nueva.
	 *  - `ready`: caso por defecto, accionable ("Publicar").
	 *
	 * `hasChanges === null` (degradación de `detectUnpublishedChanges`: ningún `ContentType` tiene
	 * un campo `updated` legible) NUNCA deshabilita el botón — "no lo sé" no es lo mismo que "no
	 * hay cambios", y bloquear la publicación por un dato que no se tiene sería peor que dejar
	 * publicar de más (P3-L3).
	 */
	import { onDestroy, onMount } from 'svelte';
	import { getVegaContext } from '$lib/app-context';
	import {
		BuildRequestError,
		createBuildClient,
		detectUnpublishedChanges,
		pollBuildStatus,
		type BuildStatus
	} from '$lib/backend';
	import Icon from '$lib/icons/Icon.svelte';

	const ctx = getVegaContext();

	// Capturado UNA vez al montar (misma sesión durante toda la vida del componente, mismo
	// criterio que `ConnectionStatus`/`Topbar`): un cambio de `buildApiUrl` implicaría una
	// instancia de `BackendPort` distinta, y eso ya remonta el árbol entero (`+layout.svelte`).
	const buildApiUrl = ctx.port.buildApiUrl;
	const client = buildApiUrl
		? createBuildClient({ apiUrl: buildApiUrl, token: ctx.session.token })
		: null;

	let status = $state<BuildStatus | null>(null);
	let triggering = $state(false);
	/** `true`/`false` si se pudo determinar, `null` si `detectUnpublishedChanges` no tiene manera
	 *  honesta de saberlo (ver su cabecera) — nunca bloquea el botón por sí solo. */
	let hasChanges = $state<boolean | null>(null);
	let stopPolling: (() => void) | null = null;
	/** Un trigger pendiente puede resolverse después de desmontar la sesión que lo lanzó. */
	let destroyed = false;
	/** Por qué falló la última consulta de estado (`null` = la última fue bien o aún no hubo fallo). */
	let fetchProblem = $state<'denied' | 'unreachable' | null>(null);

	/** Arranca (o reinicia) el sondeo: el primer `fetchStatus()` es inmediato (`pollBuildStatus`),
	 *  así que tanto el montaje inicial como un `trigger()` recién disparado ven la verdad cuanto
	 *  antes, sin esperar el intervalo. Reemplaza cualquier sondeo previo (`stopPolling?.()`
	 *  primero): dos sondeos concurrentes duplicarían peticiones sin aportar nada. */
	function beginPolling(): void {
		if (!client) return;
		stopPolling?.();
		stopPolling = pollBuildStatus(client, {
			onStatus(next) {
				status = next;
				fetchProblem = null;
				// Recalcular "hay cambios" solo tiene sentido con un estado TERMINAL: mientras sigue
				// 'running', `lastPublishedAt` todavía es el de la publicación ANTERIOR (no ha
				// cambiado todavía), así que repetir la consulta en cada sondeo intermedio sería
				// trabajo perdido — una vez por transición basta.
				if (next.state !== 'running') void refreshUnpublishedChanges(next.lastPublishedAt);
			},
			// Un fallo de sondeo deja `status` en su último valor conocido (nunca lo borra) y el
			// back-off interno de `pollBuildStatus` sigue reintentando solo. Solo se anota la causa:
			// sin ningún estado previo, es lo que evita quedarse en «Cargando» para siempre.
			onError(err) {
				fetchProblem =
					err instanceof BuildRequestError && (err.status === 401 || err.status === 403)
						? 'denied'
						: 'unreachable';
			}
		});
	}

	async function refreshUnpublishedChanges(lastPublishedAt: string | null): Promise<void> {
		const contentTypes = ctx.model.types.map((t) => t.schema);
		const result = await detectUnpublishedChanges(ctx.port, contentTypes, lastPublishedAt);
		hasChanges = result.hasChanges;
	}

	/**
	 * Refresco del indicador "hay cambios sin publicar" INDEPENDIENTE del sondeo de build, y la
	 * razón de que exista: `pollBuildStatus` deja de reprogramarse en cuanto ve un estado terminal
	 * (a propósito), y `refreshUnpublishedChanges` solo se llamaba desde ahí. Como la topbar se
	 * monta UNA vez por sesión (shell persistente, no por ruta), el dato se congelaba en el primer
	 * sondeo: quien editara después seguía viendo "Sin cambios" hasta recargar la página entera —
	 * justo el flujo normal de un editor (guardar, seguir editando).
	 *
	 * Cadencia deliberadamente holgada: cada barrido cuesta una consulta por colección
	 * (`detectUnpublishedChanges`), así que esto NO puede correr al ritmo del sondeo de build. Un
	 * par de minutos basta para un indicador que es una pista, no un semáforo. Se complementa con
	 * el refresco al volver a la pestaña, que es cuando el usuario mira de verdad.
	 */
	const UNPUBLISHED_REFRESH_MS = 120000;
	let unpublishedTimer: ReturnType<typeof setInterval> | null = null;

	function refreshFromLastKnownStatus(): void {
		// Pestaña oculta (fix de peso, auditoría 23 sep 2026 p3): nadie mira este indicador, así que
		// la consulta (una por colección, `detectUnpublishedChanges`) sería trabajo perdido cada
		// `UNPUBLISHED_REFRESH_MS`. El `setInterval` sigue vivo (barato: no hace nada él solo), solo
		// se salta el TRABAJO. Al volver a la pestaña, `handleVisibilityChange` llama a esta misma
		// función con `document.hidden` ya `false`, así que el refresco de "al volver" no lo bloquea
		// este guard — es justo lo que lo dispara.
		if (document.hidden) return;
		// Mientras hay un build EN CURSO no aporta nada: `lastPublishedAt` sigue siendo el de la
		// publicación anterior y el sondeo ya recalculará al terminar.
		if (!status || status.state === 'running') return;
		void refreshUnpublishedChanges(status.lastPublishedAt);
	}

	function handleVisibilityChange(): void {
		if (document.visibilityState === 'visible') refreshFromLastKnownStatus();
	}

	onMount(() => {
		beginPolling();
		unpublishedTimer = setInterval(refreshFromLastKnownStatus, UNPUBLISHED_REFRESH_MS);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		destroyed = true;
		// Ver la cabecera de `pollBuildStatus` (`backend/build-client.ts`): SIEMPRE hay que llamar a
		// `stop()` al desmontar, o el `setTimeout` del sondeo sobrevive al componente.
		stopPolling?.();
		if (unpublishedTimer) clearInterval(unpublishedTimer);
		unpublishedTimer = null;
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	async function handleTrigger(): Promise<void> {
		if (!client || triggering) return;
		triggering = true;
		try {
			await client.trigger();
		} catch {
			if (destroyed) return;
			ctx.feedback.toast(ctx.t('topbar.publish.triggerError'), { kind: 'error' });
		} finally {
			if (!destroyed) {
				triggering = false;
				// Consultar el estado real también si /trigger rechaza: puede haber cerrado el
				// intento como fallido. No inventar un BuildStatus ni mostrar el error de petición.
				// Una sesión desmontada no debe reiniciar el sondeo con su token anterior.
				beginPolling();
			}
		}
	}

	type PublishUiState =
		'loading' | 'unavailable' | 'running' | 'failed' | 'no-changes' | 'ok' | 'ready';

	const uiState = $derived.by((): PublishUiState => {
		if (!status) return fetchProblem ? 'unavailable' : 'loading';
		if (triggering || status.state === 'running') return 'running';
		if (status.state === 'failed') return 'failed';
		if (hasChanges === false) return 'no-changes';
		if (status.state === 'ok') return 'ok';
		return 'ready';
	});

	const label = $derived(
		uiState === 'unavailable'
			? ctx.t(
					fetchProblem === 'denied'
						? 'topbar.publish.unavailableDenied'
						: 'topbar.publish.unavailableOffline'
				)
			: uiState === 'no-changes' && status?.state === 'ok'
				? ctx.t('topbar.publish.ok')
				: uiState === 'ok'
					? ctx.t('topbar.publish.again')
					: ctx.t(`topbar.publish.${camelUiState(uiState)}`)
	);
	/** `no-changes` NO deshabilita: republicar sin cambios es inofensivo (rehace el mismo sitio),
	 *  y deshabilitar convierte cualquier desfase del indicador en una trampa sin salida — el
	 *  usuario no podría ni forzar la publicación para comprobarlo. El estado sigue comunicándose
	 *  por texto y `data-state`; lo único que se bloquea es lo que de verdad no tiene sentido:
	 *  disparar un build encima de otro que ya está corriendo. */
	const disabled = $derived(
		uiState === 'loading' || uiState === 'unavailable' || uiState === 'running'
	);

	/** Las claves de `es.ts`/`en.ts` usan camelCase (`noChanges`), `PublishUiState` usa el guion
	 *  propio del resto de `data-state` del repo (`no-changes`, ver `ConnectionStatus`) — este
	 *  puente evita duplicar CADA estado en dos vocabularios distintos por una sola excepción. */
	function camelUiState(state: PublishUiState): string {
		return state.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
	}

	const lastPublishedLabel = $derived(
		status?.lastPublishedAt
			? ctx.t('topbar.publish.lastPublished', {
					date: new Date(status.lastPublishedAt).toLocaleString(ctx.locale)
				})
			: undefined
	);
</script>

{#if client}
	<div class="vega-publish">
		<button
			type="button"
			class="vega-publish-trigger"
			data-state={uiState}
			{disabled}
			title={lastPublishedLabel}
			aria-label={label}
			onclick={handleTrigger}
		>
			<Icon
				id={uiState === 'failed' || uiState === 'unavailable' ? 'warning' : 'upload'}
				size={14}
			/>
			<span role="status">{label}</span>
		</button>
		{#if uiState === 'failed' && status?.detail}
			<!-- Texto de un sistema externo: nodo de texto, nunca {@html}. -->
			<span class="vega-publish-detail" title={status.detail}>{status.detail}</span>
		{/if}
		{#if uiState === 'failed' && status?.logUrl}
			<a href={status.logUrl} target="_blank" rel="noopener noreferrer" class="vega-publish-log">
				{ctx.t('topbar.publish.viewLog')}
			</a>
		{/if}
	</div>
{/if}

<style>
	.vega-publish {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	/* Mismo tratamiento de píldora que `ConnectionStatus` (borde + mono + punto de estado), pero
	   INTERACTIVA: es un `<button>` real, no un indicador de solo lectura. */
	.vega-publish-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--line);
		border-radius: 99px;
		padding: 0.3rem 0.7rem;
		background: var(--surface);
		color: var(--ink);
		font-family: var(--mono);
		font-size: 0.75rem;
		white-space: nowrap;
		cursor: pointer;
	}

	.vega-publish-trigger:hover:not(:disabled) {
		border-color: var(--accent-line);
		color: var(--accent-text);
	}

	.vega-publish-trigger:disabled {
		cursor: default;
		opacity: 0.65;
	}

	/* Color por estado (decorativo: el TEXTO ya lleva el estado, esto es refuerzo visual, nunca la
	   única señal — mismo criterio que `ConnectionStatus`). */
	.vega-publish-trigger[data-state='ok'] {
		border-color: var(--success);
		color: var(--success);
	}

	.vega-publish-trigger[data-state='failed'] {
		border-color: var(--danger);
		color: var(--danger);
	}

	.vega-publish-trigger[data-state='unavailable'] {
		border-color: var(--danger);
		color: var(--danger);
	}

	.vega-publish-trigger[data-state='running'] {
		border-color: var(--accent-line);
		color: var(--accent-text);
	}

	.vega-publish-detail {
		min-width: 0;
		max-width: 24rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.75rem;
		color: var(--danger);
	}

	.vega-publish-log {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--danger);
		text-decoration: underline;
		white-space: nowrap;
	}

	/* Mismo colapso estructural (768px) que el resto de la topbar (`ConnectionStatus`/`Topbar`):
	   en móvil solo el icono de estado, sin texto ni enlace al log — el nombre accesible del botón
	   (`aria-label`, arriba) NO depende de este texto visible, así que sigue anunciándose entero
	   pese al recorte visual. Padding más ajustado: sin texto, la píldora completa sobra ancho. */
	@media (max-width: 768px) {
		.vega-publish-detail,
		.vega-publish-log {
			display: none;
		}

		.vega-publish-trigger {
			padding: 0.3rem;
		}

		.vega-publish-trigger span[role='status'] {
			display: none;
		}
	}
</style>
