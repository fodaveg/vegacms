/**
 * La semilla de la demo viaja en el bundle de producción: sus correos inventados no pueden caer en
 * el dominio real de un tercero (hubo uno con el de un ayuntamiento). Solo valen los reservados
 * para ejemplos (RFC 2606) y los propios del proyecto.
 */
import { describe, expect, test } from 'vitest';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { loadContentModel } from '$lib/model/load';
import { loadReviewData } from '$lib/publish-review/load-review-data';
import { reviewRecord } from '$lib/publish-review/publish-review';
import { DEMO_CREDENTIALS, DEMO_SEED, DEMO_SEED_WITH_MEDIA, SHOWCASE_SEED } from './demo-seed';

/** Dominios admitidos en un correo de la semilla; un subdominio suyo también vale. */
const ALLOWED_EMAIL_DOMAINS = ['example.org', 'example.com', 'example.net', 'fodaveg.net'];

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function emailDomains(value: unknown): string[] {
	return Array.from(JSON.stringify(value).matchAll(EMAIL), (match) => match[1].toLowerCase());
}

function isAllowed(domain: string): boolean {
	return ALLOWED_EMAIL_DOMAINS.some((ok) => domain === ok || domain.endsWith(`.${ok}`));
}

describe('demo-seed: dominios de los correos', () => {
	test.each([
		['DEMO_SEED', DEMO_SEED],
		['DEMO_SEED_WITH_MEDIA', DEMO_SEED_WITH_MEDIA],
		['SHOWCASE_SEED', SHOWCASE_SEED]
	])('%s no usa el dominio real de un tercero', (_name, seed) => {
		// La cuenta de acceso de la demo es la única excepción y se compara entera.
		const foreign = emailDomains(seed).filter(
			(domain) => !isAllowed(domain) && domain !== DEMO_CREDENTIALS.email.split('@')[1]
		);
		expect(foreign).toEqual([]);
	});

	test('conserva un correo largo de ejemplo para la fila que se recorta', () => {
		const emails = (DEMO_SEED.editors ?? []).map((editor) => editor.email);
		const longest = emails.reduce((a, b) => (b.length > a.length ? b : a), '');
		expect(longest.length).toBeGreaterThan(60);
		expect(longest.endsWith('.example.org')).toBe(true);
	});
});

test('el escaparate declara páginas con rutas reales y detecta /precios como enlace roto', async () => {
	const { users, contentTypes, records, scheduledPublishing } = SHOWCASE_SEED;
	const port = createMemoryBackend({ users, contentTypes, records, scheduledPublishing });
	await port.login(DEMO_CREDENTIALS);
	const model = await loadContentModel(port);
	const type = model.types.find((candidate) => candidate.name === 'paginas')!;
	const home = await port.get('paginas', 'pagina_1');

	expect(type.page).toMatchObject({ pathField: 'path', pathFieldUnique: true });
	const data = await loadReviewData(port, model, type, home);
	expect(data.pages).toEqual(
		expect.arrayContaining([
			{ type: 'paginas', id: 'pagina_1', path: '/', published: false },
			{ type: 'paginas', id: 'pagina_2', path: '/sobre-mi', published: true }
		])
	);
	expect(data.pages).toHaveLength(5);
	const result = reviewRecord({ type, record: home, model, ...data });
	expect(result.skipped).not.toContain('link.broken');
	expect(result.findings).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ check: 'link.broken', params: { href: '/precios' } })
		])
	);
});
