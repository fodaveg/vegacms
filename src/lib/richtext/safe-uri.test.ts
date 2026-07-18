/**
 * Suite de `safe-uri.ts` (MUST FIX de la auditoría de seguridad, F5-d): la función pura que cierra
 * el hueco de XSS almacenado en el path Markdown de `Link`/`Image` (ver cabecera de `editor.ts`).
 */
import { describe, expect, test } from 'vitest';
import { safeUri } from './safe-uri';

describe('safeUri — esquemas peligrosos → cadena vacía', () => {
	test.each([
		'javascript:alert(1)',
		'JAVASCRIPT:alert(1)',
		'  javascript:alert(1)  ',
		'java\tscript:alert(1)',
		'java\nscript:alert(1)',
		'java\rscript:alert(1)',
		'java&#115;cript:alert(1)',
		'java&#x73;cript:alert(1)',
		'JAVA&#X73;CRIPT:alert(1)',
		'data:text/html,<script>alert(1)</script>',
		'DATA:text/html,x',
		'data:image/svg+xml;base64,PHN2Zz4=',
		'vbscript:msgbox(1)',
		'file:///etc/passwd'
	])('safeUri(%j) === ""', (input) => {
		expect(safeUri(input)).toBe('');
	});
});

describe('safeUri — esquemas y formas legítimas → intactos', () => {
	test.each([
		['http://example.com', 'http://example.com'],
		['https://example.com/x?y=1#z', 'https://example.com/x?y=1#z'],
		['HTTPS://EXAMPLE.COM', 'HTTPS://EXAMPLE.COM'],
		['mailto:x@example.com', 'mailto:x@example.com'],
		['/relative/path', '/relative/path'],
		['relative/path', 'relative/path'],
		['./relative/path', './relative/path'],
		['../up/path', '../up/path'],
		['#anchor', '#anchor'],
		['//example.com/protocol-relative', '//example.com/protocol-relative'],
		['  https://example.com  ', 'https://example.com']
	])('safeUri(%j) === %j', (input, expected) => {
		expect(safeUri(input)).toBe(expected);
	});
});

describe('safeUri — casos límite', () => {
	test('cadena vacía → cadena vacía', () => {
		expect(safeUri('')).toBe('');
	});

	test('solo espacios → cadena vacía', () => {
		expect(safeUri('   ')).toBe('');
	});

	test('null/undefined → cadena vacía (L11, degradar sin crashear)', () => {
		expect(safeUri(null)).toBe('');
		expect(safeUri(undefined)).toBe('');
	});
});
