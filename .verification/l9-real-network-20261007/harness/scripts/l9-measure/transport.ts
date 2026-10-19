/** Sanitized transparent proxy: every successful response comes from real PocketBase. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type { BrowserContext, Request } from '@playwright/test';
export interface Event {
	method: string;
	path: string;
	fields: string | null;
	status?: number;
	bytes?: number;
	start: number;
	end?: number;
	resource?: string;
	failed?: boolean;
	listIds?: { count: number; unique: number };
}
const pathOf = (url: URL) =>
	url.pathname
		.replace(/\/records\/[^/]+$/, '/records/:id')
		.replace(/\/preview\/[^/]+\/[^/]+$/, '/preview/:collection/:id')
		.replace(/\/preview-share\/[^/]+$/, '/preview-share/:token');
export function record(url: URL, method: string): Event {
	return {
		method,
		path: pathOf(url),
		fields: url.searchParams.get('fields'),
		start: performance.now()
	};
}
async function listen(server: ReturnType<typeof createServer>) {
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('No local address');
	return `http://127.0.0.1:${address.port}`;
}
export async function proxyPocketBase(target: string) {
	const events: Event[] = [];
	let held:
		| { promise: Promise<void>; release: () => void; captured: Promise<void>; capture: () => void }
		| undefined;
	let holdNext = false;
	const server = createServer((req, res) => {
		void forward(req, res).catch(() => {
			if (!res.headersSent) res.writeHead(502);
			res.end();
		});
	});
	async function forward(req: IncomingMessage, res: ServerResponse) {
		const url = new URL(req.url ?? '/', target);
		const event = record(url, req.method ?? 'GET');
		events.push(event);
		const chunks = [];
		for await (const chunk of req) chunks.push(Buffer.from(chunk));
		try {
			const headers = new Headers();
			for (const [k, v] of Object.entries(req.headers)) {
				if (v !== undefined && !['host', 'connection', 'content-length'].includes(k))
					headers.set(k, Array.isArray(v) ? v.join(',') : v);
			}
			const response = await fetch(url, {
				method: req.method,
				headers,
				...(['GET', 'HEAD'].includes(req.method ?? 'GET') ? {} : { body: Buffer.concat(chunks) }),
				redirect: 'manual',
				signal: AbortSignal.timeout(20_000)
			});
			const body = Buffer.from(await response.arrayBuffer());
			if (
				url.pathname === '/api/collections/pages/records' &&
				req.method === 'GET' &&
				response.ok
			) {
				const items = JSON.parse(body.toString()).items;
				if (Array.isArray(items))
					event.listIds = {
						count: items.length,
						unique: new Set(items.map((item: { id: string }) => item.id)).size
					};
			}
			event.status = response.status;
			event.bytes = body.length;
			if (holdNext && url.pathname === '/api/collections/pages/records' && req.method === 'GET') {
				holdNext = false;
				held?.capture();
				await held?.promise;
			}
			for (const [k, v] of response.headers)
				if (!['content-length', 'content-encoding', 'connection', 'transfer-encoding'].includes(k))
					res.setHeader(k, v);
			res.writeHead(response.status);
			res.end(body);
		} catch {
			event.failed = true;
			event.status = 502;
			if (!res.headersSent) res.writeHead(502);
			res.end();
		} finally {
			event.end = performance.now();
		}
	}
	const url = await listen(server);
	return {
		url,
		events,
		reset() {
			events.length = 0;
		},
		holdNextPagesList() {
			let release!: () => void, capture!: () => void;
			held = {
				promise: new Promise((r) => (release = r)),
				release: () => release(),
				captured: new Promise((r) => (capture = r)),
				capture: () => capture()
			};
			holdNext = true;
			return held;
		},
		async close() {
			held?.release();
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
		}
	};
}
export function browserLedger(context: BrowserContext, pbOrigin: string) {
	const events: Event[] = [];
	const map = new Map<Request, Event>();
	const pending = new Set<Promise<void>>();
	context.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== pbOrigin) return;
		const event = { ...record(url, request.method()), resource: request.resourceType() };
		events.push(event);
		map.set(request, event);
	});
	context.on('response', (response) => {
		const event = map.get(response.request());
		if (!event) return;
		const p = (async () => {
			event.status = response.status();
			try {
				event.bytes = (await response.body()).length;
			} catch {
				event.failed = true;
			}
			event.end = performance.now();
		})();
		pending.add(p);
		void p.finally(() => pending.delete(p));
	});
	context.on('requestfailed', (request) => {
		const event = map.get(request);
		if (event) {
			event.failed = true;
			event.end = performance.now();
		}
	});
	return {
		events,
		reset() {
			events.length = 0;
			map.clear();
		},
		async settle() {
			await Promise.all([...pending]);
		}
	};
}
export function summarize(events: Event[]) {
	const groups: Record<
		string,
		{ count: number; bytes: number; statuses: Record<string, number>; fields: (string | null)[] }
	> = {};
	let maxInFlight = 0;
	const points = events.flatMap((e) => [
		[e.start, 1],
		[e.end ?? e.start, -1]
	]);
	points.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
	let active = 0;
	for (const [, d] of points) {
		active += d!;
		maxInFlight = Math.max(maxInFlight, active);
	}
	for (const e of events) {
		const key = `${e.method} ${e.path}`;
		const g = (groups[key] ??= { count: 0, bytes: 0, statuses: {}, fields: [] });
		g.count++;
		g.bytes += e.bytes ?? 0;
		const status = String(e.status ?? 'failed');
		g.statuses[status] = (g.statuses[status] ?? 0) + 1;
		if (!g.fields.includes(e.fields)) g.fields.push(e.fields);
	}
	return {
		count: events.length,
		decodedBodyBytes: events.reduce((sum, e) => sum + (e.bytes ?? 0), 0),
		maxInFlight,
		listIds: events.filter((e) => e.listIds).map((e) => e.listIds),
		groups
	};
}
export async function serveBuild(buildRoot: string) {
	const root = resolve(buildRoot);
	const mime: Record<string, string> = {
		'.html': 'text/html',
		'.js': 'application/javascript',
		'.css': 'text/css',
		'.json': 'application/json',
		'.svg': 'image/svg+xml',
		'.woff2': 'font/woff2'
	};
	const server = createServer((req, res) => {
		void (async () => {
			const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
			const file = resolve(root, path === '/' ? 'index.html' : `.${path}`);
			if (!file.startsWith(root + '/')) {
				res.writeHead(403);
				res.end();
				return;
			}
			let data: Buffer;
			let extension = extname(file);
			try {
				data = await readFile(file);
			} catch {
				data = await readFile(resolve(root, 'index.html'));
				extension = '.html';
			}
			res.setHeader('Content-Type', mime[extension] ?? 'application/octet-stream');
			res.setHeader('Cache-Control', 'no-store');
			res.end(data);
		})().catch(() => {
			res.writeHead(500);
			res.end();
		});
	});
	const url = await listen(server);
	return {
		url,
		async close() {
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
		}
	};
}
