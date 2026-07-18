/**
 * Suite de regresión del round-trip Markdown↔TipTap (D-P5.8, spike D-P5.8 ya cerrado): fija como
 * test los casos que el spike verificó byte-exactos (parse→serialize devuelve el MISMO string,
 * salvo el salto de línea final que `marked`/el serializador no reproducen — se compara con
 * `.trim()`, igual que hizo el spike). Un cambio de versión de `@tiptap/markdown` que rompa
 * alguno de estos casos debe fallar AQUÍ, no descubrirse en producción.
 *
 * Sin DOM: `MarkdownManager` (via `parseMarkdown`/`serializeMarkdown`) trabaja sobre JSON de
 * ProseMirror en memoria, así que este fichero corre en el entorno `node` por defecto del repo
 * (`vite.config.ts`) — no necesita jsdom, a diferencia de `sanitize.test.ts`.
 */
import { describe, expect, test } from 'vitest';
import { parseMarkdown, serializeMarkdown } from './markdown';

/** Round-trip: MD → doc TipTap → MD, comparado sin el salto de línea final. */
function roundTrip(markdown: string): string {
	return serializeMarkdown(parseMarkdown(markdown)).trim();
}

describe('round-trip byte-exacto (D-P5.8)', () => {
	test.each([
		['h1', '# Título\n'],
		['h2', '## Título\n'],
		['h3', '### Título\n'],
		['h4', '#### Título\n'],
		['párrafo plano', 'Un párrafo cualquiera.\n'],
		['negrita', '**negrita**\n'],
		['cursiva', '*cursiva*\n'],
		['tachado', '~~tachado~~\n'],
		['negrita anidando cursiva', '**bold *and italic* text**\n'],
		['código inline', '`código`\n'],
		['bloque de código con lenguaje', '```js\nconst x = 1;\n```\n'],
		['bloque de código sin lenguaje', '```\nplain\n```\n'],
		['cita', '> una cita\n'],
		['lista con viñetas anidada', '- a\n- b\n  - anidado\n- c\n'],
		['lista ordenada', '1. uno\n2. dos\n'],
		['enlace con título', '[enlace](https://example.com "un título")\n'],
		['imagen', '![texto alternativo](https://example.com/foto.png)\n'],
		['escape de asterisco', '\\*no es negrita\\*\n'],
		['escape de guion bajo', '\\_no es cursiva\\_\n'],
		['regla horizontal', '---\n'],
		['párrafos separados por una línea en blanco', 'párrafo uno\n\npárrafo dos\n']
	])('%s', (_label, markdown) => {
		expect(roundTrip(markdown)).toBe(markdown.trim());
	});
});

describe('limitaciones conocidas (D-P5.8, NO byte-exactas — documentadas, no regresión)', () => {
	test('HTML embebido con atributos no sobrevive el round-trip (pertenece a richtext, no a markdown)', () => {
		const md = '<div class="foo">html crudo</div>\n';
		expect(roundTrip(md)).not.toBe(md.trim());
	});
});

/**
 * Regresión del MUST FIX de la auditoría de seguridad (F5-d): `@tiptap/extension-link`/`-image`
 * validan el esquema en su path HTML pero NO en `parseMarkdown`/`renderMarkdown` — sin el parche
 * `SafeLink`/`SafeImage` de `editor.ts` (que enruta `href`/`src` por `safeUri()`, ver `safe-uri.ts`
 * y su test propio), un `[x](javascript:alert(1))` sobrevive el round-trip BYTE A BYTE y viaja tal
 * cual a `onChange`/al backend — XSS almacenado para cualquier consumidor del Markdown aguas
 * abajo. Estos casos fijan que el href/src peligroso NUNCA sobrevive, y que uno legítimo sí.
 */
describe('MUST FIX seguridad — esquemas de URI peligrosos NUNCA sobreviven el round-trip', () => {
	test.each([
		['enlace javascript:', '[click](javascript:alert(1))\n'],
		['enlace data:', '[click](data:text/html,<script>alert(1)</script>)\n'],
		['enlace vbscript:', '[click](vbscript:msgbox(1))\n'],
		['enlace javascript: ofuscado con entidad decimal', '[click](java&#115;cript:alert(1))\n'],
		['imagen javascript:', '![a](javascript:alert(1))\n'],
		['imagen data:', '![a](data:image/svg+xml;base64,PHN2Zz4=)\n']
	])('%s → el href/src desaparece tras el round-trip', (_label, markdown) => {
		const out = roundTrip(markdown);
		expect(out).not.toContain('javascript:');
		expect(out).not.toContain('data:');
		expect(out).not.toContain('vbscript:');
	});

	test('enlace http/https/mailto y ruta relativa SÍ sobreviven (no es una regresión funcional)', () => {
		expect(roundTrip('[a](https://example.com/x)\n')).toBe('[a](https://example.com/x)');
		expect(roundTrip('[a](mailto:x@example.com)\n')).toBe('[a](mailto:x@example.com)');
		expect(roundTrip('[a](/ruta/relativa)\n')).toBe('[a](/ruta/relativa)');
		expect(roundTrip('![alt](https://example.com/x.png "un título")\n')).toBe(
			'![alt](https://example.com/x.png "un título")'
		);
	});
});
