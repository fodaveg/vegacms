import { describe, expect, it } from 'vitest';
import type { JsonValue } from '$lib/backend/types';
import type { ResolvedBlockField, ResolvedBlockType } from './types';
import {
	readBlockData,
	resolveBlockDataFields,
	writeBlockData,
	type BlockDataValues
} from './block-data-form';

function field(
	name: string,
	widget: ResolvedBlockField['widget'],
	overrides: Partial<ResolvedBlockField> = {}
): ResolvedBlockField {
	return {
		name,
		label: name,
		widget,
		source: 'data',
		required: false,
		options: null,
		...overrides
	};
}

function blockType(fields: ResolvedBlockField[]): ResolvedBlockType {
	return { name: 'hero', label: 'Portada', icon: null, fields };
}

const allDataWidgets = blockType([
	field('text', 'text', { required: true }),
	field('textarea', 'textarea'),
	field('markdown', 'markdown'),
	field('richtext', 'richtext'),
	field('number', 'number'),
	field('switch', 'switch'),
	field('email', 'email'),
	field('url', 'url'),
	field('datetime', 'datetime'),
	field('select', 'select', { options: ['draft', 'published'] }),
	field('chips', 'chips', { options: ['featured', 'new'] }),
	field('json', 'json'),
	field('image', 'relation', { source: 'record', required: true })
]);

describe('resolveBlockDataFields', () => {
	it('sintetiza cada widget de data y excluye las columnas source=record', () => {
		const resolved = resolveBlockDataFields(allDataWidgets);

		expect(
			resolved.map(({ name, widget, subtype, schema }) => ({
				name,
				widget,
				subtype,
				type: schema.type,
				multiple: schema.type === 'select' ? schema.multiple : undefined,
				options: schema.type === 'select' ? schema.options : undefined
			}))
		).toEqual([
			{ name: 'text', widget: 'text', subtype: 'plain', type: 'text' },
			{ name: 'textarea', widget: 'textarea', subtype: 'plain', type: 'text' },
			{ name: 'markdown', widget: 'markdown', subtype: 'markdown', type: 'text' },
			{ name: 'richtext', widget: 'richtext', subtype: 'html', type: 'richtext' },
			{ name: 'number', widget: 'number', subtype: null, type: 'number' },
			{ name: 'switch', widget: 'switch', subtype: null, type: 'bool' },
			{ name: 'email', widget: 'email', subtype: null, type: 'email' },
			{ name: 'url', widget: 'url', subtype: null, type: 'url' },
			{ name: 'datetime', widget: 'datetime', subtype: null, type: 'date' },
			{
				name: 'select',
				widget: 'select',
				subtype: null,
				type: 'select',
				multiple: false,
				options: ['draft', 'published']
			},
			{
				name: 'chips',
				widget: 'chips',
				subtype: null,
				type: 'select',
				multiple: true,
				options: ['featured', 'new']
			},
			{ name: 'json', widget: 'json', subtype: null, type: 'json' }
		]);
		expect(resolved[0]).toMatchObject({
			name: 'text',
			label: 'text',
			help: null,
			placeholder: null,
			hidden: false,
			group: null,
			listable: false,
			schema: {
				name: 'text',
				required: true,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			}
		});
	});
});

