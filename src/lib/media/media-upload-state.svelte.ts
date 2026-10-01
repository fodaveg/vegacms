/**
 * Estado reactivo de un LOTE de subida a `vega_media` (Fase P6·6c): por cada `File` elegido/
 * soltado en la zona de subida de `/media`, produce un `MediaUploadItem` con su propio estado —
 * mismo patrón "un estado local por gesto" que `media-list-state.svelte.ts` (6b), pero para un
 * lote de escrituras en vez de una lectura.
 *
 * **Pre-validación ANTES de subir (D-P6.3)**: cada fichero pasa por `validateMediaFile` (puro,
 * `media-upload.ts`) nada más añadirse al lote — un fichero rechazado por MIME/tamaño NUNCA llega
 * a `port.create` (`'rejected'`, distinto de `'error'`: la distinción separa "lo bloqueó el
 * cliente antes de intentarlo" de "lo rechazó/abortó el backend", aunque ambos cuentan para el
 * resumen final como "fallado").
 *
 * **Reducir antes de subir (Lote 13)**: salvo con `keepOriginal`, cada JPEG/PNG/WebP se reduce en
 * el navegador (`shrink-image.ts`) JUSTO antes de su `create()`, de uno en uno. Por eso el TOPE de
 * tamaño de una imagen reducible no se rechaza en la pre-validación sino DESPUÉS de reducir: si
 * aun así lo supera (o no se pudo reducir), el rechazo de siempre, con el motivo en `item.shrink`.
 * El MIME sí se valida antes. El ítem lleva `shrink` con los bytes de antes y después.
 *
 * **Por-fichero, SECUENCIAL (L-P6.6)**: los ficheros que pasan la pre-validación se suben uno a
 * uno, nunca en paralelo (mismo criterio que `RecordTable`/`DeleteConfirm` de P4: una escritura a
 * la vez es más fácil de razonar/testear que N promesas concurrentes, y no asume que el backend
 * real tolera un ráfaga sin límite de conexiones). Un rechazo de `create()`:
 * - `VegaError.kind === 'validation'` (defensa en profundidad — el cliente ya pre-valida, así que
 *   en la práctica solo se alcanza si el esquema cambió entre medias): marca ESE fichero
 *   `'error'` y CONTINÚA con el siguiente.
 * - `'network'`/`'forbidden'`: ABORTA el resto del lote (no tiene sentido seguir intentando
 *   contra un backend inalcanzable o sin permiso) — los ficheros aún no procesados quedan
 *   `'error'` con un motivo de aborto, nunca se intentan.
 * - `'auth-expired'` (la sesión caducó a mitad del lote): CORTA el lote sin marcar nada como
 *   error. El fichero en vuelo (el servidor lo rechazó con 401, no se guardó) y los no empezados
 *   vuelven/quedan `'pending'` — reintentables tras reentrar, no perdidos —, y el error va al
 *   feedback GLOBAL (`ctx.feedback.reportError`, overlay de re-login, §2.3 de P3) como en el
 *   resto de la app. No cuenta como `failed`; el resumen trae `pending` con cuántos quedaron.
 * - Cualquier otro `kind` (`'backend'`/`'not-found'`): se trata como el caso `validation` (error
 *   acotado a ESE fichero, el lote sigue) — ninguno de esos `kind` tiene sentido real para un
 *   `create()` de un solo campo `file`, pero degradar a "sigue con el siguiente" es más seguro
 *   que abortar por un `kind` inesperado.
 *
 * **Refresco del grid**: `onUploaded` se llama tras CADA éxito individual (no solo al final del
 * lote) — el contrato solo exige "el nuevo asset aparece"; hacerlo por-éxito da feedback más
 * rápido en lotes grandes sin coste extra (`mediaListState.reload()` es idempotente).
 */

import { VegaError } from '$lib/backend/errors';
import type { VegaAppContext } from '$lib/app-context';
import { MEDIA_FILE_FIELD } from './media-item';
import {
	validateMediaFile,
	type MediaFileFieldSchema,
	type MediaFileRejectionReason
} from './media-upload';
import {
	isShrinkableType,
	shrinkImage,
	type ShrinkKeptReason,
	type ShrinkOutcome
} from './shrink-image';
import { browserShrinkDeps } from './shrink-image-browser';

export type MediaUploadItemStatus =
	| { kind: 'pending' }
	| { kind: 'uploading' }
	| { kind: 'done' }
	| { kind: 'rejected'; reason: MediaFileRejectionReason }
	| { kind: 'error'; message: string };

/** Qué pasó con el paso de reducir en UN ítem (solo se rellena si se redujo o se intentó). */
export type MediaUploadShrink =
	| { kind: 'shrunk'; fromBytes: number; toBytes: number }
	| { kind: 'original'; why: ShrinkKeptReason };

