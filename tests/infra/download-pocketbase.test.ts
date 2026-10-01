/**
 * `scripts/download-pocketbase.mjs` falla CERRADO cuando la versión pedida no tiene hash en
 * `PB_CHECKSUMS` (revisión de seguridad del 30 sep 2026): antes avisaba y descargaba sin verificar.
 *
 * El script ejecuta `main()` al cargarse, así que se prueba como lo que es: un proceso. Va con un
 * `fetch` sustituido por `--import` que delata la llamada y falla, de modo que el test no toca la
 * red ni escribe en `.pbbin/` en ningún caso, ni con el script de antes ni con el de ahora.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'download-pocketbase.mjs');

const FETCH_MARK = 'FETCH-LLAMADO';
const FETCH_STUB =
	'data:text/javascript,' +
	encodeURIComponent(
		`globalThis.fetch = async () => { console.error('${FETCH_MARK}'); throw new Error('sin red (test)'); };`
	);

function runDownload(pbVersion: string | undefined) {
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.PB_VERSION;
	if (pbVersion !== undefined) env.PB_VERSION = pbVersion;
	const result = spawnSync(process.execPath, ['--import', FETCH_STUB, SCRIPT], {
		cwd: REPO_ROOT,
		env,
		encoding: 'utf8'
	});
	return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('download-pocketbase.mjs: versión sin hash conocido', () => {
	test.each(['0.0.1', '0.39.8', '99.0.0'])(
		'PB_VERSION=%s (sin entrada en PB_CHECKSUMS) → sale con error y NO descarga',
		(version) => {
			const { status, output } = runDownload(version);
			expect(output).not.toContain(FETCH_MARK);
			expect(status).toBe(1);
			expect(output).toContain(version);
			expect(output).toContain('PB_CHECKSUMS');
		}
	);

	test.each([
		['la pineada (sin PB_VERSION)', undefined],
		['0.39.9', '0.39.9'],
		['0.26.0, la mínima soportada', '0.26.0']
	])('%s sí tiene hash: no se rechaza por falta de checksum', (_caso, version) => {
		const { status, output } = runDownload(version);
		// Con el binario ya en `.pbbin/` dice «ya disponible»; sin él intenta descargar, el `fetch`
		// de mentira falla y el script conserva su éxito silencioso de «sin red».
		expect(status).toBe(0);
		expect(output).not.toContain('PB_CHECKSUMS');
	});
});
