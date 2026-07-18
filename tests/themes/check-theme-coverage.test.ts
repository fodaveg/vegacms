/**
 * Checker anti-parches (§5.4/§9.6 del contrato P7): fixtures sintéticos (sin tocar disco) para
 * las dos comprobaciones de contenido de `scripts/check-theme-coverage.mjs` — color crudo fuera
 * de `src/lib/themes/` y `[data-theme=` a mano. La comprobación 1 (artefactos al día) ya la
 * cubre `artifacts-in-sync.test.ts`.
 */

import { describe, expect, test } from 'vitest';
import {
	findDataThemeViolations,
	findRawColorViolations,
	stripComments
} from '../../scripts/check-theme-coverage.mjs';

describe('findRawColorViolations', () => {
	test('un hex crudo en un .svelte → violación', () => {
		const files = [{ file: 'src/lib/shell/Widget.svelte', content: '.x { color: #ff0000; }' }];
		const { violations } = findRawColorViolations(files, []);
		expect(violations).toHaveLength(1);
		expect(violations[0].file).toBe('src/lib/shell/Widget.svelte');
	});

	test('rgb()/color-mix() de marca en un .ts → violación', () => {
		const files = [
			{ file: 'src/lib/shell/a.ts', content: "const c = 'rgb(0 0 0 / 20%)';" },
			{ file: 'src/lib/shell/b.ts', content: "const c = 'color-mix(in oklab, red, blue)';" }
		];
		const { violations } = findRawColorViolations(files, []);
		expect(violations).toHaveLength(2);
	});

	test('solo var(--token) del vocabulario → pasa', () => {
		const files = [{ file: 'src/lib/shell/Widget.svelte', content: '.x { color: var(--ink); }' }];
		const { violations } = findRawColorViolations(files, []);
		expect(violations).toEqual([]);
	});

	test('color dentro de un comentario de bloque → no cuenta (stripComments)', () => {
		const files = [
			{
				file: 'src/lib/shell/Widget.svelte',
				content: '/* ejemplo: #ff0000 */\n.x { color: var(--ink); }'
			}
		];
		const { violations } = findRawColorViolations(files, []);
		expect(violations).toEqual([]);
	});

	test('entrada en la allowlist evita la violación y queda "matched" (sin quedar obsoleta)', () => {
		const files = [{ file: 'src/lib/shell/Widget.svelte', content: '.x { color: #ff0000; }' }];
		const allowlist = [
			{ file: 'src/lib/shell/Widget.svelte', snippet: 'color: #ff0000', reason: 'test' }
		];
		const { violations, staleAllowlist } = findRawColorViolations(files, allowlist);
		expect(violations).toEqual([]);
		expect(staleAllowlist).toEqual([]);
	});
});

describe('findDataThemeViolations', () => {
	test('[data-theme= a mano en un .svelte → violación', () => {
		const files = [
			{
				file: 'src/routes/+page.svelte',
				content: '<style>[data-theme="niebla"] { color: red; }</style>'
			}
		];
		const violations = findDataThemeViolations(files);
		expect(violations).toHaveLength(1);
	});

	test('sin [data-theme= a mano → pasa', () => {
		const files = [
			{ file: 'src/routes/+page.svelte', content: '<style>.x { color: var(--ink); }</style>' }
		];
		expect(findDataThemeViolations(files)).toEqual([]);
	});
});

describe('stripComments', () => {
	test('quita comentarios de bloque y de línea preservando el nº de líneas', () => {
		const input = '/* uno\ndos */\ntres // cuatro\ncinco';
		const out = stripComments(input);
		expect(out.split('\n')).toHaveLength(4);
		expect(out).not.toContain('uno');
		expect(out).not.toContain('cuatro');
		expect(out).toContain('tres');
		expect(out).toContain('cinco');
	});
});
