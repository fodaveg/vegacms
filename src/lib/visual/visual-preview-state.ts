import type { VegaAppContext } from '$lib/app-context';
import { classifyPreviewError } from '$lib/backend/preview-error';
import {
	PreviewRequestError,
	type createPreviewClient,
	type PreviewDraft,
	type PreviewToken
} from '$lib/backend/preview-client';
import type { VisualBridgeClient } from './bridge-client';

export type TokenState =
	{ kind: 'loading' } | { kind: 'ready'; token: PreviewToken } | { kind: 'error'; message: string };

interface VisualPreviewOptions {
	client: ReturnType<typeof createPreviewClient>;
	typeName: string;
	recordId: string;
	bridge: () => VisualBridgeClient | null;
	/** Snapshot editorial en el instante de pedir el token, nunca una lectura de PocketBase. */
	getDraft?: () => PreviewDraft | undefined;
	hasCanvas?: () => boolean;
	onRefreshError?: (message: string | null) => void;
	/** El servidor indica aceptación del borrador únicamente con `postToken`. */
	onPreviewToken?: (token: PreviewToken) => void;
	setTokenState: (state: TokenState) => void;
	resetFrameLoaded: () => void;
	t: VegaAppContext['t'];
}

const RENEW_BUFFER_MS = 15000;
const MAX_RENEW_DELAY_MS = 2_147_483_647;
const REFRESH_DEBOUNCE_MS = 400;

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
	let paused = false;
	let draftRevision = 0;

	/** Un 403 del snapshot permite seguir viendo lo guardado. La siguiente edición vuelve a
	 *  intentar el draft: un valor temporal no desactiva la vista en vivo para toda la sesión. */
	async function fetchPreview(draft: PreviewDraft | undefined): Promise<PreviewToken> {
		if (!draft) return options.client.requestPreview(options.typeName, options.recordId);
		try {
			return await options.client.requestPreview(options.typeName, options.recordId, draft);
		} catch (err) {
			if (!(err instanceof PreviewRequestError) || err.status !== 403) throw err;
			return options.client.requestPreview(options.typeName, options.recordId);
		}
	}

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
		if (destroyed || paused) return;
		const delay = Math.min(
			MAX_RENEW_DELAY_MS,
			Math.max(0, Date.parse(token.expiresAt) - Date.now() - RENEW_BUFFER_MS)
		);
		renewTimer = setTimeout(() => void renewToken(), delay);
	}

	/** Recarga entera: invalida refrescos en vuelo, desmonta el iframe y vuelve a pedir token. */
	async function requestPreview(preserveCanvas = false): Promise<void> {
		if (paused) return;
		const generation = ++requestGeneration;
		clearRefreshDebounce();
		refreshGeneration++;
		const revision = draftRevision;
		const draft = options.getDraft?.();
		if (!preserveCanvas) {
			options.bridge()?.stop();
			options.setTokenState({ kind: 'loading' });
			options.resetFrameLoaded();
		}
		options.onRefreshError?.(null);
		try {
			const token = await fetchPreview(draft);
			if (destroyed || paused || generation !== requestGeneration || revision !== draftRevision)
				return;
			options.bridge()?.stop();
			options.resetFrameLoaded();
			options.onPreviewToken?.(token);
			options.setTokenState({ kind: 'ready', token });
			scheduleRenew(token);
		} catch (err) {
			if (destroyed || paused || generation !== requestGeneration || revision !== draftRevision)
				return;
			const classified = classifyPreviewError(err);
			const message =
				classified.kind === 'http' && classified.message !== null
					? classified.message
					: classified.kind === 'network'
						? options.t('common.networkError')
						: options.t('editor.preview.panel.genericError');
			if (preserveCanvas) options.onRefreshError?.(message);
			else {
				clearRenewTimer();
				options.setTokenState({ kind: 'error', message });
			}
		}
	}

	/** Con puente vivo agrupa los guardados cercanos; sin él recarga inmediatamente. */
	function scheduleCanvasRefresh({ draftEdit = false }: { draftEdit?: boolean } = {}): void {
		draftRevision++;
		requestGeneration++;
		refreshGeneration++;
		options.onRefreshError?.(null);
		const state = options.bridge()?.state;
		clearRefreshDebounce();
		if (paused) return;
		if (!draftEdit && !(state?.status === 'connected' && state.liveRefresh)) {
			void requestPreview(options.hasCanvas?.() === true);
			return;
		}
		refreshDebounceTimer = setTimeout(
			() => {
				refreshDebounceTimer = null;
				if (state?.status === 'connected' && state.liveRefresh) void refreshCanvas();
				else void requestPreview(options.hasCanvas?.() === true);
			},
			draftEdit ? REFRESH_DEBOUNCE_MS : 200
		);
	}

	/** Entrega el token entero al puente sin modificar el src del iframe. */
	async function refreshCanvas(opts: { renew?: boolean } = {}): Promise<void> {
		if (paused) return;
		const generation = ++refreshGeneration;
		const revision = draftRevision;
		try {
			const token = await fetchPreview(options.getDraft?.());
			// La renovación se rearma antes de descartar una respuesta tardía mientras sigue montado.
			if (opts.renew && !paused) scheduleRenew(token);
			if (destroyed || paused || generation !== refreshGeneration || revision !== draftRevision)
				return;
			options.onPreviewToken?.(token);
			scheduleRenew(token);
			if (options.bridge()?.refresh({ url: token.url, postToken: token.postToken }) !== true) {
				void requestPreview(true);
			}
		} catch (err) {
			if (destroyed || paused || generation !== refreshGeneration || revision !== draftRevision)
				return;
			const classified = classifyPreviewError(err);
			options.onRefreshError?.(
				classified.kind === 'http' && classified.message !== null
					? classified.message
					: classified.kind === 'network'
						? options.t('common.networkError')
						: options.t('editor.preview.panel.genericError')
			);
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
		draftRevision++;
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
		draftRevision++;
		requestGeneration++;
		refreshGeneration++;
		clearRenewTimer();
		clearRefreshDebounce();
	}

	/** Detiene también respuestas ya en vuelo: ninguna puede reemplazar el caret activo. */
	function pauseInline(): void {
		paused = true;
		requestGeneration++;
		refreshGeneration++;
		clearRefreshDebounce();
		clearRenewTimer();
	}
	function resumeInline(): void {
		if (!paused) return;
		paused = false;
		scheduleCanvasRefresh({ draftEdit: true });
	}
	return { requestPreview, scheduleCanvasRefresh, deactivate, dispose, pauseInline, resumeInline };
}
