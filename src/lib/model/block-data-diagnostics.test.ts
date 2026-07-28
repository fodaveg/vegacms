import { describe, expect, it } from 'vitest';
import type { ResolvedBlockField, ResolvedBlockType } from './types';
import { diagnoseBlockDataKeys } from './block-data-diagnostics';

function field(name: string, source: ResolvedBlockField['source'] = 'data'): ResolvedBlockField {
	return {
		name,
		label: name,
		widget: source === 'record' ? 'relation' : 'text',
		source,
		required: false,
		options: null
	};
}

function blockType(fields: ResolvedBlockField[]): ResolvedBlockType {
	return { name: 'hero', label: 'Portada', icon: null, fields };
}

describe('diagnoseBlockDataKeys', () => {
	it('separa reclamadas, ensombrecidas y huérfanas con su clave y valor', () => {
		const title = field('title');
		const image = field('image', 'record');
		const type = blockType([title, image]);

		expect(
			diagnoseBlockDataKeys(type, {
				title: 'Visible',
				image: { id: 'asset-histórico' },
				retired: ['valor', 2]
			})
		).toEqual([
			{ status: 'claimed', key: 'title', value: 'Visible', field: title },
			{
				status: 'shadowed',
				key: 'image',
				value: { id: 'asset-histórico' },
				field: image
			},
			{ status: 'orphaned', key: 'retired', value: ['valor', 2] }
		]);
	});

	it.each([undefined, null, [], 'legacy', 42])(
		'devuelve vacío y no lanza para data no-objeto (%j)',
		(data) => {
			const type = blockType([field('title')]);
			expect(() => diagnoseBlockDataKeys(type, data)).not.toThrow();
			expect(diagnoseBlockDataKeys(type, data)).toEqual([]);
		}
	);

	it('no inventa un hallazgo para un campo record cuya clave no existe en data', () => {
		const type = blockType([field('title'), field('image', 'record')]);

		expect(diagnoseBlockDataKeys(type, { title: 'Visible' })).toEqual([
			{
				status: 'claimed',
				key: 'title',
				value: 'Visible',
				field: type.fields[0]
			}
		]);
	});

	it('clasifica claves especiales como propiedades propias sin contaminar prototipos', () => {
		const protoField = field('__proto__', 'record');
		const data = JSON.parse(
			'{"__proto__":{"polluted":true},"constructor":"histórico","toString":"huérfano"}'
		);

		const diagnostics = diagnoseBlockDataKeys(blockType([protoField]), data);

		expect(diagnostics).toEqual([
			{
				status: 'shadowed',
				key: '__proto__',
				value: { polluted: true },
				field: protoField
			},
			{ status: 'orphaned', key: 'constructor', value: 'histórico' },
			{ status: 'orphaned', key: 'toString', value: 'huérfano' }
		]);
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	});

	it('cuenta valores ensombrecidos null y cadena vacía porque la clave existe', () => {
		const empty = field('empty', 'record');
		const missing = field('missing', 'record');
		const nothing = field('nothing', 'record');

		expect(
			diagnoseBlockDataKeys(blockType([empty, missing, nothing]), {
				empty: '',
				nothing: null
			})
		).toEqual([
			{ status: 'shadowed', key: 'empty', value: '', field: empty },
			{ status: 'shadowed', key: 'nothing', value: null, field: nothing }
		]);
	});

	it('clona los valores reportados para que el diagnóstico no comparta referencias con data', () => {
		const original = { nested: [{ value: 'histórico' }] };
		const diagnostics = diagnoseBlockDataKeys(blockType([]), { retired: original });
		const reported = diagnostics[0]?.value as { nested: Array<{ value: string }> };

		reported.nested[0].value = 'mutado';

		expect(original.nested[0].value).toBe('histórico');
	});
});
