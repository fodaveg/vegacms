/**
 * Cliente HTTP de los ENLACES DE VISTA PREVIA PARA COMPARTIR (contrato en
 * `docs/PROJECT-CONTRACT-v1.md#share-links-optional`). Es un mecanismo aparte del token de vista
 * previa de `preview-client.ts`: aquel es una URL firmada que vive como mucho una hora y solo sirve
 * al panel del editor; este es un enlace con estado en el servidor, de duración elegida por quien
 * edita (30 días como mucho) y anulable, pensado para enviárselo a un cliente.
 *
 * Mismo transporte y misma disciplina que `preview-client.ts` y `build-client.ts`: `fetch` crudo,
 * fuera del `BackendPort`, contra el `preview.apiBasePath` del proyecto conectado, con el token de
 * la sesión activa en `Authorization` SIN prefijo `Bearer`. Nunca lanza `VegaError`: sus errores
 * son `Error` planos y quien lo consuma los traduce a su estado de interfaz.
 *
 * Solo cubre las tres rutas que usa Vega (crear, listar, anular). La cuarta, `POST
 * .../share/resolve`, la llama el servidor del sitio con su clave y NO debe llamarse nunca desde
 * un navegador, así que no tiene sitio aquí.
 */

// ————— Contrato de las rutas (§"Share links" del contrato de proyecto) —————

/** Un enlace vivo tal como lo describe el servidor. No lleva el secreto ni su hash. */
export interface PreviewShareLink {
	/** Id del enlace: es lo que se pasa a `revokeLink`. No es el secreto ni permite abrir nada. */
	id: string;
	/** Etiqueta que escribió quien lo creó (p. ej. el nombre del cliente). Puede ser `''`. */
	label: string;
	/** ISO 8601 UTC. */
	createdAt: string;
	/** ISO 8601 UTC. Pasado ese instante el servidor deja de resolver el enlace y lo borra. */
	expiresAt: string;
	/** Id del registro de autenticación que lo creó. */
	createdBy: string;
	/** Colección de autenticación de `createdBy` (la de editores, o `_superusers`). */
	createdByCollection: string;
}

/** Respuesta de crear: el enlace más su URL. La URL lleva el secreto y el servidor la devuelve
 *  UNA sola vez: no se puede volver a pedir, ni aparece al listar. Es opaca para Vega: se copia o
 *  se muestra tal cual, nunca se parsea ni se reescribe. */
export interface CreatedPreviewShareLink extends PreviewShareLink {
	url: string;
}

export interface CreatePreviewShareLinkOptions {
	/** Duración en SEGUNDOS enteros. El servidor rechaza con 400 lo que quede fuera de su rango
	 *  configurado (30 días como máximo absoluto); este cliente no lo recorta por su cuenta. */
	ttlSeconds: number;
	/** Texto corto opcional (120 caracteres como mucho, sin saltos de línea). */
	label?: string;
}

export interface PreviewShareClientOptions {
	/** Base ABSOLUTA ya resuelta del endpoint de preview (la misma que recibe
	 *  `createPreviewClient`), con o sin barra final. */
	apiUrl: string;
	/** `Session.token` de la sesión activa, reenviado tal cual en `Authorization`. */
	token: string;
	/** Inyectable para tests, por defecto el `fetch` global. */
	fetcher?: typeof fetch;
}

export interface PreviewShareClient {
	/** Crea un enlace para `{collection, id}`. Exige poder ver Y editar el registro (403 si solo se
	 *  puede ver; 404 si no existe, no se puede ver o la colección no admite enlaces). */
	createLink(
		collection: string,
		id: string,
		options: CreatePreviewShareLinkOptions
	): Promise<CreatedPreviewShareLink>;
	/** Enlaces vivos de ese registro, del más reciente al más antiguo. Mismas comprobaciones. */
	listLinks(collection: string, id: string): Promise<PreviewShareLink[]>;
	/** Anula un enlace de ese registro. Idempotente: anular uno ya anulado, caducado o inexistente
	 *  también resuelve sin error. */
	revokeLink(collection: string, id: string, linkId: string): Promise<void>;
}

/**
 * Error de una ruta de enlaces que SÍ obtuvo respuesta pero no `2xx`. Lleva el `status` para que
 * la interfaz distinga un 403 (puede ver el registro, no editarlo) de un 400 (duración o etiqueta
 * fuera de rango) o un 404. Mismo patrón que `PreviewRequestError` (`preview-client.ts`).
 */
