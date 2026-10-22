/** Agrupado de presentación: conserva todas las filas originales y nunca mezcla identidades. */
import type { ResolvedContentType } from '$lib/model/types';
import type { ActivityEntry } from './activity-collection';
export interface ActivityGroup {
	entries: ActivityEntry[];
	kind: 'single' | 'saves' | 'bulk';
}

/** Frase derivada del modelo, sin guardar acciones editoriales redundantes en el servidor. */
export function activityVerb(entry: ActivityEntry, type?: ResolvedContentType): string {
	if (entry.action === 'delete') return 'deleted';
	if (entry.action === 'create') return entry.collection === 'vega_media' ? 'uploaded' : 'created';
	const status = entry.changes.find((change) => change.field === type?.statusField);
	if (status?.to === 'published') return 'published';
	if (status?.from === 'published' && status.to !== 'published') return 'unpublished';
	if (type?.orderField && entry.changes.length === 1 && entry.changes[0].field === type.orderField)
		return 'reordered';
	return 'edited';
}

function sameActor(a: ActivityEntry, b: ActivityEntry): boolean {
	return a.actorId === b.actorId && a.actorCollection === b.actorCollection;
}

/** Primero agrupa guardados cercanos; después pliega rachas de más de tres registros distintos. */
export function groupActivity(entries: readonly ActivityEntry[]): ActivityGroup[] {
	const saves: ActivityGroup[] = [];
	for (const entry of entries) {
		const last = saves.at(-1);
		const previous = last?.entries.at(-1);
		if (
			last &&
			previous &&
			entry.action === 'update' &&
			previous.action === 'update' &&
			sameActor(entry, previous) &&
			entry.collection === previous.collection &&
			entry.recordId === previous.recordId &&
			entry.created.slice(0, 10) === previous.created.slice(0, 10) &&
			Math.abs(Date.parse(previous.created) - Date.parse(entry.created)) < 600000
		) {
			last.entries.push(entry);
			last.kind = 'saves';
		} else saves.push({ entries: [entry], kind: 'single' });
	}
	const groups: ActivityGroup[] = [];
	for (let i = 0; i < saves.length;) {
		let end = i + 1;
		const first = saves[i].entries[0];
		while (end < saves.length) {
			const candidate = saves[end].entries[0];
			if (
				!sameActor(first, candidate) ||
				candidate.action !== first.action ||
				candidate.collection !== first.collection ||
				candidate.created.slice(0, 10) !== first.created.slice(0, 10)
			)
				break;
			end++;
		}
		if (end - i > 3)
			groups.push({ kind: 'bulk', entries: saves.slice(i, end).flatMap((group) => group.entries) });
		else groups.push(...saves.slice(i, end));
		i = end;
	}
	return groups;
}
