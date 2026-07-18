/**
 * Proxy HTTP mínimo, solo para el test "respuesta 2xx con cuerpo corrupto → backend" (§9.5):
 * reenvía todo tal cual a un PocketBase real, EXCEPTO `GET /api/collections`, que responde 200
 * con un cuerpo sin `items[]` (forma que `listContentTypes` no puede interpretar como esquema
 * válido). No se añade ninguna dependencia: `http`/`node:net` de Node bastan para esto.
 */

import http from 'node:http';
import type { Server } from 'node:http';

export interface CorruptingProxy {
	url: string;
	stop(): Promise<void>;
}

export async function startCorruptingProxy(targetUrl: string): Promise<CorruptingProxy> {
	const target = new URL(targetUrl);

	const server: Server = http.createServer((req, res) => {
		const isCollectionsList = req.method === 'GET' && req.url?.split('?')[0] === '/api/collections';
		if (isCollectionsList) {
			const body = JSON.stringify({ esto: 'no es una lista de colecciones' });
			res.writeHead(200, {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body)
			});
			res.end(body);
			return;
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
		stop: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}
