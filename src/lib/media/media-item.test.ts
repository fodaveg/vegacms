/**
 * Suite de `media-item.ts` (Fase P6·6b): clasificación imagen-vs-otro por extensión, normalización
 * de `tags` (json arbitrario → `string[]`), mapeo `VegaRecord` → `MediaItemView` y los fallbacks de
 * nombre a mostrar (`mediaDisplayName`/`mediaImgAlt`).
 */
import { describe, expect, test } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import {
	classifyMediaFile,
	mediaDisplayName,
	mediaImgAlt,
	normalizeMediaTags,
	toMediaItemView
} from './media-item';

describe('classifyMediaFile (extensión, mismo criterio que classifyFileRef de F5-f)', () => {
	test.each([
		['foto.png', 'image'],
		['foto.JPG', 'image'],
		['foto.webp', 'image'],
		['manual.pdf', 'other'],
		['sin-extension', 'other'],
		['archivo.', 'other']
	] as const)('%s → %s', (ref, kind) => {
		expect(classifyMediaFile(ref)).toBe(kind);
	});
});

describe('normalizeMediaTags (json arbitrario → string[])', () => {
	test('un array de strings pasa tal cual', () => {
		expect(normalizeMediaTags(['a', 'b'])).toEqual(['a', 'b']);
	});

	test('elementos no-string se descartan', () => {
		expect(normalizeMediaTags(['a', 1, null, 'b'] as never)).toEqual(['a', 'b']);
	});

	test('cualquier forma no-array (objeto, string, null) degrada a []', () => {
		expect(normalizeMediaTags(null)).toEqual([]);
		expect(normalizeMediaTags('no-es-array')).toEqual([]);
		expect(normalizeMediaTags({ a: 1 } as never)).toEqual([]);
	});
});

describe('toMediaItemView', () => {
	function record(values: Record<string, unknown>): VegaRecord {
		return { id: 'm1', type: 'vega_media', values: values as VegaRecord['values'] };
	}

	test('mapea un registro completo', () => {
		const view = toMediaItemView(
			record({
				file: 'foto.png',
				alt: 'Un atardecer',
				title: 'Portada',
				tags: ['foto', 'playa'],
				created: '2024-01-02T00:00:00.000Z'
			})
		);
		expect(view).toEqual({
			id: 'm1',
			fileRef: 'foto.png',
			fileName: 'foto.png',
			kind: 'image',
			alt: 'Un atardecer',
			title: 'Portada',
			tags: ['foto', 'playa'],
			created: '2024-01-02T00:00:00.000Z'
		});
	});

	test('un pdf clasifica como "other"', () => {
		expect(toMediaItemView(record({ file: 'manual.pdf' })).kind).toBe('other');
	});

	test('sin "file" (defensivo: el campo es required en el esquema) → fileRef null, kind "other"', () => {
		const view = toMediaItemView(record({}));
		expect(view.fileRef).toBeNull();
		expect(view.kind).toBe('other');
		expect(view.fileName).toBe('');
	});

	test('alt/title ausentes o no-string degradan a "" (nunca null/undefined en la vista)', () => {
		const view = toMediaItemView(record({ file: 'a.png', alt: null, title: undefined }));
		expect(view.alt).toBe('');
		expect(view.title).toBe('');
	});

	test('"created" no-string (defensivo) degrada a null', () => {
		expect(toMediaItemView(record({ file: 'a.png', created: 123 })).created).toBeNull();
	});
});

describe('mediaDisplayName (title > alt > fileName)', () => {
	test('title gana si no está vacío', () => {
		expect(mediaDisplayName({ title: 'T', alt: 'A', fileName: 'f.png' })).toBe('T');
	});

	test('sin title, alt gana', () => {
		expect(mediaDisplayName({ title: '', alt: 'A', fileName: 'f.png' })).toBe('A');
	});

	test('sin title ni alt, el nombre de fichero', () => {
		expect(mediaDisplayName({ title: '', alt: '', fileName: 'f.png' })).toBe('f.png');
	});
});

describe('mediaImgAlt (alt del asset, o el filename si está vacío — NUNCA usa "title")', () => {
	test('alt no vacío gana, aunque haya title', () => {
		expect(mediaImgAlt({ alt: 'Un atardecer', fileName: 'f.png' })).toBe('Un atardecer');
	});

	test('alt vacío degrada al nombre de fichero', () => {
		expect(mediaImgAlt({ alt: '', fileName: 'f.png' })).toBe('f.png');
	});
});
