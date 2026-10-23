/** Formas admitidas por `thumbField`: fichero local o un único salto a Medios. */
import type { Field } from '$lib/backend/types';

type SchemaType = { name: string; fields: readonly Field[] };
type FileField = Extract<Field, { type: 'file' }>;
export type RelationThumbSource =
	| { kind: 'file'; field: FileField }
	| { kind: 'media'; field: Extract<Field, { type: 'relation' }>; file: FileField };

/** No interpreta rutas ni encadena relaciones: el nombre siempre designa una columna real. */
export function relationThumbSource(
	name: string | null | undefined,
	fields: readonly Field[],
	types: readonly SchemaType[]
): RelationThumbSource | null {
	if (!name || name.includes('.')) return null;
	const field = fields.find((candidate) => candidate.name === name);
	if (field?.type === 'file') return { kind: 'file', field };
	if (field?.type !== 'relation' || field.multiple || field.target !== 'vega_media') return null;
	const file = types
		.find((type) => type.name === 'vega_media')
		?.fields.find((f) => f.name === 'file');
	return file?.type === 'file' && !file.multiple ? { kind: 'media', field, file } : null;
}
