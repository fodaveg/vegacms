import { describe, expect, it, vi } from 'vitest';
import type { BackendPort } from '$lib/backend/port';
import type { Field, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { relationThumbSource } from '$lib/model/relation-thumb';
import {
	MediaThumbnailRecords,
	mediaRecordThumbnail,
	recordThumbnails,
	recordThumbnailSrc
} from './record-thumbnail';

const file: Extract<Field, { type: 'file' }> = {
	name: 'file',
	type: 'file',
	multiple: false,
	protected: false,
	required: true,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false,
	thumbs: ['28x28', '120x120']
};
const relation: Extract<Field, { type: 'relation' }> = {
	...file,
	name: 'media',
	type: 'relation',
	target: 'vega_media',
	multiple: false
};
const media = (id: string, ref = 'image.png'): VegaRecord => ({
	id,
	type: 'vega_media',
	values: { file: ref, alt: 'Alt del medio' }
});
const artwork = (id: string, asset = 'm1'): VegaRecord => ({
	id,
	type: 'artworks',
	values: { media: asset, title: `Obra ${id}`, alt: 'Alt de la obra' }
});
const page = (items: VegaRecord[]) => ({
	items,
	page: 1,
	perPage: 50,
	totalItems: items.length,
	totalPages: 1
});
const source = relationThumbSource('media', [relation], [{ name: 'vega_media', fields: [file] }]);

describe('miniaturas de relaciones a Medios', () => {
	it('deduplica obras, candidatos y chips en vuelo y mantiene propietario y alt de la obra', async () => {
		let resolve!: (value: ReturnType<typeof page>) => void;
		const list = vi.fn(
			() =>
				new Promise<ReturnType<typeof page>>((done) => {
					resolve = done;
				})
		);
		const records = new MediaThumbnailRecords({ list, get: vi.fn() });
		const first = recordThumbnails([artwork('a'), artwork('b')], source, records);
		records.refresh(); // una página nueva reutiliza el lote que todavía sigue en vuelo
		const second = recordThumbnails([artwork('c')], source, records);
		resolve(page([media('m1')]));
		const [a, b] = await Promise.all([first, second]);
		expect(list).toHaveBeenCalledTimes(1);
		expect(a.get('a')).toMatchObject({
			owner: { type: 'vega_media', id: 'm1' },
			field: 'file',
			ref: 'image.png',
			alt: 'Alt de la obra'
		});
		expect(b.get('c')?.owner.id).toBe('m1');
		const fileUrl = vi.fn(() => 'https://files/image');
		const port = { fileUrl, capabilities: { thumbs: true } } as unknown as BackendPort;
		expect(recordThumbnailSrc(port, a.get('a'), { width: 28, height: 28, fit: 'crop' })).toBe(
			'https://files/image'
		);
		expect(fileUrl).toHaveBeenCalledWith({ type: 'vega_media', id: 'm1' }, 'file', 'image.png', {
			thumb: { width: 28, height: 28, fit: 'crop' }
		});
	});

	it('sin thumbs usa el original, sin mezclar id de obra y fichero del medio', async () => {
		const records = new MediaThumbnailRecords({
			list: vi.fn(async () => page([media('m1')])),
			get: vi.fn()
		});
		const thumbs = await recordThumbnails([artwork('a')], source, records);
		const fileUrl = vi.fn(() => 'original');
		recordThumbnailSrc(
			{ fileUrl, capabilities: { thumbs: false } } as unknown as BackendPort,
			thumbs.get('a'),
			{ width: 120, height: 120, fit: 'crop' }
		);
		expect(fileUrl).toHaveBeenCalledWith(
			{ type: 'vega_media', id: 'm1' },
			'file',
			'image.png',
			undefined
		);
	});

	it('respeta PDF, SVG, BMP, relaciones vacías y múltiples en los datos', async () => {
		const list = vi.fn(async () =>
			page([media('m1', 'document.pdf'), media('m2', 'vector.svg'), media('m3', 'bitmap.bmp')])
		);
		const records = new MediaThumbnailRecords({ list, get: vi.fn() });
		const thumbnails = await recordThumbnails(
			[
				artwork('a'),
				artwork('b', 'm2'),
				artwork('c', 'm3'),
				artwork('empty', ''),
				{ ...artwork('multiple'), values: { media: ['m1'] } }
			],
			source,
			records
		);
		expect(thumbnails.size).toBe(0);
		expect(mediaRecordThumbnail(media('m4', 'photo.avif'), file)?.ref).toBe('photo.avif');
		expect(mediaRecordThumbnail(artwork('a'), file)).toBeNull();
	});

	it('list privado usa get permitido; errores temporales no quedan cacheados', async () => {
		const list = vi.fn(async () => {
			throw VegaError.forbidden();
		});
		const get = vi
			.fn()
			.mockRejectedValueOnce(VegaError.backend('temporal'))
			.mockResolvedValueOnce(media('m1'));
		const records = new MediaThumbnailRecords({ list, get });
		expect((await recordThumbnails([artwork('a')], source, records)).size).toBe(0);
		expect((await recordThumbnails([artwork('a')], source, records)).get('a')?.ref).toBe(
			'image.png'
		);
		expect(get).toHaveBeenCalledTimes(2);
	});

	it('fallo de list y 404 no impiden una lectura futura, sin bucle de reintentos', async () => {
		const list = vi
			.fn()
			.mockRejectedValueOnce(VegaError.backend('sin red'))
			.mockResolvedValue(page([]));
		const get = vi
			.fn()
			.mockRejectedValueOnce(VegaError.notFound())
			.mockResolvedValueOnce(media('m1'));
		const records = new MediaThumbnailRecords({ list, get });
		expect((await records.read(['m1'])).size).toBe(0);
		expect((await records.read(['m1'])).size).toBe(0);
		expect((await records.read(['m1'])).get('m1')?.values.file).toBe('image.png');
		expect(list).toHaveBeenCalledTimes(3);
	});

	it('caché local acotada, seed reutilizado y clear invalida fichero y respuestas antiguas', async () => {
		const list = vi.fn(async () => page([media('m1', 'new.png')]));
		const records = new MediaThumbnailRecords({ list, get: vi.fn() }, 1);
		records.seed([media('m1', 'old.png')]);
		expect((await records.read(['m1'])).get('m1')?.values.file).toBe('old.png');
		expect(list).not.toHaveBeenCalled();
		records.seed([media('m2')]);
		expect((await records.read(['m1'])).get('m1')?.values.file).toBe('new.png');
		records.clear();
		await records.read(['m1']);
		expect(list).toHaveBeenCalledTimes(2);
	});

	it('una respuesta anterior a clear no envenena el nuevo snapshot', async () => {
		let resolve!: (value: ReturnType<typeof page>) => void;
		const list = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise((done) => {
						resolve = done;
					})
			)
			.mockResolvedValue(page([media('m1', 'new.png')]));
		const records = new MediaThumbnailRecords({ list, get: vi.fn() });
		const old = records.read(['m1']);
		records.clear();
		expect((await records.read(['m1'])).get('m1')?.values.file).toBe('new.png');
		resolve(page([media('m1', 'old.png')]));
		await old;
		expect((await records.read(['m1'])).get('m1')?.values.file).toBe('new.png');
	});
});