describe('readBlockData / writeBlockData — tolerancia a evolución del tipo', () => {
	it('1. conserva intacta una clave histórica durante el ciclo leer → escribir', () => {
		const type = blockType([field('title', 'text')]);
		const original = {
			title: 'Antes',
			retired: { nested: ['valor', { version: 1 }] }
		};
		const values = readBlockData(type, original);
		values.title = 'Después';

		const written = writeBlockData(type, original, values);

		expect(written).toEqual({
			title: 'Después',
			retired: { nested: ['valor', { version: 1 }] }
		});
		expect(JSON.stringify(written.retired)).toBe(JSON.stringify(original.retired));
	});

	it('2. usa el default declarado y, si falta, la tabla de vacíos de normalizeFieldValue', () => {
		const declaredDefault = { nested: ['starter'] };
		const type = blockType([
			field('title', 'text', { default: 'Título inicial' }),
			field('visible', 'switch'),
			field('score', 'number'),
			field('publishedAt', 'datetime'),
			field('tone', 'select', { options: ['light', 'dark'] }),
			field('tags', 'chips', { options: ['new'] }),
			field('config', 'json', { default: declaredDefault })
		]);

		expect(readBlockData(type, {})).toEqual({
			title: 'Título inicial',
			visible: false,
			score: null,
			publishedAt: null,
			tone: null,
			tags: [],
			config: { nested: ['starter'] }
		});
	});

	it.each([undefined, null, [], 'legacy', 42])(
		'3. data no-objeto devuelve defaults sin lanzar (%j)',
		(data) => {
			const type = blockType([
				field('title', 'text', { default: 'Inicial' }),
				field('enabled', 'switch')
			]);

			expect(() => readBlockData(type, data)).not.toThrow();
			expect(readBlockData(type, data)).toEqual({ title: 'Inicial', enabled: false });
		}
	);

	it('4. conserva valores guardados cuya forma ya no coincide con el widget', () => {
		const type = blockType([field('tags', 'chips'), field('score', 'number')]);
		const legacy = {
			tags: 'antes-era-texto',
			score: { raw: 'antes-era-json' }
		};

		const values = readBlockData(type, legacy);

		expect(values).toEqual(legacy);
		expect(writeBlockData(type, legacy, values)).toEqual(legacy);
	});

	it('5. excluye source=record del adaptador, la lectura y la escritura de data', () => {
		const type = blockType([
			field('title', 'text'),
			field('image', 'relation', { source: 'record', required: true })
		]);
		const data = { title: 'Hola', image: 'asset-antiguo', unknown: 'se conserva' };
		const values = {
			...readBlockData(type, data),
			image: 'asset-nuevo'
		} as BlockDataValues;

		expect(resolveBlockDataFields(type).map(({ name }) => name)).toEqual(['title']);
		expect(readBlockData(type, data)).toEqual({ title: 'Hola' });
		expect(writeBlockData(type, data, values)).toEqual({
			title: 'Hola',
			unknown: 'se conserva'
		});
	});

	it('6. clona en profundidad data, defaults y valores escritos para mantener el baseline inmutable', () => {
		const dataNested = { sections: [{ title: 'Persistido' }] };
		const defaultNested = { sections: [{ title: 'Default' }] };
		const type = blockType([
			field('config', 'json'),
			field('fallback', 'json', { default: defaultNested })
		]);

		const values = readBlockData(type, { config: dataNested });
		(values.config as { sections: Array<{ title: string }> }).sections[0].title = 'Editado';
		(values.fallback as { sections: Array<{ title: string }> }).sections[0].title = 'Editado';

		expect(dataNested.sections[0].title).toBe('Persistido');
		expect(defaultNested.sections[0].title).toBe('Default');

		const written = writeBlockData(type, { config: dataNested }, values);
		(values.config as { sections: Array<{ title: string }> }).sections[0].title = 'Otra edición';
		expect((written.config as { sections: Array<{ title: string }> }).sections[0].title).toBe(
			'Editado'
		);
	});

	it('protege claves especiales sin alterar el prototipo del resultado', () => {
		const type = blockType([field('__proto__', 'json')]);
		const data = JSON.parse('{"__proto__":{"polluted":true},"legacy":"ok"}') as Record<
			string,
			JsonValue
		>;
		const values = readBlockData(type, data);

		expect(Object.hasOwn(values, '__proto__')).toBe(true);
		const written = writeBlockData(type, data, values);
		expect(Object.hasOwn(written, '__proto__')).toBe(true);
		expect(Object.getPrototypeOf(written)).toBe(Object.prototype);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});
});
