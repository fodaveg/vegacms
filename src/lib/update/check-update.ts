/**
 * Comprobación de actualizaciones (P8, opt-in): compara `VEGA_VERSION` contra la última release
 * publicada en GitHub. Es la PRIMERA petición de red de Vega a un origen EXTERNO — todo lo demás
 * en la app habla exclusivamente con SU PocketBase (same-origin u override, ver
 * `session/backend-config.ts`). Por eso este módulo NUNCA se dispara solo: quien lo invoca es
 * siempre una acción explícita (botón "Comprobar actualizaciones" de `/settings`) o el arranque
 * del layout, y SOLO si la preferencia `update/storage.ts#readAutoCheckPreference()` está en
 * `true` (default `false`, ver esa cabecera). `checkForUpdate` en sí no comprueba esa
 * preferencia: quien la invoca decide cuándo es legítimo llamarla.
 *
 * `checkForUpdate` NUNCA lanza — cualquier fallo (red, HTTP, JSON, forma inesperada de la
 * respuesta) se captura y se devuelve como `{ kind: 'error' }`, para que la UI (banner/ajustes)
 * lo pinte como un estado más, nunca como una excepción sin capturar (mismo criterio que
 * `VegaError` en el resto de la app, aunque este módulo no forma parte del puerto de backend).
 */

import { VEGA_VERSION } from '$lib/version';
import { readCachedUpdateCheck, writeCachedUpdateCheck } from './storage';

/** `owner/repo` de GitHub. Constante explícita: `package.json` no declara el campo
 *  `repository`, así que no hay de dónde derivarlo sin inventar una convención nueva. */
export const VEGA_REPO_SLUG = 'fodaveg/vegacms';

const RELEASES_URL = `https://api.github.com/repos/${VEGA_REPO_SLUG}/releases/latest`;

/** Margen de espera de la petición (§ "degradar con elegancia"): ni tan corto que falle en una
 *  conexión lenta normal, ni tan largo que un servidor colgado bloquee la UI un buen rato. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * TTL de la caché para NO llamar a GitHub en cada carga (fix de peso, auditoría 23 sep 2026 p3):
 * GitHub limita `releases/latest` sin autenticar a 60 peticiones/hora por IP, y antes de este fix
 * CADA apertura de Vega con el auto-check activado (`update-banner.svelte.ts#runAutoCheckIfEnabled`,
 * disparado en `onMount` del layout raíz) disparaba una petición nueva, sin mirar si ya había una
 * reciente. 4 horas: de sobra para no acercarse al límite con un uso normal (varias aperturas al
 * día por editor, y varios editores tras el mismo NAT/CDN pueden compartir IP saliente), bastante
 * corto para que "hay actualización" no tarde más de una jornada de trabajo en aparecer tras una
 * release. Es la única cifra de este módulo que no sale de una medición sino de un criterio —
 * documentado aquí en vez de justificarlo en el sitio que la usa.
 */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/** Resultado de comparar la versión instalada contra la última publicada. Unión discriminada por
 *  `kind`, la misma forma que espera tanto `/settings` (mensaje inline) como `UpdateBanner`
 *  (solo le importa `'update-available'`). */
export type UpdateStatus =
	| { kind: 'up-to-date'; current: string; latest: string }
	| { kind: 'update-available'; current: string; latest: string; releaseUrl: string }
	| { kind: 'error'; reason: string };

/**
 * Compara dos versiones `X.Y.Z` segmento a segmento (numérico). Ignora cualquier sufijo de
 * pre-release/build metadata (`-beta.1`, `+build5`) para el MVP: se recorta antes de parsear, así
 * que `1.2.0-beta.1` se compara como `1.2.0`. Un segmento ausente o no numérico se trata como `0`
 * (nunca lanza con una versión mal formada — degradación honesta, igual que el resto del
 * comparador).
 *
 * @returns `1` si `a > b`, `-1` si `a < b`, `0` si son iguales (para el MVP, tras el recorte).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
	const segsA = parseSemverCore(a);
	const segsB = parseSemverCore(b);
	for (let i = 0; i < 3; i++) {
		if (segsA[i] > segsB[i]) return 1;
		if (segsA[i] < segsB[i]) return -1;
	}
	return 0;
}

/** Recorta pre-release/build metadata y parsea los tres segmentos numéricos (`major.minor.patch`).
 *  Segmentos ausentes o no numéricos → `0`, nunca `NaN`. */
