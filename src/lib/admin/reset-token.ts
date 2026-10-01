/**
 * Token de `/restablecer?token=…`: se lee UNA vez y se retira de la barra de direcciones.
 *
 * El token es una credencial de un solo uso que da la contraseña de la cuenta. Mientras siga en la
 * URL viaja en la cabecera `Referer` de cada petición que salga de la página (la API de
 * PocketBase, que puede estar en otro origen) y se queda en el historial del navegador, así que
 * puede acabar en los logs de PocketBase o de Caddy. Quitarlo nada más leerlo deja el token solo
 * en memoria, que es donde lo necesita el formulario.
 *
 * Lo que NO arregla: la primera petición `GET /restablecer?token=…` ya ha llegado al servidor que
 * sirve la SPA cuando este código corre; si ese servidor guarda logs de acceso, la línea lleva el
 * token. Eso solo se evita no mandándolo en la query.
 *
 * Consecuencia buscada: recargar la página ya limpia no trae token, y el formulario enseña su
 * estado «sin token» (`data-reset-state="missing"`), que pide volver a abrir el enlace del correo.
 */

/** Nombre del parámetro de la plantilla de correo (ver `invitationActionUrl`). */
const TOKEN_PARAM = 'token';

/**
 * Devuelve el token de `url` (recortado, `''` si no viene) y, si la URL traía el parámetro, llama
 * a `replaceUrl` con la misma dirección sin él: ruta, resto de la query y ancla intactos.
 *
 * `replaceUrl` es la escritura en el historial (`history.replaceState`); va inyectada para que
 * esta función sea pura y se pueda probar sin navegador. No se la llama si no hay nada que quitar.
 */
export function takeResetToken(url: URL, replaceUrl: (cleanUrl: string) => void): string {
	if (!url.searchParams.has(TOKEN_PARAM)) return '';
	const token = url.searchParams.get(TOKEN_PARAM)?.trim() ?? '';

	const clean = new URL(url.href);
	clean.searchParams.delete(TOKEN_PARAM);
	replaceUrl(clean.pathname + clean.search + clean.hash);

	return token;
}
