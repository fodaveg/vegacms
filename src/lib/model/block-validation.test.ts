import { describe, expect, it } from 'vitest';
import { PB_VALIDATION_CODES } from '$lib/backend/errors';
import type { ResolvedBlockType } from './types';
import { validateBlockData } from './block-validation';

const hero: ResolvedBlockType = {
	name: 'hero',
	label: 'Portada',
	icon: null,
	fields: [
		{
			name: 'title',
			label: 'Título',
			widget: 'text',
			source: 'data',
			required: true,
			options: null
		},
		{
			name: 'tone',
			label: 'Tono',
			widget: 'select',
			source: 'data',
			required: false,
			options: ['light', 'dark']
		},
		{
			name: 'tags',
			label: 'Etiquetas',
			widget: 'chips',
			source: 'data',
			required: true,
			options: ['new', 'featured']
		}
	]
};

describe('validateBlockData', () => {
	it('acepta los campos requeridos y las opciones declaradas', () => {
		expect(
			validateBlockData(hero, {
				title: 'Hola',
				tone: 'dark',
				tags: ['new', 'featured']
			})
		).toEqual({ byField: {}, record: null });
	});

	it('usa la misma forma y código estable para required', () => {
		expect(validateBlockData(hero, { title: '', tone: null, tags: [] })).toEqual({
			byField: {
				title: {
					code: PB_VALIDATION_CODES.required,
					message: 'Este campo es obligatorio',
					known: true
				},
				tags: {
					code: PB_VALIDATION_CODES.required,
					message: 'Este campo es obligatorio',
					known: true
				}
			},
			record: null
		});
	});

	it('rechaza valores de select y chips fuera de sus opciones', () => {
		const result = validateBlockData(hero, {
			title: 'Hola',
			tone: 'sepia',
			tags: ['new', 'archived']
		});

		expect(result.record).toBeNull();
		expect(result.byField.tone?.code).toBe(PB_VALIDATION_CODES.selectInvalid);
		expect(result.byField.tags?.code).toBe(PB_VALIDATION_CODES.selectInvalid);
	});

	it('no valida options ausentes ni valores opcionales vacíos', () => {
		const freeform: ResolvedBlockType = {
			...hero,
			fields: [
				{
					name: 'body',
					label: 'Texto',
					widget: 'text',
					source: 'data',
					required: false,
					options: null
				},
				{
					name: 'tone',
					label: 'Tono',
					widget: 'select',
					source: 'data',
					required: false,
					options: ['light']
				}
			]
		};

		expect(validateBlockData(freeform, { body: 42, tone: '' })).toEqual({
			byField: {},
			record: null
		});
	});

	it('tolera claves históricas y detecta el campo requerido que las sustituyó', () => {
		const renamed: ResolvedBlockType = {
			...hero,
			fields: [
				{
					name: 'heading',
					label: 'Título',
					widget: 'text',
					source: 'data',
					required: true,
					options: null
				}
			]
		};
		const data = { title: 'Nombre anterior', futureKey: { preserved: true } };

		expect(validateBlockData(renamed, data).byField.heading?.code).toBe(
			PB_VALIDATION_CODES.required
		);
		expect(data).toEqual({ title: 'Nombre anterior', futureKey: { preserved: true } });
	});

	it.each([null, 'texto', [], 42])('degrada data no-objeto sin lanzar (%j)', (data) => {
		expect(() => validateBlockData(hero, data)).not.toThrow();
		expect(validateBlockData(hero, data)).toEqual({
			byField: {},
			record: {
				code: PB_VALIDATION_CODES.selectInvalid,
				message: 'Los datos del bloque deben ser un objeto JSON',
				known: true
			}
		});
	});

	it('degrada un tipo eliminado sin intentar leer data', () => {
		const explosive = Object.defineProperty({}, 'title', {
			get() {
				throw new Error('no debería leerse');
			}
		});

		expect(() => validateBlockData(undefined, explosive)).not.toThrow();
		expect(validateBlockData(undefined, explosive).record).toEqual({
			code: PB_VALIDATION_CODES.selectInvalid,
			message: 'El tipo de bloque ya no existe en el manifiesto',
			known: true
		});
	});

	it('no confunde propiedades heredadas con campos presentes', () => {
		const adversarial: ResolvedBlockType = {
			...hero,
			fields: [
				{
					name: 'toString',
					label: 'Texto',
					widget: 'text',
					source: 'data',
					required: true,
					options: null
				}
			]
		};

		expect(validateBlockData(adversarial, {}).byField['toString']?.code).toBe(
			PB_VALIDATION_CODES.required
		);
	});

	it('devuelve __proto__ como error enumerable sin alterar el acumulador', () => {
		const adversarial: ResolvedBlockType = {
			...hero,
			fields: [
				{
					name: '__proto__',
					label: 'Prototipo',
					widget: 'text',
					source: 'data',
					required: true,
					options: null
				}
			]
		};
		const result = validateBlockData(adversarial, JSON.parse('{"__proto__":null}'));

		expect(Object.hasOwn(result.byField, '__proto__')).toBe(true);
		expect(result.byField.__proto__?.code).toBe(PB_VALIDATION_CODES.required);
		expect(Object.keys(result.byField)).toEqual(['__proto__']);
	});

	it('deja los campos source=record a la validación real de PocketBase', () => {
		const withRecordField: ResolvedBlockType = {
			...hero,
			fields: [
				{
					name: 'image',
					label: 'Imagen',
					widget: 'relation',
					source: 'record',
					required: true,
					options: ['asset-permitido']
				}
			]
		};

		expect(validateBlockData(withRecordField, {})).toEqual({ byField: {}, record: null });
		expect(validateBlockData(withRecordField, { image: 'asset-ajeno' })).toEqual({
			byField: {},
			record: null
		});
	});
});
