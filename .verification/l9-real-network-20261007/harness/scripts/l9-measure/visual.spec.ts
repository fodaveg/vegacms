/** Visual renewal across the actual admin build, vegapreview Go routes, Astro recipe and bridge. */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import {
	seedL9,
	PAGE_ID,
	EDITOR_EMAIL,
	EDITOR_PASSWORD
} from '../../tests/contract/pb-harness/l9-network-seed';
import { proxyPocketBase, browserLedger, serveBuild, summarize } from './transport';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
	const srv = createServer();
	await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
	const address = srv.address();
	if (!address || typeof address === 'string') throw new Error('No fixture port');
	await new Promise<void>((r) => srv.close(() => r()));
	return address.port;
}
async function stop(child: ChildProcessWithoutNullStreams, line: string) {
	if (child.exitCode !== null) return;
	if (!child.stdin.destroyed) child.stdin.end(line + '\n');
	await Promise.race([
		new Promise<void>((r) => child.once('close', () => r())),
		sleep(5000).then(() => {
			if (child.exitCode === null) child.kill('SIGTERM');
		})
	]);
}

test('visual renewal and reload: real Go and Astro consumers', async ({ browser }) => {
	test.setTimeout(240_000);
	const buildRoot = process.env.L9_BUILD_ROOT;
	const astroRoot = process.env.L9_ASTRO_ROOT;
	const binary = process.env.L9_GO_SERVER_BINARY;
	if (!buildRoot || !astroRoot || !binary)
		throw new Error(
			'Visual fixture requires verified admin build, archived Astro root and compiled local Go fixture'
		);
	const report = process.env.L9_REPORT ?? '/private/tmp/vega-l9-visual-network.json';
	const out =
		process.env.L9_MATRIX === '1'
			? report.replace(/\.json$/, `-r${test.info().repeatEachIndex + 1}.json`)
			: report;
	const ready = resolve('.network-measure', `pb-ready-${process.pid}.json`);
	await mkdir(resolve('.network-measure'), { recursive: true });
	const port = await freePort();
	const astroOrigin = `http://127.0.0.1:${port}`;
	const go = spawn(binary, ['-test.run=^TestL9NetworkServer$'], {
		env: { ...process.env, L9_PB_READY_FILE: ready, L9_SITE_ORIGIN: astroOrigin },
		stdio: 'pipe'
	});
	go.stdin.on('error', () => {}); // cleanup must not replace the original failure with EPIPE
	let goDiagnostic = '';
	let astroDiagnostic = '';
	for (const stream of [go.stdout, go.stderr])
		stream.on('data', (data) => {
			goDiagnostic = (goDiagnostic + data.toString()).slice(-100_000);
		});
	let site: Awaited<ReturnType<typeof serveBuild>> | undefined,
		proxy: Awaited<ReturnType<typeof proxyPocketBase>> | undefined,
		astro: ChildProcessWithoutNullStreams | undefined,
		context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
	try {
		let config:
			{ url: string; adminEmail: string; adminPassword: string; fixture: string } | undefined;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				config = JSON.parse(await readFile(ready, 'utf8'));
				break;
			} catch {
				if (go.exitCode !== null) throw new Error('Local Go fixture exited before readiness');
				await sleep(100);
			}
		}
		if (
			!config ||
			config.fixture !== 'l9-local-only' ||
			new URL(config.url).hostname !== '127.0.0.1'
		)
			throw new Error('No verified local Go fixture');
		const admin = await seedL9({ ...config, stop: async () => {} });
		// The real newer starter runs its redirects middleware for SSR preview too.
		await admin.collections.create({
			name: 'redirects',
			type: 'base',
			listRule: '',
			viewRule: '',
			fields: ['from', 'to', 'code'].map((name) => ({ name, type: 'text' }))
		});
		// Real content gives the actual iframe a scrollable document in both candidates.
		for (let order = 2; order <= 6; order++)
			await admin.collection('blocks').create({
				parent: PAGE_ID,
				type: 'hero',
				order,
				data: { title: `Visual measurement ${order}` }
			});
		proxy = await proxyPocketBase(config.url);
		site = await serveBuild(buildRoot);
		astro = spawn(process.execPath, [resolve('scripts/l9-measure/astro-consumer.mjs')], {
			stdio: 'pipe',
			cwd: resolve(astroRoot, 'starters/default')
		});
		astro.stdin.on('error', () => {});
		astro.stderr.on('data', (data) => {
			astroDiagnostic = (astroDiagnostic + data.toString()).slice(-10_000);
		});
		const lines = createInterface({ input: astro.stdout });
		const started = new Promise<{ ready: boolean; port: number }>((resolveReady, reject) => {
			lines.once('line', (line) => {
				try {
					resolveReady(JSON.parse(line));
				} catch {
					reject(new Error('Invalid Astro fixture readiness'));
				}
			});
			astro!.once('exit', () => reject(new Error('Astro fixture exited before readiness')));
		});
		astro.stdin.write(
			JSON.stringify({
				astroRoot,
				pocketbaseUrl: proxy.url,
				secret: '0123456789abcdef0123456789abcdef',
				loaderToken: admin.authStore.token,
				allowedOrigin: site.url,
				port
			}) + '\n'
		);
		const actual = await Promise.race([
			started,
			sleep(20_000).then(() => {
				throw new Error('Astro fixture startup timeout');
			})
		]);
		if (!actual.ready || actual.port !== port)
			throw new Error('Astro fixture origin differs from signed origin');
		context = await browser.newContext({
			locale: 'es-ES',
			viewport: { width: 1440, height: 1000 }
		});
		const page = await context.newPage();
		await page.addInitScript(
			({ url }) => {
				localStorage.setItem('vega.backendUrl.v1', url);
				localStorage.setItem('vega.authCollection.v1', 'vega_editors');
				(window as Window & { __VEGA_ADAPTER__?: string }).__VEGA_ADAPTER__ = 'pocketbase';
			},
			{ url: proxy.url }
		);
		await page.goto(`${site.url}/login`);
		await page.getByLabel('Correo electrónico').fill(EDITOR_EMAIL);
		await page.getByLabel('Contraseña', { exact: true }).fill(EDITOR_PASSWORD);
		await page.getByRole('button', { name: 'Entrar', exact: true }).click();
		await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
		const pbBrowser = browserLedger(context, proxy.url),
			siteBrowser = browserLedger(context, astroOrigin);
		let expiry = 0;
		page.on('response', (response) => {
			if (new URL(response.url()).pathname === '/api/vega-preview/token')
				void response
					.json()
					.then((body) => {
						if (!expiry) expiry = Date.parse(body.expiresAt);
					})
					.catch(() => {});
		});
		proxy.reset();
		await page.goto(`${site.url}/c/pages/${PAGE_ID}/visual`);
		await expect(page.locator('.vega-visual-status-text')).toContainText('Conectado al sitio');
		const frame = () => page.frames().find((f) => f.url().startsWith(astroOrigin + '/preview/'));
		await expect.poll(() => !!frame()).toBe(true);
		await frame()!.waitForLoadState('networkidle');
		await frame()!.evaluate(async () => {
			(window as Window & { __l9Marker?: boolean }).__l9Marker = true;
			window.scrollTo({ top: 200, behavior: 'instant' });
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
		});
		const initialScroll = await frame()!.evaluate(() => scrollY);
		await writeFile(
			out + '.geometry.json',
			JSON.stringify(
				await frame()!.evaluate(() => ({
					scroll: scrollY,
					viewport: innerHeight,
					documentHeight: document.documentElement.scrollHeight,
					blocks: document.querySelectorAll('[data-vega-block-id]').length
				}))
			)
		);
		expect(initialScroll).toBeGreaterThan(0);
		await pbBrowser.settle();
		await siteBrowser.settle();
		const initial = {
			browserPB: summarize(pbBrowser.events),
			browserSite: summarize(siteBrowser.events),
			serverPB: summarize(proxy.events)
		};
		pbBrowser.reset();
		siteBrowser.reset();
		proxy.reset();
		let documentNavigations = 0;
		page.on('framenavigated', (f) => {
			if (f.url().startsWith(astroOrigin + '/preview/')) documentNavigations++;
		});
		const renewed = page.waitForResponse(
			(r) =>
				new URL(r.url()).pathname === '/api/vega-preview/token' && r.request().method() === 'POST',
			{ timeout: 35_000 }
		);
		const rendered = page.waitForResponse(
			(r) =>
				new URL(r.url()).origin === astroOrigin &&
				new URL(r.url()).pathname.startsWith('/preview/') &&
				r.request().method() === 'GET',
			{ timeout: 35_000 }
		);
		const refreshed = await Promise.all([renewed, rendered]);
		for (const response of refreshed) {
			expect(response.ok()).toBe(true);
			await response.finished();
		}
		await page.waitForLoadState('networkidle');
		await expect(page.locator('.vega-visual-status-text')).toContainText('Conectado al sitio');
		await pbBrowser.settle();
		await siteBrowser.settle();
		const currentFrame = frame();
		if (!currentFrame) throw new Error('Renewal lost preview frame');
		const renewal = {
			browserPB: summarize(pbBrowser.events),
			browserSite: summarize(siteBrowser.events),
			serverPB: summarize(proxy.events),
			frameNavigationEvents: documentNavigations,
			documentRequests: siteBrowser.events.filter((event) => event.resource === 'document').length,
			markerRetained: await currentFrame.evaluate(
				() => (window as Window & { __l9Marker?: boolean }).__l9Marker === true
			),
			initialScroll,
			scroll: await currentFrame.evaluate(() => scrollY)
		};
		await writeFile(
			out,
			JSON.stringify(
				{
					candidate: process.env.L9_CANDIDATE,
					tree: process.env.L9_CANDIDATE_TREE,
					astroCandidate: process.env.L9_ASTRO_CANDIDATE,
					initial,
					renewal,
					completed: ['initial', 'renewal']
				},
				null,
				2
			)
		);
		// Real clocks: wait until the ORIGINAL GET token expired, allowing normal renewal meanwhile.
		if (!expiry) throw new Error('No real token expiration observed');
		await sleep(Math.max(0, expiry + 1200 - Date.now()));
		const reloadFrame = frame();
		if (!reloadFrame) throw new Error('Missing preview frame before reload');
		pbBrowser.reset();
		siteBrowser.reset();
		proxy.reset();
		const responsePromise = page.waitForResponse(
			(r) => r.request().isNavigationRequest() && new URL(r.url()).origin === astroOrigin,
			{ timeout: 15_000 }
		);
		await reloadFrame.evaluate(() => location.reload());
		const response = await responsePromise;
		await response.finished();
		await reloadFrame.waitForLoadState('load');
		await pbBrowser.settle();
		await siteBrowser.settle();
		const reload = {
			status: response.status(),
			browserPB: summarize(pbBrowser.events),
			browserSite: summarize(siteBrowser.events),
			serverPB: summarize(proxy.events)
		};
		await writeFile(
			out,
			JSON.stringify(
				{
					candidate: process.env.L9_CANDIDATE,
					tree: process.env.L9_CANDIDATE_TREE,
					astroCandidate: process.env.L9_ASTRO_CANDIDATE,
					browser: browser.version(),
					initial,
					renewal,
					reload,
					scope:
						'Real Go PocketBase v0.39.9 + real Astro SSR dev GET recipe + actual static admin build; no POST reload claim'
				},
				null,
				2
			)
		);
		// Counts are observed, not asserted to force the expected reduction. These are fidelity guards.
		expect(renewal.serverPB.count).toBeGreaterThan(0);
		expect(renewal.browserSite.count).toBeGreaterThan(0);
	} finally {
		if (proxy)
			await writeFile(out + '.transport.json', JSON.stringify(summarize(proxy.events), null, 2));
		await context?.close();
		if (astro) await stop(astro, JSON.stringify({ close: true }));
		await site?.close();
		await proxy?.close();
		await stop(go, 'stop');
		await writeFile(
			out + '.go-status.json',
			JSON.stringify(
				{
					exitCode: go.exitCode,
					signal: go.signalCode,
					astroExit: astro?.exitCode,
					astroPhases: [...astroDiagnostic.matchAll(/\[l9-phase\] ([a-z]+)/g)].map((m) => m[1]),
					panic: goDiagnostic.includes('panic:'),
					fatalConcurrentMap: goDiagnostic.includes('concurrent map'),
					stack: [...goDiagnostic.matchAll(/(?:github\.com\/pocketbase\/[^\s]+|[^\s]+\.go:\d+)/g)]
						.map((m) => m[0])
						.slice(0, 24)
				},
				null,
				2
			)
		);
		await rm(ready, { force: true });
	}
});
