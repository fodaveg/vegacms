/**
 * Artefactos al día (§5.4/§9.5 del contrato P7, L3 "fuente única generada"): regenerar
 * `themes.generated.css`/`themes.generated.ts` desde los `*.theme.json` + `index.json` actuales
 * (invocando el generador REAL, `pnpm themes:build`) debe dar EXACTAMENTE lo committeado. Si
 * alguien edita el generado a mano o olvida regenerar tras tocar un `*.theme.json`, este test lo
 * detecta — es el mismo criterio que la comprobación 1 de `check-theme-coverage.mjs`, aislado
 * como test unitario para no arrastrar las OTRAS comprobaciones del checker (que hoy sí fallan
 * por código de P3/P2 aún sin migrar al vocabulario §3, ver el resumen de la fase).
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(__dirname, '../..');
const CSS_OUT = join(ROOT, 'src/lib/themes/themes.generated.css');
const TS_OUT = join(ROOT, 'src/lib/themes/themes.generated.ts');
const BUILD_SCRIPT = join(ROOT, 'scripts/build-themes.mjs');

describe('themes.generated.css / themes.generated.ts al día', () => {
	test('regenerar con el pipeline real reproduce byte a byte lo committeado', () => {
		const before = {
			css: readFileSync(CSS_OUT, 'utf8'),
			ts: readFileSync(TS_OUT, 'utf8')
		};

		execFileSync(process.execPath, [BUILD_SCRIPT], { cwd: ROOT, stdio: 'pipe' });

		const after = {
			css: readFileSync(CSS_OUT, 'utf8'),
			ts: readFileSync(TS_OUT, 'utf8')
		};

		// Si difieren, `before` (el estado committeado) queda demostrado obsoleto: el mensaje de
		// fallo de vitest muestra el diff exacto entre lo que había y lo que el pipeline produce.
		expect(after.css).toBe(before.css);
		expect(after.ts).toBe(before.ts);
	});
});
