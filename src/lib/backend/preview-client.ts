/**
 * Cliente HTTP del endpoint de preview de borrador (lote "publicación", fase B; contrato en
 * `docs/PROJECT-CONTRACT-v1.md#preview-endpoint-optional`). Mismo estilo de transporte y misma
 * disciplina de degradación que `backend/build-client.ts` (fetch crudo, DELIBERADAMENTE fuera del
 * `BackendPort`/adaptador `pocketbase`: esta ruta vive en un `apiBasePath` propio del proyecto
 * conectado, no en el puerto — mismo criterio que `project-discovery.ts#fetchProjectDiscovery`).
 *
 * Vive en `session/` y no en `backend/` (a diferencia de `build-client.ts`) por reparto de
 * ficheros de este lote, no por diseño: `src/lib/backend/**` lo está tocando en paralelo otro
 * agente en el mismo worktree. El transporte/la disciplina son idénticos a `build-client.ts`; solo
 * cambia dónde vive el fichero.
 *
 * Autentica con el MISMO token que ya usa la sesión activa (`Session.token`), en la cabecera
 * `Authorization` SIN prefijo `Bearer` — igual convención que `build-client.ts` (el SDK de
 * PocketBase, ver su cabecera para el porqué completo).
 *
 * Nunca lanza `VegaError`: ajeno al puerto (igual que `build-client.ts`), sus errores son `Error`
 * planos — quien lo consume (`form/PreviewPanel.svelte`) los traduce a un estado de UI con su
 * propio criterio, sin fingir un `VegaError.kind` que no le corresponde.
 */

// ————— Contrato del endpoint (§"Preview endpoint" del contrato de proyecto) —————

/** `POST {apiBasePath}/token` → `200` + este cuerpo (§contrato). `url` es SIEMPRE opaca para
 *  Vega: se embebe tal cual en un `<iframe src>` (`PreviewPanel.svelte`), nunca se parsea, se
 *  reescribe ni se decodifica. */
export interface PreviewToken {
	url: string;
	/** ISO 8601 UTC. Solo se usa para programar una renovación SILENCIOSA un poco antes de que
	 *  caduque (`PreviewPanel.svelte`, `scheduleRenew`) — Vega nunca decide por su cuenta si el
	 *  token sigue siendo válido; eso lo dice el propio servidor de preview en la respuesta a la
	 *  siguiente petición. */
	expiresAt: string;
	/** Presente solo para un borrador sin guardar. El panel lo envía como campo `token` de un
	 *  formulario POST dirigido a `url`; el ciphertext nunca entra en la query string. */
	postToken?: string;
}

/** Snapshot canónico que viaja cifrado al sitio. `id` queda fuera de `fields` para que un campo
 *  editorial con ese nombre no pueda cambiar la identidad estructural del registro. */
export interface PreviewDraftRecord {
	id: string;
	fields: Record<string, unknown>;
}

export interface PreviewDraft {
	record: PreviewDraftRecord;
	blocks: PreviewDraftRecord[];
}

export interface PreviewClientOptions {
	/** Base ABSOLUTA ya resuelta (mismo criterio que `BuildClientOptions.apiUrl`), con o sin barra
	 *  final — se normaliza aquí. */
	apiUrl: string;
	/** `Session.token` de la sesión activa, reenviado tal cual en `Authorization`. */
	token: string;
	/** Inyectable para tests, por defecto el `fetch` global (mismo patrón que `build-client.ts`). */
	fetcher?: typeof fetch;
}

export interface PreviewClient {
	/** Pide un token de preview NUEVO para `{collection, id}`. Rechaza si la respuesta no es
	 *  `2xx` o no trae una `url`/`expiresAt` utilizables — nunca inventa una URL a partir de una
	 *  forma parcial (P3-L3, "nunca un dato inventado"). */
	requestPreview(collection: string, id: string, draft?: PreviewDraft): Promise<PreviewToken>;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

/**
 * Valida la forma de `POST .../token` (§contrato). A diferencia de `parseBuildStatus`
 * (`build-client.ts`, que degrada campo a campo porque casi todos son opcionales), aquí NO hay
 * nada que degradar: sin una `url` no hay nada que embeber, y una `expiresAt` inventada rompería
 * la renovación silenciosa en vez de solo perder un dato cosmético — así que cualquiera de los
 * dos ausente o de tipo inesperado invalida el documento entero.
 */
export function parsePreviewToken(raw: unknown): PreviewToken | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Record<string, unknown>;
	const url = stringOrNull(record.url);
	const expiresAt = stringOrNull(record.expiresAt);
	if (!url || !expiresAt) return null;
	const postToken = stringOrNull(record.postToken);
	return postToken ? { url, expiresAt, postToken } : { url, expiresAt };
}

/**
 * Crea el cliente contra una instalación concreta del endpoint de preview. Puro transporte: no
 * cachea el token ni decide cuándo renovarlo (eso vive en `PreviewPanel.svelte`, igual reparto
 * que `createBuildClient`/`pollBuildStatus`).
 */
export function createPreviewClient(opts: PreviewClientOptions): PreviewClient {
	const fetcher = opts.fetcher ?? fetch;
	const base = opts.apiUrl.replace(/\/+$/, '');

	return {
		async requestPreview(collection, id, draft) {
			const response = await fetcher(`${base}/token`, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					Authorization: opts.token
				},
				body: JSON.stringify(draft === undefined ? { collection, id } : { collection, id, draft }),
				cache: 'no-store'
			});
			if (!response.ok) {
				throw new Error(
					`El endpoint de preview respondió con el estado ${response.status} (POST ${base}/token).`
				);
			}
			const token = parsePreviewToken(await response.json());
			if (!token) {
				throw new Error('El endpoint de preview no devolvió una vista previa con forma válida.');
			}
			return token;
		}
	};
}
