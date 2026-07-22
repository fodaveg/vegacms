/**
 * Suite de `media-thumb.ts` (Fase P6·6b, L-P6.4/D-P6.4): thumb-vs-full según
 * `capabilities.thumbs`, con un `BackendPort` FALSO (nunca el adaptador real — módulo puro
 * respecto a Svelte, pero SÍ recibe el puerto inyectado, así que se simula aquí).
 */
import { describe, expect, test, vi } from 'vitest';
import type { Capabilities } from '$lib/backend/types';
import type { MediaItemView } from './media-item';
import {
	type FileUrlPort,
	MEDIA_GRID_THUMB_SPEC,
	mediaGridThumbOpts,
	resolveMediaFullSrc,
	resolveMediaGridSrc
} from './media-thumb';

function capabilitiesWith(thumbs: boolean): Capabilities {
	return {
		realtime: true,
		thumbs,
		schemaDiscovery: true,
		filePerRecord: true,
		protectedFiles: false,
		schemaBootstrap: true,
		strongAuth: false
	};
}

const IMAGE_ITEM: MediaItemView = {
	id: 'm1',
	fileRef: 'foto.png',
	fileName: 'foto.png',
	kind: 'image',
	alt: '',
	title: '',
	tags: [],
	created: null
};

const OTHER_ITEM: MediaItemView = { ...IMAGE_ITEM, id: 'm2', kind: 'other' };
const NO_FILE_ITEM: MediaItemView = { ...IMAGE_ITEM, id: 'm3', fileRef: null };

describe('mediaGridThumbOpts (L-P6.4: NUNCA asume la capability)', () => {
	test('capabilities.thumbs === true ⇒ pide MEDIA_GRID_THUMB_SPEC (300×300 crop, D-P6.4)', () => {
		expect(mediaGridThumbOpts(capabilitiesWith(true))).toEqual({ thumb: MEDIA_GRID_THUMB_SPEC });
	});

	test('capabilities.thumbs === false (memory) ⇒ undefined, degradación a la imagen completa', () => {
		expect(mediaGridThumbOpts(capabilitiesWith(false))).toBeUndefined();
	});
});

describe('resolveMediaGridSrc', () => {
	test('un item "image" con fileRef llama a fileUrl con los opts de la capability', () => {
		const fileUrl = vi.fn().mockReturnValue('data:image/png;base64,xxx');
		const port: FileUrlPort = { fileUrl, capabilities: capabilitiesWith(true) };

		const src = resolveMediaGridSrc(port, IMAGE_ITEM);

		expect(src).toBe('data:image/png;base64,xxx');
		expect(fileUrl).toHaveBeenCalledWith({ type: 'vega_media', id: 'm1' }, 'file', 'foto.png', {
			thumb: MEDIA_GRID_THUMB_SPEC
		});
	});

	test('memory (thumbs: false): mismo item, opts undefined (degradación real)', () => {
		const fileUrl = vi.fn().mockReturnValue('data:image/png;base64,xxx');
		const port: FileUrlPort = { fileUrl, capabilities: capabilitiesWith(false) };

		resolveMediaGridSrc(port, IMAGE_ITEM);

		expect(fileUrl).toHaveBeenCalledWith(
			{ type: 'vega_media', id: 'm1' },
			'file',
			'foto.png',
			undefined
		);
	});

	test('un item "other" (pdf…) nunca llama a fileUrl: null sin tocar el puerto', () => {
		const fileUrl = vi.fn();
		const port: FileUrlPort = { fileUrl, capabilities: capabilitiesWith(true) };

		expect(resolveMediaGridSrc(port, OTHER_ITEM)).toBeNull();
		expect(fileUrl).not.toHaveBeenCalled();
	});

	test('sin fileRef (defensivo): null sin tocar el puerto', () => {
		const fileUrl = vi.fn();
		const port: FileUrlPort = { fileUrl, capabilities: capabilitiesWith(true) };

		expect(resolveMediaGridSrc(port, NO_FILE_ITEM)).toBeNull();
		expect(fileUrl).not.toHaveBeenCalled();
	});
});

describe('resolveMediaFullSrc (detalle: SIEMPRE la imagen completa, ni con thumbs: true)', () => {
	test('llama a fileUrl SIN opts, aunque la capability soporte thumb', () => {
		const fileUrl = vi.fn().mockReturnValue('data:image/png;base64,yyy');
		const port = { fileUrl };

		const src = resolveMediaFullSrc(port, IMAGE_ITEM);

		expect(src).toBe('data:image/png;base64,yyy');
		expect(fileUrl).toHaveBeenCalledWith({ type: 'vega_media', id: 'm1' }, 'file', 'foto.png');
	});

	test('un item "other" o sin fileRef: null sin tocar el puerto', () => {
		const fileUrl = vi.fn();
		const port = { fileUrl };

		expect(resolveMediaFullSrc(port, OTHER_ITEM)).toBeNull();
		expect(resolveMediaFullSrc(port, NO_FILE_ITEM)).toBeNull();
		expect(fileUrl).not.toHaveBeenCalled();
	});
});
