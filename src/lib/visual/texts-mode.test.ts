/**
 * `texts-mode.ts` (Lote 12, lámina 8): la ÚNICA definición de «qué cuenta como texto» en el modo
 * «solo textos». Se prueba contra el vocabulario cerrado de widgets entero (`WIDGET_IDS`), no con
 * una lista escrita a mano aquí: si mañana entra un widget nuevo, este test lo ve y obliga a
 * decidir de qué lado cae.
 */
import { describe, expect, test } from 'vitest';
import { WIDGET_IDS, type WidgetId } from '$lib/model/types';
import { isTextWidget, splitTextFields, TEXT_WIDGETS } from './texts-mode';

describe('texts-mode', () => {
	test('solo `text` y `textarea` cuentan como texto; el texto con formato queda fuera', () => {
		const texts = WIDGET_IDS.filter(isTextWidget);
		expect(texts).toEqual(['text', 'textarea']);
		expect(isTextWidget('markdown')).toBe(false);
		expect(isTextWidget('richtext')).toBe(false);
	});

	test('`TEXT_WIDGETS` es un subconjunto del vocabulario cerrado', () => {
		for (const widget of TEXT_WIDGETS) expect(WIDGET_IDS).toContain(widget);
	});

	test('`splitTextFields` reparte conservando el orden original en cada mitad', () => {
		const fields: { name: string; widget: WidgetId }[] = [
			{ name: 'titulo', widget: 'text' },
			{ name: 'imagen', widget: 'file' },
			{ name: 'cuerpo', widget: 'textarea' },
			{ name: 'enlace', widget: 'url' },
			{ name: 'contenido', widget: 'richtext' }
		];
		const { texts, rest } = splitTextFields(fields);
		expect(texts.map((f) => f.name)).toEqual(['titulo', 'cuerpo']);
		expect(rest.map((f) => f.name)).toEqual(['imagen', 'enlace', 'contenido']);
	});

	test('sin campos, las dos mitades salen vacías (sección sin textos)', () => {
		expect(splitTextFields([])).toEqual({ texts: [], rest: [] });
	});
});
