/**
 * Suite de `media-card.ts` (rediseño de `/media`, mockup `aquelarre-medios.html`): clasificación de
 * tipo por extensión (los tres cajones de los chips de la toolbar), filtros de tipo/nombre, matiz
 * determinista del placeholder, formateo de tamaños y subtítulo de tarjeta.
 */
import { describe, expect, test } from 'vitest';
import {
	classifyMediaAssetType,
	formatFileSize,
	matchesMediaNameQuery,
	matchesMediaTypeFilter,
	mediaCardSubtitle,
	mediaExtensionBadge,
	mediaThumbTone
} from './media-card';

describe('classifyMediaAssetType (extensión; "document" es el cajón por defecto)', () => {
	test.each([
		['foto.png', 'image'],
		['foto.JPEG', 'image'],
		['logo.svg', 'image'],
		['demo.mp4', 'video'],
		['demo.MOV', 'video'],
		['manual.pdf', 'document'],
		['notas.txt', 'document'],
		['raro.xyz', 'document'],
		['sin-extension', 'document'],
		['acaba-en-punto.', 'document']
	] as const)('%s → %s', (fileName, type) => {
		expect(classifyMediaAssetType(fileName)).toBe(type);
	});

	test('un fichero oculto sin extensión real (.gitignore) no confunde el punto inicial', () => {
		expect(classifyMediaAssetType('.gitignore')).toBe('document');
	});
});

describe('mediaExtensionBadge', () => {
	test.each([
		['foto.jpg', 'JPG'],
		['demo.MP4', 'MP4'],
		['guia-v3.tar.gz', 'GZ'],
		['sin-extension', ''],
		['.gitignore', '']
	] as const)('%s → "%s"', (fileName, badge) => {
		expect(mediaExtensionBadge(fileName)).toBe(badge);
	});
});

describe('matchesMediaTypeFilter', () => {
	test('"all" no filtra nada', () => {
		expect(matchesMediaTypeFilter('manual.pdf', 'all')).toBe(true);
		expect(matchesMediaTypeFilter('foto.png', 'all')).toBe(true);
	});

	test('cada chip deja pasar solo su tipo', () => {
		expect(matchesMediaTypeFilter('foto.png', 'image')).toBe(true);
		expect(matchesMediaTypeFilter('foto.png', 'video')).toBe(false);
		expect(matchesMediaTypeFilter('demo.mp4', 'video')).toBe(true);
		expect(matchesMediaTypeFilter('manual.pdf', 'document')).toBe(true);
	});
});

describe('matchesMediaNameQuery (nombre de FICHERO, case-insensitive)', () => {
	test('búsqueda en blanco (o solo espacios) no filtra nada', () => {
		expect(matchesMediaNameQuery('foto.png', '')).toBe(true);
		expect(matchesMediaNameQuery('foto.png', '   ')).toBe(true);
	});

	test('substring, ignorando mayúsculas y espacios sobrantes', () => {
		expect(matchesMediaNameQuery('Portada-Motor-Temas.JPG', 'motor')).toBe(true);
		expect(matchesMediaNameQuery('portada.jpg', ' PORTADA ')).toBe(true);
		expect(matchesMediaNameQuery('portada.jpg', 'huerto')).toBe(false);
	});
});

describe('mediaThumbTone (determinista)', () => {
	test('el mismo id da SIEMPRE el mismo matiz', () => {
		expect(mediaThumbTone('media_1')).toBe(mediaThumbTone('media_1'));
		expect(mediaThumbTone('')).toBe(mediaThumbTone(''));
	});

	test('siempre uno de los cuatro matices del mockup', () => {
		for (const id of ['media_1', 'media_2', 'media_3', 'zzz', 'a', '']) {
			expect(['a', 'b', 'c', 'd']).toContain(mediaThumbTone(id));
		}
	});

	test('ids distintos reparten (no colapsan todos en el mismo matiz)', () => {
		const tones = new Set(
			Array.from({ length: 40 }, (_, i) => mediaThumbTone(`media_${i}`)) // ids como los de la demo
		);
		expect(tones.size).toBeGreaterThan(1);
	});
});

