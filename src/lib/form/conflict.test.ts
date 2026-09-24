/**
 * `conflict.ts`: el diff a tres bandas del aviso de edición concurrente y "lo tocado" que envía
 * «Guardar igualmente» en un bloque tipado. Puro, sin montar nada.
 */
import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import { readBlockData, writeBlockData } from '$lib/model/block-data-form';
import type { ResolvedBlockType } from '$lib/model/types';
import { threeWayDiff, toComparableValues, touchedBlockData } from './conflict';

function text(name: string, readonly = false): Field {
	return {
		name,
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly,
		presentable: false,
		hidden: false,
		unique: false
	};
}

const FIELDS: Field[] = [
	text('title'),
	text('summary'),
	text('cover'),
	text('body'),
	text('updated', true)
];

describe('threeWayDiff', () => {
	test('reparte cada campo en su banda y dice cómo quedará si se guarda igualmente', () => {
		const base = {
			title: 'Sobre mí',
			summary: 'Diseño web',
			cover: '',
			body: 'igual',
			updated: 'a'
		};
		const mine = {
			title: 'Sobre mí',
			summary: 'Tomates',
			cover: 'retrato.webp',
			body: 'igual',
			updated: 'a'
		};
		const server = {
			title: 'Sobre mí y este cuaderno',
			summary: 'Escribo sobre PocketBase',
			cover: '',
			body: 'igual',
			updated: 'b'
		};

		expect(threeWayDiff(FIELDS, base, mine, server)).toEqual([
			// Solo el servidor: de lo que viste a lo suyo, que se CONSERVA.
			{ field: 'title', scope: 'server', before: 'Sobre mí', after: 'Sobre mí y este cuaderno' },
			// Los dos: de lo del servidor a lo tuyo (lo del otro se pierde).
			{ field: 'summary', scope: 'both', before: 'Escribo sobre PocketBase', after: 'Tomates' },
			// Solo tú.
			{ field: 'cover', scope: 'mine', before: '', after: 'retrato.webp' }
		]);
	});

	test('los readonly (autodate) nunca salen, aunque sean lo único que cambió', () => {
		const base = { title: 'x', updated: 'a' };
		expect(threeWayDiff(FIELDS, base, base, { ...base, updated: 'b' })).toEqual([]);
	});

	test('si los dos llegasteis al MISMO valor, no hay nada que decidir', () => {
		const base = { title: 'viejo' };
		expect(threeWayDiff(FIELDS, base, { title: 'nuevo' }, { title: 'nuevo' })).toEqual([]);
	});
});

describe('toComparableValues', () => {
	test('una subida pendiente se compara y se pinta por su nombre, no como objeto vacío', () => {
		const file = new File(['x'], 'retrato.webp', { type: 'image/webp' });
		expect(
			toComparableValues({ cover: file, gallery: ['ya-subida.png', file], title: 't' })
		).toEqual({
			cover: 'retrato.webp',
			gallery: ['ya-subida.png', 'retrato.webp'],
			title: 't'
		});
	});
});

describe('touchedBlockData (lo que «Guardar igualmente» mezcla en `data`)', () => {
	const hero: ResolvedBlockType = {
		name: 'hero',
		label: 'Hero',
		icon: null,
		fields: [
			{
				name: 'title',
				label: 'Título',
				widget: 'text',
				source: 'data',
				default: '',
				required: false,
				options: null
			},
			{
				name: 'body',
				label: 'Texto',
				widget: 'textarea',
				source: 'data',
				default: '',
				required: false,
				options: null
			}
		]
	} satisfies ResolvedBlockType;

	test('solo las claves que difieren de lo que se abrió', () => {
		const baseline = { title: 'Hola', body: 'viejo' };
		const current = { title: 'Hola', body: 'mío' };
		expect(touchedBlockData(baseline, current)).toEqual({ body: 'mío' });
	});

	test('mezclado sobre el `data` del servidor, conserva la clave que cambió el otro', () => {
		const opened = { title: 'Hola', body: 'viejo', legacy: 'se conserva' };
		const baseline = readBlockData(hero, opened);
		const current = { ...baseline, body: 'mío' };
		const server = { title: 'Hola de Ana', body: 'viejo', legacy: 'se conserva' };

		expect(writeBlockData(hero, server, touchedBlockData(baseline, current))).toEqual({
			title: 'Hola de Ana',
			body: 'mío',
			legacy: 'se conserva'
		});
	});
});
