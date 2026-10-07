/**
 * Tests de `default-labels.ts` (lote 11, tarea 1): la etiqueta por defecto sale del catálogo,
 * y la del manifiesto, cuando existe, gana siempre.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { ensureLocaleLoaded, t as translate, type Locale } from '$lib/i18n';
import { fieldDisplayLabel, statusValueLabel } from './default-labels';

const tFor = (locale: Locale) => (key: string, params?: Record<string, string | number>) =>
	translate(locale, key, params);

beforeAll(async () => {
	await ensureLocaleLoaded('en');
});

describe('fieldDisplayLabel', () => {
	test('humanización por defecto → catálogo (es y en)', () => {
		expect(fieldDisplayLabel({ name: 'title', label: 'Title' }, tFor('es'))).toBe('Título');
		expect(fieldDisplayLabel({ name: 'status', label: 'Status' }, tFor('es'))).toBe('Estado');
		expect(fieldDisplayLabel({ name: 'title', label: 'Title' }, tFor('en'))).toBe('Title');
		expect(fieldDisplayLabel({ name: 'status', label: 'Status' }, tFor('en'))).toBe('Status');
		expect(fieldDisplayLabel({ name: 'path', label: 'Path' }, tFor('es'))).toBe('Ruta');
		expect(fieldDisplayLabel({ name: 'layout', label: 'Layout' }, tFor('es'))).toBe('Plantilla');
		expect(fieldDisplayLabel({ name: 'path', label: 'Path' }, tFor('en'))).toBe('Path');
		expect(fieldDisplayLabel({ name: 'layout', label: 'Layout' }, tFor('en'))).toBe('Layout');
	});

	test('etiqueta del manifiesto: se respeta', () => {
		expect(fieldDisplayLabel({ name: 'title', label: 'Titular' }, tFor('es'))).toBe('Titular');
		expect(fieldDisplayLabel({ name: 'path', label: 'URL pública' }, tFor('es'))).toBe(
			'URL pública'
		);
	});

	test('campo sin entrada en el catálogo: la etiqueta resuelta', () => {
		expect(fieldDisplayLabel({ name: 'hero_image', label: 'Hero image' }, tFor('es'))).toBe(
			'Hero image'
		);
	});
});

describe('statusValueLabel', () => {
	test('draft/published sin statusLabels → catálogo', () => {
		expect(statusValueLabel(null, 'draft', tFor('es'))).toBe('Borrador');
		expect(statusValueLabel(null, 'published', tFor('es'))).toBe('Publicada');
		expect(statusValueLabel(null, 'draft', tFor('en'))).toBe('Draft');
		expect(statusValueLabel(null, 'published', tFor('en'))).toBe('Published');
	});

	test('statusLabels del manifiesto gana; valor desconocido → crudo', () => {
		expect(statusValueLabel({ published: 'En línea' }, 'published', tFor('es'))).toBe('En línea');
		expect(statusValueLabel({ published: 'En línea' }, 'draft', tFor('es'))).toBe('Borrador');
		expect(statusValueLabel(null, 'archived', tFor('es'))).toBe('archived');
	});
});