function parseSemverCore(version: string): [number, number, number] {
	const core = version.split(/[-+]/, 1)[0] ?? '';
	const parts = core.split('.');
	const segment = (index: number): number => {
		const n = Number.parseInt(parts[index] ?? '', 10);
		return Number.isFinite(n) ? n : 0;
	};
	return [segment(0), segment(1), segment(2)];
}

/** Quita una `v` inicial opcional (`v1.2.3` → `1.2.3`), convención habitual de `tag_name` en
 *  GitHub Releases. Sin la `v`, se devuelve tal cual. */
function stripLeadingV(tag: string): string {
	return tag.startsWith('v') || tag.startsWith('V') ? tag.slice(1) : tag;
}

/** Forma mínima que este módulo exige de la respuesta de `GET .../releases/latest`: un
 *  `tag_name` string y, si existe, un `html_url` string (el link "Ver el release"). Cualquier
 *  otro campo de la respuesta real de GitHub se ignora. */
function extractRelease(data: unknown): { tagName: string; htmlUrl: string | null } | null {
	if (typeof data !== 'object' || data === null) return null;
	const record = data as Record<string, unknown>;
	if (typeof record.tag_name !== 'string' || record.tag_name.length === 0) return null;
	const htmlUrl = typeof record.html_url === 'string' ? record.html_url : null;
	return { tagName: record.tag_name, htmlUrl };
}

/** Describe un error de `fetch`/`AbortController` en un `reason` legible, sin exponer nunca la
 *  excepción cruda a la UI (mismo criterio que `VegaError.message` en el resto de la app). */
function describeFetchError(err: unknown): string {
	if (err instanceof DOMException && err.name === 'AbortError') {
		return 'La comprobación tardó demasiado y se canceló.';
	}
	if (err instanceof Error) return err.message;
	return 'Error desconocido al comprobar actualizaciones.';
}

/**
 * Comprueba si hay una versión de Vega más nueva publicada en GitHub. Acepta un `fetch`
 * inyectado (por defecto el global) para poder testearlo sin red real. Escribe el resultado en
 * caché (`update/storage.ts#writeCachedUpdateCheck`, con timestamp) antes de devolverlo: así
 * cualquier check (manual o automático) alimenta al `UpdateBanner`, que solo lee esa caché.
 *
 * `opts.force` (default `false`): con una caché más reciente que `CACHE_TTL_MS` (ver arriba),
 * devuelve ESE `UpdateStatus` sin tocar la red — el camino que toma el auto-check del arranque
 * (`update-banner.svelte.ts`). El botón "Comprobar actualizaciones" de `/settings` pasa
 * `force: true`: un clic explícito es una petición de "ahora mismo", no algo que el TTL deba
 * silenciar sin decir nada — degradar en silencio ahí sería mentirle al usuario sobre qué acaba
 * de comprobar. `readCachedUpdateCheck` ya es seguro sin `localStorage`/con contenido corrupto
 * (ver su cabecera en `storage.ts`): si no hay caché legible, esto simplemente cae al camino de
 * red de siempre.
 */
export async function checkForUpdate(
	fetchImpl: typeof fetch = fetch,
	opts: { force?: boolean } = {}
): Promise<UpdateStatus> {
	if (!opts.force) {
		const cached = readCachedUpdateCheck();
		if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return cached.status;
	}
	const status = await resolveStatus(fetchImpl);
	writeCachedUpdateCheck(status);
	return status;
}

async function resolveStatus(fetchImpl: typeof fetch): Promise<UpdateStatus> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetchImpl(RELEASES_URL, {
			headers: { Accept: 'application/vnd.github+json' },
			signal: controller.signal
		});
		if (!response.ok) {
			return { kind: 'error', reason: `GitHub respondió con el estado ${response.status}.` };
		}
		const data: unknown = await response.json();
		const release = extractRelease(data);
		if (!release) {
			return { kind: 'error', reason: 'La respuesta de GitHub no incluye "tag_name".' };
		}
		const current = VEGA_VERSION;
		const latest = stripLeadingV(release.tagName);
		if (compareSemver(latest, current) > 0) {
			const releaseUrl =
				release.htmlUrl ?? `https://github.com/${VEGA_REPO_SLUG}/releases/tag/${release.tagName}`;
			return { kind: 'update-available', current, latest, releaseUrl };
		}
		return { kind: 'up-to-date', current, latest };
	} catch (err) {
		return { kind: 'error', reason: describeFetchError(err) };
	} finally {
		clearTimeout(timeoutId);
	}
}
