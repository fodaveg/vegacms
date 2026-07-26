/**
 * Trae el binario de un `{ file, url }` exportado (§4.4 del contrato de `#lote-esquema`, ver la
 * cabecera de `export-collection.ts`): `fetch(url)` del ORIGEN → `File`, listo para ir en el mismo
 * `create`/`update` del destino. Único punto de red de la Fase 2 fuera de `BackendPort` — separado
 * de `record-deserializer.ts` (que lo recibe inyectado) para que ese módulo y `import-preview.ts`
 * (que usa esta misma función para comprobar si un `file` `required` es traíble ANTES de escribir,
 * §4.2) puedan testearse con un doble sin tocar `fetch` real.
 *
 * **Nunca lanza**: red caída, CORS, 404, timeout, `content-type` que no puede ser un fichero real
 * o cualquier otra forma de "no se puede traer" resuelven igual a `null` — es al llamador
 * (`record-deserializer.ts`/`import-preview.ts`) a quien le toca decidir qué significa `null` en su
 * contexto (campo vacío vs registro BLOQUEADO). Distinguir el motivo exacto del fallo no aporta
 * nada aquí: el desenlace para el usuario es el mismo, "esta imagen no se pudo traer, resúbela a
 * mano" (§4.4, "el texto es lo caro de rehacer, una imagen se resube").
 *
 * **Fix de code-review (commit `e4dd164`)**: la primera versión solo miraba `response.ok`. Un
 * origen que responde con un 200 de basura —una página de login, el `index.html` de fallback de
 * una SPA, un error de proxy servido como HTML— pasaba como éxito: el HTML se envolvía en un
 * `File` y se escribía tal cual en destino, con el registro marcado `created`/`updated` y SIN
 * aparecer en `missingFiles`. Eso rompe el invariante de honestidad de toda la feature ("nunca
 * decir que entró un fichero que no entró"). Tres guardas nuevas, todas con el MISMO desenlace que
 * un 404 (`null`, nunca una excepción):
 * - **`content-type` de HTML** (`isHtmlContentType`): un endpoint de fichero NUNCA responde HTML de
 *   verdad — si lo hace, es un fallback/página de error, no el binario pedido. No hace falta saber
 *   el mime ESPERADO del campo destino para detectar esto: HTML es SIEMPRE la señal de "esto no es
 *   un fichero", venga lo que venga después.
 * - **Cuerpo vacío** (`size === 0`): un fichero de 0 bytes no es un fichero traído con éxito.
 * - **Timeout** (`timeoutMs`, 30s por defecto): sin límite, un origen que cuelga (nunca responde,
 *   ni error ni éxito) colgaba el import ENTERO — `buildRequiredFileReachability` congela la fase
 *   `reading` del diálogo con su `Promise.all`, y `runImport` cuelga la fase `running`, que la
 *   cabecera de `ImportDialog.svelte` documenta como no cancelable. Un único `AbortController` ata
 *   la petición Y la lectura del cuerpo al mismo plazo (su `signal` viaja al `fetch` real, que
 *   aborta la conexión Y cualquier lectura de cuerpo en marcha), pero NO se confía solo en que el
 *   `fetch` inyectado lo respete (un doble de test podría ignorarlo por completo) — se corre además
 *   una carrera explícita contra el mismo evento `abort`, así que la función expira igual aunque el
 *   `fetch` de quien llama nunca mire `signal`.
 * - **Límite de tamaño + streaming** (`maxBytes`, 25 MB por defecto): `response.blob()` bufferiza
 *   el cuerpo ENTERO en memoria antes de poder mirar su tamaño — un import con ficheros grandes (o
 *   un origen hostil) podía tumbar la pestaña. `readBoundedBlob` lee el cuerpo por *chunks*
 *   (`ReadableStreamDefaultReader`) y aborta en cuanto se supera `maxBytes`, sin llegar a
 *   materializar el resto.
 * - **Concurrencia acotada** (`MAX_CONCURRENT_FETCHES`): un semáforo a nivel de MÓDULO (no por
 *   llamada) — `buildRequiredFileReachability` lanzaba TODOS los `fetch` de la vista previa a la
 *   vez con `Promise.all`; puesto aquí, en el ÚNICO punto de red de la Fase 2, cualquier llamador
 *   (vista previa o escritura) queda acotado por construcción, sin que cada uno tenga que coordinar
 *   su propio límite.
 */

import type { TransferFileValue } from './record-serializer';

/** Nº máximo de `fetch` de esta Fase en vuelo a la vez, GLOBAL al módulo (ver cabecera): evita que
 *  un import con muchos ficheros abra cientos de conexiones a la vez. Nº pequeño y conservador —
 *  esto no es la ruta caliente de la app, un import ya es una operación de fondo. */
