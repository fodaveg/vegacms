import type { VegaAppContext } from '$lib/app-context';
import {
	VISUAL_PROTOCOL_VERSION,
	type VisualBridgeErrorKind,
	type VisualBridgeState
} from './bridge-client';

export interface BridgeErrorText {
	title: string;
	body: string;
	/** La URL errónea se fija al crear el cliente; los demás fallos admiten reintento. */
	canRetry: boolean;
}

/** Traduce el estado del puente sin incluir detalles del error fuera de los campos previstos. */
export function bridgeErrorText(
	kind: VisualBridgeErrorKind,
	state: VisualBridgeState,
	t: VegaAppContext['t']
): BridgeErrorText {
	switch (kind) {
		case 'no-bridge':
			return {
				title: t('editor.visual.error.noBridge.title'),
				body: t('editor.visual.error.noBridge.body'),
				canRetry: true
			};
		case 'protocol-version':
			return {
				title: t('editor.visual.error.protocolVersion.title'),
				body: t('editor.visual.error.protocolVersion.body', {
					found: state.status === 'error' ? (state.version ?? '') : '',
					expected: VISUAL_PROTOCOL_VERSION
				}),
				canRetry: true
			};
		case 'site-error':
			return {
				title: t('editor.visual.error.siteError.title'),
				body: t('editor.visual.error.siteError.body', {
					code: state.status === 'error' ? (state.code ?? '') : ''
				}),
				canRetry: true
			};
		case 'record-mismatch':
			return {
				title: t('editor.visual.error.recordMismatch.title'),
				body: t('editor.visual.error.recordMismatch.body', {
					collection: state.status === 'error' ? (state.found?.collection ?? '') : '',
					id: state.status === 'error' ? (state.found?.id ?? '') : ''
				}),
				canRetry: true
			};
		case 'bad-preview-url':
			return {
				title: t('editor.visual.error.badPreviewUrl.title'),
				body: t('editor.visual.error.badPreviewUrl.body'),
				canRetry: false
			};
	}
}
