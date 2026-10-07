import type { VegaAppContext } from '$lib/app-context';
import { classifyPreviewError } from '$lib/backend/preview-error';
import type { createPreviewClient, PreviewToken } from '$lib/backend/preview-client';
import type { VisualBridgeClient } from './bridge-client';

export type TokenState =
	{ kind: 'loading' } | { kind: 'ready'; token: PreviewToken } | { kind: 'error'; message: string };

interface VisualPreviewOptions {
	client: ReturnType<typeof createPreviewClient>;
	typeName: string;
	recordId: string;
	bridge: () => VisualBridgeClient | null;
	setTokenState: (state: TokenState) => void;
	resetFrameLoaded: () => void;
	t: VegaAppContext['t'];
}

const RENEW_BUFFER_MS = 15000;
const MAX_RENEW_DELAY_MS = 2_147_483_647;
const REFRESH_DEBOUNCE_MS = 200;

/**
 * Un solo dueño de peticiones, generaciones y temporizadores del lienzo. El componente conserva
 * el iframe y el puente; sus callbacks se consultan justo cuando una respuesta llega.
 */
export function createVisualPreviewState(options: VisualPreviewOptions) {
	let renewTimer: ReturnType<typeof setTimeout> | null = null;
	let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let requestGeneration = 0;
	let refreshGeneration = 0;
	let destroyed = false;

	function clearRenewTimer(): void {
		if (renewTimer) clearTimeout(renewTimer);
		renewTimer = null;
	}

	function clearRefreshDebounce(): void {
		if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
		refreshDebounceTimer = null;
	}

	function scheduleRenew(token: PreviewToken): void {
		clearRenewTimer();
		// Una respuesta posterior al desmontaje no debe dejar un timer sin dueño.
		if (destroyed) return;
		const delay = Math.min(
			MAX_RENEW_DELAY_MS,
			Math.max(0, Date.parse(token.expiresAt) - Date.now() - RENEW_BUFFER_MS)
		);
		renewTimer = setTimeout(() => void renewToken(), delay);
	}

	/** Recarga entera: invalida refrescos en vuelo, desmonta el iframe y vuelve a pedir token. */
	async function requestPreview(): Promise<void> {
		const generation = ++requestGeneration;
		clearRefreshDebounce();
		refreshGeneration++;
		options.bridge()?.stop();
		options.setTokenState({ kind: 'loading' });
		options.resetFrameLoaded();
		try {
			const token = await options.client.requestPreview(options.typeName, options.recordId);
			if (generation !== requestGeneration) return;
			options.setTokenState({ kind: 'ready', token });
			scheduleRenew(token);
		} catch (err) {
			if (generation !== requestGeneration) return;
			clearRenewTimer();
			const classified = classifyPreviewError(err);
			options.setTokenState({
				kind: 'error',
				message:
					classified.kind === 'http' && classified.message !== null
						? classified.message
						: classified.kind === 'network'
							? options.t('common.networkError')
							: options.t('editor.preview.panel.genericError')
			});
		}
	}

	/** Con puente vivo agrupa los guardados cercanos; sin él recarga inmediatamente. */
	function scheduleCanvasRefresh(): void {
		const state = options.bridge()?.state;
		if (!(state?.status === 'connected' && state.liveRefresh)) {
			void requestPreview();
			return;
		}
		clearRefreshDebounce();
		refreshDebounceTimer = setTimeout(() => {
			refreshDebounceTimer = null;
			void refreshCanvas();
		}, REFRESH_DEBOUNCE_MS);
	}

	/** Entrega el token entero al puente sin modificar el src del iframe. */
	async function refreshCanvas(opts: { renew?: boolean } = {}): Promise<void> {
		const generation = ++refreshGeneration;
		try {
			const token = await options.client.requestPreview(options.typeName, options.recordId);
			// La renovación se rearma antes de descartar una respuesta tardía mientras sigue montado.
			if (opts.renew) scheduleRenew(token);
			if (generation !== refreshGeneration) return;
			if (options.bridge()?.refresh({ url: token.url, postToken: token.postToken }) !== true) {
				void requestPreview();
			}
		} catch {
			if (generation !== refreshGeneration) return;
			void requestPreview();
		}
	}

	async function renewToken(): Promise<void> {
		const state = options.bridge()?.state;
		if (state?.status === 'connected' && state.liveRefresh) {
			await refreshCanvas({ renew: true });
			return;
		}
		await requestPreview();
	}

	/** Un lienzo estrecho deja sin efecto solicitudes y temporizadores pendientes. */
	function deactivate(): void {
		requestGeneration++;
		refreshGeneration++;
		clearRefreshDebounce();
		options.bridge()?.stop();
		clearRenewTimer();
		options.setTokenState({ kind: 'loading' });
		options.resetFrameLoaded();
	}

	/** El desmontaje corta incluso la cadena de renovaciones de una respuesta tardía. */
	function dispose(): void {
		destroyed = true;
		requestGeneration++;
		refreshGeneration++;
		clearRenewTimer();
		clearRefreshDebounce();
	}

	return { requestPreview, scheduleCanvasRefresh, deactivate, dispose };
}
