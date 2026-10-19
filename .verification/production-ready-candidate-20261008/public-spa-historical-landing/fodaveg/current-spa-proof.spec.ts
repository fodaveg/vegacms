/** Prepared browser proof only: current build + actual Caddy headers, memory backend/site double. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';

const candidateRoot = process.env.VEGA_CSP_PROOF_CANDIDATE_ROOT;
if (!candidateRoot) throw new Error('Explicit gated candidate root required');
const identity = JSON.parse(
	readFileSync(new URL('./current-spa-proof-runtime/identity.json', import.meta.url), 'utf8')
);
if (identity.candidateRoot !== candidateRoot) throw new Error('Prepared identity/root mismatch');
const { test, expect, loginAsDemo, waitForHistoricalLanding } = await import(
	new URL('../fixtures.ts', import.meta.url).href
);
const { createVisualSite, SITE_ORIGIN } = await import(
	pathToFileURL(join(candidateRoot, 'e2e/visual-site.ts')).href
);

type Violation = { directive: string; blockedOrigin: string };
let violations: Violation[] = [];
let headerChecks: Promise<void>[] = [];
let headerFailures: string[] = [];
let caddyDocuments = 0;

test.beforeEach(async ({ page }: { page: Page }) => {
	violations = [];
	headerChecks = [];
	headerFailures = [];
	caddyDocuments = 0;
	page.on('response', (response) => {
		const request = response.request();
		const url = new URL(response.url());
		if (
			!request.isNavigationRequest() ||
			request.frame() !== page.mainFrame() ||
			url.hostname !== 'localhost'
		)
			return;
		const variant = Object.values(identity.variants).find(
			(v: any) => String(v.port) === url.port
		) as { policy: string } | undefined;
		if (!variant) return;
		// Existing fixture may replace a 404 with local index HTML. Such a replacement has no
		// real response CSP and must fail this proof, rather than give a false zero-violation pass.
		headerChecks.push(
			response.allHeaders().then((headers) => {
				caddyDocuments++;
				if (headers['content-security-policy'] !== variant.policy)
					headerFailures.push('document CSP differs from generated source variant');
			})
		);
	});
	await page.exposeBinding('__recordCspProof', (_source, entry: Violation) =>
		violations.push(entry)
	);
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (event) => {
			let blockedOrigin = event.blockedURI;
			try {
				blockedOrigin = new URL(event.blockedURI).origin;
			} catch {
				blockedOrigin = event.blockedURI.split(':')[0].slice(0, 24);
			}
			(window as unknown as { __recordCspProof: (value: Violation) => void }).__recordCspProof({
				directive: event.effectiveDirective,
				blockedOrigin
			});
		});
	});
});

async function clean(): Promise<void> {
	await actualHeaders();
	expect(violations).toEqual([]);
}
async function actualHeaders(): Promise<void> {
	await Promise.all(headerChecks);
	expect(caddyDocuments).toBeGreaterThan(0);
	expect(headerFailures).toEqual([]);
}
async function login(page: Page, showcase = false): Promise<void> {
	await loginAsDemo(page, { seedShowcase: showcase });
	await waitForHistoricalLanding(page);
}

const blocks = [
	{ id: 'seccion_1', type: 'seccion', text: 'Escribe. Publica. Olvídate del resto.' },
	{ id: 'seccion_2', type: 'seccion', text: 'Tu contenido, en tu servidor' },
	{ id: 'seccion_3', type: 'seccion', text: 'Se adapta a tu modelo' }
];
async function installSite(page: Page, transport: 'get' | 'post' = 'get') {
	const site = createVisualSite({ collection: 'paginas', id: 'pagina_1', blocks });
	await site.install(page);
	await page.addInitScript((api: string) => {
		(window as unknown as { __VEGA_PREVIEW_API_URL__: string }).__VEGA_PREVIEW_API_URL__ = api;
	}, site.previewApiUrl);
	const counts = {
		tokenPosts: 0,
		withDraft: 0,
		documentGets: 0,
		documentPosts: 0,
		postBodyValid: false
	};
	page.on('request', (request) => {
		if (request.url() !== `${SITE_ORIGIN}/preview` || request.resourceType() !== 'document') return;
		if (request.method() === 'GET') counts.documentGets++;
		if (request.method() === 'POST') {
			counts.documentPosts++;
			// Synthetic fixture body only; never persist URL query, Authorization or form values.
			counts.postBodyValid =
				new URLSearchParams(request.postData() ?? '').get('token') === 'csp-draft-synthetic';
		}
	});
	// Reuse the independent HTTPS bridge fixture, changing only token transport for panel POST.
	await page.route(`${site.previewApiUrl}/token`, async (route) => {
		const request = route.request();
		const origin = (await request.headerValue('origin')) ?? 'http://localhost:4173';
		const headers = {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept'
		};
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers, body: '' });
			return;
		}
		if (request.method() !== 'POST') throw new Error('Token fixture expected POST');
		counts.tokenPosts++;
		if (Object.hasOwn(request.postDataJSON(), 'draft')) counts.withDraft++;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers,
			body: JSON.stringify({
				url: `${SITE_ORIGIN}/preview`,
				expiresAt: new Date(Date.now() + 600_000).toISOString(),
				...(transport === 'post' ? { postToken: 'csp-draft-synthetic' } : {})
			})
		});
	});
	return { site, counts };
}

test('source: exact current index bytes and source CSP served by isolated Caddy', async ({
	request
}) => {
	const response = await request.get('/login');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-security-policy']).toBe(identity.policy);
	expect(
		createHash('sha256')
			.update(await response.body())
			.digest('hex')
	).toBe(identity.buildFilesSHA256['index.html']);
});

test('source: login reaches exact historical landing and exposes content navigation', async ({
	page
}) => {
	await login(page);
	await expect(page.getByRole('heading', { level: 1, name: 'Crear «Información del sitio»', exact: true })).toBeVisible();
	await page.locator('#vega-sidebar a[href="/c/posts"]').click();
	await expect(page).toHaveURL(/\/c\/posts$/);
	await clean();
});

test('source: list search actually filters seeded content', async ({ page }) => {
	await login(page);
	await page.goto('/c/posts');
	await page.getByLabel('Buscar en el listado').fill('Bienvenido');
	await expect(page.getByRole('link', { name: 'Bienvenido a Vega', exact: true })).toBeVisible();
	await clean();
});

test('source: edit form writes and reopens saved title via SPA; history panel opens', async ({
	page
}) => {
	await login(page);
	await page.goto('/c/posts/post_1');
	await page.getByRole('textbox', { name: 'Título', exact: true }).fill('CSP título guardado');
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await page.getByRole('button', { name: 'Historial', exact: true }).click();
	await expect(
		page.getByText('El historial de versiones no está activado en este proyecto.')
	).toBeVisible();
	await page.getByRole('link', { name: 'Entradas', exact: false }).click();
	await page.getByRole('link', { name: 'CSP título guardado', exact: true }).click();
	await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
		'CSP título guardado'
	);
	await clean();
});

test('source: new form creates a record and resolves its real memory ID', async ({ page }) => {
	await login(page);
	await page.goto('/c/posts/new');
	await page.getByRole('textbox', { name: 'Título', exact: true }).fill('CSP nueva entrada');
	await page.getByLabel('Body').fill('Contenido de prueba CSP.');
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/posts\/(?!new)[^/]+$/);
	await expect(page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
		'CSP nueva entrada'
	);
	await clean();
});

test('source: visual editor fetches HTTPS token, completes bridge and selects real block', async ({
	page
}) => {
	const { counts } = await installSite(page);
	await login(page, true);
	await page.goto('/c/paginas/pagina_1/visual');
	await expect(page.locator('.vega-visual-status-text')).toHaveText(
		'Conectado al sitio: 3 bloques en la página.'
	);
	await expect.poll(() => counts.tokenPosts).toBeGreaterThan(0);
	await page
		.frameLocator('iframe.vega-visual-frame')
		.locator('[data-vega-block-id="seccion_2"]')
		.click();
	await expect(page.locator('[data-vega-tree-row="seccion_2"]')).toHaveClass(
		/vega-tree-row--selected/
	);
	await expect(
		page.locator('.vega-visual-overlay-box[data-vega-block-id="seccion_2"]')
	).toHaveClass(/vega-visual-overlay-box--selected/);
	await clean();
});

for (const transport of ['get', 'post'] as const) {
	test(`source: preview panel uses actual external ${transport.toUpperCase()} document transport`, async ({
		page
	}) => {
		const { counts } = await installSite(page, transport);
		await login(page, true);
		await page.goto('/c/paginas/pagina_1');
		await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
		await expect(
			page.frameLocator('.vega-preview-panel-frame').locator('[data-vega-block-id="seccion_1"]')
		).toBeVisible();
		await expect.poll(() => counts.tokenPosts).toBeGreaterThan(0);
		await expect.poll(() => counts.withDraft).toBeGreaterThan(0);
		if (transport === 'post') {
			await expect.poll(() => counts.documentPosts).toBeGreaterThan(0);
			expect(counts.postBodyValid).toBe(true);
			expect(counts.documentGets).toBe(0);
			expect(identity.policy).not.toContain('form-action');
		} else await expect.poll(() => counts.documentGets).toBeGreaterThan(0);
		await clean();
	});
}

test('source: media bootstrap and settings change run real UI handlers', async ({ page }) => {
	await login(page);
	await page.goto('/media');
	await page.getByRole('button', { name: 'Crear colección de medios', exact: true }).click();
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: 'Crear colección', exact: true })
		.click();
	await expect(page.locator('[data-media-state="present"]')).toBeVisible();
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	const editor = page.locator('#manifest-editor-textarea');
	await editor.fill((await editor.inputValue()).replace('Vega Demo', 'CSP Vega Demo'));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.locator('.vega-topbar-site')).toContainText('CSP Vega Demo');
	await clean();
});

test('source: trash exposes actual fallback and navigates its CTA', async ({ page }) => {
	await login(page);
	await page.goto('/papelera');
	await expect(page.getByText('La papelera no está activada en este proyecto.')).toBeVisible();
	await page.getByRole('button', { name: 'Ir a Ajustes', exact: true }).click();
	await expect(page.locator('#manifest-editor-textarea')).toBeVisible();
	await clean();
});

test('ancestor control: same built app embeds without ancestor rule; source actually blocks it', async ({
	page,
	request
}) => {
	const diagnostics: {
		consoleCategories: string[];
		pageErrorNames: string[];
		networkErrors: string[];
	} = {
		consoleCategories: [],
		pageErrorNames: [],
		networkErrors: []
	};
	page.on('pageerror', (error) => diagnostics.pageErrorNames.push(error.name));
	page.on('requestfailed', (request) => {
		const code = request.failure()?.errorText.match(/ERR_[A-Z_]+/)?.[0];
		if (code) diagnostics.networkErrors.push(code);
	});
	page.on('console', (message) => {
		for (const category of [
			'frame-ancestors',
			'X-Frame-Options',
			'connect-src',
			'script-src',
			'Private Network',
			'localStorage',
			'SecurityError'
		]) {
			if (message.text().includes(category)) diagnostics.consoleCategories.push(category);
		}
	});
	for (const name of ['ancestor-control', 'source']) {
		const variant = identity.variants[name];
		const response = await request.get(`http://localhost:${variant.port}/login`);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-security-policy']).toBe(variant.policy);
		if (name === 'ancestor-control') expect(response.headers()['x-frame-options']).toBeUndefined();
		else expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
		expect(
			createHash('sha256')
				.update(await response.body())
				.digest('hex')
		).toBe(identity.buildFilesSHA256['index.html']);
	}
	let ancestorViolation = false;
	page.on('console', (message) => {
		// Inspect only to classify; never attach raw console text/headers/URLs.
		if (message.text().includes('frame-ancestors')) ancestorViolation = true;
	});
	// Remove only the fixture's generic document fallback in this case. Its memory initScript
	// remains; no specific backend/site intercepts are registered or removed here.
	await page.unroute('**/*');
	const parent = await page.goto(identity.parentFixture.origin + identity.parentFixture.path);
	expect(parent?.status()).toBe(200);
	expect(await parent?.serverAddr()).not.toBeNull();
	expect(parent?.headers()['content-security-policy']).toBeUndefined();
	expect(parent?.headers()['content-type']).toContain('text/html');
	expect(
		createHash('sha256')
			.update(await parent!.body())
			.digest('hex')
	).toBe(identity.parentFixture.HTMLSHA256);
	await page
		.locator('#target')
		.evaluate((element) => ((element as HTMLIFrameElement).src = 'http://localhost:4174/login'));
	try {
		await expect(page.frameLocator('#target').locator('#login-email')).toBeVisible();
		await expect(page.frameLocator('#target').locator('input[type="email"]')).toBeVisible();
	} finally {
		const frames = [];
		for (const frame of page.frames()) {
			frames.push({
				isMain: frame === page.mainFrame(),
				isExpectedControl: frame.url() === 'http://localhost:4174/login',
				emailInputs: await frame.getByLabel('Correo electrónico').count(),
				englishEmailLabels: await frame.getByLabel('Email', { exact: true }).count(),
				loginEmailID: await frame.locator('#login-email').count(),
				emailTypeInputs: await frame.locator('input[type="email"]').count(),
				DOM: await frame
					.evaluate(() => ({
						readyState: document.readyState,
						language: navigator.language,
						elements: document.querySelectorAll('*').length,
						inputs: document.querySelectorAll('input').length,
						memoryAdapter:
							(window as unknown as { __VEGA_ADAPTER__?: string }).__VEGA_ADAPTER__ === 'memory'
					}))
					.catch(() => ({ inaccessible: true }))
			});
		}
		writeFileSync(
			new URL('./current-spa-proof-ancestor-probe.json', import.meta.url),
			JSON.stringify({ diagnostics, frames }, null, 2)
		);
	}
	await page
		.locator('#target')
		.evaluate((element) => ((element as HTMLIFrameElement).src = 'http://localhost:4173/login'));
	await expect.poll(() => ancestorViolation).toBe(true);
	await expect(page.frameLocator('#target').locator('#login-email')).toHaveCount(0);
});

