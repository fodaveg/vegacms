/**
 * Suite de `richtext-image.ts`: lo elegido en la biblioteca se traduce a la URL pública del
 * fichero y al texto alternativo del medio.
 */
import { describe, expect, test, vi } from 'vitest';
import { richtextImageFromPick } from './richtext-image';

function pick(alt: string) {
	return { file: new File(['x'], 'portada_ab12.png', { type: 'image/png' }), mediaId: 'm1', alt };
}

describe('richtextImageFromPick', () => {
	test('el src es port.fileUrl del registro de vega_media, sin miniatura', () => {
		const fileUrl = vi.fn(() => 'https://cms.ejemplo.com/api/files/vega_media/m1/portada_ab12.png');
		const image = richtextImageFromPick({ fileUrl }, pick('Una portada'));

		expect(fileUrl).toHaveBeenCalledWith(
			{ type: 'vega_media', id: 'm1' },
			'file',
			'portada_ab12.png'
		);
		expect(image).toEqual({
			src: 'https://cms.ejemplo.com/api/files/vega_media/m1/portada_ab12.png',
			alt: 'Una portada',
			fileName: 'portada_ab12.png'
		});
	});

	test('un alt de solo espacios cuenta como que no tiene', () => {
		expect(richtextImageFromPick({ fileUrl: () => '/f.png' }, pick('   ')).alt).toBe('');
	});

	test('propaga lo que lance port.fileUrl', () => {
		const fileUrl = () => {
			throw new Error('no encontrado');
		};
		expect(() => richtextImageFromPick({ fileUrl }, pick('x'))).toThrow('no encontrado');
	});
});
