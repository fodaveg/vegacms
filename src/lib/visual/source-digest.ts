/**
 * Huella del valor ENTERO de un campo (§"Markdown source ranges" del contrato): `v1:<longitud>:<FNV-1a
 * de 32 bits sobre sus unidades UTF-16>`, la misma que calcula `@vega/astro` (`vegaSourceDigest`)
 * en el sitio. Si no casa con la del borrador, la página se pintó desde otro texto y el rango puede
 * apuntar a cualquier parte: no se edita. Detecta deriva, no es una barrera de seguridad (eso es
 * el token).
 *
 * Módulo propio de una sola función a propósito: lo importa `BlockEditor`, que va en el chunk
 * compartido de los formularios; si viviera en `inline-session.ts`, ese chunk arrastraría también
 * los ayudantes del cliente del puente (medido el 22 oct 2026: +0,6 KB en el formulario de registro).
 */
export function sourceDigest(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `v1:${value.length}:${hash.toString(16).padStart(8, '0')}`;
}
