import { describe, expect, it, vi } from 'vitest';
import {
	applyProjectDiscovery,
	fetchProjectDiscovery,
	parseProjectDiscovery
} from './project-discovery';

const DOCUMENT = {
	protocolVersion: 1,
	project: { key: 'default', name: 'Fodaveg' },
	auth: { collection: 'vega_editors', apiBasePath: '/api/vega-auth' },
	manifest: { collection: 'vega', key: 'fodaveg-main', schemaVersion: 1 },
	siteSettings: { collection: 'site_settings', key: 'default' },
	build: { apiBasePath: '/api/vega-build' },
	preview: { apiBasePath: '/api/vega-preview' },
	blockTypes: ['hero', 'rich-text', 'gallery']
};

describe('project discovery', () => {
	/** `DOCUMENT` es un documento de servidor REALISTA, o sea sin `preview.visualEditing`: ese campo
	 *  lo NORMALIZA el parseo a `false`, y por eso el resultado no es idéntico a la entrada. */
	const PARSED = { ...DOCUMENT, preview: { ...DOCUMENT.preview, visualEditing: false } };

	it('parses the versioned contract', () => {
		expect(parseProjectDiscovery(DOCUMENT)).toEqual(PARSED);
	});

	it('rejects unsupported or incomplete documents', () => {
		expect(parseProjectDiscovery({ ...DOCUMENT, protocolVersion: 2 })).toBeNull();
		expect(parseProjectDiscovery({ ...DOCUMENT, manifest: { key: 'default' } })).toBeNull();
	});

	it('reads the additive "build" trigger when the server declares it', () => {
		expect(parseProjectDiscovery(DOCUMENT)?.build).toEqual({ apiBasePath: '/api/vega-build' });
	});

	it('degrades "build" to null without rejecting the whole document (legacy/opt-out servers)', () => {
		// Ausente por completo (servidor anterior a esta enmienda del contrato).
		const { build: _omitted, ...withoutBuild } = DOCUMENT;
		expect(parseProjectDiscovery(withoutBuild)).toMatchObject({ build: null });
		// Explícitamente `null` (el proyecto existe pero no tiene publicación conectada).
		expect(parseProjectDiscovery({ ...DOCUMENT, build: null })).toMatchObject({ build: null });
		// Presente pero mal formado: NO invalida el resto del documento (a diferencia de
		// `siteSettings`), solo el propio campo se trata como ausente.
		expect(parseProjectDiscovery({ ...DOCUMENT, build: {} })).toMatchObject({ build: null });
		expect(parseProjectDiscovery({ ...DOCUMENT, build: { apiBasePath: '' } })).toMatchObject({
			build: null
		});
		expect(
			parseProjectDiscovery({ ...DOCUMENT, build: { apiBasePath: 'not-a-path' } })
		).toMatchObject({ build: null });
		expect(parseProjectDiscovery({ ...DOCUMENT, build: 'nope' })).toMatchObject({ build: null });
	});

	it('reads the additive "preview" capability when the server declares it (fase B)', () => {
		expect(parseProjectDiscovery(DOCUMENT)?.preview).toEqual({
			apiBasePath: '/api/vega-preview',
			// Un `preview` sin `visualEditing` es el caso NORMAL (todo servidor anterior a la
			// enmienda del puente de edición visual): sin puente, no a medias.
			visualEditing: false
		});
	});

	it('reads "preview.visualEditing" only when it is the boolean true (edición visual)', () => {
		expect(
			parseProjectDiscovery({
				...DOCUMENT,
				preview: { apiBasePath: '/api/vega-preview', visualEditing: true }
			})?.preview
		).toEqual({ apiBasePath: '/api/vega-preview', visualEditing: true });

		// Cualquier otra cosa se lee como `false`, que es el valor SEGURO: anunciar el puente sin
		// tenerlo dejaría a Vega esperando un saludo que no llega. Ojo a `"true"` en cadena, que es
		// lo que produce un servidor que serializa mal el booleano.
		for (const value of [false, null, undefined, 'true', 1, {}, []]) {
			expect(
				parseProjectDiscovery({
					...DOCUMENT,
					preview: { apiBasePath: '/api/vega-preview', visualEditing: value }
				})?.preview
			).toEqual({ apiBasePath: '/api/vega-preview', visualEditing: false });
		}
	});

	it('ignores "visualEditing" when the preview capability itself degrades to null', () => {
		// El puente vive DENTRO de `preview`: sin ruta de preview no hay iframe que pilotar, así que
		// anunciarlo por su cuenta no puede resucitar la capacidad entera.
		expect(parseProjectDiscovery({ ...DOCUMENT, preview: { visualEditing: true } })).toMatchObject({
			preview: null
		});
	});

	it('degrades "preview" to null without rejecting the whole document (legacy/opt-out servers)', () => {
		// Ausente por completo (servidor anterior a esta enmienda del contrato).
		const { preview: _omitted, ...withoutPreview } = DOCUMENT;
		expect(parseProjectDiscovery(withoutPreview)).toMatchObject({ preview: null });
		// Explícitamente `null` (el proyecto existe pero no puede servir preview de borradores).
		expect(parseProjectDiscovery({ ...DOCUMENT, preview: null })).toMatchObject({
			preview: null
		});
		// Presente pero mal formado: NO invalida el resto del documento, mismo criterio que `build`.
		expect(parseProjectDiscovery({ ...DOCUMENT, preview: {} })).toMatchObject({ preview: null });
		expect(parseProjectDiscovery({ ...DOCUMENT, preview: { apiBasePath: '' } })).toMatchObject({
			preview: null
		});
		expect(
			parseProjectDiscovery({ ...DOCUMENT, preview: { apiBasePath: 'not-a-path' } })
		).toMatchObject({ preview: null });
		expect(parseProjectDiscovery({ ...DOCUMENT, preview: 'nope' })).toMatchObject({
			preview: null
		});
	});

	it('reads the additive block renderer vocabulary and distinguishes legacy from explicit empty', () => {
		expect(parseProjectDiscovery(DOCUMENT)?.blockTypes).toEqual(['hero', 'rich-text', 'gallery']);
		const { blockTypes: _omitted, ...legacy } = DOCUMENT;
		expect(parseProjectDiscovery(legacy)?.blockTypes).toBeNull();
		expect(parseProjectDiscovery({ ...DOCUMENT, blockTypes: [] })?.blockTypes).toEqual([]);
	});

	it('degrades malformed blockTypes without rejecting discovery', () => {
		for (const blockTypes of ['hero', ['Hero'], ['hero', 'hero'], ['hero', ''], ['hero', 42]]) {
			expect(parseProjectDiscovery({ ...DOCUMENT, blockTypes })?.blockTypes).toBeNull();
		}
	});

	it('loads discovery from the selected backend, not from the Vega origin', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify(DOCUMENT), { status: 200 }));
		await expect(fetchProjectDiscovery('https://pb.example.test/base/', fetcher)).resolves.toEqual(
			PARSED
		);
		expect(fetcher).toHaveBeenCalledWith(
			new URL('https://pb.example.test/api/vega/discovery'),
			expect.objectContaining({ cache: 'no-store' })
		);
	});

	it('uses remote project auth while preserving the already resolved backend URL', () => {
		expect(
			applyProjectDiscovery(
				{ backendUrl: 'https://pb.example.test', authCollection: '_superusers' },
				parseProjectDiscovery(DOCUMENT)
			)
		).toEqual({
			backendUrl: 'https://pb.example.test',
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth',
			manifestKey: 'fodaveg-main'
		});
	});
});
