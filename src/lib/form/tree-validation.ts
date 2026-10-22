/** Guarda de cliente: relectura antes de cada envío, incluida la opción Guardar igualmente. */
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';
import type { FormInputValues } from './dirty';
import { VegaError } from '$lib/backend/errors';
import { loadTreeRecords } from '$lib/tree/load';
import { validateTreeMove } from '$lib/tree/records';

export interface TreeValidationContext {
	port: Pick<BackendPort, 'list'>;
	id: string | null;
	message: (
		key: 'cycle' | 'too-deep' | 'missing-parent' | 'unavailable',
		maxDepth: number
	) => string;
}

/** Un fallo de lectura bloquea el envío: no se promete una integridad que no se ha comprobado. */
export async function validateTreeBeforeSave(
	type: ResolvedContentType,
	values: FormInputValues,
	context?: TreeValidationContext
): Promise<void> {
	if (!type.tree) return;
	const { parentField, maxDepth } = type.tree;
	const reject = (reason: 'cycle' | 'too-deep' | 'missing-parent' | 'unavailable'): never => {
		throw VegaError.validation({
			[parentField]: {
				code: `vega_tree_${reason}`,
				message:
					context?.message(reason, maxDepth) ?? 'No se ha podido comprobar el árbol, reintenta.'
			}
		});
	};
	if (!context) reject('unavailable');
	let records;
	try {
		records = await loadTreeRecords(context!.port, type.name, [parentField]);
	} catch (error) {
		if (error instanceof VegaError && error.kind === 'auth-expired') throw error;
		reject('unavailable');
	}
	const raw = values[parentField];
	const problem = validateTreeMove(
		records!,
		context!.id ?? '__vega_new_record__',
		typeof raw === 'string' && raw !== '' ? raw : null,
		type.tree
	);
	if (problem) reject(problem);
}
