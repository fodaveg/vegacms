/**
 * Estado de la revisión antes de publicar (lote 13): la pieza que junta la lógica pura
 * (`reviewRecord`, `applicableChecks`) con la carga (`loadReviewData`) para que el formulario
 * (`RecordForm.svelte` → `ReviewCard.svelte`) y el editor visual (`VisualEditorScreen.svelte` →
 * `VisualPublishControl.svelte`) enseñen LA MISMA revisión sin duplicar el cableado. Mismo reparto
 * que `blocks-state.svelte.ts`: una fábrica con runas que se instancia UNA vez en el `<script>` de
 * quien la monta, y getters en vez de valores para leer siempre lo VIVO.
 *
 * **Se recalcula en vivo** (decisión 3 de la lámina): `result` es un `$derived` de `reviewRecord`
 * sobre el registro y los bloques que hay EN PANTALLA (`getRecord`/`getBlocks`), guardados o no —
 * corregir la descripción quita su aviso en el acto. Lo que sí se LEE del servidor (páginas,
 * redirecciones, fichas de medios) se carga con `loadReviewData` al abrir, tras cada guardado
 * (`getReloadToken` cambia) y con «Volver a comprobar» (`reload()`). Mientras no hay datos,
 * `reviewRecord` ya marca enlaces e imágenes como `skipped`; la interfaz distingue «comprobando»
 * (`phase === 'loading'`) de «no comprobado» (`skipped` con la carga ya hecha).
 *
 * **Fallo de carga** (`phase === 'error'`): `loadReviewData` solo rechaza si no puede leer los
 * bloques del registro (ver su cabecera). SEO no depende de esa lectura y se sigue enseñando; la
 * interfaz pinta el error con «Reintentar» (lámina 1.7 / 2.4) en el sitio de enlaces e imágenes.
 *
 * **Cuándo hay revisión** (`enabled`): el tipo tiene `statusField` (sin estado no se publica nada:
 * Etiquetas, Redirecciones) Y le aplica alguna comprobación (`applicableChecks`). Sin eso no se
 * carga nada ni se pinta tarjeta (decisión 8).
 *
 * **Medios tras «Describir la imagen…»**: `updateMedia(item)` sustituye la ficha en el mapa cargado
 * sin volver a leer nada, así el aviso desaparece de la tarjeta en cuanto `MediaDetail` guarda.
 *
 * Una carga que llega tarde (otro registro, otra recarga posterior) se descarta por generación,
 * mismo criterio que `RequestSequencer`: nunca pisa el resultado de la petición más reciente.
 */

