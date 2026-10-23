/** Blog sembrado desde la UI: firmas, jerarquía, guardas y reparación de datos importados. */
import type { Locator, Page } from '@playwright/test';
import { expect, loginAsDemo, test, waitForHome } from './fixtures';

async function seedBlog(page: Page) {
	await page.addInitScript(() => {
		(window as unknown as { __VEGA_SEED_EMPTY__: boolean }).__VEGA_SEED_EMPTY__ = true;
	});
	await loginAsDemo(page);
	await waitForHome(page);
	await page.getByRole('link', { name: 'Ajustes', exact: false }).click();
	await page.getByRole('button', { name: 'Preparar el sitio', exact: true }).click();
	const base = page.getByRole('dialog', { name: 'Preparar el sitio', exact: true });
	await base.getByRole('button', { name: 'Preparar el sitio', exact: true }).click();
	await expect(base).not.toBeVisible();
	await page
		.locator('[data-site-module="blog"]')
		.getByRole('button', { name: 'Añadir: Blog' })
		.click();
	const blog = page.getByRole('dialog', { name: 'Añadir: Blog' });
	await blog.getByRole('button', { name: 'Añadir', exact: true }).click();
	await expect(blog).not.toBeVisible();
}
const field = (surface: Page | Locator, name: string) =>
	surface.locator(`.vega-field-row[data-field="${name}"]`);
async function openCollection(page: Page, name: string) {
	await page.locator(`a[href="/c/${name}"]`).first().click();
}
async function selectParent(surface: Page | Locator, title: string) {
	const group = field(surface, 'parent');
	await expect(group.locator('input[type="search"]')).toBeEnabled();
	await group.locator('input[type="search"]').fill(title);
	await group.locator('.vega-relation-candidate').filter({ hasText: title }).click();
}
async function createCategory(page: Page, name: string, parent?: string) {
	await openCollection(page, 'categories');
	await page.getByRole('button', { name: 'Nuevo: Categoría' }).click();
	await field(page, 'name').locator('input,textarea').fill(name);
	if (parent) await selectParent(page, parent);
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/categories\/(?!new$)[^/]+$/);
	await expect(
		page.locator('.vega-field-row[data-field="created"], .vega-field-row[data-field="updated"]')
	).toHaveCount(0);
	return page.url().split('/').pop()!;
}
async function createInline(surface: Page, relation: string, label: string, name: string) {
	await field(surface, relation)
		.getByRole('button', { name: `Crear ${label}…`, exact: true })
		.click();
	const dialog = surface.getByRole('dialog', { name: `Crear ${label}…`, exact: true });
	await field(dialog, 'name').locator('input,textarea').fill(name);
	await dialog.getByRole('button', { name: 'Crear y seleccionar', exact: true }).click();
	await expect(dialog).not.toBeVisible();
}

