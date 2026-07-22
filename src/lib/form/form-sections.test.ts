/**
 * Suite de `buildFormSections` (§4.9/§4.9b del contrato P2): agrupación de campos por
 * `fieldGroups` en el orden efectivo, huérfanos (L11, un `group` que no aparece en
 * `fieldGroups` cae en una sección final sin cabecera en vez de desaparecer) y `columns` por
 * grupo (rejilla responsive de `RecordForm.svelte`, §4.9b). Fixtures a mano, mismo estilo que
 * `form-model.test.ts`.
 */
import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField, ResolvedFieldGroup } from '$lib/model/types';
import { buildFormSections } from './form-sections';

function makeField(name: string, group: string | null = null): ResolvedField {
	const schema: Field = {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	return {
		schema,
		name,
		label: name,
		help: null,
		placeholder: null,
		hidden: false,
		group,
		widget: 'text',
		subtype: 'plain',
		listable: false
	};
}

function makeType(fields: ResolvedField[], fieldGroups: ResolvedFieldGroup[]): ResolvedContentType {
	return {
		schema: { name: 'post', readonly: false, fields: fields.map((f) => f.schema) },
		name: 'post',
		label: 'Post',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		readonly: false,
		titleField: null,
		orderField: null,
		statusField: null,
		previewUrl: null,
		fields,
		listFields: [],
		fieldGroups
	};
}

describe('buildFormSections (§4.9/§4.9b)', () => {
	test('grupo anónimo único (sin fieldGroups declarado) → una sección con todos los campos, columns 1', () => {
		const fields = [makeField('title'), makeField('body')];
		const type = makeType(fields, [{ name: null, columns: 1 }]);
		expect(buildFormSections(type)).toEqual([{ group: null, columns: 1, fields }]);
	});

	test('un grupo con columns: 2 produce una sección con esas columnas (feature "campos emparejados")', () => {
		const titleEs = makeField('titleEs', 'Título');
		const titleEn = makeField('titleEn', 'Título');
		const type = makeType([titleEs, titleEn], [{ name: 'Título', columns: 2 }]);
		expect(buildFormSections(type)).toEqual([
			{ group: 'Título', columns: 2, fields: [titleEs, titleEn] }
		]);
	});

	test('campo huérfano (group no declarado en fieldGroups, L11) cae en una sección final sin cabecera, columns 1', () => {
		const declared = makeField('title', 'Contenido');
		const orphan = makeField('legacy', 'GrupoFantasma');
		const type = makeType([declared, orphan], [{ name: 'Contenido', columns: 3 }]);
		expect(buildFormSections(type)).toEqual([
			{ group: 'Contenido', columns: 3, fields: [declared] },
			{ group: null, columns: 1, fields: [orphan] }
		]);
	});

	test('campos hidden no se renderizan, aunque el override venga del manifiesto', () => {
		const visible = makeField('image', 'Contenido');
		const hiddenGrouped = { ...makeField('filename', 'Contenido'), hidden: true };
		const hiddenOrphan = { ...makeField('legacy', 'GrupoFantasma'), hidden: true };
		const type = makeType(
			[hiddenGrouped, visible, hiddenOrphan],
			[{ name: 'Contenido', columns: 1 }]
		);

		expect(buildFormSections(type)).toEqual([
			{ group: 'Contenido', columns: 1, fields: [visible] }
		]);
	});

	test('grupo declarado sin ningún campo real → sección con fields: [] (RecordForm la omite en el render)', () => {
		const type = makeType([], [{ name: 'Vacío', columns: 2 }]);
		expect(buildFormSections(type)).toEqual([{ group: 'Vacío', columns: 2, fields: [] }]);
	});
});
