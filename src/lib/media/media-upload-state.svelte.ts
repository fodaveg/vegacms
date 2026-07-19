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
 * - Cualquier otro `kind` (`'backend'`/`'not-found'`/`'auth-expired'`): se trata como el caso
 *   `validation` (error acotado a ESE fichero, el lote sigue) — ninguno de esos `kind` tiene
 *   sentido real para un `create()` de un solo campo `file`, pero degradar a "sigue con el
 *   siguiente" es más seguro que abortar por un `kind` inesperado.
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

export type MediaUploadItemStatus =
	| { kind: 'pending' }
	| { kind: 'uploading' }
	| { kind: 'done' }
	| { kind: 'rejected'; reason: MediaFileRejectionReason }
	| { kind: 'error'; message: string };

export interface MediaUploadItem {
	/** Clave estable del ítem DENTRO de este lote (nunca la `RecordId` real: el fichero puede no
	 *  haber llegado a crearse). */
	id: string;
	name: string;
	status: MediaUploadItemStatus;
}

export interface MediaUploadSummary {
	uploaded: number;
	failed: number;
}

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

/** Construye un `MediaUploadState` vacío (sin lote todavía). */
export function createMediaUploadState(): MediaUploadState {
	let items = $state<MediaUploadItem[]>([]);
	let running = $state(false);

	function setStatus(id: string, status: MediaUploadItemStatus): void {
		items = items.map((item) => (item.id === id ? { ...item, status } : item));
	}

	async function start(
		ctx: VegaAppContext,
		schema: MediaFileFieldSchema,
		files: File[],
		onUploaded: () => void,
		onSummary: (summary: MediaUploadSummary) => void
	): Promise<void> {
		if (files.length === 0) return;

		// Pre-validación (D-P6.3): calculada UNA vez por fichero, antes de tocar el puerto para
		// ninguno del lote — así el usuario ve de inmediato qué va a subir de verdad y qué no.
		const batch: MediaUploadItem[] = files.map((file, index) => {
			const reason = validateMediaFile(schema, file);
			return {
				id: `${index}_${crypto.randomUUID()}`,
				name: file.name,
				status: reason === null ? { kind: 'pending' } : { kind: 'rejected', reason }
			};
		});
		items = batch;
		running = true;

		let uploaded = 0;
		let failed = batch.filter((item) => item.status.kind === 'rejected').length;
		let aborted = false;

		for (let i = 0; i < files.length; i++) {
			if (aborted) break;
			// `batch[i]` (nunca `items[i]`): el snapshot ORIGINAL de la clasificación de este
			// fichero, que no cambia — solo dice si esta entrada empezó `'pending'` o ya llegó
			// `'rejected'` de la pre-validación (`items` sí muta con cada `setStatus`).
			if (batch[i].status.kind !== 'pending') continue;

			const item = batch[i];
			setStatus(item.id, { kind: 'uploading' });
			try {
				await ctx.port.create('vega_media', { [MEDIA_FILE_FIELD]: files[i] });
				setStatus(item.id, { kind: 'done' });
				uploaded++;
				onUploaded();
			} catch (err) {
				const vegaErr =
					err instanceof VegaError ? err : VegaError.backend('Error al subir el fichero', err);
				setStatus(item.id, { kind: 'error', message: messageFor(vegaErr) });
				failed++;

				if (abortsBatch(vegaErr)) {
					aborted = true;
					// El resto de pendientes (aún no intentados) queda `'error'` con un motivo de
					// aborto explícito: nunca se llega a llamar a `create()` para ellos.
					for (let j = i + 1; j < files.length; j++) {
						if (batch[j].status.kind === 'pending') {
							setStatus(batch[j].id, { kind: 'error', message: ctx.t('media.upload.aborted') });
							failed++;
						}
					}
				}
			}
		}

		running = false;
		onSummary({ uploaded, failed });
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
		clear
	};
}
