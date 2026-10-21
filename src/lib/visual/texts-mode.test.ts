/**
 * `texts-mode.ts` (Lote 12, lámina 8): la ÚNICA definición de «qué cuenta como texto» en el modo
 * «solo textos». Se prueba contra el vocabulario cerrado de widgets entero (`WIDGET_IDS`), no con
 * una lista escrita a mano aquí: si mañana entra un widget nuevo, este test lo ve y obliga a
 * decidir de qué lado cae.
 */
import { describe, expect, test } from 'vitest';
import { WIDGET_IDS, type WidgetId } from '$lib/model/types';
import {
	isPlainTextWidget,
	isTextWidget,
	splitTextFields,
	TEXT_WIDGETS,
	textsModeField
} from './texts-mode';

describe('texts-mode', () => {
	test('`text`, `textarea` y `markdown` cuentan como texto; el `richtext` queda fuera', () => {
		const texts = WIDGET_IDS.filter(isTextWidget);
		expect(texts).toEqual(['text', 'textarea', 'markdown']);
		expect(isTextWidget('richtext')).toBe(false);
	});

	test('en la página solo se escribe texto plano: el markdown no', () => {
		expect(WIDGET_IDS.filter(isPlainTextWidget)).toEqual(['text', 'textarea']);
	});

	test('el markdown se pinta como textarea con su fuente; lo demás no cambia', () => {
		const body = { name: 'bodyEs', label: 'Cuerpo', widget: 'markdown' as WidgetId };
		expect(textsModeField(body)).toEqual({ ...body, widget: 'textarea' });
		const title = { name: 'titleEs', widget: 'text' as WidgetId };
		expect(textsModeField(title)).toBe(title);
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
			{ name: 'markdown', widget: 'markdown' },
			{ name: 'contenido', widget: 'richtext' }
		];
		const { texts, rest } = splitTextFields(fields);
		expect(texts.map((f) => f.name)).toEqual(['titulo', 'cuerpo', 'markdown']);
		expect(rest.map((f) => f.name)).toEqual(['imagen', 'enlace', 'contenido']);
	});

	test('sin campos, las dos mitades salen vacías (sección sin textos)', () => {
		expect(splitTextFields([])).toEqual({ texts: [], rest: [] });
	});
});
