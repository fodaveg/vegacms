/**
 * Resolución PURA de la URL de backend (§3.7 del contrato P3, D-P3.5-a; ampliada por el lote L5
 * — distribución/onboarding genérico — con un tercer nivel de precedencia, el override runtime).
 * Decide la URL string; NO instancia el puerto (eso vive en `src/lib/session/backend.ts`, Fase 2,
 * el único sitio que crea el adaptador — P3-L1). El override en sí (lectura/escritura de
 * `localStorage`) vive en `backend-override.ts`, un módulo hermano IMPURO — este sigue sin tocar
 * `window`/`localStorage`, trivialmente testeable con objetos planos.
 */

/**
 * Forma de `static/vega.config.json` (D-P3.5-a): fichero opcional, leído en runtime (fetch,
 * cero build), para apuntar a un PocketBase que NO es same-origin. Si el fichero no existe o
 * `backendUrl` está ausente/no es una URL válida, Vega usa same-origin sin queja (es el caso
 * por defecto: copiar la SPA a `pb_public/`).
 *
 * `authCollection` (lote L6a, opcional): colección de auth contra la que autentica el adaptador
 * `pocketbase` (`login`/`restoreSession`). Ausente ⇒ `'_superusers'` (default, camino previo
 * intacto). Un operador que monte el rol editor plano (§L6, colección dedicada `vega_editors`)
 * la fija aquí para que TODA instancia de Vega servida desde este `pb_public/` autentique contra
 * ella sin que cada usuario tenga que introducirla a mano.
 *
 * ```json
 * { "backendUrl": "https://pb.midominio.com", "authCollection": "vega_editors" }
 * ```
 */
export interface VegaConfig {
	backendUrl?: string;
	authCollection?: string;
	/** Clave estable del registro `vega` que contiene el manifiesto del proyecto. */
	manifestKey?: string;
	/**
	 * Base RELATIVA de la extensión de auth fuerte instalada en el mismo PocketBase.
	 * Ejemplos: `/api/vega-auth` (extensión genérica) o `/api/fodaveg` (admin bespoke).
	 */
	authApiBasePath?: string;
}

/**
 * `origin` = `window.location.origin` (lo trae la Fase 2, este módulo no toca `window`).
 * `config` = el contenido ya parseado de `vega.config.json`, o `null` si no existe/no se pudo
 * leer (la Fase 2 hace el `fetch`/`JSON.parse`; los fallos de red o de parseo se tratan como
 * ausencia de config, nunca bloquean el arranque — L3, "cero build por proyecto").
 * `override` = el valor crudo persistido en `localStorage` (clave `vega.backendUrl.v1`, L5 —
 * distribución/onboarding genérico), o `null` si no hay ninguno. Lo lee la capa impura
 * (`readBackendOverride()` en `backend-override.ts`); este módulo sigue sin tocar
 * `window`/`localStorage`.
 *
 * Prioridad de TRES niveles (L5 amplía §3.7/D-P3.5-a con un tercer nivel por encima, SUPERSET
 * compatible: sin `override`, el comportamiento es idéntico al de antes de L5):
 *  1. `override` si es una URL absoluta válida → esa (el usuario lo introdujo a mano en
 *     `BackendUrlForm.svelte`, gana a cualquier configuración estática).
 *  2. `config.backendUrl` si es una URL absoluta válida → esa (D-P3.5-a, sin cambios).
 *  3. `origin` (same-origin, el default).
 * Un `override`/`backendUrl` inválido (string vacío, URL malformada) NO lanza: se ignora y cae
 * al siguiente nivel, coherente con "nunca pantalla blanca" (P3-L3).
 *
 * Devuelve el `override`/`backendUrl` ganador con `.trim()` (fix de code-review de L5):
 * `isAbsoluteUrl` acepta espacios colgantes (`new URL()`, WHATWG, los recorta al parsear), pero
 * sin este `.trim()` la función devolvía el string CRUDO tal cual llegó — con espacios que
 * `createPocketBaseBackend({ url })` no espera. Deliberadamente NO se usa `new URL(value).href`
 * (introduciría una barra final que podría afectar al cliente PB); basta el `.trim()`. `origin`
 * NUNCA se toca: ya llega normalizado de `window.location.origin`.
 */
