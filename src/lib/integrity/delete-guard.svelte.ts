/**
 * Estado reactivo del aviso de referencias ANTES de borrar (`#lote-integridad`, Fase A): mismo
 * patrón que `$lib/list/list-state.svelte.ts`/`media-list-state.svelte.ts` (runas Svelte 5 +
 * `RequestSequencer` para el anti-carrera), reutilizado por `DeleteConfirm.svelte` (registros) y
 * `MediaDeleteConfirm.svelte` (assets) — la única diferencia entre los dos es el `target` que le
 * pasan a `check()`.
 *
 * **`needsExplicitConfirm`** (§3 del contrato: "exige una confirmación explícita adicional"):
 * `true` en cuanto la comprobación terminó con algo que mostrar (alguna referencia real, o un
 * degradado parcial que no permite descartarlas) — el llamador lo usa para exigir un checkbox
 * extra antes de habilitar el botón destructivo. `false` mientras se está comprobando o si falló
 * del todo: **nunca bloquea** (§3: "si la comprobación de referencias falla, el borrado sigue
 * siendo posible… nunca se queda la persona encerrada") — un fallo total degrada a `'error'` y
 * el llamador pinta el aviso de "no se pudo comprobar" sin añadir ninguna fricción nueva.
 */

import type { VegaAppContext } from '$lib/app-context';
import { RequestSequencer } from '$lib/list/list-load';
import { findReferences, type FindReferencesTarget, type ReferencesReport } from './references';

export type DeleteGuardStatus =
	| { kind: 'idle' }
	| { kind: 'loading' }
	| { kind: 'ready'; report: ReferencesReport }
	| { kind: 'error' };

export interface DeleteReferencesGuard {
	readonly status: DeleteGuardStatus;
	/** Ver cabecera del módulo: gatea el checkbox de confirmación adicional del llamador. */
	readonly needsExplicitConfirm: boolean;
	/** Dispara la comprobación para `target`. Anti-carrera (`RequestSequencer`, mismo criterio que
	 *  el resto de estados de carga del repo): una respuesta que ya no es la última emitida se
	 *  descarta sin pisar `status`. */
	check(ctx: VegaAppContext, target: FindReferencesTarget): void;
	/** Vuelve a `'idle'` (el diálogo se cerró/cambió de objetivo): la próxima apertura arranca
	 *  limpia, nunca arrastra el resultado del registro anterior. */
	reset(): void;
}

/** Construye un `DeleteReferencesGuard` vacío (arranca en `'idle'`, sin comprobación en vuelo). */
export function createDeleteReferencesGuard(): DeleteReferencesGuard {
	let status = $state<DeleteGuardStatus>({ kind: 'idle' });
	const sequencer = new RequestSequencer();

	function check(ctx: VegaAppContext, target: FindReferencesTarget): void {
		const seq = sequencer.next();
		status = { kind: 'loading' };
		void (async () => {
			try {
				// Mismo criterio que `UsedInPanel`: `ctx.model.types` ya tiene el esquema completo
				// (P2, mismo cardinal que `listContentTypes()`, L6) — sin volver a tocar la red.
				const types = ctx.model.types.map((t) => t.schema);
				const report = await findReferences(types, target, ctx.port.list);
				if (!sequencer.isLatest(seq)) return;
				status = { kind: 'ready', report };
			} catch {
				// Defensivo (ver cabecera de `findReferences`): el motor aísla el fallo POR
				// COLECCIÓN y no debería rechazar nunca. Un fallo inesperado aquí NUNCA bloquea el
				// borrado (ver cabecera del módulo): solo cambia el aviso que pinta el llamador.
				if (!sequencer.isLatest(seq)) return;
				status = { kind: 'error' };
			}
		})();
	}

	function reset(): void {
		status = { kind: 'idle' };
	}

	return {
		get status() {
			return status;
		},
		get needsExplicitConfirm() {
			return status.kind === 'ready' && (status.report.groups.length > 0 || status.report.partial);
		},
		check,
		reset
	};
}
