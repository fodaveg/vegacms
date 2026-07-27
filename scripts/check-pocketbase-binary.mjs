#!/usr/bin/env node
/**
 * Guard anti-FALSO VERDE del binario de PocketBase. Corre dentro de `pnpm gate` (justo detrás de
 * `pnpm pb:download`) y falla si `.pbbin/pocketbase` no está listo.
 *
 * Por qué existe: los tests de contrato contra PB real (`tests/contract/pocketbase.*.test.ts`) ya
 * forman parte de `pnpm test`, pero se auto-saltan con `describe.skip` cuando no encuentran el
 * binario (ver `tests/contract/pb-harness/binary.ts`). Sin este guard, un `pnpm gate` LOCAL sale
 * verde habiéndose saltado en silencio ~87 tests: justo la mitad que ejerce PocketBase de verdad,
 * que es donde vive el riesgo de cualquier cambio del adaptador. Medido el 2026-07-27 revisando el
 * lote de campos `relation`: gate en verde, 93 tests saltados sin que nada lo dijera.
 *
 * Este guard vivía inline (bash, `if [ ! -x .pbbin/pocketbase ]`) repetido en cuatro pasos de
 * `ci.yml` y `release.yml`. Ahora es UN script que llaman los workflows y el gate local, así que
 * CI y la máquina de cada cual comprueban exactamente lo mismo.
 *
 * Escotilla `VEGA_ALLOW_NO_PB=1`: `scripts/download-pocketbase.mjs` termina con ÉXITO silencioso
 * si no hay red (decisión deliberada, ver su cabecera: en un proyecto MIT, quien contribuye sin
 * conexión tiene que poder pasar el gate). Esa escotilla conserva esa propiedad sin regalar el
 * falso verde: hay que pedirla A MANO, y cuando se usa el aviso sale igual de escandaloso. La
 * diferencia con lo de antes no es la posibilidad de saltárselo, es que ahora se sabe.
 */

import { existsSync, accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.resolve(
	__dirname,
	'..',
	'.pbbin',
	process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase'
);

/** Anotación nativa de GitHub Actions cuando corremos ahí; texto plano en local. */
function fail(message) {
	const prefix = process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '[pb-guard] ERROR: ';
	console.error(`${prefix}${message}`);
	process.exit(1);
}

function isExecutable(file) {
	if (!existsSync(file)) return false;
	// En Windows no hay bit de ejecución; que exista es todo lo que se puede comprobar.
	if (process.platform === 'win32') return true;
	try {
		accessSync(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

if (!isExecutable(BIN_PATH)) {
	if (process.env.VEGA_ALLOW_NO_PB === '1') {
		console.warn(
			`[pb-guard] AVISO: no hay binario de PocketBase en ${BIN_PATH} y VEGA_ALLOW_NO_PB=1 ` +
				`permite continuar.\n` +
				`[pb-guard] La suite de contrato contra PB REAL se saltará entera. Este gate NO acredita ` +
				`que el adaptador de PocketBase funcione: no lo uses para dar por bueno un cambio de ` +
				`src/lib/backend/adapters/pocketbase/ ni de las migraciones.`
		);
	} else {
		fail(
			`no hay binario ejecutable de PocketBase en ${BIN_PATH} tras 'pnpm pb:download'. ` +
				`La suite de contrato contra PB real se saltaría EN SILENCIO y el gate daría un falso ` +
				`verde. Revisa la conectividad con GitHub Releases o scripts/download-pocketbase.mjs. ` +
				`Si de verdad quieres correr el gate sin PocketBase (p.ej. sin red), pídelo a mano con ` +
				`VEGA_ALLOW_NO_PB=1.`
		);
	}
} else {
	let version = 'desconocida';
	try {
		const out = execFileSync(BIN_PATH, ['--version'], { encoding: 'utf8' });
		version = out.match(/(\d+\.\d+\.\d+)/)?.[1] ?? 'desconocida';
	} catch {
		fail(
			`el binario ${BIN_PATH} existe pero no se puede ejecutar (¿arquitectura equivocada o ` +
				`descarga a medias?). Bórralo y vuelve a correr 'pnpm pb:download'.`
		);
	}
	console.log(
		`[pb-guard] PocketBase ${version} listo: la suite de contrato se ejecutará de verdad.`
	);
}
