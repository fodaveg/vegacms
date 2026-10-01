/**
 * Pasos de entrada compartidos por `/login` y `ReloginModal.svelte` (audit del 30 sep 2026):
 * contraseña → segundo factor (TOTP o código de recuperación), y passkey. Aquí viven el estado
 * de los campos, la bandera de envío, el mapeo de errores por `kind` y los cuatro envíos; cada
 * superficie pone solo su marcado.
 *
 * Existe porque el overlay de re-login tenía su propia copia del paso de contraseña y decidía el
 * éxito mirando `session && !loginError`. Con la sesión caducada `session` sigue siendo la
 * ANTIGUA (no-nula a propósito, §3.1.3 del contrato P3), así que un `login()` que se quedaba en
 * `mfaChallenge` pasaba por bueno, el overlay se cerraba y el siguiente guardado volvía a dar
 * 401. Los envíos de este módulo devuelven lo que devuelve el `SessionStore`: `true` solo cuando
 * ESA llamada obtuvo una sesión nueva del backend.
 *
 * No decide qué pasos existen: eso lo dice el store (`mfaChallenge` abierto ⇒ segundo paso;
 * `strongAuthAvailable` ⇒ hay passkey). Sin la extensión `vegaauth`, `login()` va por el
 * `port.login` de siempre y nunca abre un reto, así que el flujo se queda en contraseña.
 */

import type { SessionStore } from './session.svelte';
import { strongAuthErrorMessage } from './strong-auth-errors';

/** Traductor del chrome ya resuelto a un idioma (el `t()` local de `/login` y del overlay). */
export type LoginFlowTranslate = (key: string, params?: Record<string, string | number>) => string;

export interface LoginFlow {
	email: string;
	password: string;
	totpCode: string;
	recoveryCode: string;
	/** Hay un envío en vuelo: los botones se deshabilitan y un segundo envío se ignora. */
	readonly submitting: boolean;
	/**
	 * Mensaje del último fallo, o `null`. Mapeo honesto por `kind` (§2.3, P3-L3): `network` →
	 * reintentable; `forbidden` → código no válido si hay reto abierto, credenciales no válidas si
	 * no (mensaje neutro de P1 §4.1, no revela si el email existe); cualquier OTRO fallo de
	 * transporte (`backend` 5xx, etc.) → su `message` real, NUNCA reinterpretado como credenciales
	 * (decir "Credenciales no válidas" ante un 500 haría reintentar contraseñas en vano).
	 */
	readonly errorMessage: string | null;
	/** Los cuatro envíos resuelven a `true` SOLO con sesión nueva (ver cabecera). */
	submitPassword(): Promise<boolean>;
	submitTotp(): Promise<boolean>;
	submitRecovery(): Promise<boolean>;
	submitPasskey(): Promise<boolean>;
	/** Abandona el segundo paso y vuelve al de contraseña; descarta los códigos tecleados. */
	cancelMfa(): void;
	/** Vacía los cuatro campos. No toca el store: un reto abierto se cierra con `cancelMfa()`. */
	reset(): void;
}

/**
 * Crea el estado de un formulario de entrada sobre `store`. Una instancia por superficie: los
 * campos son suyos, pero `loginError` y `mfaChallenge` son del store y por tanto compartidos.
 */
export function createLoginFlow(store: SessionStore, t: LoginFlowTranslate): LoginFlow {
	let email = $state('');
	let password = $state('');
	let totpCode = $state('');
	let recoveryCode = $state('');
	let submitting = $state(false);

	function reset(): void {
		email = '';
		password = '';
		totpCode = '';
		recoveryCode = '';
	}

	/** Serializa los envíos y, con sesión nueva, vacía los campos: la contraseña y los códigos no
	 *  se quedan en memoria detrás de una vista que ya no los pide. */
	async function run(step: () => Promise<boolean>): Promise<boolean> {
		if (submitting) return false;
		submitting = true;
		try {
			const authenticated = await step();
			if (authenticated) reset();
			return authenticated;
		} finally {
			submitting = false;
		}
	}

	return {
		get email() {
			return email;
		},
		set email(value) {
			email = value;
		},
		get password() {
			return password;
		},
		set password(value) {
			password = value;
		},
		get totpCode() {
			return totpCode;
		},
		set totpCode(value) {
			totpCode = value;
		},
		get recoveryCode() {
			return recoveryCode;
		},
		set recoveryCode(value) {
			recoveryCode = value;
		},
		get submitting() {
			return submitting;
		},
		get errorMessage() {
			const err = store.loginError;
			if (!err) return null;
			if (err.kind === 'network') return t('login.networkError');
			if (err.kind === 'forbidden') {
				return store.mfaChallenge ? t('login.mfa.invalidCode') : t('login.invalidCredentials');
			}
			// Bloqueo por intentos, intento que el servidor no pudo contar, passkey demasiado
			// grande: tienen texto propio traducido y ninguno habla de las credenciales.
			return strongAuthErrorMessage(err, t) ?? err.message;
		},
		submitPassword() {
			return run(() => store.login({ email, password }));
		},
		submitTotp() {
			return run(() => store.loginWithTotp(totpCode));
		},
		submitRecovery() {
			return run(() => store.loginWithRecovery(recoveryCode));
		},
		submitPasskey() {
			return run(() => store.loginWithPasskey());
		},
		cancelMfa() {
			store.cancelMfa();
			totpCode = '';
			recoveryCode = '';
		},
		reset
	};
}