test.describe('connect negative', () => {
	test.use({ baseURL: 'http://localhost:4175' });
	test('removing only https connect permission blocks actual preview fetch before endpoint', async ({
		page
	}) => {
		const { counts } = await installSite(page);
		await login(page, true);
		await page.goto('/c/paginas/pagina_1/visual');
		await expect.poll(() => violations.some((v) => v.directive === 'connect-src')).toBe(true);
		expect(counts.tokenPosts).toBe(0);
		await expect(page.getByRole('alert')).toContainText('No se pudo cargar la página del sitio');
		await expect(page.locator('.vega-visual-status-text')).toHaveCount(0);
		await expect(page.locator('iframe.vega-visual-frame')).toHaveCount(0);
		await actualHeaders();
	});
});

test.describe('form negative', () => {
	test.use({ baseURL: 'http://localhost:4176' });
	test('adding form-action self blocks actual panel POST while token fetch still succeeds', async ({
		page
	}) => {
		const { counts } = await installSite(page, 'post');
		await login(page, true);
		await page.goto('/c/paginas/pagina_1');
		await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
		await expect.poll(() => counts.tokenPosts).toBeGreaterThan(0);
		await expect.poll(() => violations.some((v) => v.directive === 'form-action')).toBe(true);
		expect(counts.documentPosts).toBe(0);
		await actualHeaders();
	});
});
