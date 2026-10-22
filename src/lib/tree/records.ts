/** Recorridos iterativos de árboles editoriales; datos importados con ciclos nunca cuelgan la UI. */
import type { VegaRecord } from '$lib/backend/types';
import type { FilterNode } from '$lib/backend/query';
import type { ResolvedTreeConfig } from '$lib/model/types';

export type TreeProblem = 'cycle' | 'too-deep' | 'missing-parent';
export interface TreeRow {
	record: VegaRecord;
	parentId: string | null;
	depth: number;
	problem: TreeProblem | null;
}

/** Las relaciones simples normalizadas vacías son null; admite también el vacío crudo de PB. */
export function parentId(record: VegaRecord, field: string): string | null {
	const value = record.values[field];
	return typeof value === 'string' && value !== '' ? value : null;
}

/** Incluye la propia fila y sus descendientes, una sola vez incluso con ciclos. */
export function treeBranchIds(records: VegaRecord[], id: string, parentField: string): Set<string> {
	const children = new Map<string, string[]>();
	for (const record of records) {
		const parent = parentId(record, parentField);
		if (!parent) continue;
		const siblings = children.get(parent) ?? [];
		siblings.push(record.id);
		children.set(parent, siblings);
	}
	const ids = new Set<string>();
	const pending = [id];
	while (pending.length) {
		const next = pending.pop()!;
		if (ids.has(next)) continue;
		ids.add(next);
		pending.push(...(children.get(next) ?? []));
	}
	return ids;
}

/** Verifica la rama propuesta completa: profundidad de sus hojas y toda su nueva ascendencia. */
export function validateTreeMove(
	records: VegaRecord[],
	id: string,
	proposedParent: string | null,
	config: ResolvedTreeConfig
): TreeProblem | null {
	const parents = new Map(
		records.map((record) => [record.id, parentId(record, config.parentField)])
	);
	parents.set(id, proposedParent);
	const branch = treeBranchIds(records, id, config.parentField);
	for (const start of branch) {
		const seen = new Set<string>();
		let current: string | null = start;
		let depth = 0;
		while (current !== null) {
			if (seen.has(current)) return 'cycle';
			if (!parents.has(current)) return 'missing-parent';
			seen.add(current);
			depth += 1;
			current = parents.get(current)!;
		}
		if (depth > config.maxDepth) return 'too-deep';
	}
	return null;
}

/** Filtro AST compartido con el widget de relación, sin sintaxis PocketBase en la UI. */
export function treeParentFilter(
	records: VegaRecord[],
	id: string | null,
	config: ResolvedTreeConfig
): FilterNode | null {
	if (!id) return null;
	const nodes: FilterNode[] = [...treeBranchIds(records, id, config.parentField)].map((value) => ({
		kind: 'cond',
		field: 'id',
		op: 'neq',
		value
	}));
	return { kind: 'group', combinator: 'and', nodes };
}

/** Orden por rama, hermanas por order/id. Datos inválidos se muestran como raíces y se señalan. */
export function flattenTree(
	records: VegaRecord[],
	config: ResolvedTreeConfig,
	orderField: string | null
): TreeRow[] {
	const byId = new Map(records.map((record) => [record.id, record]));
	const rows = new Map<string, TreeRow>();
	for (const record of records) {
		const seen = new Set<string>();
		let cursor: string | null = record.id;
		let problem: TreeProblem | null = null;
		while (cursor !== null) {
			if (seen.has(cursor)) {
				problem = 'cycle';
				break;
			}
			const current = byId.get(cursor);
			if (!current) {
				problem = 'missing-parent';
				break;
			}
			seen.add(cursor);
			cursor = parentId(current, config.parentField);
		}
		if (!problem && seen.size > config.maxDepth) problem = 'too-deep';
		rows.set(record.id, {
			record,
			parentId: problem ? null : parentId(record, config.parentField),
			depth: 1,
			problem
		});
	}
	const children = new Map<string | null, TreeRow[]>();
	for (const row of rows.values()) {
		const siblings = children.get(row.parentId) ?? [];
		siblings.push(row);
		children.set(row.parentId, siblings);
	}
	for (const siblings of children.values())
		siblings.sort((a, b) => {
			const av = orderField ? a.record.values[orderField] : 0;
			const bv = orderField ? b.record.values[orderField] : 0;
			return (
				(typeof av === 'number' ? av : 0) - (typeof bv === 'number' ? bv : 0) ||
				(a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0)
			);
		});
	const result: TreeRow[] = [];
	const pending = [...(children.get(null) ?? [])].reverse();
	while (pending.length) {
		const row = pending.pop()!;
		result.push(row);
		for (const child of [...(children.get(row.record.id) ?? [])].reverse()) {
			child.depth = row.depth + 1;
			pending.push(child);
		}
	}
	return result;
}