export interface MediaUploadItem {
	/** Clave estable del ítem DENTRO de este lote (nunca la `RecordId` real: el fichero puede no
	 *  haber llegado a crearse). */
	id: string;
	name: string;
	status: MediaUploadItemStatus;
	shrink?: MediaUploadShrink;
}

export interface MediaUploadSummary {
	uploaded: number;
	failed: number;
	/** Ficheros que NO se intentaron porque la sesión caducó a mitad del lote (siguen `pending`,
	 *  reintentables tras reentrar). `0` en cualquier otro desenlace. */
	pending: number;
}

/** Opciones de un lote. */
export interface MediaUploadOptions {
	/** «Subir el original»: no se reduce nada y se valida el fichero tal cual (comportamiento de
	 *  siempre). Por defecto `false`. */
	keepOriginal?: boolean;
}

/** Función que reduce una imagen (inyectable en tests; por defecto, la del navegador). */
export type ShrinkFn = (file: File, options: { maxBytes?: number }) => Promise<ShrinkOutcome>;

const defaultShrink: ShrinkFn = (file, options) => shrinkImage(file, browserShrinkDeps, options);

export interface MediaUploadState {
	/** Ficheros del ÚLTIMO lote arrancado, con su estado en vivo. Vacío antes del primer lote o
	 *  tras `clear()`. */
	readonly items: MediaUploadItem[];
	/** `true` mientras el lote sigue procesándose (la zona de subida se deshabilita para AÑADIR
	 *  hasta que termine — misma afordancia que `saving` en `MediaDetail`). */
	readonly running: boolean;
	/** Arranca un lote nuevo a partir de `files`: pre-valida todos, sube los válidos en secuencia
	 *  contra `ctx.port`. `onUploaded()` se llama tras CADA éxito; `onSummary()` una única vez, al
	 *  terminar (o abortar) el lote entero. No-op si `files` está vacío. */
	start(
		ctx: VegaAppContext,
		schema: MediaFileFieldSchema,
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void,
		options?: MediaUploadOptions
	): Promise<void>;
	/** Reanuda el ÚLTIMO lote parado (sesión caducada): `files` va ALINEADO por índice con `items`.
	 *  Solo se suben los `pending`; los `done`, `error` y `rejected` se quedan en su sitio, y el
	 *  resumen cuenta el lote ENTERO (lo ya subido/fallado más lo de esta vuelta). No-op si no hay
	 *  ningún `pending` o `files` no cubre la lista. */
	resume(
		ctx: VegaAppContext,
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void
	): Promise<void>;
	/** Limpia la lista de ficheros del último lote (p.ej. tras leer el resumen) — no cancela nada
	 *  en vuelo, solo la vista; llamarla mientras `running` es `true` no tiene efecto útil. */
	clear(): void;
}

/** `true` si `err` debe abortar el resto del lote (ver cabecera): sin red o sin permiso, seguir
 *  intentando el resto de ficheros no tiene sentido. */
function abortsBatch(err: VegaError): boolean {
	return err.kind === 'network' || err.kind === 'forbidden';
}

/** Mensaje legible de un `VegaError` de `create()` para el estado por-fichero: el de validación
 *  del propio campo `file` (`fieldErrors.file`) si lo trae, si no el `message` general del error. */
function messageFor(err: VegaError): string {
	return err.fieldErrors?.[MEDIA_FILE_FIELD]?.message ?? err.message;
}

