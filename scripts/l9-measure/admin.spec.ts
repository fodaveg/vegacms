/** Real browser + real PB only. No memory adapter, mocked fetch or application source edits. */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	startPocketBaseServerOn,
	destroyPocketBaseInstanceDir,
	type RunningPocketBase
} from '../../tests/contract/pb-harness/server';
import {
	seedL9,
	resetL9,
	seedTrash,
	PAGE_ID,
	RAIL_LAST_ID,
	EDITOR_EMAIL,
	EDITOR_PASSWORD,
	idFor
} from '../../tests/contract/pb-harness/l9-network-seed';
import { proxyPocketBase, browserLedger, serveBuild, summarize } from './transport';

let pb: RunningPocketBase;
let admin: Awaited<ReturnType<typeof seedL9>>;
let proxy: Awaited<ReturnType<typeof proxyPocketBase>>;
let site: Awaited<ReturnType<typeof serveBuild>>;
const candidate = process.env.L9_CANDIDATE ?? 'unidentified';
const reportPath = process.env.L9_REPORT ?? `/private/tmp/vega-l9-${candidate}-network.json`;
const results: object[] = [];
let browserVersion = '';

test.beforeAll(async () => {
	if (!process.env.L9_BUILD_ROOT)
		throw new Error('L9_BUILD_ROOT must identify a verified static build');
	const instance = createPocketBaseInstanceDir();
	try {
		const hooksDir = resolve(instance.dataDir, 'pb_hooks');
		await mkdir(hooksDir, { recursive: true });
		await createPocketBaseSuperuser(instance.dataDir);
		const server = await startPocketBaseServerOn(instance, { hooksDir });
		pb = {
			url: server.url,
			adminEmail: ADMIN_EMAIL,
			adminPassword: ADMIN_PASSWORD,
			stop: async () => {
				await server.stop();
				destroyPocketBaseInstanceDir(instance);
			}
		};
	} catch (error) {
		destroyPocketBaseInstanceDir(instance);
		throw error;
	}
	admin = await seedL9(pb);
	proxy = await proxyPocketBase(pb.url);
	site = await serveBuild(resolve(process.env.L9_BUILD_ROOT));
});
test.afterAll(async () => {
	await mkdir(resolve(reportPath, '..'), { recursive: true });
	await writeFile(
		reportPath,
		JSON.stringify(
			{
				candidate,
				tree: process.env.L9_CANDIDATE_TREE ?? null,
				browserVersion,
				scope: 'local real PocketBase HTTP + static admin build',
				results
			},
			null,
			2
		)
	);
	await site?.close();
	await proxy?.close();
	await pb?.stop();
});

