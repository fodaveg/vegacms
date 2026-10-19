/**
 * Conserva una URL absoluta HTTP(S) recibida de un endpoint, o devuelve `null` si no lo es.
 * Se usa antes de ofrecerla como enlace o embeberla: `new URL` reconoce también esquemas
 * ofuscados con controles, igual que el navegador. Solo se consulta el protocolo; el destino,
 * la ruta y los tokens siguen siendo opacos y el string válido nunca se reescribe.
 */
export function httpUrlOrNull(value: unknown): string | null {
	if (typeof value !== 'string' || !value) return null;
	let protocol: string;
	try {
		protocol = new URL(value).protocol;
	} catch {
		return null;
	}
	return protocol === 'http:' || protocol === 'https:' ? value : null;
}
