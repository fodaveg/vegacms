/**
 * Resolución PURA de la URL de backend (§3.7 del contrato P3, D-P3.5-a). Decide la URL string;
 * NO instancia el puerto (eso vive en `src/lib/session/backend.ts`, Fase 2, el único sitio que
 * crea el adaptador — P3-L1).
 */

/**
 * Forma de `static/vega.config.json` (D-P3.5-a): fichero opcional, leído en runtime (fetch,
 * cero build), para apuntar a un PocketBase que NO es same-origin. Si el fichero no existe o
 * `backendUrl` está ausente/no es una URL válida, Vega usa same-origin sin queja (es el caso
 * por defecto: copiar la SPA a `pb_public/`).
 *
 * ```json
 * { "backendUrl": "https://pb.midominio.com" }
 * ```
 */
export interface VegaConfig {
	backendUrl?: string;
}

/**
 * `origin` = `window.location.origin` (lo trae la Fase 2, este módulo no toca `window`).
 * `config` = el contenido ya parseado de `vega.config.json`, o `null` si no existe/no se pudo
 * leer (la Fase 2 hace el `fetch`/`JSON.parse`; los fallos de red o de parseo se tratan como
 * ausencia de config, nunca bloquean el arranque — L3, "cero build por proyecto").
 *
 * Prioridad: `config.backendUrl` si es una URL absoluta válida → esa; si no → `origin`
 * (same-origin, el default). Una `backendUrl` inválida (string vacío, URL malformada) NO lanza:
 * se ignora y cae a same-origin, coherente con "nunca pantalla blanca" (P3-L3).
 */
export function resolveBackendUrl(opts: { origin: string; config: VegaConfig | null }): string {
	const candidate = opts.config?.backendUrl;
	if (candidate && isAbsoluteUrl(candidate)) return candidate;
	return opts.origin;
}

/**
 * Solo `http:`/`https:` cuentan como URL de backend válida. `new URL()` a secas es demasiado
 * laxo: `new URL('pb.example.com:8090')` NO lanza (WHATWG lee `pb.example.com:` como esquema y
 * `8090` como opaque-path), así que un typo muy plausible en `vega.config.json` (host:puerto sin
 * `https://`) pasaría como "válido" y reventaría en Fase 2 al construir el cliente. Exigir el
 * protocolo http(s) hace que ese caso caiga a same-origin, como pide §3.7/§7.A.6.
 */
function isAbsoluteUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}
