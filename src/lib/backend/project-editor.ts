/** Identity bindings for Vega-owned schema templates; arbitrary PocketBase rules stay literal. */
import { COMMON_COLLECTION_RULE_KEYS, type CollectionSpec } from './collections';
import { VegaError } from './errors';
import type { BackendPort } from './port';

export const DEFAULT_EDITOR_AUTH_COLLECTION = 'vega_editors';

export function projectEditorAuthCollection(
	port: Pick<BackendPort, 'editorAuthCollection'>
): string {
	const name = port.editorAuthCollection ?? DEFAULT_EDITOR_AUTH_COLLECTION;
	if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
		throw VegaError.backend('La colección editorial del proyecto no es válida.');
	}
	return name;
}

/** Opt-in provenance belongs to the template, not to matching text or a collection name. */
export function resolveProjectEditorCollection(
	spec: CollectionSpec,
	port: Pick<BackendPort, 'editorAuthCollection'>
): CollectionSpec {
	if (!spec.projectEditorRules) return spec;
	const name = projectEditorAuthCollection(port);
	if (name === DEFAULT_EDITOR_AUTH_COLLECTION) return spec;
	const resolved = { ...spec };
	const binding = '@request.auth.collectionName = "vega_editors"';
	const identity = `(@request.auth.collectionName = "${name}" && @request.auth.id != "")`;
	for (const key of COMMON_COLLECTION_RULE_KEYS) {
		const rule = spec[key];
		if (typeof rule === 'string') resolved[key] = rule.replaceAll(binding, identity);
	}
	return resolved;
}

/** A custom editor identity must already exist; schema bootstrap never creates/adopts its auth. */
export async function assertProjectEditorAuth(port: BackendPort): Promise<void> {
	if (projectEditorAuthCollection(port) === DEFAULT_EDITOR_AUTH_COLLECTION) return;
	if (!port.assertEditorAuthCollection) {
		throw VegaError.backend('No se puede comprobar la colección editorial del proyecto.');
	}
	await port.assertEditorAuthCollection();
}