const MAX_CONCURRENT_FETCHES = 4;
/** Plazo por fichero antes de darlo por "no alcanzable" (ver cabecera). */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Tamaño máximo por fichero antes de cortar la descarga (ver cabecera, `readBoundedBlob`). 25 MB:
 *  generoso para el caso de uso (imágenes/documentos de un editor), pequeño frente a lo que
 *  bufferizar entero podría hacerle a la pestaña. */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

let activeFetches = 0;
const waitQueue: (() => void)[] = [];

/** Cola FIFO mínima (ver `MAX_CONCURRENT_FETCHES`): se resuelve en cuanto hay hueco, nunca lanza. */
function acquireFetchSlot(): Promise<void> {
	return new Promise((resolve) => {
		const tryAcquire = (): void => {
			if (activeFetches < MAX_CONCURRENT_FETCHES) {
				activeFetches += 1;
				resolve();
				return;
			}
			waitQueue.push(tryAcquire);
		};
		tryAcquire();
	});
}

function releaseFetchSlot(): void {
	activeFetches -= 1;
	const next = waitQueue.shift();
	if (next) next();
}

/** `true` si `contentType` describe HTML — la señal genérica de "esto no es el fichero pedido, es
 *  una página" (fallback de SPA, login, error de proxy…). Sin `charset`/parámetros: substring
 *  simple, deliberadamente laxo (mejor un falso positivo raro que dejar pasar basura). */
function isHtmlContentType(contentType: string): boolean {
	const normalized = contentType.toLowerCase();
	return normalized.includes('text/html') || normalized.includes('application/xhtml+xml');
}

/**
 * Lee `response.body` por *chunks*, cortando en cuanto se supera `maxBytes` (ver cabecera) — nunca
 * bufferiza más de `maxBytes` + un *chunk* de sobra. `null` si se superó el límite (`Content-Length`
 * declarado o real durante la lectura) o si el cuerpo queda vacío. Sin `response.body` (entorno sin
 * *streams*, o un doble de test que devuelve un `Response` sin cuerpo real): cae a `response.blob()`
 * entero — mejor-esfuerzo, nunca el camino principal contra un `fetch` real de navegador/Node.
 */
async function readBoundedBlob(response: Response, maxBytes: number): Promise<Blob | null> {
	const declaredLength = response.headers.get('content-length');
	if (declaredLength !== null && Number(declaredLength) > maxBytes) return null;

	if (!response.body) {
		const blob = await response.blob();
		return blob.size > 0 && blob.size <= maxBytes ? blob : null;
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(value);
	}
	if (total === 0) return null;
	// `Uint8Array<ArrayBufferLike>` (lo que devuelve `getReader().read()`) vs `BlobPart` (que exige
	// `ArrayBuffer`, no `ArrayBufferLike`) es un desajuste puro de los tipos de lib.dom — el propio
	// `Blob` en runtime acepta cualquier `Uint8Array` sin problema.
	return new Blob(chunks as BlobPart[], {
		type: response.headers.get('content-type') ?? undefined
	});
}

export interface FetchTransferFileOptions {
	/** Ver `DEFAULT_TIMEOUT_MS`. */
	timeoutMs?: number;
	/** Ver `DEFAULT_MAX_BYTES`. */
	maxBytes?: number;
}

/**
 * Trae `file.url` y lo envuelve en un `File` con el nombre original (`file.file`, el `FileRef` de
 * origen) — el destino le asignará su propio nombre al guardarlo (PocketBase renombra todo
 * fichero subido, landmine conocida, ver cabecera de `export-collection.ts`), así que el nombre
 * aquí es solo para que el `File` sea válido y legible en depuración, nunca una promesa de que se
 * conserva. Ver la cabecera del módulo para las guardas de honestidad (HTML/vacío/timeout/tamaño).
 */
export async function fetchTransferFile(
	file: TransferFileValue,
	opts: FetchTransferFileOptions = {}
): Promise<File | null> {
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

	await acquireFetchSlot();
	// UN solo temporizador para TODO el ciclo de vida de esta petición (cabeceras + cuerpo, ver
	// cabecera del módulo): `controller.signal` se pasa a `fetch` para que una implementación real
	// aborte la conexión y cualquier lectura de cuerpo en marcha en cuanto expira; la promesa que
	// rechaza al mismo evento `abort` es la red de seguridad para un `fetch` inyectado (tests, u
	// otro entorno) que no observe `signal` en absoluto — expira igual.
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await Promise.race([
			fetch(file.url, { signal: controller.signal }),
			new Promise<never>((_, reject) => {
				controller.signal.addEventListener('abort', () => reject(new Error('timeout')), {
					once: true
				});
			})
		]);

		if (!response.ok) return null;
		const contentType = response.headers.get('content-type') ?? '';
		if (isHtmlContentType(contentType)) return null; // fallback/login/error servido como 200

		const blob = await readBoundedBlob(response, maxBytes);
		if (blob === null) return null;

		return new File([blob], file.file, { type: blob.type || contentType || undefined });
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutHandle);
		releaseFetchSlot();
	}
}
