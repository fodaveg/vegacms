/** Lectura tolerante de tree: una decoración inválida no convierte una relación en árbol. */
import type { ContentType, JsonValue } from '$lib/backend/types';
import { isPlainObject } from '$lib/is-plain-object';
import type { ModelWarning, ResolvedTreeConfig } from './types';
import { manifestInvalidKey } from './warnings';

export function resolveTree(
	type: ContentType,
	raw: JsonValue | undefined,
	warnings: ModelWarning[]
): ResolvedTreeConfig | null {
	if (raw === undefined) return null;
	const path = `/collections/${type.name}/tree`;
	if (
		isPlainObject(raw) &&
		typeof raw.parentField === 'string' &&
		typeof raw.maxDepth === 'number' &&
		Number.isInteger(raw.maxDepth) &&
		raw.maxDepth >= 1 &&
		raw.maxDepth <= 10
	) {
		const field = type.fields.find((field) => field.name === raw.parentField);
		if (field?.type === 'relation' && field.target === type.name && !field.multiple) {
			return { parentField: raw.parentField, maxDepth: raw.maxDepth };
		}
	}
	warnings.push(
		manifestInvalidKey(
			path,
			`tree de "${type.name}" requiere una autorrelación simple y maxDepth de 1 a 10; se ignora.`
		)
	);
	return null;
}
