/**
 * `withRevisions(port)` (`#lote-integridad`, Fase B §3): decorador de `BackendPort` que guarda la
 * PRE-IMAGEN de cada `update` en `vega_revisions`, ANTES de dejar pasar la escritura real. Se
 * aplica en `session/backend.ts#createInstance()` envolviendo **las dos ramas** (memoria y
 * pocketbase), exactamente como ya hacen ahí `wrapMemoryPortForDemo`/`withEditorCapabilities` —
 * ese es el precedente que justifica "decorador, no una llamada repartida en cada sitio que
 * guarda" (§3 del contrato: hoy hay ≥4 caminos que escriben, un quinto que olvide el enganche
 * reabriría el fallo que este lote existe para cerrar).
 *
 * **Fase B1**: solo `update` está cableado. El gancho de `delete` (§3, exclusión y coste
 * IDÉNTICOS, `kind:'delete'`) queda preparado en `captureUpdateSnapshot`/`pruneAfterSnapshot`
 * —ambas funciones ya son genéricas en `kind`— pero el objeto devuelto NO sobreescribe
 * `port.delete`: el spread `...port` deja pasar el `delete` original tal cual, sin snapshot. Fase
 * B2 solo tiene que añadir un `delete` propio al objeto de retorno que llame a
 * `captureSnapshot('delete', …)` ANTES de `port.delete(...)`, mismo orden que `update` aquí abajo.
 *
 * **INVARIANTE 2 (§4): un fallo de snapshot NUNCA rompe la escritura.** Toda la maquinaria de
 * snapshot vive dentro de `try/catch` que nunca relanza — si `port.get` (pre-imagen), `port.create`
 * (guardar la revisión) o la lectura del manifiesto fallan, `update()` sigue delegando en el
 * puerto interno exactamente como si `withRevisions` no existiera.
 *
 * **Latch de disponibilidad (§6)**: sin él, un proyecto sin `vega_revisions` dispara un
 * `not-found` en CADA escritura (una llamada de red perdida por operación, para siempre). Se
 * cachea en `revisionsUnavailable`, una variable de closure — SOLO se marca `true` cuando el
 * `create` contra `vega_revisions` (no el `get` de la pre-imagen, que puede fallar por motivos
 * ajenos a la colección) rechaza con `VegaError('not-found')`. `resetRevisionsLatch(port)`
 * (exportada) la resetea desde fuera vía un `WeakMap` de closures keyed por el PUERTO YA
 * decorado — el propio `BackendPort` no tiene hueco para exponer esto en su interfaz pública, y
 * añadir un método nuevo a `BackendPort` para un detalle interno de este decorador sería
 * ensanchar el contrato del puerto por un problema que es solo suyo. `session/backend.ts` no
 * necesita saberlo: solo pasa el puerto ya construido a `resetRevisionsLatch` cuando toca
 * (bootstrap desde Ajustes, `reloadModel()`).
 *
 * **Config de retención, leída del manifiesto — SIN pasar por `model/`**: `enabled`/
 * `keepPerRecord`/`trashDays` viven en `revisions.*` del manifiesto (`ResolvedRevisionsConfig`,
 * `model/types.ts`), pero este decorador vive una capa por DEBAJO de P2 (se construye en
 * `session/backend.ts`, antes de que exista ningún `ContentModel` resuelto) y P2 se apoya en P1,
 * nunca al revés — así que aquí se hace una lectura TOLERANTE mínima y propia del registro `vega`
 * crudo (`fetchRevisionsConfig`/`parseRevisionsConfig`), con los mismos defaults que
 * `resolveRevisions` (`model/resolve.ts`) pero sin compartir código con él (misma frontera de capa
 * que ya separa `record-label.ts` de `model/conventions.ts#resolveTitleField`, ver su cabecera).
 * Esta lectura se CACHEA (`configPromise`, single-flight) tras el primer uso: sin caché, cada
 * escritura pagaría un `list('vega', …)` extra además de su `get`+`create`, incumpliendo el coste
 * documentado en §5 ("1 get extra + 1 create", nada más). El caché se resetea con el mismo
 * `resetRevisionsLatch` que la disponibilidad — un cambio de retención en Ajustes debe verse en la
 * siguiente escritura, no arrastrar la config vieja hasta la próxima recarga completa.
 *
 * **Exclusiones (§3)**, todas comprobadas en `shouldSnapshot` antes de tocar la red:
 * 1. `vega_revisions` sobre sí misma (recursión infinita).
 * 2. Reservadas `vega`/`vega_*` EXCEPTO `vega_media` (plomería interna de Vega, no contenido de
 *    usuario — `vega_media` es la única excepción, es contenido real). Un único
 *    `isReservedCollectionName(type) && type !== 'vega_media'` cubre TAMBIÉN la exclusión 1 (
 *    `'vega_revisions'.startsWith('vega_')` es reservado y no es `vega_media`), así que no hace
 *    falta comprobarla aparte.
 * 3. `create`: no hay pre-imagen que guardar — `withRevisions` ni siquiera sobreescribe `create`.
 * 4. Latch de disponibilidad activo.
 * 5. `revisions.enabled === false` en el manifiesto.
 */

