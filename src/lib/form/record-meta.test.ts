/**
 * Tests unitarios de `record-meta.ts` (tarjeta "Registro" del aside + semilla de "último
 * guardado"): lo que importa aquí es la REGLA de honestidad — un campo llamado `created`/`updated`
 * solo cuenta como metadato de procedencia si además es `date` + `readonly` (un autodate de
 * verdad), nunca por el nombre a secas.
 */

import { describe, expect, test } from 'vitest';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { Field } from '$lib/backend/types';
import type { ResolvedContentType, ResolvedField } from '$lib/model/types';
import { autodateField, autodateInstant, autodateText } from '$lib/form/record-meta';

function dateField(name: string, readonly: boolean): ResolvedField {
	const schema: Field = {
		name,
		type: 'date',
		required: false,
		readonly,
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
		group: null,
		widget: 'datetime',
		subtype: null,
		listable: true
	};
}

function textField(name: string): ResolvedField {
	const schema: Field = {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: true,
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
		group: null,
		widget: 'text',
		subtype: 'plain',
		listable: true
	};
}

function makeType(fields: ResolvedField[]): ResolvedContentType {
	return {
		schema: { name: 'post', readonly: false, fields: fields.map((f) => f.schema) },
		name: 'post',
		label: 'Post',
		labelSingular: 'Post',
		icon: null,
		hidden: false,
		group: null,
		singleton: false,
		permissions: ALL_PERMISSIONS,
		readonly: false,
		titleField: null,
		subtitleField: null,
		slugField: null,
		orderField: null,
		defaultSort: null,
		statusField: null,
		statusLabels: null,
		previewUrl: null,
		fields,
		listFields: [],
		fieldGroups: [{ name: null, columns: 1, placement: 'main' }],
		editorRail: false,
		localization: null
	};
}

const NOW = Date.parse('2026-07-24T12:00:00.000Z');

describe('autodateField', () => {
	test('un `date` readonly llamado `updated` ES el autodate', () => {
		const type = makeType([dateField('updated', true)]);
		expect(autodateField(type, 'updated')?.name).toBe('updated');
	});

	test('un `date` EDITABLE llamado `updated` NO cuenta (campo de dominio, no procedencia)', () => {
		const type = makeType([dateField('updated', false)]);
		expect(autodateField(type, 'updated')).toBeNull();
	});

	test('un campo readonly llamado `created` pero que no es `date` NO cuenta', () => {
		const type = makeType([textField('created')]);
		expect(autodateField(type, 'created')).toBeNull();
	});

	test('un tipo sin el campo devuelve null', () => {
		expect(autodateField(makeType([]), 'created')).toBeNull();
	});
});

describe('autodateInstant', () => {
	test('valor ISO parseable → Date', () => {
		const type = makeType([dateField('created', true)]);
		const instant = autodateInstant(type, { created: '2026-07-19T18:42:00.000Z' }, 'created');
		expect(instant?.toISOString()).toBe('2026-07-19T18:42:00.000Z');
	});

	test('valor ausente, no-string o no parseable → null (nunca una fecha inventada)', () => {
		const type = makeType([dateField('created', true)]);
		expect(autodateInstant(type, {}, 'created')).toBeNull();
		expect(autodateInstant(type, { created: 42 }, 'created')).toBeNull();
		expect(autodateInstant(type, { created: 'no-es-fecha' }, 'created')).toBeNull();
	});
});

describe('autodateText', () => {
	// Los esperados se COMPUTAN con `Intl` (mismo criterio que `cell.test.ts`): hardcodear el
	// literal ataría el test a la versión de ICU del runtime.
	test('menos de una semana → relativo (mockup "hace 1 min")', () => {
		const type = makeType([dateField('updated', true)]);
		const text = autodateText(type, { updated: '2026-07-24T11:59:00.000Z' }, 'updated', 'es', NOW);
		expect(text).toBe(new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(-1, 'minute'));
	});

	test('más de una semana → fecha absoluta localizada', () => {
		const type = makeType([dateField('created', true)]);
		const iso = '2026-06-01T10:00:00.000Z';
		const text = autodateText(type, { created: iso }, 'created', 'es', NOW);
		expect(text).toBe(new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(iso)));
	});

	test('sin campo autodate, o con valor vacío, no se pinta fila', () => {
		expect(autodateText(makeType([]), {}, 'created', 'es', NOW)).toBeNull();
		const type = makeType([dateField('created', true)]);
		expect(autodateText(type, { created: '' }, 'created', 'es', NOW)).toBeNull();
	});
});
