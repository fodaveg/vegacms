/**
 * Mundo de prueba de la revisión antes de publicar: el adaptador `memory` con el sembrado REAL del
 * sitio (`seedSiteProject`: `pages`, `blocks`, `redirects`, `vega_media` y el manifiesto inicial),
 * y su modelo resuelto con `loadContentModel`. Así los tests miden contra la forma que tiene un
 * sitio sembrado de verdad, no contra un esquema escrito a mano que pueda separarse de él.
 */

import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import type { RecordId, VegaRecord } from '$lib/backend/types';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { loadContentModel } from '$lib/model/load';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import type { JsonValue } from '$lib/backend/types';

export interface ReviewWorld {
	port: MemoryBackendPort;
	model: ContentModel;
	pagesType: ResolvedContentType;
}

export async function seededWorld(): Promise<ReviewWorld> {
	const port = createMemoryBackend({
		users: [{ email: 'admin@vega.test', password: 'test-password' }],
		contentTypes: [],
		records: {}
	});
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	await seedSiteProject(port);
	const model = await loadContentModel(port);
	const pagesType = model.types.find((type) => type.name === 'pages');
	if (!pagesType) throw new Error('el sembrado no creó `pages`');
	return { port, model, pagesType };
}

export function createPage(
	world: ReviewWorld,
	values: Record<string, string | boolean | null>
): Promise<VegaRecord> {
	return world.port.create('pages', { title: 'Página', status: 'published', ...values });
}

/** Un bloque heterogéneo (`type` + `data`) de la página `parent`, con `image`/`images` opcionales. */
export function createBlock(
	world: ReviewWorld,
	parent: RecordId,
	order: number,
	type: string,
	data: Record<string, JsonValue>,
	record: { image?: RecordId; images?: RecordId[] } = {}
): Promise<VegaRecord> {
	return world.port.create('blocks', { parent, order, type, data, ...record });
}

/** Una imagen en la biblioteca, con o sin texto alternativo. */
export function createMedia(
	world: ReviewWorld,
	fileName: string,
	alt: string
): Promise<VegaRecord> {
	const file = new File([new Uint8Array([1, 2, 3])], fileName, { type: 'image/jpeg' });
	return world.port.create('vega_media', { file, alt });
}