import { untrack } from 'svelte';
import type { VegaAppContext } from '$lib/app-context';
import type { RecordId, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import type { MediaItemView } from '$lib/media/media-item';
import type { ResolvedContentType } from '$lib/model/types';
import { loadReviewData, type ReviewData } from './load-review-data';
import {
	applicableChecks,
	reviewRecord,
	type ReviewGroup,
	type ReviewResult
} from './publish-review';

export type ReviewPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface ReviewStateOptions {
	ctx: Pick<VegaAppContext, 'port' | 'model'>;
	/** Capturado una vez: quien monta la revisión se remonta si cambia de tipo. */
	type: ResolvedContentType;
	/** Id del registro revisado, `''` en creación (todavía sin id) y `null` si no hay nada que
	 *  revisar. Es lo ÚNICO del registro que dispara una recarga: los valores van aparte. */
	getRecordId: () => RecordId | null;
	/** El registro con los valores EN PANTALLA (en el formulario, `current`). Se lee en cada
	 *  recálculo, nunca para decidir una recarga. */
	getRecord: () => VegaRecord | null;
	/** Los bloques en pantalla, guardados o no (`[]` sin bloques). `null` = no se sabe todavía
	 *  (la lista no ha cargado): se usan los que leyó `loadReviewData`. */
	getBlocks: () => readonly VegaRecord[] | null;
	/** Un número que cambia cuando toca releer páginas, redirecciones y medios (p. ej. tras cada
	 *  guardado). El cambio de registro (`getRecord().id`) también relee. */
	getReloadToken: () => number;
}

export interface ReviewState {
	/** Grupos que aplican al tipo, en el orden de la tarjeta. */
	readonly groups: readonly ReviewGroup[];
	/** Hay revisión que enseñar: `statusField` y al menos un grupo. */
	readonly enabled: boolean;
	readonly phase: ReviewPhase;
	/** Recalculado en vivo con lo que hay en pantalla (ver cabecera). */
	readonly result: ReviewResult;
	/** Motivo del último fallo de carga, o `null`. */
	readonly errorMessage: string | null;
	/** Hay algo que decir antes de publicar: avisos, algo sin comprobar, carga en curso o fallida. */
	readonly needsAttention: boolean;
	/** Vuelve a leer páginas, redirecciones y medios («Volver a comprobar», «Reintentar»). */
	reload(): Promise<void>;
	/** Sustituye una ficha de medios ya cargada (tras guardar su alt en `MediaDetail`). */
	updateMedia(item: MediaItemView): void;
}

/** Construye el estado de la revisión de UN registro. Llamar SÍNCRONAMENTE en la inicialización
 *  de quien lo monta (lleva un `$effect`, como `createBlocksState`). */
export function createReviewState(options: ReviewStateOptions): ReviewState {
	const { ctx, type, getRecordId, getRecord, getBlocks, getReloadToken } = options;

	const groups = applicableChecks(type, ctx.model);
	const enabled = type.statusField !== null && groups.length > 0;

	let phase = $state<ReviewPhase>('idle');
	let data = $state.raw<ReviewData | null>(null);
	let errorMessage = $state<string | null>(null);
	let generation = 0;

	const result = $derived.by((): ReviewResult => {
		const record = getRecord();
		if (!enabled || record === null) return { findings: [], skipped: [] };
		const loaded = data;
		return reviewRecord({
			type,
			record,
			model: ctx.model,
			blocks: getBlocks() ?? loaded?.blocks ?? [],
			pages: loaded?.pages ?? null,
			redirects: loaded?.redirects ?? null,
			media: loaded?.media ?? null
		});
	});

	async function reload(): Promise<void> {
		const record = getRecord();
		if (!enabled || record === null) return;
		const mine = ++generation;
		phase = 'loading';
		errorMessage = null;
		try {
			const next = await loadReviewData(ctx.port, ctx.model, type, record);
			if (mine !== generation) return;
			data = next;
			phase = 'ready';
		} catch (err) {
			if (mine !== generation) return;
			const vegaErr =
				err instanceof VegaError ? err : VegaError.backend('No se pudo revisar la página', err);
			errorMessage = vegaErr.message;
			phase = 'error';
		}
	}

	// Al abrir, al cambiar de registro y cada vez que quien monta pide releer (tras guardar). Solo
	// el id y el token son dependencias: `reload()` lee los valores del registro, y rastrearlos
	// aquí releería el servidor con cada tecla.
	$effect(() => {
		const id = getRecordId();
		getReloadToken();
		if (!enabled || id === null) return;
		untrack(() => void reload());
	});

	function updateMedia(item: MediaItemView): void {
		if (!data?.media) return;
		// `Map` normal (mismo criterio que `byId` en `blocks-state.svelte.ts`): `data` es
		// `$state.raw` y se sustituye ENTERO, nunca se muta; un `SvelteMap` metería un proxy en
		// cada recálculo sin comprar nada.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ver arriba
		const media = new Map(data.media);
		media.set(item.id, item);
		data = { ...data, media };
	}

	return {
		groups,
		enabled,
		get phase() {
			return phase;
		},
		get result() {
			return result;
		},
		get errorMessage() {
			return errorMessage;
		},
		get needsAttention() {
			return (
				enabled && (phase !== 'ready' || result.findings.length > 0 || result.skipped.length > 0)
			);
		},
		reload,
		updateMedia
	};
}
