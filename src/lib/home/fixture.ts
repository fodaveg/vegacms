/**
 * Modelo de mentira para los tests de la portada: lo justo de `ContentModel` que leen los módulos
 * de `$lib/home`. No es código de producto.
 */

import type { Field } from '$lib/backend/types';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';

const ALL = { list: true, view: true, create: true, update: true, delete: true };

export function field(name: string, schema: Partial<Field> & { type: Field['type'] }) {
	return { name, label: name, schema: { name, ...schema } };
}

const STATUS = field('status', {
	type: 'select',
	multiple: false,
	options: ['draft', 'published']
} as never);

/** Un tipo con título y, salvo que se pida otra cosa, sin estado ni descripción. */
export function type(
	name: string,
	overrides: Partial<Record<keyof ResolvedContentType, unknown>> = {}
): ResolvedContentType {
	const withStatus = overrides.statusField === 'status';
	const fields = [
		field('title', { type: 'text' } as never),
		...(withStatus ? [STATUS] : []),
		...((overrides.fields as ReturnType<typeof field>[] | undefined) ?? [])
	];
	return {
		name,
		label: `${name}s`,
		labelSingular: name,
		hidden: false,
		singleton: false,
		readonly: false,
		titleField: 'title',
		statusField: null,
		statusLabels: null,
		publishAtField: null,
		social: null,
		blocks: null,
		...overrides,
		permissions: { ...ALL, ...((overrides.permissions as object | undefined) ?? {}) },
		fields,
		schema: { name, fields: fields.map((item) => item.schema) }
	} as unknown as ResolvedContentType;
}

/** Modelo con `types`; el menú lleva, en ese orden, los que no están ocultos. */
export function model(
	types: ResolvedContentType[],
	extra: Partial<Record<keyof ContentModel, unknown>> = {}
): ContentModel {
	return {
		types,
		nav: {
			groups: [
				{
					label: null,
					items: types
						.filter((item) => !item.hidden)
						.map((item) => ({
							kind: 'collection',
							type: item.name,
							label: item.label,
							icon: null,
							singleton: item.singleton,
							readonly: item.readonly
						}))
				}
			]
		},
		...extra
	} as unknown as ContentModel;
}
