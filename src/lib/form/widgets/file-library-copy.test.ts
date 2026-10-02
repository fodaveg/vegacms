/**
 * Suite de `file-library-copy.ts` (lote 12, lámina 5): cuándo hay biblioteca a la que copiar, qué
 * se copia y a qué se le pide texto, y cómo se casa cada `File` con la `FileRef` que le dio el
 * backend al guardar. Puro, sin montar nada.
 */
import { describe, expect, test } from 'vitest';
import type { ContentType } from '$lib/backend/types';
import type { ResolvedContentType } from '$lib/model/types';
import { ALL_PERMISSIONS } from '$lib/backend/access';
import type { MediaFileFieldSchema } from '$lib/media/media-upload';
import {
	asksForAlt,
	fileRefsOf,
	libraryCopyTarget,
	matchSavedRefs,
	shouldCopyToLibrary
} from './file-library-copy';

const mediaSchema: ContentType = {
	name: 'vega_media',
	readonly: false,
	fields: [
		{
			name: 'file',
			type: 'file',
			multiple: false,
			protected: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false,
			maxSizeBytes: 1000,
			mimeTypes: ['image/png', 'image/jpeg', 'application/pdf']
		}
	]
};

function resolved(schema: ContentType, permissions = ALL_PERMISSIONS): ResolvedContentType {
	return { schema, name: schema.name, permissions } as unknown as ResolvedContentType;
}

const file = (name: string, type: string, size = 10): File =>
	new File([new Uint8Array(size)], name, { type });

describe('libraryCopyTarget', () => {
	test('sin `vega_media` en el modelo no hay destino', () => {
		expect(libraryCopyTarget([resolved({ ...mediaSchema, name: 'posts' })])).toBeNull();
	});

	test('sin permiso de crear en Medios no hay destino: ni texto ni copia', () => {
		expect(
			libraryCopyTarget([resolved(mediaSchema, { ...ALL_PERMISSIONS, create: false })])
		).toBeNull();
	});

	test('con la biblioteca y permiso devuelve su campo `file` descubierto', () => {
		const target = libraryCopyTarget([resolved(mediaSchema)]);
		expect(target?.name).toBe('file');
		expect(target?.maxSizeBytes).toBe(1000);
	});
});

describe('shouldCopyToLibrary / asksForAlt', () => {
	const schema = libraryCopyTarget([resolved(mediaSchema)]) as MediaFileFieldSchema;

	test('una imagen admitida se copia y pide texto, aunque supere el tope (se reduce antes)', () => {
		const big = file('foto.png', 'image/png', 5000);
		expect(shouldCopyToLibrary(schema, big)).toBe(true);
		expect(asksForAlt(schema, big)).toBe(true);
	});

	test('un fichero que no es imagen se copia sin pedir texto', () => {
		const pdf = file('calendario.pdf', 'application/pdf');
		expect(shouldCopyToLibrary(schema, pdf)).toBe(true);
		expect(asksForAlt(schema, pdf)).toBe(false);
	});

	test('un tipo que la biblioteca no admite no se copia ni pide texto', () => {
		const svg = file('logo.svg', 'image/svg+xml');
		expect(shouldCopyToLibrary(schema, svg)).toBe(false);
		expect(asksForAlt(schema, svg)).toBe(false);
	});
});

describe('fileRefsOf', () => {
	test('single, múltiple, vacío y nulo', () => {
		expect(fileRefsOf('a.png')).toEqual(['a.png']);
		expect(fileRefsOf(['a.png', 'b.pdf'])).toEqual(['a.png', 'b.pdf']);
		expect(fileRefsOf('')).toEqual([]);
		expect(fileRefsOf(null)).toEqual([]);
		expect(fileRefsOf(undefined)).toEqual([]);
	});
});

describe('matchSavedRefs', () => {
	test('single: el único File casa con la única ref nueva', () => {
		const f = file('foto.png', 'image/png');
		expect(matchSavedRefs([f], 'abc_foto.png')).toEqual(new Map([[f, 'abc_foto.png']]));
	});

	test('múltiple: las refs que no estaban antes casan en orden con los File pendientes', () => {
		const f1 = file('uno.png', 'image/png');
		const f2 = file('dos.png', 'image/png');
		const before = ['vieja.png', f1, f2];
		const saved = ['vieja.png', 'x_uno.png', 'y_dos.png'];
		expect(matchSavedRefs(before, saved)).toEqual(
			new Map([
				[f1, 'x_uno.png'],
				[f2, 'y_dos.png']
			])
		);
	});

	test('un File sin ref nueva (el backend devolvió menos) no entra en el mapa', () => {
		const f1 = file('uno.png', 'image/png');
		const f2 = file('dos.png', 'image/png');
		expect(matchSavedRefs([f1, f2], ['x_uno.png'])).toEqual(new Map([[f1, 'x_uno.png']]));
	});

	test('sin File pendientes el mapa está vacío aunque haya refs', () => {
		expect(matchSavedRefs(['a.png'], ['a.png', 'b.png']).size).toBe(0);
	});
});
