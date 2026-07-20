/**
 * Tests unitarios de las funciones puras de `conventions.ts` (§4 del contrato P2): cascada de
 * título (§4.4), convención de publicación (§4.5), tabla de widget por tipo (§4.2/L9) y el
 * ordenado de grupos+items (§4.9). Fixtures mínimos e inline (no el kitchen-sink completo):
 * cada uno existe solo para aislar una rama concreta del algoritmo.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import type { ModelWarning } from '$lib/model/types';
import {
	defaultListable,
	humanizeLabel,
	isRepresentableField,
	orderByGroups,
	resolveMergedSourceOrderField,
	resolveOrderField,
	resolveStatusField,
	resolveTitleField,
	resolveWidget
} from '$lib/model/conventions';

// ————— §4.8 Humanización —————

describe('humanizeLabel', () => {
	test.each([
		['blog_posts', 'Blog posts'],
		['publishedAt', 'Published at'],
		['a--b__c', 'A b c'],
		['field2Name', 'Field2 name'],
		['already nice', 'Already nice'],
		['', '']
	])('%s -> %s', (raw, expected) => {
		expect(humanizeLabel(raw)).toBe(expected);
	});
});

// ————— §4.4 Cascada de campo-título —————

const textField = (name: string, overrides: Partial<Field> = {}): Field =>
	({
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	}) as Field;

const richtextField = (name: string): Field => ({
	name,
	type: 'richtext',
	subtype: 'html',
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
});

const numberField = (name: string): Field => ({
	name,
	type: 'number',
	integer: false,
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
});

const emailField = (name: string, overrides: Partial<Field> = {}): Field =>
	({
		name,
		type: 'email',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	}) as Field;

describe('resolveTitleField (§4.4)', () => {
	test('manifiesto válido gana a la convención por nombre', () => {
		const warnings: ModelWarning[] = [];
		const fields = [textField('title'), textField('slug')];
		expect(resolveTitleField(fields, 'slug', 'post', warnings)).toBe('slug');
		expect(warnings).toEqual([]);
	});

	test('manifiesto roto (no representable) → warning + sigue la cascada hasta "title"', () => {
		const warnings: ModelWarning[] = [];
		const fields = [textField('title'), richtextField('body')];
		expect(resolveTitleField(fields, 'body', 'post', warnings)).toBe('title');
		expect(warnings).toEqual([
			expect.objectContaining({ code: 'title-field-invalid', collection: 'post' })
		]);
	});

	test('manifiesto apunta a un campo inexistente → warning + sigue la cascada', () => {
		const warnings: ModelWarning[] = [];
		const fields = [textField('title')];
		expect(resolveTitleField(fields, 'does-not-exist', 'post', warnings)).toBe('title');
		expect(warnings[0].code).toBe('title-field-invalid');
	});

	test('sin manifiesto, campo exacto "title" representable', () => {
		expect(resolveTitleField([textField('title'), textField('name')], undefined, 'post', [])).toBe(
			'title'
		);
	});

	test('sin "title", campo exacto "name" representable', () => {
		expect(
			resolveTitleField([numberField('rating'), textField('name')], undefined, 'post', [])
		).toBe('name');
	});

	test('sin "title"/"name", primer campo presentable representable', () => {
		const fields = [numberField('rating'), emailField('headline', { presentable: true })];
		expect(resolveTitleField(fields, undefined, 'post', [])).toBe('headline');
	});

	test('sin "title"/"name"/presentable, primer campo text aunque no sea presentable', () => {
		const fields = [numberField('rating'), textField('note')];
		expect(resolveTitleField(fields, undefined, 'post', [])).toBe('note');
	});

	test('ningún campo representable → null, sin warning', () => {
		const warnings: ModelWarning[] = [];
		expect(resolveTitleField([numberField('rating')], undefined, 'post', warnings)).toBeNull();
		expect(warnings).toEqual([]);
	});

	test('isRepresentableField: text/email/url sí, richtext/number no', () => {
		expect(isRepresentableField(textField('x'))).toBe(true);
		expect(isRepresentableField(emailField('x'))).toBe(true);
		expect(isRepresentableField(richtextField('x'))).toBe(false);
		expect(isRepresentableField(numberField('x'))).toBe(false);
	});
});

// ————— §4.5 Convención de publicación —————

const statusField = (options: string[], overrides: Partial<Field> = {}): Field =>
	({
		name: 'status',
		type: 'select',
		options,
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		...overrides
	}) as Field;

describe('resolveStatusField (§4.5)', () => {
	test('statusField: false desactiva la convención sin buscar nada', () => {
		const warnings: ModelWarning[] = [];
		expect(
			resolveStatusField([statusField(['draft', 'published'])], false, 'post', warnings)
		).toBeNull();
		expect(warnings).toEqual([]);
	});

	test('statusField explícito válido (con opciones extra) gana', () => {
		const fields = [{ ...statusField(['draft', 'published', 'archived']), name: 'estado' }];
		expect(resolveStatusField(fields, 'estado', 'post', [])).toBe('estado');
	});

	test('statusField explícito roto (select multi) → warning + sigue con "status"', () => {
		const warnings: ModelWarning[] = [];
		const fields = [
			{ ...statusField(['draft', 'published']), name: 'estado', multiple: true },
			statusField(['draft', 'published'])
		];
		expect(resolveStatusField(fields, 'estado', 'post', warnings)).toBe('status');
		expect(warnings).toEqual([
			expect.objectContaining({ code: 'status-field-invalid', collection: 'post' })
		]);
	});

	test('statusField explícito roto (faltan opciones) → warning + sigue con "status"', () => {
		const warnings: ModelWarning[] = [];
		const fields = [
			{ ...statusField(['draft']), name: 'estado' },
			statusField(['draft', 'published'])
		];
		expect(resolveStatusField(fields, 'estado', 'post', warnings)).toBe('status');
		expect(warnings[0].code).toBe('status-field-invalid');
	});

	test('convención por nombre "status" sin manifiesto', () => {
		expect(resolveStatusField([statusField(['draft', 'published'])], undefined, 'post', [])).toBe(
			'status'
		);
	});

	test('campo "status" existe pero no cumple → null, SIN warning (no hay intención declarada)', () => {
		const warnings: ModelWarning[] = [];
		expect(resolveStatusField([statusField(['draft'])], undefined, 'post', warnings)).toBeNull();
		expect(warnings).toEqual([]);
	});

	test('sin campo "status" → null', () => {
		expect(resolveStatusField([numberField('rating')], undefined, 'post', [])).toBeNull();
	});
});

// ————— Orden manual (reorder) —————

describe('resolveOrderField', () => {
	test('declarado y numérico → se resuelve, sin warning', () => {
		const warnings: ModelWarning[] = [];
		const fields = [numberField('sort'), textField('title')];
		expect(resolveOrderField(fields, 'sort', 'post', warnings)).toBe('sort');
		expect(warnings).toEqual([]);
	});

	test('declarado pero inexistente → warning + null', () => {
		const warnings: ModelWarning[] = [];
		const fields = [textField('title')];
		expect(resolveOrderField(fields, 'sort', 'post', warnings)).toBeNull();
		expect(warnings).toEqual([
			expect.objectContaining({ code: 'order-field-invalid', collection: 'post' })
		]);
	});

	test('declarado pero no numérico → warning + null', () => {
		const warnings: ModelWarning[] = [];
		const fields = [textField('sort')];
		expect(resolveOrderField(fields, 'sort', 'post', warnings)).toBeNull();
		expect(warnings).toEqual([
			expect.objectContaining({ code: 'order-field-invalid', collection: 'post' })
		]);
	});

	test('ausente → null, SIN warning (a diferencia de statusField, no hay autodetección por nombre)', () => {
		const warnings: ModelWarning[] = [];
		const fields = [numberField('sort'), numberField('order')];
		expect(resolveOrderField(fields, undefined, 'post', warnings)).toBeNull();
		expect(warnings).toEqual([]);
	});
});

// ————— Orden manual per-source de vistas fusionadas (mergedViews, L7a) —————

describe('resolveMergedSourceOrderField', () => {
	const fields = [numberField('rating'), numberField('homeOrder'), textField('title')];

	test('la source declara el suyo → gana sobre el de la vista', () => {
		expect(resolveMergedSourceOrderField(fields, 'homeOrder', 'rating')).toBe('homeOrder');
	});

	test('la source no declara nada → hereda el de la vista', () => {
		expect(resolveMergedSourceOrderField(fields, undefined, 'rating')).toBe('rating');
	});

	test('ninguno de los dos declara nada → null', () => {
		expect(resolveMergedSourceOrderField(fields, undefined, undefined)).toBeNull();
	});

	test('el declarado (source) no existe en la colección → null', () => {
		expect(resolveMergedSourceOrderField(fields, 'no-existe', 'rating')).toBeNull();
	});

	test('el declarado (source) existe pero no es numérico → null', () => {
		expect(resolveMergedSourceOrderField(fields, 'title', 'rating')).toBeNull();
	});

	test('el de la vista no existe/no es numérico y la source no declara nada → null', () => {
		expect(resolveMergedSourceOrderField(fields, undefined, 'title')).toBeNull();
		expect(resolveMergedSourceOrderField(fields, undefined, 'no-existe')).toBeNull();
	});
});

// ————— §4.2 Tabla de widget por tipo (L8/L9) —————

describe('resolveWidget (§4.2, L8, L9)', () => {
	test('text/plain sin override → text/plain', () => {
		expect(resolveWidget(textField('body'), undefined, 'post', [])).toEqual({
			widget: 'text',
			subtype: 'plain'
		});
	});

	test('text/plain + override "textarea" → textarea/plain', () => {
		expect(resolveWidget(textField('body'), 'textarea', 'post', [])).toEqual({
			widget: 'textarea',
			subtype: 'plain'
		});
	});

	test('text/plain + override "markdown" → markdown/markdown (única palanca, L9)', () => {
		expect(resolveWidget(textField('body'), 'markdown', 'post', [])).toEqual({
			widget: 'markdown',
			subtype: 'markdown'
		});
	});

	test('richtext + override "markdown" → widget-incompatible, default intacto', () => {
		const warnings: ModelWarning[] = [];
		expect(resolveWidget(richtextField('content'), 'markdown', 'post', warnings)).toEqual({
			widget: 'richtext',
			subtype: 'html'
		});
		expect(warnings).toEqual([
			expect.objectContaining({ code: 'widget-incompatible', collection: 'post', field: 'content' })
		]);
	});

	test('number + override "textarea" → widget-incompatible, default number', () => {
		const warnings: ModelWarning[] = [];
		expect(resolveWidget(numberField('rating'), 'textarea', 'post', warnings)).toEqual({
			widget: 'number',
			subtype: null
		});
		expect(warnings[0].code).toBe('widget-incompatible');
	});

	test('valor de widget que no es "textarea" ni "markdown" → manifest-invalid-key, no widget-incompatible', () => {
		const warnings: ModelWarning[] = [];
		expect(resolveWidget(textField('body'), 'bogus', 'post', warnings)).toEqual({
			widget: 'text',
			subtype: 'plain'
		});
		expect(warnings[0].code).toBe('manifest-invalid-key');
	});

	test('tabla completa de defaults (sin override) — cada tipo real produce su widget', () => {
		const cases: [Field, string, string | null][] = [
			[textField('t'), 'text', 'plain'],
			[richtextField('r'), 'richtext', 'html'],
			[numberField('n'), 'number', null],
			[
				{
					name: 'b',
					type: 'bool',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'switch',
				null
			],
			[emailField('e'), 'email', null],
			[
				{
					name: 'u',
					type: 'url',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'url',
				null
			],
			[
				{
					name: 'd',
					type: 'date',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'datetime',
				null
			],
			[
				{
					name: 's',
					type: 'select',
					options: ['a'],
					multiple: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'select',
				null
			],
			[
				{
					name: 'sm',
					type: 'select',
					options: ['a'],
					multiple: true,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'chips',
				null
			],
			[
				{
					name: 'rel',
					type: 'relation',
					target: 'x',
					multiple: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'relation',
				null
			],
			[
				{
					name: 'f',
					type: 'file',
					multiple: false,
					protected: false,
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'file',
				null
			],
			[
				{
					name: 'j',
					type: 'json',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'json',
				null
			],
			[
				{
					name: 'x',
					type: 'unsupported',
					backendType: 'geoPoint',
					required: false,
					readonly: false,
					presentable: false,
					hidden: false,
					unique: false
				},
				'unsupported',
				null
			]
		];

		for (const [field, widget, subtype] of cases) {
			expect(resolveWidget(field, undefined, 'post', [])).toEqual({ widget, subtype });
		}
	});
});

// ————— §4.10 Columnas listables —————

describe('defaultListable (§4.10)', () => {
	test('true para text/number/bool/email/url/date/select-single', () => {
		expect(defaultListable(textField('t'))).toBe(true);
		expect(defaultListable(numberField('n'))).toBe(true);
		expect(
			defaultListable({
				name: 's',
				type: 'select',
				options: [],
				multiple: false,
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			})
		).toBe(true);
	});

	test('false para richtext/json/file/relation/select-multi/unsupported', () => {
		expect(defaultListable(richtextField('r'))).toBe(false);
		expect(
			defaultListable({
				name: 'sm',
				type: 'select',
				options: [],
				multiple: true,
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			})
		).toBe(false);
		expect(
			defaultListable({
				name: 'rel',
				type: 'relation',
				target: 'x',
				multiple: false,
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			})
		).toBe(false);
	});
});

// ————— §4.9 Orden y grupos —————

interface Item {
	key: string;
	group: string | null;
	order?: number;
}

describe('orderByGroups (§4.9)', () => {
	test('anónimo primero, luego grupos declarados en orden, luego no declarados alfabético', () => {
		const items: Item[] = [
			{ key: 'z-anon', group: null },
			{ key: 'in-seo', group: 'SEO' },
			{ key: 'in-content', group: 'Contenido' },
			{ key: 'in-zeta', group: 'Zeta' },
			{ key: 'in-alfa', group: 'Alfa' }
		];
		const { groupOrder } = orderByGroups(
			items,
			(i) => i.group,
			(i) => i.order,
			['Contenido', 'SEO']
		);
		expect(groupOrder).toEqual([null, 'Contenido', 'SEO', 'Alfa', 'Zeta']);
	});

	test('sin grupo anónimo, groupOrder no incluye null', () => {
		const items: Item[] = [{ key: 'a', group: 'G' }];
		const { groupOrder } = orderByGroups(
			items,
			(i) => i.group,
			(i) => i.order,
			[]
		);
		expect(groupOrder).toEqual(['G']);
	});

	test('grupos declarados duplicados → una sola entrada, sin items duplicados (lector tolerante, L4)', () => {
		// El lector no aplica el `uniqueItems` del schema (L4), así que un manifiesto con
		// `nav.groups: ["Contenido","Contenido"]` llega con duplicados. `orderByGroups` debe
		// deduplicar preservando el orden de primera aparición y NO duplicar la sección.
		const items: Item[] = [
			{ key: 'a', group: 'Contenido' },
			{ key: 'b', group: 'Contenido' }
		];
		const { groupOrder, orderedItems } = orderByGroups(
			items,
			(i) => i.group,
			(i) => i.order,
			['Contenido', 'Contenido']
		);
		expect(groupOrder).toEqual(['Contenido']);
		expect(orderedItems.map((i) => i.key)).toEqual(['a', 'b']);
	});

	test('dentro de un grupo: order explícito asc primero, empate → orden base, luego el resto en orden base', () => {
		const items: Item[] = [
			{ key: 'base-1', group: null },
			{ key: 'ord-10', group: null, order: 10 },
			{ key: 'base-2', group: null },
			{ key: 'ord-5-a', group: null, order: 5 },
			{ key: 'ord-5-b', group: null, order: 5 } // empate → orden base (aparece antes en items)
		];
		const { orderedItems } = orderByGroups(
			items,
			(i) => i.group,
			(i) => i.order,
			[]
		);
		expect(orderedItems.map((i) => i.key)).toEqual([
			'ord-5-a',
			'ord-5-b',
			'ord-10',
			'base-1',
			'base-2'
		]);
	});
});