import type { BackendPort } from '$lib/backend/port';
import type { RecordId, RecordInput, VegaRecord } from '$lib/backend/types';
import { VEGA_COLLECTION, isReservedCollectionName } from '$lib/backend/collections';
import { VegaError } from '$lib/backend/errors';
import { MAX_PER_PAGE } from '$lib/backend/query';
import { VEGA_REVISIONS_COLLECTION } from './revisions-collection';
import { guessRecordLabel } from './record-label';
import {
	DEFAULT_KEEP_PER_RECORD,
	DEFAULT_TRASH_RETENTION_DAYS,
	selectUpdateRevisionsToPrune,
	type RevisionPruneCandidate
} from './retention';

/** Nombre del campo `json` del registro `vega` (P2 §6.1): duplicado a propósito — mismo criterio
 *  que `settings/+page.svelte`/`model/load.ts` (cada capa que necesita leer el manifiesto crudo
 *  fija su propia copia de esta constante, ver cabecera del módulo para el porqué de la capa). */
const MANIFEST_FIELD = 'manifest';

interface RevisionsManifestConfig {
	enabled: boolean;
	keepPerRecord: number;
	trashDays: number;
}

const DEFAULT_REVISIONS_MANIFEST_CONFIG: RevisionsManifestConfig = {
	enabled: true,
	keepPerRecord: DEFAULT_KEEP_PER_RECORD,
	trashDays: DEFAULT_TRASH_RETENTION_DAYS
};

/** Lectura TOLERANTE de `manifest.revisions` (ver cabecera): cualquier forma inesperada degrada
 *  campo a campo a su default, nunca invalida las otras dos claves. */
function parseRevisionsConfig(raw: unknown): RevisionsManifestConfig {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return DEFAULT_REVISIONS_MANIFEST_CONFIG;
	}
	const obj = raw as Record<string, unknown>;
	const revisionsRaw = obj.revisions;
	if (typeof revisionsRaw !== 'object' || revisionsRaw === null || Array.isArray(revisionsRaw)) {
		return DEFAULT_REVISIONS_MANIFEST_CONFIG;
	}
	const r = revisionsRaw as Record<string, unknown>;
	const enabled = typeof r.enabled === 'boolean' ? r.enabled : true;
	const keepPerRecord =
		typeof r.keepPerRecord === 'number' && Number.isInteger(r.keepPerRecord) && r.keepPerRecord >= 0
			? r.keepPerRecord
			: DEFAULT_KEEP_PER_RECORD;
	const trashDays =
		typeof r.trashDays === 'number' && Number.isInteger(r.trashDays) && r.trashDays >= 0
			? r.trashDays
			: DEFAULT_TRASH_RETENTION_DAYS;
	return { enabled, keepPerRecord, trashDays };
}

/** `list('vega', { perPage: 1 })` sin filtrar por `key` (simplificación deliberada frente a
 *  `manifestRecordQuery`/`listManifestRecords` de `model/load.ts`, que sí filtran por
 *  `port.manifestKey` cuando el campo existe): esta lectura es un CACHÉ de mejor esfuerzo para un
 *  detalle de retención, no la fuente de verdad que se reescribe — con 0 o 1 registros de `vega`
 *  (el caso de prácticamente cualquier proyecto real) el resultado es idéntico; el caso raro de
 *  varios registros `vega` con distinto `key` podría leer uno que no es el canónico, degradación
 *  aceptable para un valor puramente cosmético (cuántas versiones conservar). Cualquier fallo
 *  (red, `vega` inexistente, forbidden) cae a los defaults — NUNCA bloquea una escritura por no
 *  poder leer configuración. */
async function fetchRevisionsConfig(port: BackendPort): Promise<RevisionsManifestConfig> {
	try {
		const page = await port.list(VEGA_COLLECTION.name, { perPage: 1 });
		return parseRevisionsConfig(page.items[0]?.values[MANIFEST_FIELD]);
	} catch {
		return DEFAULT_REVISIONS_MANIFEST_CONFIG;
	}
}

/** Reset de la latch/caché de un puerto YA decorado (ver cabecera): no-op silencioso si `port` no
 *  fue construido por `withRevisions` (nunca debería pasar en producción, pero es más seguro que
 *  lanzar por un detalle de mantenimiento). */
const resetHooks = new WeakMap<BackendPort, () => void>();

export function resetRevisionsLatch(port: BackendPort): void {
	resetHooks.get(port)?.();
}

