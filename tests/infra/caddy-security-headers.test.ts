/**
 * Cabeceras de seguridad de los fragmentos de Caddy del repo (`infra/**\/*.caddy`).
 *
 * No sustituye a `caddy validate` (lo corre `infra/production/validate.sh` en el servidor) ni a la
 * prueba en navegador: fija lo que un cambio de mantenimiento rompería sin que nada avise. Que la
 * CSP siga permitiendo lo que la SPA necesita para arrancar, que no se cuele por las rutas donde
 * PocketBase pone la suya, y que la receta de `docs/DEPLOYMENT.md` sea la misma política.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INFRA_DIR = path.join(REPO_ROOT, 'infra');

const caddyFiles = readdirSync(INFRA_DIR, { recursive: true, encoding: 'utf8' })
	.filter((file) => file.endsWith('.caddy'))
	.map((file) => path.join(INFRA_DIR, file));

/** Líneas de configuración, sin comentarios ni sangría. */
function directives(source: string): string[] {
	return source
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));
}

/** `{ 'default-src': ["'self'"], … }` a partir del valor de la cabecera. */
function parseCsp(policy: string): Record<string, string[]> {
	return Object.fromEntries(
		policy
			.split(';')
			.map((part) => part.trim().split(/\s+/))
			.filter(([name]) => name)
			.map(([name, ...sources]) => [name, sources])
	);
}

const CSP_LINE = /^header (@\w+) Content-Security-Policy "([^"]+)"$/;

describe('infra: cabeceras de seguridad en Caddy', () => {
	test('hay al menos un fragmento de Caddy que comprobar', () => {
		expect(caddyFiles.length).toBeGreaterThan(0);
	});

	describe.each(caddyFiles.map((file) => [path.relative(REPO_ROOT, file), file]))(
		'%s',
		(_name, file) => {
			const lines = directives(readFileSync(file, 'utf8'));
			const match = lines.map((line) => CSP_LINE.exec(line)).find((found) => found !== null);

			test('envía nosniff, Referrer-Policy y HSTS', () => {
				expect(lines).toContain('X-Content-Type-Options "nosniff"');
				expect(lines).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
				expect(lines.some((line) => line.startsWith('Strict-Transport-Security '))).toBe(true);
			});

			test('la CSP cierra lo que se pidió y deja lo que la SPA necesita', () => {
				expect(match).toBeTruthy();
				const csp = parseCsp(match![2]);

				expect(csp['default-src']).toEqual(["'self'"]);
				expect(csp['frame-ancestors']).toEqual(["'none'"]);
				expect(csp['object-src']).toEqual(["'none'"]);
				expect(csp['base-uri']).toEqual(["'self'"]);

				// El `<script>` en línea de `index.html` y los atributos `style`: sin esto no arranca.
				expect(csp['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
				expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
				// Medios, vistas previas locales, API y realtime, y el sitio en el `<iframe>`.
				expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
				expect(csp['connect-src']).toEqual(expect.arrayContaining(["'self'", 'https:']));
				expect(csp['frame-src']).toEqual(expect.arrayContaining(['https:']));
				// La vista previa envía su token con un `<form>` POST al sitio, de otro origen.
				expect(csp).not.toHaveProperty('form-action');

				// Nada de comodines ni de `eval`.
				const sources = Object.values(csp).flat();
				expect(sources).not.toContain('*');
				expect(sources).not.toContain("'unsafe-eval'");
				expect(sources).not.toContain('http:');
			});

			test('la CSP no alcanza /api ni /_/, donde PocketBase pone la suya', () => {
				const matcher = match![1];
				const start = lines.indexOf(`${matcher} {`);
				expect(start).toBeGreaterThanOrEqual(0);
				expect(lines[start + 1]).toBe('not path /api/* /_/*');
				expect(lines[start + 2]).toBe('}');
			});

			test('la CSP va en su propio header, fuera del bloque diferido que sustituye cabeceras', () => {
				const block = lines.slice(lines.indexOf('header {'), lines.indexOf('-Server') + 1);
				expect(block.some((line) => line.includes('Content-Security-Policy'))).toBe(false);
			});
		}
	);

	test('docs/DEPLOYMENT.md documenta la misma política que la instancia de referencia', () => {
		const reference = readFileSync(
			path.join(INFRA_DIR, 'production', 'admin.vegacms.com.caddy'),
			'utf8'
		);
		const policy = directives(reference)
			.map((line) => CSP_LINE.exec(line))
			.find((found) => found !== null)![2];
		const docs = readFileSync(path.join(REPO_ROOT, 'docs', 'DEPLOYMENT.md'), 'utf8');

		expect(docs).toContain(`Content-Security-Policy "${policy}"`);
	});
});
