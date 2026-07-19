/**
 * Suite de `media-upload.ts` (Fase P6·6c, D-P6.3): `findMediaFileFieldSchema` (lee el esquema
 * DESCUBIERTO de `ContentType[]`) + `validateMediaFile` (pura, MIME/tamaño) — incluyendo el caso
 * "el superuser afinó el esquema en el Admin de PB" que D-P6.3 exige respetar (constraints
 * descubiertas mandan, nunca el default del bootstrap).
 */
import { describe, expect, test } from 'vitest';
import type { ContentType } from '$lib/backend/types';
import {
	findMediaFileFieldSchema,
	validateMediaFile,
	type MediaFileFieldSchema
} from './media-upload';

/** Campo `file` de `vega_media`, mínimo, para no repetir las claves de `FieldBase`. */
function mediaFileField(overrides: Partial<MediaFileFieldSchema> = {}): MediaFileFieldSchema {
	return {
		name: 'file',
		type: 'file',
		multiple: false,
		required: true,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false,
		protected: false,
		...overrides
	};
}

function mediaContentType(fileField: MediaFileFieldSchema): ContentType {
	return {
		name: 'vega_media',
		readonly: false,
		fields: [
			fileField,
			{
				name: 'alt',
				type: 'text',
				subtype: 'plain',
				required: false,
				readonly: false,
				presentable: false,
				hidden: false,
				unique: false
			}
		]
	};
}

function makeFile(name: string, type: string, size = 10): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('findMediaFileFieldSchema', () => {
	test('encuentra el campo "file" de "vega_media"', () => {
		const field = mediaFileField({ maxSizeBytes: 123 });
		const types = [mediaContentType(field)];
		expect(findMediaFileFieldSchema(types)).toEqual(field);
	});

	test('null si "vega_media" no existe todavía (creatable/manual)', () => {
		const other: ContentType = { name: 'post', readonly: false, fields: [] };
		expect(findMediaFileFieldSchema([other])).toBeNull();
	});

	test('null si "vega_media" existe pero, por lo que sea, no trae el campo "file"', () => {
		const media: ContentType = { name: 'vega_media', readonly: false, fields: [] };
		expect(findMediaFileFieldSchema([media])).toBeNull();
	});
});

describe('validateMediaFile', () => {
	test('sin maxSizeBytes ni mimeTypes: siempre admitido', () => {
		const field = mediaFileField();
		expect(validateMediaFile(field, makeFile('a.png', 'image/png'))).toBeNull();
	});

	test('maxSizeBytes superado → tooLarge', () => {
		const field = mediaFileField({ maxSizeBytes: 5 });
		expect(validateMediaFile(field, makeFile('a.png', 'image/png', 10))).toBe('tooLarge');
	});

	test('maxSizeBytes justo en el límite → admitido (no estrictamente mayor)', () => {
		const field = mediaFileField({ maxSizeBytes: 10 });
		expect(validateMediaFile(field, makeFile('a.png', 'image/png', 10))).toBeNull();
	});

	test('mimeTypes exacto: fuera de la lista → invalidType', () => {
		const field = mediaFileField({
			mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
		});
		expect(validateMediaFile(field, makeFile('a.txt', 'text/plain'))).toBe('invalidType');
	});

	test('mimeTypes exacto: dentro de la lista → admitido', () => {
		const field = mediaFileField({ mimeTypes: ['image/png', 'application/pdf'] });
		expect(validateMediaFile(field, makeFile('a.pdf', 'application/pdf'))).toBeNull();
	});

	test('mimeTypes con comodín "image/*": cualquier subtipo de imagen admitido', () => {
		const field = mediaFileField({ mimeTypes: ['image/*'] });
		expect(validateMediaFile(field, makeFile('a.webp', 'image/webp'))).toBeNull();
		expect(validateMediaFile(field, makeFile('a.pdf', 'application/pdf', 10))).toBe('invalidType');
	});

	test('mimeTypes vacío ([]): tratado como sin restricción, igual que ausente', () => {
		const field = mediaFileField({ mimeTypes: [] });
		expect(validateMediaFile(field, makeFile('a.exe', 'application/x-msdownload'))).toBeNull();
	});

	test('tamaño Y tipo inválidos a la vez: gana tooLarge (se comprueba primero)', () => {
		const field = mediaFileField({ maxSizeBytes: 5, mimeTypes: ['image/png'] });
		expect(validateMediaFile(field, makeFile('a.pdf', 'application/pdf', 10))).toBe('tooLarge');
	});

	test('fichero sin extensión en el nombre: la validación mira el MIME, no el nombre', () => {
		const field = mediaFileField({ mimeTypes: ['image/png'] });
		expect(validateMediaFile(field, makeFile('sin-extension', 'image/png'))).toBeNull();
		expect(validateMediaFile(field, makeFile('sin-extension', 'application/pdf'))).toBe(
			'invalidType'
		);
	});

	test(
		'D-P6.3: el superuser afinó el esquema (añadió image/svg+xml, ausente del default del ' +
			'bootstrap) → las constraints DESCUBIERTAS mandan, el svg entra',
		() => {
			const tunedByAdmin = mediaFileField({
				maxSizeBytes: 10 * 1024 * 1024,
				mimeTypes: [
					'image/png',
					'image/jpeg',
					'image/webp',
					'image/gif',
					'application/pdf',
					'image/svg+xml'
				]
			});
			expect(validateMediaFile(tunedByAdmin, makeFile('logo.svg', 'image/svg+xml'))).toBeNull();
		}
	);

	test(
		'D-P6.3 (inverso): un backend más restrictivo que el default rechaza lo que el bootstrap ' +
			'admitiría',
		() => {
			const stricterThanBootstrap = mediaFileField({ mimeTypes: ['image/png'] });
			expect(validateMediaFile(stricterThanBootstrap, makeFile('doc.pdf', 'application/pdf'))).toBe(
				'invalidType'
			);
		}
	);
});
