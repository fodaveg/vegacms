import { test, expect, loginAsDemo } from './fixtures';

test('Actividad: filtro por persona y enlace al título vivo', async ({ page }) => {
	await loginAsDemo(page);
	await page.getByRole('link', { name: 'Actividad', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Actividad', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Bienvenido a Vega', exact: true })).toBeVisible();
	await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption('editor_ana');
	await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
	await expect(
		page.locator('.activity-list').getByText('jorge.p@fodaveg.net', { exact: true })
	).toHaveCount(0);
	await expect(page.getByText('2 guardados')).toBeVisible();
	await page.getByRole('link', { name: 'Bienvenido a Vega', exact: true }).click();
	await expect(page).toHaveURL(/\/c\/posts\/post_1$/);
});

test('editor no ve Actividad y la URL enseña su puerta', async ({ page }) => {
	await page.addInitScript(() => {
		window.__VEGA_FORCE_EDITOR_CAPABILITIES__ = true;
	});
	await loginAsDemo(page);
	await expect(page.getByRole('link', { name: 'Actividad', exact: true })).toHaveCount(0);
	await page.goto('/actividad');
	await expect(page.getByRole('heading', { name: 'Solo para superusuarios' })).toBeVisible();
});

test('Actividad en móvil: filtros, agrupado masivo y sin desbordamiento', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await loginAsDemo(page);
	await page.goto('/actividad');
	await expect(page.getByRole('heading', { name: 'Actividad', exact: true })).toBeVisible();
	await expect(page.getByText('sin copia en la papelera')).toBeVisible();
	await page.locator('summary').click();
	await expect(page.getByText('Entrada importada 1')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('Actividad: contraste medido, foco y controles táctiles', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await loginAsDemo(page);
	await page.goto('/actividad');
	await expect(page.getByRole('link', { name: 'Bienvenido a Vega', exact: true })).toBeVisible();
	const measure = (root: HTMLElement | SVGElement) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d')!;
		const rgb = (color: string) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			return [...context.getImageData(0, 0, 1, 1).data];
		};
		const luminance = (color: number[]) =>
			color
				.slice(0, 3)
				.map((value) => {
					const c = value / 255;
					return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
				})
				.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
		const ratios = Array.from(
			root.querySelectorAll('h1,h2,p,label,time,a,summary,button,select,input')
		)
			.filter((node) => {
				const rect = node.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			})
			.map((node) => {
				let ancestor: Element | null = node;
				let background = [255, 255, 255, 255];
				while (ancestor) {
					const color = rgb(getComputedStyle(ancestor).backgroundColor);
					if (color[3] === 255) {
						background = color;
						break;
					}
					ancestor = ancestor.parentElement;
				}
				const ink = luminance(rgb(getComputedStyle(node).color));
				const paper = luminance(background);
				return {
					tag: node.tagName,
					ratio: (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05)
				};
			});
		return {
			ratios,
			controls: Array.from(root.querySelectorAll('button,input,select,summary')).map((node) => {
				const rect = node.getBoundingClientRect();
				return { tag: node.tagName, width: rect.width, height: rect.height };
			})
		};
	};
	const measurement = await page.locator('.activity-page').evaluate(measure);
	for (const pair of measurement.ratios)
		expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
	for (const control of measurement.controls) {
		expect(control.width).toBeGreaterThanOrEqual(44);
		expect(control.height).toBeGreaterThanOrEqual(44);
	}
	await page.getByRole('button', { name: 'Filtrar', exact: true }).focus();
	await page.keyboard.press('Tab');
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: 'Filtrar', exact: true })).toBeFocused();
	expect(
		await page
			.getByRole('button', { name: 'Filtrar', exact: true })
			.evaluate((node) => getComputedStyle(node).outlineStyle)
	).not.toBe('none');
	console.log('ACTIVITY_UI_MEASUREMENT ' + JSON.stringify(measurement));
	if (process.env.VEGA_ACTIVITY_EVIDENCE_DIR) {
		await page.screenshot({
			path: `${process.env.VEGA_ACTIVITY_EVIDENCE_DIR}/activity-mobile.png`,
			fullPage: true
		});
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.screenshot({
			path: `${process.env.VEGA_ACTIVITY_EVIDENCE_DIR}/activity-desktop.png`,
			fullPage: true
		});
	}
	await page.evaluate(() => {
		document.documentElement.dataset.mode = 'dark';
	});
	const dark = await page.locator('.activity-page').evaluate(measure);
	for (const pair of dark.ratios)
		expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
	console.log('ACTIVITY_UI_DARK_MEASUREMENT ' + JSON.stringify(dark));
	if (process.env.VEGA_ACTIVITY_EVIDENCE_DIR)
		await page.screenshot({
			path: `${process.env.VEGA_ACTIVITY_EVIDENCE_DIR}/activity-dark.png`,
			fullPage: true
		});
});
