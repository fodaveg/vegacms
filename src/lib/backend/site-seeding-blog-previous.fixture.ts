/** Blog anterior a firmas y categorías: fixture de actualización aditiva, sin datos nuevos. */
import type { SiteSeedModule } from './site-seeding';
import type { JsonValue } from './types';
import { SITE_SEED_BLOG_MODULE } from './site-seeding-blog';

export function previousBlogModule(): SiteSeedModule {
	const manifest = structuredClone(SITE_SEED_BLOG_MODULE.manifest) as {
		collections: Record<string, { fields?: Record<string, JsonValue> }>;
	};
	delete manifest.collections.authors;
	delete manifest.collections.categories;
	delete manifest.collections.posts.fields!.authors;
	delete manifest.collections.posts.fields!.categories;
	return {
		id: 'blog',
		manifest: manifest as JsonValue,
		collections: SITE_SEED_BLOG_MODULE.collections
			.filter((spec) => ['tags', 'posts'].includes(spec.name))
			.map((spec) => ({
				...spec,
				fields: spec.fields.filter((field) => !['authors', 'categories'].includes(field.name))
			}))
	};
}