export function resolveBackendUrl(opts: {
	origin: string;
	config: VegaConfig | null;
	override: string | null;
}): string {
	if (opts.override && isAbsoluteUrl(opts.override)) return opts.override.trim();
	const candidate = opts.config?.backendUrl;
	if (candidate && isAbsoluteUrl(candidate)) return candidate.trim();
	return opts.origin;
}

/**
 * Solo `http:`/`https:` cuentan como URL de backend válida. `new URL()` a secas es demasiado
 * laxo: `new URL('pb.example.com:8090')` NO lanza (WHATWG lee `pb.example.com:` como esquema y
 * `8090` como opaque-path), así que un typo muy plausible en `vega.config.json`/el formulario de
 * conexión (host:puerto sin `https://`) pasaría como "válido" y reventaría en Fase 2 al construir
 * el cliente. Exigir el protocolo http(s) hace que ese caso caiga al siguiente nivel, como pide
 * §3.7/§7.A.6. Exportada para que `BackendUrlForm.svelte` (L5) valide con el MISMO criterio antes
 * de guardar el override, en vez de duplicar la lógica.
 */
export function isAbsoluteUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/** Default espejo del de `createPocketBaseBackend` (`adapters/pocketbase/index.ts`): duplicado a
 *  propósito, la capa de sesión no puede importar del adaptador concreto (ley L1/P3-L1). */
const DEFAULT_AUTH_COLLECTION = '_superusers';

/**
 * Resolución PURA de la colección de auth (lote L6a), MISMO patrón de tres niveles que
 * `resolveBackendUrl` — de hecho `config` y `override` son los mismos objetos ya resueltos por
 * la Fase 2 (`session/backend.ts`), ninguna llamada de red/`localStorage` extra:
 *  1. `override` (no vacío tras `.trim()`) → ese (guardado a mano, gana a cualquier config).
 *  2. `config.authCollection` (no vacío tras `.trim()`) → ese (D-P3.5-a ampliado por L6a).
 *  3. `'_superusers'` (default, comportamiento previo — SIN override ni config, resultado
 *     IDÉNTICO al de antes de L6a).
 * Un valor en blanco (string vacío, solo espacios) en cualquiera de los dos niveles se ignora y
 * cae al siguiente, mismo criterio "nunca pantalla blanca" que `resolveBackendUrl` (P3-L3): un
 * nombre de colección no se valida más allá de "no vacío" (a diferencia de la URL, cualquier
 * string es sintácticamente un nombre de colección posible; un valor erróneo simplemente fallará
 * en `login`/`restoreSession`, mapeado como cualquier otro error de PB).
 */
export function resolveAuthCollection(opts: {
	config: VegaConfig | null;
	override: string | null;
}): string {
	const trimmedOverride = opts.override?.trim();
	if (trimmedOverride) return trimmedOverride;
	const trimmedCandidate = opts.config?.authCollection?.trim();
	if (trimmedCandidate) return trimmedCandidate;
	return DEFAULT_AUTH_COLLECTION;
}

/**
 * Resuelve la base de auth fuerte. Es opt-in: ausente o inválida mantiene PocketBase vanilla.
 * Solo se aceptan paths absolutos del MISMO backend (`/api/...`), nunca `//host` ni una URL
 * externa; la URL del servidor ya se resuelve por `resolveBackendUrl` y así no se mezclan tokens
 * de un PocketBase con endpoints de otro origen.
 */
export function resolveAuthApiBasePath(config: VegaConfig | null): string | null {
	const value = config?.authApiBasePath?.trim().replace(/\/+$/, '');
	if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
	return value;
}