test('crear dos autores desde una entrada, invertir firma, guardar y reabrir conserva el orden', async ({
	page
}, info) => {
	await seedBlog(page);
	await openCollection(page, 'posts');
	await page.getByRole('button', { name: 'Nuevo: Entrada' }).click();
	await field(page, 'title').locator('input,textarea').fill('Una firma compartida');
	await createInline(page, 'authors', 'Autor', 'Ana');
	await createInline(page, 'authors', 'Autor', 'Luis');
	const authors = field(page, 'authors');
	await authors.getByRole('button', { name: /Subir.*Luis/ }).click();
	await expect(authors.locator('.vega-relation-chip').first()).toContainText('Luis');
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/posts\/(?!new$)[^/]+$/);
	await openCollection(page, 'posts');
	await page.getByRole('link', { name: 'Una firma compartida', exact: true }).click();
	await expect(field(page, 'authors').locator('.vega-relation-chip').first()).toContainText('Luis');
	await expect(field(page, 'authors').locator('.vega-relation-chip').nth(1)).toContainText('Ana');
	await openCollection(page, 'authors');
	await page.getByRole('link', { name: 'Ana', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Editar «Autor»', exact: true })).toBeVisible();
	await expect(
		page.locator('.vega-field-row[data-field="created"], .vega-field-row[data-field="updated"]')
	).toHaveCount(0);
	await expect(page.locator('.vega-editor-kv').getByText('Creado', { exact: true })).toBeVisible();
	await page.screenshot({ path: info.outputPath('autor-sin-foto-desktop.png'), fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
		await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
	await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('autor-sin-foto-mobile.png'), fullPage: true });
});

test('árbol con madre visible, orden entre hermanas y selector sin propia ni descendientes', async ({
	page
}, info) => {
	await seedBlog(page);
	await createCategory(page, 'Desarrollo');
	await createCategory(page, 'Web', 'Desarrollo');
	await createCategory(page, 'Apple', 'Desarrollo');
	await createCategory(
		page,
		'Herramientas de publicación y mantenimiento de sitios con nombres largos',
		'Web'
	);
	await openCollection(page, 'categories');
	const web = page
		.locator('tbody tr')
		.filter({ has: page.getByRole('link', { name: 'Web', exact: true }) });
	await expect(web).toContainText('Dentro de Desarrollo');
	await page.screenshot({
		path: info.outputPath('categorias-tres-niveles-desktop.png'),
		fullPage: true
	});
	const rootBox = await page.getByRole('link', { name: 'Desarrollo', exact: true }).boundingBox();
	const childBox = await web.getByRole('link', { name: 'Web', exact: true }).boundingBox();
	expect(childBox!.x).toBeGreaterThan(rootBox!.x);
	await web.getByRole('button', { name: 'Acciones de «Web»' }).click();
	const move = page
		.getByRole('menuitem', { name: /Subir entre hermanas|Bajar entre hermanas/ })
		.first();
	await move.click();
	await expect(page.locator('tbody tr').first()).toContainText('Desarrollo');
	await page.getByRole('link', { name: 'Desarrollo', exact: true }).click();
	const parent = field(page, 'parent');
	await expect(parent.locator('input[type="search"]')).toBeEnabled();
	await page.screenshot({ path: info.outputPath('categorias-form-desktop.png'), fullPage: true });
	await parent.locator('input[type="search"]').fill('Web');
	await expect(parent).toContainText('Sin resultados');
	await expect(parent.locator('.vega-relation-candidate')).toHaveCount(0);
	await page.getByRole('button', { name: 'Categorías', exact: true }).click();
	await page.setViewportSize({ width: 390, height: 844 });
	if (await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).count())
		await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
	await expect(page.locator('#vega-sidebar')).not.toBeInViewport();
	await expect(page.locator('#vega-sidebar')).not.toHaveClass(/vega-sidebar-open/);
	await expect(page.getByRole('link', { name: 'Desarrollo', exact: true })).toBeVisible();
	await expect(page.locator('.vega-list-card')).toBeVisible();
	await page.screenshot({
		path: info.outputPath('categorias-tres-niveles-mobile.png'),
		fullPage: true
	});
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('crear una categoría contextual de cuarto nivel muestra error y conserva el borrador', async ({
	page
}) => {
	await seedBlog(page);
	await createCategory(page, 'Desarrollo');
	await createCategory(page, 'Web', 'Desarrollo');
	await createCategory(page, 'JavaScript', 'Web');
	await openCollection(page, 'posts');
	await page.getByRole('button', { name: 'Nuevo: Entrada' }).click();
	await field(page, 'categories')
		.getByRole('button', { name: 'Crear Categoría…', exact: true })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Crear Categoría…', exact: true });
	await field(dialog, 'name').locator('input,textarea').fill('Navegador');
	await selectParent(dialog, 'JavaScript');
	await dialog.getByRole('button', { name: 'Crear y seleccionar', exact: true }).click();
	await expect(field(dialog, 'parent').getByRole('alert')).toContainText('Pasaría de 3 niveles');
	await expect(field(dialog, 'name').locator('input,textarea')).toHaveValue('Navegador');
	await expect(dialog).toBeVisible();
});

test('un ciclo importado aparece como raíces con aviso, guardar lo rechaza y quitar madre lo repara', async ({
	page
}) => {
	await seedBlog(page);
	const rootId = await createCategory(page, 'Desarrollo');
	const childId = await createCategory(page, 'Web', 'Desarrollo');
	await openCollection(page, 'categories');
	await page.getByRole('button', { name: 'Exportar', exact: true }).click();
	const exportDialog = page.getByRole('dialog', { name: 'Exportar «Categorías»' });
	const downloadPromise = page.waitForEvent('download');
	await exportDialog.getByRole('button', { name: 'Exportar', exact: true }).click();
	const stream = await (await downloadPromise).createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(chunk as Buffer);
	const doc = JSON.parse(Buffer.concat(chunks).toString('utf8'));
	const collection = doc.collections.find((item: { type: string }) => item.type === 'categories');
	collection.records.find((record: { id: string }) => record.id === rootId).values.parent = childId;
	await page.getByRole('button', { name: 'Importar', exact: true }).click();
	const importDialog = page.getByRole('dialog', { name: 'Importar un archivo .vega.json' });
	await importDialog.getByLabel('Elige un archivo .vega.json').setInputFiles({
		name: 'ciclo.vega.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(doc))
	});
	await importDialog.getByRole('checkbox', { name: /Confirmo que quiero sobrescribir/ }).check();
	await importDialog.getByRole('button', { name: 'Importar', exact: true }).click();
	await expect(importDialog).toContainText('0 con error');
	await importDialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
	await expect(page.locator('tbody')).toContainText('Ciclo: corrige su madre');
	await page.getByRole('link', { name: 'Desarrollo', exact: true }).click();
	await expect(field(page, 'parent').getByRole('alert')).toContainText(
		'No puede estar dentro de sí misma'
	);
	await field(page, 'name').locator('input,textarea').fill('Desarrollo reparado');
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(field(page, 'parent').getByRole('alert')).toContainText(
		'No puede estar dentro de sí misma'
	);
	await field(page, 'parent').locator('.vega-relation-remove').click();
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await openCollection(page, 'categories');
	await expect(page.locator('tbody')).not.toContainText('Ciclo: corrige su madre');
});