async function login(browser: Browser, superuser = false) {
	const context = await browser.newContext({
		locale: 'es-ES',
		viewport: { width: 1440, height: 1000 }
	});
	const page = await context.newPage();
	const pageErrors: { name: string; code: string }[] = [];
	page.on('pageerror', (error) =>
		pageErrors.push({
			name: error.name,
			code: error.message.match(/svelte\.dev\/e\/([a-z_]+)/)?.[1] ?? 'unclassified-page-error'
		})
	);
	await page.addInitScript(
		({ url, collection }) => {
			localStorage.setItem('vega.backendUrl.v1', url);
			localStorage.setItem('vega.authCollection.v1', collection);
			(window as Window & { __VEGA_ADAPTER__?: string }).__VEGA_ADAPTER__ = 'pocketbase';
		},
		{ url: proxy.url, collection: superuser ? '_superusers' : 'vega_editors' }
	);
	await page.goto(`${site.url}/login`);
	await page.getByLabel('Correo electrónico').fill(superuser ? pb.adminEmail : EDITOR_EMAIL);
	await page
		.getByLabel('Contraseña', { exact: true })
		.fill(superuser ? pb.adminPassword : EDITOR_PASSWORD);
	await page.getByRole('button', { name: 'Entrar', exact: true }).click();
	await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
	await settle(page);
	return { page, context, ledger: browserLedger(context, proxy.url), pageErrors };
}
async function settle(page: Page) {
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(150);
}
async function spa(page: Page, path: string) {
	// A normal same-origin anchor drives the unmodified SvelteKit router; it is not an app test hook.
	await page.evaluate((path) => {
		document.getElementById('l9-navigation')?.remove();
		const a = document.createElement('a');
		a.href = path;
		a.id = 'l9-navigation';
		a.textContent = 'Measurement navigation';
		document.body.append(a);
	}, path);
	await page.locator('#l9-navigation').click();
	await page.waitForURL((url) => url.pathname === path);
	await page
		.locator('#l9-navigation')
		.evaluate((el) => el.remove())
		.catch(() => {});
}
async function save(page: Page, title: string) {
	await page.getByRole('textbox', { name: 'Título', exact: true }).fill(title);
	const recordId = new URL(page.url()).pathname.split('/').at(-1);
	// Arm both waits before clicking. A toast from an earlier save cannot establish that
	// this PATCH and its awaited snapshot have finished, especially while a LIST is held.
	const [updated, snapshot] = await Promise.all([
		page.waitForResponse(
			(response) =>
				response.request().method() === 'PATCH' &&
				new URL(response.url()).pathname === `/api/collections/pages/records/${recordId}`
		),
		page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname === '/api/collections/vega_revisions/records'
		),
		page.getByRole('button', { name: 'Guardar', exact: true }).click()
	]);
	expect(updated.ok()).toBe(true);
	expect(snapshot.ok()).toBe(true);
	await Promise.all([updated.finished(), snapshot.finished()]);
	expect((await updated.json()).title).toBe(title);
	expect((await snapshot.json()).recordId).toBe(recordId);
}
async function measure(
	client: Awaited<ReturnType<typeof login>>,
	scenario: string,
	iteration: number,
	phase: string,
	action: () => Promise<object | void>
) {
	await settle(client.page);
	await client.ledger.settle();
	client.ledger.reset();
	proxy.reset();
	const errorsBefore = client.pageErrors.length;
	const observations = await action();
	await settle(client.page);
	await client.ledger.settle();
	const browser = client.ledger.events.filter((e) => e.method !== 'OPTIONS');
	const server = proxy.events.filter((e) => e.method !== 'OPTIONS');
	results.push({
		scenario,
		iteration,
		phase,
		observations: observations ?? {},
		pageErrors: client.pageErrors.slice(errorsBefore),
		browser: summarize(browser),
		pocketbase: summarize(server)
	});
	await writeFile(reportPath, JSON.stringify({ candidate, browserVersion, results }, null, 2));
	expect(browser.map((e) => `${e.method} ${e.path}`).sort()).toEqual(
		server.map((e) => `${e.method} ${e.path}`).sort()
	);
}

test('smoke: real PB identity and sanitized transport', async ({ browser }) => {
	browserVersion = browser.version();
	const client = await login(browser);
	try {
		await measure(client, 'smoke-open', 0, 'first', async () => {
			await spa(client.page, `/c/pages/${PAGE_ID}`);
			await expect(client.page.getByRole('textbox', { name: 'Título', exact: true })).toHaveValue(
				'Needle 1'
			);
		});
		expect(
			proxy.events.some((e) => e.path === '/api/collections/pages/records/:id' && e.status === 200)
		).toBe(true);
		// Controlled real PB404 verifies the recorder before any normal event of this window.
		await measure(client, 'instrumentation-negative', 0, 'first', async () => {
			const status = await client.page.evaluate(
				async (url) => (await fetch(url)).status,
				`${proxy.url}/api/collections/definitely_missing/records`
			);
			expect(status).toBe(404);
		});
		expect(proxy.events[0]?.status).toBe(404);
	} finally {
		await client.context.close();
	}
});

