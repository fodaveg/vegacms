/** Colección interna del hook; el cliente solo comprueba su forma, nunca la crea. */
import type { ContentType, VegaRecord } from '$lib/backend/types';

export const ACTIVITY_COLLECTION = 'vega_activity';
export const ACTIVITY_FIELDS = [
	'action',
	'collection',
	'recordId',
	'label',
	'actorId',
	'actorCollection',
	'actorEmail',
	'changes',
	'created'
] as const;

/** El esquema descubierto debe conservar tipos, campos obligatorios y reglas cerradas. */
export function hasActivityCollection(types: readonly ContentType[]): boolean {
	const type = types.find((type) => type.name === ACTIVITY_COLLECTION);
	return (
		!!type &&
		!type.readonly &&
		ACTIVITY_FIELDS.every((name) => {
			const field = type.fields.find((field) => field.name === name);
			return (
				!!field &&
				field.type === (name === 'created' ? 'date' : name === 'changes' ? 'json' : 'text') &&
				(!['action', 'collection', 'recordId', 'actorId', 'actorCollection'].includes(name) ||
					field.required) &&
				(name !== 'created' || field.readonly)
			);
		}) &&
		!!type.access &&
		(['list', 'view', 'create', 'update', 'delete'] as const).every(
			(key) => type.access?.[key] === 'denied'
		)
	);
}

export interface ActivityChange {
	field: string;
	from?: string | string[] | boolean;
	to?: string | string[] | boolean;
}
export interface ActivityEntry {
	id: string;
	action: 'create' | 'update' | 'delete';
	collection: string;
	recordId: string;
	label: string;
	actorId: string;
	actorCollection: string;
	actorEmail: string;
	created: string;
	changes: ActivityChange[];
}

/** Valores externos: una acción desconocida nunca se convierte en una frase engañosa. */
export function parseActivity(record: VegaRecord): ActivityEntry | null {
	const v = record.values;
	if (
		typeof v.action !== 'string' ||
		!['create', 'update', 'delete'].includes(v.action) ||
		!['collection', 'recordId', 'actorId', 'actorCollection', 'created'].every(
			(key) => typeof v[key] === 'string' && v[key]
		) ||
		!Number.isFinite(Date.parse(String(v.created)))
	)
		return null;
	const changes: ActivityChange[] = [];
	if (Array.isArray(v.changes))
		for (const raw of v.changes.slice(0, 50)) {
			if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.field !== 'string')
				continue;
			const change: ActivityChange = { field: raw.field.slice(0, 200) };
			for (const key of ['from', 'to'] as const) {
				const value = raw[key];
				if (
					typeof value === 'boolean' ||
					typeof value === 'string' ||
					(Array.isArray(value) && value.every((item) => typeof item === 'string'))
				)
					change[key] = value;
			}
			changes.push(change);
		}
	return {
		id: record.id,
		action: v.action as ActivityEntry['action'],
		collection: String(v.collection),
		recordId: String(v.recordId),
		actorId: String(v.actorId),
		actorCollection: String(v.actorCollection),
		created: String(v.created),
		label: typeof v.label === 'string' ? v.label.slice(0, 200) : '',
		actorEmail: typeof v.actorEmail === 'string' ? v.actorEmail : '',
		changes
	};
}