/** Construye un `MediaUploadState` vacío (sin lote todavía). `shrink` se inyecta en los tests. */
export function createMediaUploadState(shrink: ShrinkFn = defaultShrink): MediaUploadState {
	let items = $state<MediaUploadItem[]>([]);
	let running = $state(false);
	// Casilla y esquema del ÚLTIMO lote: `resume()` los hereda (no reduce lo que se pidió intacto).
	let keepOriginal = false;
	let lastSchema: MediaFileFieldSchema | null = null;

	function canShrink(file: File): boolean {
		return !keepOriginal && isShrinkableType(file.type);
	}

	function setShrink(id: string, value: MediaUploadShrink): void {
		items = items.map((item) => (item.id === id ? { ...item, shrink: value } : item));
	}

	function setStatus(id: string, status: MediaUploadItemStatus): void {
		items = items.map((item) => (item.id === id ? { ...item, status } : item));
	}

	async function start(
		ctx: VegaAppContext,
		schema: MediaFileFieldSchema,
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void,
		options: MediaUploadOptions = {}
	): Promise<void> {
		if (files.length === 0) return;
		keepOriginal = options.keepOriginal === true;
		lastSchema = schema;

		// Pre-validación (D-P6.3): calculada UNA vez por fichero, antes de tocar el puerto para
		// ninguno del lote — así el usuario ve de inmediato qué va a subir de verdad y qué no.
		const batch: MediaUploadItem[] = files.map((file, index) => {
			// Una imagen reducible que solo falla por tamaño se queda `pending`: el tope se valida
			// DESPUÉS de reducirla, en `run` (una foto de 23 MB que reducida pesa 1 MB debe subirse).
			const reason = validateMediaFile(schema, file, { ignoreSize: canShrink(file) });
			return {
				id: `${index}_${crypto.randomUUID()}`,
				name: file.name,
				status: reason === null ? { kind: 'pending' } : { kind: 'rejected', reason }
			};
		});
		items = batch;
		await run(ctx, schema, batch, files, onUploaded, onSummary);
	}

	async function resume(
		ctx: VegaAppContext,
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void
	): Promise<void> {
		// Foto de la lista actual: `run` lee de ella qué estaba `pending` al reanudar.
		const batch = items.slice();
		if (
			lastSchema === null ||
			files.length < batch.length ||
			!batch.some((item) => item.status.kind === 'pending')
		) {
			return;
		}
		await run(ctx, lastSchema, batch, files, onUploaded, onSummary);
	}

	/** Sube en secuencia los `pending` de `batch` (alineado por índice con `files`). Los demás
	 *  ítems no se tocan; sus estados ya terminales entran en los contadores del resumen. */
	async function run(
		ctx: VegaAppContext,
		schema: MediaFileFieldSchema,
		batch: MediaUploadItem[],
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void
	): Promise<void> {
		running = true;

		let uploaded = batch.filter((item) => item.status.kind === 'done').length;
		let failed = batch.filter(
			(item) => item.status.kind === 'rejected' || item.status.kind === 'error'
		).length;
		let aborted = false;
		let pending = 0;

		for (let i = 0; i < batch.length; i++) {
			if (aborted) break;
			// `batch[i]` (nunca `items[i]`): el snapshot ORIGINAL de la clasificación de este
			// fichero, que no cambia — solo dice si esta entrada empezó `'pending'` o ya llegó
			// `'rejected'` de la pre-validación (`items` sí muta con cada `setStatus`).
			if (batch[i].status.kind !== 'pending') continue;

			const item = batch[i];
			setStatus(item.id, { kind: 'uploading' });
			try {
				let toUpload = files[i];
				if (canShrink(toUpload)) {
					// De una en una (nunca el lote entero en memoria). `shrinkImage` no lanza.
					const outcome = await shrink(toUpload, { maxBytes: schema.maxSizeBytes });
					if (outcome.kind === 'shrunk') {
						toUpload = outcome.file;
						setShrink(item.id, {
							kind: 'shrunk',
							fromBytes: outcome.fromBytes,
							toBytes: outcome.toBytes
						});
					} else if (outcome.kind === 'kept-original') {
						setShrink(item.id, { kind: 'original', why: outcome.reason });
					}
				}
				// Validación definitiva sobre lo que de verdad se sube (tope tras reducir).
				const rejection = validateMediaFile(schema, toUpload);
				if (rejection !== null) {
					setStatus(item.id, { kind: 'rejected', reason: rejection });
					failed++;
					continue;
				}
				await ctx.port.create('vega_media', { [MEDIA_FILE_FIELD]: toUpload });
				setStatus(item.id, { kind: 'done' });
				uploaded++;
				onUploaded();
			} catch (err) {
				const vegaErr =
					err instanceof VegaError ? err : VegaError.backend('Error al subir el fichero', err);

				if (vegaErr.kind === 'auth-expired') {
					// Sesión caducada: se corta el lote (ver cabecera). Este fichero no se guardó y el
					// resto ni se intentó: todos siguen `pending`, ninguno es un error suyo.
					setStatus(item.id, { kind: 'pending' });
					pending = batch.slice(i).filter((entry) => entry.status.kind === 'pending').length;
					ctx.feedback.reportError(vegaErr, { action: 'media:upload' });
					break;
				}

				setStatus(item.id, { kind: 'error', message: messageFor(vegaErr) });
				failed++;

				if (abortsBatch(vegaErr)) {
					aborted = true;
					// El resto de pendientes (aún no intentados) queda `'error'` con un motivo de
					// aborto explícito: nunca se llega a llamar a `create()` para ellos.
					for (let j = i + 1; j < batch.length; j++) {
						if (batch[j].status.kind === 'pending') {
							setStatus(batch[j].id, { kind: 'error', message: ctx.t('media.upload.aborted') });
							failed++;
						}
					}
				}
			}
		}

		running = false;
		onSummary({ uploaded, failed, pending });
	}

	function clear(): void {
		items = [];
	}

	return {
		get items() {
			return items;
		},
		get running() {
			return running;
		},
		start,
		resume,
		clear
	};
}
