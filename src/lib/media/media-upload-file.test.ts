/**
 * Suite de `uploadMediaFile` (lote 12, lámina 5): el camino único a `vega_media`, compartido por
 * el lote de `/media` y la copia desde un campo `file`. Lo que se protege: el MIME se valida antes
 * de reducir y el tope después; el `alt` viaja en el `create` solo si tiene texto; los errores del
 * puerto se propagan como `VegaError`.
 */
import { describe, expect, test, vi } from 'vitest';
import { VegaError } from '$lib/backend/errors';
import type { BackendPort } from '$lib/backend/port';
import type { RecordInput, VegaRecord } from '$lib/backend/types';
import { mediaUploadErrorMessage, uploadMediaFile, type ShrinkFn } from './media-upload-file';
import type { MediaFileFieldSchema } from './media-upload';

const schema = {
	maxSizeBytes: 1000,
	mimeTypes: ['image/png', 'application/pdf']
} as unknown as MediaFileFieldSchema;

const file = (name: string, type: string, size: number): File =>
	new File([new Uint8Array(size)], name, { type });

type CreateFn = (collection: string, input: RecordInput) => Promise<VegaRecord>;

function fakePort(
	create = vi.fn<CreateFn>(async () => ({ id: 'm1', type: 'vega_media', values: {} }))
) {
	return { port: { create } as unknown as Pick<BackendPort, 'create'>, create };
}

describe('uploadMediaFile', () => {
	test('un fichero válido se crea en `vega_media` con `file` y, si lo trae, `alt` recortado', async () => {
		const { port, create } = fakePort();
		const f = file('foto.png', 'image/png', 100);

		const result = await uploadMediaFile(port, schema, f, {
			shrink: null,
			alt: '  Tres calabazas '
		});

		expect(result.kind).toBe('done');
		expect(create).toHaveBeenCalledWith('vega_media', { file: f, alt: 'Tres calabazas' });
	});

	test('sin texto alternativo el `create` no lleva `alt`', async () => {
		const { port, create } = fakePort();
		await uploadMediaFile(port, schema, file('a.pdf', 'application/pdf', 10), {
			shrink: null,
			alt: '   '
		});
		expect(create.mock.calls[0]?.[1]).toEqual({ file: expect.any(File) });
	});

	test('tipo no admitido: rechazado antes de reducir y sin tocar el puerto', async () => {
		const { port, create } = fakePort();
		const shrink = vi.fn<ShrinkFn>();

		const result = await uploadMediaFile(port, schema, file('v.svg', 'image/svg+xml', 10), {
			shrink
		});

		expect(result).toEqual({ kind: 'rejected', reason: 'invalidType' });
		expect(shrink).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	test('imagen grande: se reduce y el tope se valida sobre lo reducido, que es lo que se sube', async () => {
		const { port, create } = fakePort();
		const big = file('grande.png', 'image/png', 5000);
		const small = file('grande.png', 'image/png', 500);
		const shrink = vi.fn<ShrinkFn>(async () => ({
			kind: 'shrunk',
			file: small,
			fromBytes: 5000,
			toBytes: 500
		}));

		const result = await uploadMediaFile(port, schema, big, { shrink });

		expect(shrink).toHaveBeenCalledWith(big, { maxBytes: 1000 });
		expect(result).toMatchObject({
			kind: 'done',
			shrink: { kind: 'shrunk', fromBytes: 5000, toBytes: 500 }
		});
		expect(create.mock.calls[0]?.[1]).toEqual({ file: small });
	});

	test('imagen grande que no se pudo reducir: rechazada por tamaño con el motivo del paso', async () => {
		const { port, create } = fakePort();
		const shrink = vi.fn<ShrinkFn>(async () => ({ kind: 'kept-original', reason: 'not-smaller' }));

		const result = await uploadMediaFile(port, schema, file('g.png', 'image/png', 5000), {
			shrink
		});

		expect(result).toEqual({
			kind: 'rejected',
			reason: 'tooLarge',
			shrink: { kind: 'original', why: 'not-smaller' }
		});
		expect(create).not.toHaveBeenCalled();
	});

	test('sin reducción (`shrink: null`) una imagen grande se rechaza directamente', async () => {
		const { port } = fakePort();
		const result = await uploadMediaFile(port, schema, file('g.png', 'image/png', 5000), {
			shrink: null
		});
		expect(result).toEqual({ kind: 'rejected', reason: 'tooLarge' });
	});

	test('un fallo del puerto se propaga como `VegaError` (el suyo, o envuelto en `backend`)', async () => {
		const forbidden = VegaError.forbidden('sin permiso');
		const { port } = fakePort(vi.fn<CreateFn>(async () => Promise.reject(forbidden)));
		await expect(
			uploadMediaFile(port, schema, file('a.png', 'image/png', 10), { shrink: null })
		).rejects.toBe(forbidden);

		const { port: broken } = fakePort(
			vi.fn<CreateFn>(async () => Promise.reject(new Error('boom')))
		);
		await expect(
			uploadMediaFile(broken, schema, file('a.png', 'image/png', 10), { shrink: null })
		).rejects.toMatchObject({ kind: 'backend' });
	});
});

describe('mediaUploadErrorMessage', () => {
	test('prefiere el error del propio campo `file`; si no, el mensaje general', () => {
		const general = VegaError.backend('Error general');
		expect(mediaUploadErrorMessage(general)).toBe('Error general');
		const withField = VegaError.validation(
			{ file: { code: 'validation_file_size_limit', message: 'excede el tamaño' } },
			'Datos inválidos'
		);
		expect(mediaUploadErrorMessage(withField)).toBe('excede el tamaño');
	});
});
