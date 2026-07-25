<script lang="ts">
	/**
	 * `PublishButton.svelte` (lote "publicación", fase A): el puente "guardado → publicado" para
	 * proyectos `output: 'static'` (Astro y similares) que hoy dependen de que un humano corra el
	 * build a mano. Vive en la topbar, junto a `ConnectionStatus`/`DensityToggle`.
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
	 *  - `running`: build en curso (`BuildStatus.state === 'running'`, sondeado con
	 *    `pollBuildStatus`). Deshabilitado (evita disparos duplicados).
	 *  - `no-changes`: nada editado desde `lastPublishedAt` (`detectUnpublishedChanges`).
	 *    Deshabilitado — "inactivo si no hay cambios" (encargo).
	 *  - `ok`: el último build terminó bien Y sigue habiendo cambios pendientes o no se puede saber
	 *    (`hasChanges` `true`/`null`) — sigue siendo accionable, para volver a publicar.
	 *  - `failed`: el último build falló. Accionable (reintentar); si el estado trae `logUrl`, un
	 *    enlace aparte abre el registro en una pestaña nueva.
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
				// Recalcular "hay cambios" solo tiene sentido con un estado TERMINAL: mientras sigue
				// 'running', `lastPublishedAt` todavía es el de la publicación ANTERIOR (no ha
				// cambiado todavía), así que repetir la consulta en cada sondeo intermedio sería
				// trabajo perdido — una vez por transición basta.
				if (next.state !== 'running') void refreshUnpublishedChanges(next.lastPublishedAt);
			}
			// Sin `onError`: un fallo de sondeo deja `status` en su último valor conocido (nunca lo
			// borra) y el back-off interno de `pollBuildStatus` sigue reintentando solo — no hay
			// nada más honesto que mostrar aquí que "seguimos en el último estado que vimos".
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
			// Optimista: no fabricamos un `BuildStatus` local con `state: 'running'` (P3-L3, nunca
			// un dato inventado) — el sondeo que arranca justo debajo hace su primer `fetchStatus()`
			// de inmediato y trae el estado REAL casi al instante.
			beginPolling();
		} catch {
			ctx.feedback.toast(ctx.t('topbar.publish.triggerError'), { kind: 'error' });
		} finally {
			triggering = false;
		}
	}

	type PublishUiState = 'loading' | 'running' | 'failed' | 'no-changes' | 'ok' | 'ready';

	const uiState = $derived.by((): PublishUiState => {
		if (!status) return 'loading';
		if (triggering || status.state === 'running') return 'running';
		if (status.state === 'failed') return 'failed';
		if (hasChanges === false) return 'no-changes';
		if (status.state === 'ok') return 'ok';
		return 'ready';
	});

	const label = $derived(ctx.t(`topbar.publish.${camelUiState(uiState)}`));
	/** `no-changes` NO deshabilita: republicar sin cambios es inofensivo (rehace el mismo sitio),
	 *  y deshabilitar convierte cualquier desfase del indicador en una trampa sin salida — el
	 *  usuario no podría ni forzar la publicación para comprobarlo. El estado sigue comunicándose
	 *  por texto y `data-state`; lo único que se bloquea es lo que de verdad no tiene sentido:
	 *  disparar un build encima de otro que ya está corriendo. */
	const disabled = $derived(uiState === 'loading' || uiState === 'running');

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
			<Icon id={uiState === 'failed' ? 'warning' : 'upload'} size={14} />
			<span role="status">{label}</span>
		</button>
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

	.vega-publish-trigger[data-state='running'] {
		border-color: var(--accent-line);
		color: var(--accent-text);
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