/**
 * Poda fire-and-forget de `kind:'update'` para UN `(collection, recordId)` (§7): se dispara tras
 * cada snapshot de éxito, nunca se espera desde `update()` y traga cualquier error — un fallo de
 * poda es, como mucho, unas cuantas versiones de más en el historial, jamás un motivo para
 * romper nada aguas arriba. `perPage: MAX_PER_PAGE` (200): de sobra para el caso normal
 * (`keepPerRecord` por defecto 20); si algún registro acumulara más de 200 versiones por un fallo
 * de poda repetido, esta pasada simplemente no vería las más antiguas — se autocorrige solo en
 * las siguientes escrituras.
 */
async function pruneUpdateRevisions(
	port: BackendPort,
	collection: string,
	recordId: RecordId,
	keepPerRecord: number
): Promise<void> {
	try {
		const page = await port.list(VEGA_REVISIONS_COLLECTION.name, {
			filter: {
				kind: 'group',
				combinator: 'and',
				nodes: [
					{ kind: 'cond', field: 'collection', op: 'eq', value: collection },
					{ kind: 'cond', field: 'recordId', op: 'eq', value: recordId },
					{ kind: 'cond', field: 'kind', op: 'eq', value: 'update' }
				]
			},
			sort: [{ field: 'created', dir: 'desc' }],
			perPage: MAX_PER_PAGE
		});
		const candidates: RevisionPruneCandidate[] = page.items.map((item) => ({
			id: item.id,
			kind: 'update',
			created: typeof item.values.created === 'string' ? item.values.created : ''
		}));
		const toPrune = selectUpdateRevisionsToPrune(candidates, keepPerRecord);
		for (const id of toPrune) {
			await port.delete(VEGA_REVISIONS_COLLECTION.name, id).catch(() => {});
		}
	} catch {
		// Fire-and-forget (§7): nunca debe afectar a nada fuera de esta función.
	}
}

/**
 * Envuelve `port` con el snapshot de `update` (Fase B1, ver cabecera). El orden dentro de
 * `update()` es el invariante que fija el test dedicado (§3): el snapshot se completa (con éxito
 * o en silencio) ANTES de delegar en `port.update`.
 */
export function withRevisions(port: BackendPort): BackendPort {
	/** Latch (§6): solo se marca desde el `catch` del `create` contra `vega_revisions`. */
	let revisionsUnavailable = false;
	/** Caché single-flight de la config de retención (ver cabecera): `null` = sin cargar/reseteada. */
	let configPromise: Promise<RevisionsManifestConfig> | null = null;

	function loadConfig(): Promise<RevisionsManifestConfig> {
		if (!configPromise) configPromise = fetchRevisionsConfig(port);
		return configPromise;
	}

	function shouldSnapshot(type: string): boolean {
		if (revisionsUnavailable) return false;
		if (isReservedCollectionName(type) && type !== 'vega_media') return false;
		return true;
	}

	/**
	 * Snapshot genérico por `kind` (ver cabecera: listo para que Fase B2 lo reutilice con
	 * `'delete'`). `preValues` YA es la pre-imagen leída por el llamador — para `update` es
	 * `port.get(type, id)` ANTES de la escritura; para un futuro `delete` sería el mismo `get`
	 * ANTES de borrar (§3: "el snapshot va SIEMPRE antes de la operación").
	 */
	async function captureSnapshot(
		kind: 'update' | 'delete',
		type: string,
		id: RecordId,
		preValues: VegaRecord['values']
	): Promise<void> {
		const input: RecordInput = {
			collection: type,
			recordId: id,
			kind,
			values: preValues,
			label: guessRecordLabel(preValues, id),
			author: port.currentSession()?.user.email ?? ''
		};
		await port.create(VEGA_REVISIONS_COLLECTION.name, input);
	}

	async function snapshotBeforeUpdate(type: string, id: RecordId): Promise<void> {
		if (!shouldSnapshot(type)) return;

		let config: RevisionsManifestConfig;
		try {
			config = await loadConfig();
		} catch {
			return; // defensivo: `fetchRevisionsConfig` ya no debería rechazar, pero nunca romper por esto
		}
		if (!config.enabled) return;

		let pre: VegaRecord;
		try {
			pre = await port.get(type, id);
		} catch {
			return; // sin pre-imagen que guardar (§4): la escritura sigue su curso igual
		}

		try {
			await captureSnapshot('update', type, id, pre.values);
		} catch (err) {
			if (err instanceof VegaError && err.kind === 'not-found') revisionsUnavailable = true;
			return; // §4: un fallo de snapshot NUNCA rompe la escritura
		}

		void pruneUpdateRevisions(port, type, id, config.keepPerRecord);
	}

	const wrapped: BackendPort = {
		...port,
		async update(type, id, data) {
			await snapshotBeforeUpdate(type, id);
			return port.update(type, id, data);
		}
	};

	resetHooks.set(wrapped, () => {
		revisionsUnavailable = false;
		configPromise = null;
	});

	return wrapped;
}
