/**
 * Proxy HTTP para simular fallos de TRANSPORTE en endpoints de auth de PocketBase, sin tocar el
 * servidor real (§4.1/§5): reenvía todo tal cual, EXCEPTO las rutas de auth que se hayan
 * "armado" con `setStatus`, que responden con el status forzado en vez de llegar al backend.
 * Existe para dos escenarios difíciles de provocar de forma fiable contra un PB real:
 *
 * - `login`/`restoreSession` con un 5xx del servidor (¿el mapeo colapsa a `forbidden`, como si
 *   fueran credenciales malas / token inválido, o distingue "el servidor petó" de verdad?).
 * - Invalidación REACTIVA de sesión (403 en un endpoint de registros, con el token aún
 *   localmente válido) para forzar el camino del `catch` de `guarded()` en vez del chequeo
 *   proactivo por `exp` — el único sitio donde vivía la carrera de L7 (ver `index.ts`).
 */

import http from 'node:http';
import type { Server } from 'node:http';

export interface AuthFailureProxy {
	url: string;
	stop(): Promise<void>;
	/**
	 * Fuerza `status` para peticiones cuyo path CONTENGA `pathMatch` (p.ej. `/auth-refresh`, o
	 * `/collections/category/records` para capturar TANTO `list` como `get` de esa colección).
	 * `null` = passthrough (deja de forzarlo).
	 */
	setStatus(pathMatch: string, status: number | null): void;
}

function sendForcedStatus(res: import('node:http').ServerResponse, status: number): void {
	const body = JSON.stringify({
		message: `Simulado por el harness de tests: status ${status}`,
		data: {}
	});
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(body)
	});
	res.end(body);
}

export async function startAuthFailureProxy(targetUrl: string): Promise<AuthFailureProxy> {
	const target = new URL(targetUrl);
	const forcedByMatch = new Map<string, number>();

	const server: Server = http.createServer((req, res) => {
		const path = req.url?.split('?')[0] ?? '';
		for (const [pathMatch, status] of forcedByMatch) {
			if (path.includes(pathMatch)) {
				sendForcedStatus(res, status);
				return;
			}
		}

		const upstream = http.request(
			{
				hostname: target.hostname,
				port: target.port,
				path: req.url,
				method: req.method,
				headers: req.headers
			},
			(upstreamRes) => {
				res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
				upstreamRes.pipe(res);
			}
		);
		upstream.on('error', () => {
			res.writeHead(502);
			res.end();
		});
		req.pipe(upstream);
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	return {
		url: `http://127.0.0.1:${port}`,
		stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
		setStatus(pathMatch, status) {
			if (status === null) forcedByMatch.delete(pathMatch);
			else forcedByMatch.set(pathMatch, status);
		}
	};
}
