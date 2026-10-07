/** Estado mutable privado que comparten las operaciones de una instancia `memory`. */

import type { ContentType, Field, FieldValue, RecordEvent, RecordId } from '../../types';
import type {
	CollectionRule,
	CollectionRuleKey,
	CollectionRules,
	CollectionSpec,
	CollectionType
} from '../../collections';
import { AUTH_COLLECTION_RULE_KEYS, COMMON_COLLECTION_RULE_KEYS } from '../../collections';
import { normalizeFieldValue } from '../../normalize';
import { VEGA_EDITORS_COLLECTION_NAME } from '../../administration';
import { MemoryFileStore } from './files';
import type { MemorySeed } from './seed';

export interface MemoryCollectionSnapshot {
	name: string;
	type: CollectionType | 'view';
	rules: CollectionRules;
	fieldNames: string[];
}

export interface MemoryState {
	readonly seed: MemorySeed | undefined;
	readonly contentTypesByName: Map<string, ContentType>;
	readonly collectionsByName: Map<string, MemoryCollectionSnapshot>;
	readonly records: Map<string, Map<RecordId, Record<string, FieldValue>>>;
	readonly fileStore: MemoryFileStore;
	readonly listeners: Map<string, Set<(event: RecordEvent) => void>>;
}

/** Siembra una sola instancia; las colecciones auth no aparecen como `ContentType`. */
export function createMemoryState(seed?: MemorySeed): MemoryState {
	// Mapa mutable: `ensureCollections` añade tipos después de construir la instancia.
	const contentTypesByName = new Map<string, ContentType>();
	for (const ct of seed?.contentTypes ?? []) contentTypesByName.set(ct.name, ct);

	// Las colecciones auth existen e idempotizan por nombre, pero siguen invisibles como tipos.
	const collectionsByName = new Map<string, MemoryCollectionSnapshot>();
	for (const ct of seed?.contentTypes ?? []) {
		collectionsByName.set(ct.name, {
			name: ct.name,
			type: ct.readonly ? 'view' : 'base',
			rules: Object.fromEntries(COMMON_COLLECTION_RULE_KEYS.map((key) => [key, null])),
			fieldNames: ct.fields.map((field) => field.name)
		});
	}
	if (seed?.editors) {
		collectionsByName.set(
			VEGA_EDITORS_COLLECTION_NAME,
			collectionSpecToMemorySnapshot({
				name: VEGA_EDITORS_COLLECTION_NAME,
				type: 'auth',
				fields: [{ name: 'created', type: 'autodate' }]
			})
		);
	}

	const records = new Map<string, Map<RecordId, Record<string, FieldValue>>>();
	for (const ct of contentTypesByName.values()) {
		const byId = new Map<RecordId, Record<string, FieldValue>>();
		for (const seeded of seed?.records[ct.name] ?? []) {
			byId.set(seeded.id, buildNormalizedValues(ct.fields, seeded.values));
		}
		records.set(ct.name, byId);
	}

	// Precarga los ficheros reales antes de que una FileRef sembrada pueda resolverse.
	const fileStore = new MemoryFileStore();
	for (const [ref, stored] of Object.entries(seed?.files ?? {})) {
		fileStore.preload(ref, stored.name, stored.mime, stored.dataUri);
	}
	return { seed, contentTypesByName, collectionsByName, records, fileStore, listeners: new Map() };
}

/** La instantánea de bootstrap conserva las reglas auth aunque no haya registros auth. */
export function collectionSpecToMemorySnapshot(spec: CollectionSpec): MemoryCollectionSnapshot {
	const type = spec.type ?? 'base';
	const keys =
		type === 'auth'
			? [...COMMON_COLLECTION_RULE_KEYS, ...AUTH_COLLECTION_RULE_KEYS]
			: COMMON_COLLECTION_RULE_KEYS;
	const rules: CollectionRules = {};
	for (const key of keys) {
		rules[key] = Object.prototype.hasOwnProperty.call(spec, key)
			? (spec as unknown as Record<CollectionRuleKey, CollectionRule>)[key]
			: type === 'auth' && key === 'authRule'
				? ''
				: null;
	}
	return {
		name: spec.name,
		type,
		rules,
		fieldNames: spec.fields.map((field) => field.name)
	};
}

function buildNormalizedValues(
	fields: Field[],
	raw: Record<string, FieldValue>
): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	for (const field of fields) out[field.name] = normalizeFieldValue(field, raw[field.name]);
	return out;
}
