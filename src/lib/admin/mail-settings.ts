/**
 * Reglas puras de la tarjeta «Correo para invitaciones» de `/editores` (`MailCard.svelte`): qué avisos
 * lleva la dirección de Vega y la validación local mínima del formulario. El servidor tiene la última
 * palabra (sus errores llegan por campo); aquí solo se para lo que Vega ya sabe que está mal.
 */

import { canWriteInvitationLink, isLoopbackHost } from '$lib/backend/administration-rules';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `true` si `value` tiene forma de email (mismo criterio que el alta de editores). */
export function looksLikeEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value.trim());
}

/** El puerto escrito como número entre 1 y 65535, o `null` si no lo es. */
export function parseMailPort(text: string): number | null {
	const trimmed = text.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const port = Number(trimmed);
	return port >= 1 && port <= 65535 ? port : null;
}

/** Lo que Vega avisa de la dirección de Vega (`meta.appURL`). */
export interface AppUrlNotices {
	/** No es una dirección http(s) completa: BLOQUEA (error de campo). */
	invalid: boolean;
	/** Empieza por `http://` y no es una máquina local: avisa, no bloquea. */
	http: boolean;
	/** No es la dirección desde la que se usa Vega: avisa, no bloquea. */
	mismatch: boolean;
}

/**
 * Los avisos de una dirección de Vega frente al origen desde el que se usa (`resetUrl`, absoluta).
 *
 * «No coincide» es lo mismo que decide la plantilla de invitación: si `canWriteInvitationLink` no
 * deja escribir el enlace, Vega no lo corregirá sola. Esa función también dice que no cuando el
 * origen SÍ coincide pero es `http://` fuera de loopback; ese caso no es «no coincide» sino el
 * aviso de `http`, así que solo cuenta como discrepancia cuando el origen es otro.
 */
export function appUrlNotices(appUrl: string, resetUrl: string): AppUrlNotices {
	let app: URL;
	try {
		app = new URL(appUrl.trim());
	} catch {
		return { invalid: true, http: false, mismatch: false };
	}
	if (app.protocol !== 'http:' && app.protocol !== 'https:') {
		return { invalid: true, http: false, mismatch: false };
	}
	const http = app.protocol === 'http:' && !isLoopbackHost(app.hostname);
	const sameOrigin = URL.canParse(resetUrl) && new URL(resetUrl).origin === app.origin;
	const mismatch = !canWriteInvitationLink(resetUrl, appUrl) && !sameOrigin;
	return { invalid: false, http, mismatch };
}