test('seven admin surfaces: repeated first and warm visits', async ({ browser }) => {
	test.setTimeout(900_000);
	browserVersion = browser.version();
	const repeats = Number(process.env.L9_REPEATS ?? 3);
	for (let iteration = 1; iteration <= repeats; iteration++) {
		for (const surface of (
			process.env.L9_SURFACES ?? 'relation,search,save,rail,list,trash,editors'
		).split(',')) {
			await resetL9(admin, surface === 'list');
			const client = await login(browser, surface === 'editors');
			const { page } = client;
			try {
				for (const phase of ['first', 'warm']) {
					if (surface === 'relation') {
						await measure(client, 'relation-50-titles', iteration, phase, async () => {
							await spa(page, `/c/pages/${PAGE_ID}`);
							await expect(page.locator('[data-field="links"]')).toContainText('Link 50');
							return {
								resolvedChips: await page
									.locator('[data-field="links"] .vega-relation-chip')
									.count()
							};
						});
					} else if (surface === 'search') {
						await spa(page, '/c/pages');
						await measure(client, 'global-search-projection', iteration, phase, async () => {
							const search = page.getByRole('combobox', { name: 'Búsqueda global' });
							await search.fill('Needle');
							await expect(
								page.getByRole('listbox', { name: 'Resultados de la búsqueda global' })
							).toContainText('Needle 1');
							return { options: await page.getByRole('option').count() };
						});
						await page.getByRole('combobox', { name: 'Búsqueda global' }).fill('');
					} else if (surface === 'save') {
						await spa(page, `/c/pages/${idFor('page', 2)}`);
						await settle(page);
						await admin.collections.truncate('vega_revisions');
						await measure(client, 'save-preimage-and-snapshot', iteration, phase, async () => {
							await save(page, `Saved ${iteration} ${phase}`);
						});
					} else if (surface === 'rail') {
						await measure(client, 'rail-open-outside-first-page', iteration, phase, async () => {
							await spa(page, `/c/pages/${RAIL_LAST_ID}`);
							await expect(
								page.getByRole('textbox', { name: 'Título', exact: true })
							).toBeVisible();
							await settle(page);
							return { selected: await page.locator('.vega-rail [aria-current="true"]').count() };
						});
						await measure(client, 'rail-save-title', iteration, phase, async () => {
							await save(page, `Rail ${iteration} ${phase}`);
							return { selected: await page.locator('.vega-rail [aria-current="true"]').count() };
						});
						await admin
							.collection('pages')
							.update(idFor('page', 2), { title: 'Peer response value' });
						await measure(
							client,
							'rail-save-during-real-list-response',
							iteration,
							phase,
							async () => {
								const held = proxy.holdNextPagesList();
								try {
									await page
										.getByLabel('Posición', { exact: true })
										.fill(phase === 'first' ? '1' : '2');
									await save(page, `Reordered ${iteration} ${phase}`);
									await Promise.race([
										held.captured,
										new Promise((_, reject) =>
											setTimeout(() => reject(new Error('No real list response captured')), 8000)
										)
									]);
									await save(page, `Interim ${iteration} ${phase}`);
									await save(page, `Latest ${iteration} ${phase}`);
								} finally {
									held.release();
								}
								await settle(page);
								const latest = `Latest ${iteration} ${phase}`;
								return {
									selected: await page.locator('.vega-rail [aria-current="true"]').count(),
									latestVisible: await page
										.locator('.vega-rail')
										.innerText()
										.then((text) => text.includes(latest)),
									peerPreserved: await page
										.locator('.vega-rail')
										.innerText()
										.then((text) => text.includes('Peer response value'))
								};
							}
						);
					} else if (surface === 'list') {
						await spa(page, '/c/pages');
						await expect(page.locator('table')).toBeVisible();
						await measure(client, 'list-reorder', iteration, phase, async () => {
							const table = await page.locator('table').elementHandle();
							const handles = page.locator('.vega-reorder-handle');
							await handles.first().focus();
							await handles.first().press('ArrowDown');
							await settle(page);
							return { tableRetained: await table?.evaluate((el) => el.isConnected) };
						});
						await measure(client, 'list-delete', iteration, phase, async () => {
							const table = await page.locator('table').elementHandle();
							const row = page.locator('tbody tr').last();
							const menu = row.getByRole('button', { name: /Acciones de/ });
							if (await menu.count()) {
								await menu.click();
								await row.getByRole('menuitem', { name: 'Borrar…' }).click();
							} else {
								await row.getByRole('button', { name: /Borrar/ }).click();
							}
							await page
								.getByRole('alertdialog')
								.getByRole('button', { name: 'Borrar', exact: true })
								.click();
							await expect(page.getByRole('alertdialog')).toBeHidden();
							await settle(page);
							return { tableRetained: await table?.evaluate((el) => el.isConnected) };
						});
						await measure(client, 'list-import-two', iteration, phase, async () => {
							const importButton = page.getByRole('button', { name: 'Importar', exact: true });
							if (!(await importButton.isVisible()))
								await page.getByRole('button', { name: 'Más', exact: true }).click();
							await importButton.click();
							const dialog = page.getByRole('dialog');
							const doc = {
								vegaTransfer: 1,
								exported: new Date().toISOString(),
								origin: { backendUrl: 'local-fixture', vegaVersion: 'measurement' },
								collections: [
									{
										type: 'pages',
										records: [1, 2].map((n) => ({
											id: idFor(`imp${phase === 'first' ? 'a' : 'b'}`, iteration * 10 + n),
											values: {
												title: `Imported ${n}`,
												position: 100 + n,
												status: 'draft',
												path: `/import-${phase}-${iteration}-${n}`,
												body: ''
											}
										}))
									}
								]
							};
							await dialog.locator('input[type="file"]').setInputFiles({
								name: 'measurement.vega.json',
								mimeType: 'application/json',
								buffer: Buffer.from(JSON.stringify(doc))
							});
							await expect(
								dialog.getByRole('button', { name: 'Importar', exact: true })
							).toBeEnabled();
							await dialog.getByRole('button', { name: 'Importar', exact: true }).click();
							await expect(
								page.getByText(/^Se han importado 2 (elementos|registros)\.$/)
							).toBeVisible();
							await page.keyboard.press('Escape');
						});
					} else if (surface === 'trash') {
						await seedTrash(admin);
						await spa(page, '/papelera');
						await expect(page.locator('.vega-trash-item').first()).toBeVisible();
						await measure(client, 'trash-empty-201', iteration, phase, async () => {
							await page.getByRole('button', { name: 'Vaciar papelera', exact: true }).click();
							await page
								.locator('.notice-confirm')
								.getByRole('button', { name: 'Vaciar papelera', exact: true })
								.click();
							await expect(page.getByText('La papelera está vacía.')).toBeVisible();
							return {
								remaining: (
									await admin
										.collection('vega_revisions')
										.getList(1, 1, { filter: 'kind="delete"' })
								).totalItems
							};
						});
					} else {
						await measure(client, 'editors-load', iteration, phase, async () => {
							await spa(page, '/editores');
							await expect(page.locator('[data-editors-state="ready"]')).toBeVisible();
							await expect(page.locator('[data-mail-card="loading"]')).toHaveCount(0);
						});
						await page
							.getByRole('button', { name: `Cambiar la contraseña de ${EDITOR_EMAIL}` })
							.click();
						const dialog = page.getByRole('dialog', { name: 'Cambiar contraseña' });
						await dialog.getByLabel('Contraseña nueva').fill(EDITOR_PASSWORD);
						await dialog.getByLabel('Repítela').fill(EDITOR_PASSWORD);
						await measure(client, 'editors-change-password', iteration, phase, async () => {
							await dialog.getByRole('button', { name: 'Guardar contraseña' }).click();
							await expect(dialog).toBeHidden();
						});
						const configure = page.getByRole('button', {
							name: 'Configurar el correo',
							exact: true
						});
						if (await configure.isVisible()) await configure.click();
						else
							await page
								.locator('[data-mail-card] .vega-admin-subhead')
								.getByRole('button', { name: 'Cambiar', exact: true })
								.click();
						await page
							.getByLabel('Nombre del remitente', { exact: true })
							.fill(`Fixture ${iteration} ${phase}`);
						await page
							.getByLabel('Dirección del remitente', { exact: true })
							.fill('fixture@vega.test');
						await page.getByLabel('Servidor', { exact: true }).fill('127.0.0.1');
						await page.getByLabel('Puerto', { exact: true }).fill('1025');
						await measure(
							client,
							'editors-save-mail-settings-no-send',
							iteration,
							phase,
							async () => {
								await page.getByRole('button', { name: 'Guardar', exact: true }).click();
								await expect(
									page.getByText('Correo guardado. Envía una prueba para comprobarlo.')
								).toBeVisible();
							}
						);
					}
					if (surface === 'relation' && phase === 'warm') {
						await spa(page, '/c/tags');
						await settle(page);
						await admin.collections.update('tags', {
							listRule: '@request.auth.id != "" && name != "Link 50"'
						});
						try {
							await measure(
								client,
								'relation-list-denied-get-visible',
								iteration,
								phase,
								async () => {
									await spa(page, `/c/pages/${PAGE_ID}`);
									await expect(page.locator('[data-field="links"]')).toContainText('Link 50');
									return {
										resolvedChips: await page
											.locator('[data-field="links"] .vega-relation-chip')
											.count()
									};
								}
							);
						} finally {
							await admin.collections.update('tags', { listRule: '@request.auth.id != ""' });
						}
					}
					await spa(page, '/c/tags');
					await settle(page);
				}
			} finally {
				await client.context.close();
			}
		}
	}
});
