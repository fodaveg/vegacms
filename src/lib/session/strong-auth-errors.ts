/**
 * Texto traducido de los rechazos tipados de `strongAuth` (`VegaStrongAuthError`). El adaptador
 * solo da el código (no tiene catálogo de idiomas); el texto vive en el bloque `security.error.*`
 * y lo comparten la pantalla de seguridad y los pasos de entrada.
 */

import { isStrongAuthError, type StrongAuthErrorCode } from '$lib/backend';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const MESSAGE_KEYS: Record<StrongAuthErrorCode, string> = {
	'step-up-required': 'security.error.stepUpRequired',
	'invalid-code': 'security.error.invalidCode',
	locked: 'security.error.locked',
	'payload-too-large': 'security.error.payloadTooLarge',
	'attempt-failed': 'security.error.attemptFailed',
	'passkey-verify-failed': 'security.error.passkeyVerifyFailed',
	'no-passkeys': 'security.error.noPasskeys',
	'enrollment-expired': 'security.error.enrollmentExpired',
	'not-enrolled': 'security.error.notEnrolled'
};

/**
 * Mensaje traducido de `err` si es un rechazo tipado de `strongAuth`; `null` si no lo es, para
 * que quien llama siga con su propio mapeo. Un bloqueo que trae la espera la dice en minutos,
 * redondeando hacia arriba: «espera 1 min» nunca promete menos de lo que falta.
 */
export function strongAuthErrorMessage(err: unknown, t: Translate): string | null {
	if (!isStrongAuthError(err)) return null;
	if (err.code === 'locked' && err.waitSeconds !== null) {
		return t('security.error.lockedWait', {
			minutes: Math.max(1, Math.ceil(err.waitSeconds / 60))
		});
	}
	return t(MESSAGE_KEYS[err.code]);
}