export class PreviewShareRequestError extends Error {
	readonly status: number;

	constructor(status: number, method: string, path: string) {
		super(
			`El endpoint de enlaces de vista previa respondió con el estado ${status} (${method} ${path}).`
		);
		this.name = 'PreviewShareRequestError';
		this.status = status;
	}
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

/**
 * Valida la descripción de un enlace. Todo o nada, como `parsePreviewToken`: un enlace sin `id` no
 * se puede anular y uno sin `expiresAt` no se puede enseñar con honestidad, así que cualquier
 * campo ausente o de tipo inesperado invalida el documento entero. `label` es el único que puede
 * venir vacío.
 */
export function parsePreviewShareLink(raw: unknown): PreviewShareLink | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const record = raw as Record<string, unknown>;
	const id = nonEmptyString(record.id);
	const createdAt = nonEmptyString(record.createdAt);
	const expiresAt = nonEmptyString(record.expiresAt);
	const createdBy = nonEmptyString(record.createdBy);
	const createdByCollection = nonEmptyString(record.createdByCollection);
	if (!id || !createdAt || !expiresAt || !createdBy || !createdByCollection) return null;
	if (typeof record.label !== 'string') return null;
	return { id, label: record.label, createdAt, expiresAt, createdBy, createdByCollection };
}

/** Respuesta de crear: un enlace válido más una `url` no vacía. Sin `url` no hay nada que
 *  compartir, y no se puede pedir otra vez. */
export function parseCreatedPreviewShareLink(raw: unknown): CreatedPreviewShareLink | null {
	const link = parsePreviewShareLink(raw);
	if (!link) return null;
	const url = nonEmptyString((raw as Record<string, unknown>).url);
	return url ? { ...link, url } : null;
}

/** Respuesta de listar: `{ items: [...] }`. Un solo elemento con forma inesperada invalida la
 *  lista entera: enseñar una lista incompleta haría creer que un enlace vivo no existe. */
export function parsePreviewShareLinkList(raw: unknown): PreviewShareLink[] | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const items = (raw as Record<string, unknown>).items;
	if (!Array.isArray(items)) return null;
	const links: PreviewShareLink[] = [];
	for (const item of items) {
		const link = parsePreviewShareLink(item);
		if (!link) return null;
		links.push(link);
	}
	return links;
}

/**
 * Crea el cliente contra una instalación concreta. Puro transporte: no guarda la URL devuelta al
 * crear ni decide cuándo refrescar la lista.
 */
export function createPreviewShareClient(opts: PreviewShareClientOptions): PreviewShareClient {
	const fetcher = opts.fetcher ?? fetch;
	const base = `${opts.apiUrl.replace(/\/+$/, '')}/share`;

	function post(path: string, body: unknown): Promise<Response> {
		return fetcher(path, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: opts.token
			},
			body: JSON.stringify(body),
			cache: 'no-store'
		});
	}

	return {
		async createLink(collection, id, options) {
			const body =
				options.label === undefined
					? { collection, id, ttlSeconds: options.ttlSeconds }
					: { collection, id, ttlSeconds: options.ttlSeconds, label: options.label };
			const response = await post(base, body);
			if (!response.ok) {
				throw new PreviewShareRequestError(response.status, 'POST', base);
			}
			const link = parseCreatedPreviewShareLink(await response.json());
			if (!link) {
				throw new Error(
					'El endpoint de enlaces de vista previa no devolvió un enlace con forma válida.'
				);
			}
			return link;
		},

		async listLinks(collection, id) {
			const query = new URLSearchParams({ collection, id });
			const response = await fetcher(`${base}?${query.toString()}`, {
				method: 'GET',
				headers: { Accept: 'application/json', Authorization: opts.token },
				cache: 'no-store'
			});
			if (!response.ok) {
				throw new PreviewShareRequestError(response.status, 'GET', base);
			}
			const links = parsePreviewShareLinkList(await response.json());
			if (!links) {
				throw new Error(
					'El endpoint de enlaces de vista previa no devolvió una lista con forma válida.'
				);
			}
			return links;
		},

		async revokeLink(collection, id, linkId) {
			const path = `${base}/revoke`;
			const response = await post(path, { collection, id, linkId });
			if (!response.ok) {
				throw new PreviewShareRequestError(response.status, 'POST', path);
			}
		}
	};
}
