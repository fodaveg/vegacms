/**
 * Validación del enlace «Ver el release» (segunda barrera, revisión de seguridad del 30 sep 2026).
 *
 * La URL del release llega de fuera — del `html_url` de la respuesta de GitHub, o de lo que haya
 * guardado en `localStorage` una comprobación anterior — y termina en un `<a href>` de
 * `UpdateBanner` y de `/settings`. Solo se enlaza si es una página de `https://github.com/`.
 *
 * Se decide PARSEANDO con `URL` y comparando protocolo y host, nunca por prefijo de cadena:
 * `https://github.com.evil.example/` y `https://github.com@evil.example/` empiezan por
 * `https://github.com` y apuntan a otro sitio. Módulo puro y sin imports a propósito: lo usan
 * `check-update.ts` y `storage.ts`, que ya se importan entre sí.
 */

const RELEASE_PROTOCOL = 'https:';
const RELEASE_HOST = 'github.com';

/**
 * Devuelve la URL NORMALIZADA (`URL#href`) si `candidate` es un string que apunta a
 * `https://github.com/…` sin credenciales ni puerto distinto del de por defecto; `null` en
 * cualquier otro caso (otro host, otro esquema, relativa, no parseable, no es un string).
 *
 * Se devuelve la forma normalizada y no la cadena recibida para que lo validado sea exactamente
 * lo que se enlaza: el navegador aplicaría el mismo parseo al `href`, pero así no depende de ello.
 */
export function safeReleaseUrl(candidate: unknown): string | null {
	if (typeof candidate !== 'string') return null;
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}
	if (url.protocol !== RELEASE_PROTOCOL) return null;
	// `host` incluye el puerto cuando no es el de por defecto: `github.com:8443` no casa.
	if (url.host !== RELEASE_HOST) return null;
	if (url.username !== '' || url.password !== '') return null;
	return url.href;
}
