/** Reordenación de hermanas: relee el árbol, nunca modifica la madre y comparte el cálculo de orden. */
import type { BackendPort } from '$lib/backend/port';
import type { ResolvedContentType } from '$lib/model/types';
import { computeSpanReorder } from '$lib/list/reorder';
import { loadTreeRecords } from './load';
import { flattenTree } from './records';

export async function moveTreeSibling(
	port: BackendPort,
	type: ResolvedContentType,
	id: string,
	direction: -1 | 1
): Promise<void> {
	if (!type.tree || !type.orderField || !type.permissions.update) return;
	const records = await loadTreeRecords(port, type.name);
	const rows = flattenTree(records, type.tree, type.orderField);
	const row = rows.find((item) => item.record.id === id);
	if (!row || row.problem) return;
	const siblings = rows.filter((item) => item.parentId === row.parentId && !item.problem);
	const index = siblings.findIndex((item) => item.record.id === id);
	const target = index + direction;
	if (target < 0 || target >= siblings.length) return;
	const values = Object.fromEntries(
		siblings.map((item) => [
			item.record.id,
			typeof item.record.values[type.orderField!] === 'number'
				? (item.record.values[type.orderField!] as number)
				: 0
		])
	);
	for (const update of computeSpanReorder(
		siblings.map((item) => item.record.id),
		values,
		index,
		target
	)) {
		await port.update(
			type.name,
			update.id,
			{ [type.orderField]: update.value },
			{ orderOnlyField: type.orderField }
		);
	}
}