describe('formatFileSize (base 1024, etiquetas cortas)', () => {
	test.each([
		[0, '0 B'],
		[512, '512 B'],
		// El separador de millares lo pone el locale (`Intl.NumberFormat`, mismo criterio que el
		// resto de números de la app): solo asoma en la franja 1000–1023 B, justo antes de KB.
		[1023, '1,023 B'],
		[1024, '1 KB'],
		[3 * 1024, '3 KB'],
		[10 * 1024 * 1024, '10 MB'],
		[2 * 1024 * 1024 * 1024, '2 GB']
	] as const)('%d B → %s', (bytes, expected) => {
		expect(formatFileSize(bytes, 'en')).toBe(expected);
	});

	test('un decimal por debajo de 10 en la unidad elegida, con el separador del locale', () => {
		expect(formatFileSize(1258291, 'es')).toBe('1,2 MB');
		expect(formatFileSize(1258291, 'en')).toBe('1.2 MB');
	});

	test('valores no finitos o negativos → cadena vacía (nunca "NaN B")', () => {
		expect(formatFileSize(Number.NaN, 'es')).toBe('');
		expect(formatFileSize(Number.POSITIVE_INFINITY, 'es')).toBe('');
		expect(formatFileSize(-1, 'es')).toBe('');
	});
});

describe('mediaCardSubtitle con medidas reales (cascada del mockup)', () => {
	const ITEM = { title: 'Foto de portada', alt: '', fileName: 'portada.jpg', created: null };

	test('dimensiones + tamaño → "W×H · TAMAÑO"', () => {
		expect(mediaCardSubtitle(ITEM, 'es', { width: 2880, height: 1800, bytes: 1258291 })).toBe(
			'2880×1800 · 1,2 MB'
		);
	});

	test('solo dimensiones (el HEAD no dijo nada) → "W×H"', () => {
		expect(mediaCardSubtitle(ITEM, 'es', { width: 1920, height: 1080 })).toBe('1920×1080');
	});

	test('solo tamaño (pdf/vídeo: sin bitmap que medir) → "TAMAÑO"', () => {
		expect(mediaCardSubtitle(ITEM, 'es', { bytes: 3072 })).toBe('3 KB');
	});

	test('las dimensiones NO llevan separador de millares (no son prosa)', () => {
		expect(mediaCardSubtitle(ITEM, 'es', { width: 4032, height: 3024 })).toBe('4032×3024');
	});

	test('sin medir (o medido a nada) cae al texto de respaldo, nunca a vacío', () => {
		expect(mediaCardSubtitle(ITEM, 'es', null)).toBe('portada.jpg');
		expect(mediaCardSubtitle(ITEM, 'es', {})).toBe('portada.jpg');
	});
});

describe('mediaCardSubtitle (respaldo sin medidas)', () => {
	test('con title/alt editorial: el nombre de fichero crudo (el dato que si no, no se vería)', () => {
		expect(
			mediaCardSubtitle(
				{ title: 'Foto de portada', alt: '', fileName: 'portada.jpg', created: null },
				'es'
			)
		).toBe('portada.jpg');
		expect(
			mediaCardSubtitle({ title: '', alt: 'Un atardecer', fileName: 'a.png', created: null }, 'es')
		).toBe('a.png');
	});

	test('sin metadatos: la fecha de alta en formato medio del locale', () => {
		const created = '2026-07-18T10:00:00.000Z';
		const expected = new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(
			new Date(created)
		);
		expect(mediaCardSubtitle({ title: '', alt: '', fileName: 'a.png', created }, 'es')).toBe(
			expected
		);
	});

	test('sin metadatos ni "created" (o con uno corrupto) → cadena vacía', () => {
		expect(mediaCardSubtitle({ title: '', alt: '', fileName: 'a.png', created: null }, 'es')).toBe(
			''
		);
		expect(
			mediaCardSubtitle({ title: '', alt: '', fileName: 'a.png', created: 'no-es-fecha' }, 'es')
		).toBe('');
	});
});
