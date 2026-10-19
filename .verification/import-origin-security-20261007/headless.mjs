// Verificación visual mínima de la lámina; no sustituye los tests del componente real.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const repo = process.argv[2];
const out = process.argv[3];
const { chromium } = await import(pathToFileURL(join(repo, 'node_modules/@playwright/test/index.mjs')).href);
const browser = await chromium.launch({ headless: true });
try {
 for (const width of [390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(pathToFileURL(join(out, 'lamina.html')).href);
  for (const mode of ['light', 'dark']) {
   await page.evaluate((mode) => document.documentElement.dataset.mode = mode, mode);
   const measurements = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    origins: [...document.querySelectorAll('.vega-import-origin')].map((el) => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })),
    inputs: [...document.querySelectorAll('input[type=checkbox]')].map((el) => ({ hasLabel: el.labels.length > 0, checked: el.checked }))
   }));
   console.log(JSON.stringify({ width, mode, measurements }));
   if (measurements.scrollWidth > measurements.width || measurements.origins.some((o) => o.height < 44) || measurements.inputs.some((i) => !i.hasLabel || i.checked)) throw new Error('Desborde, target o consentimiento inválido');
   await page.screenshot({ path: join(out, `lamina-${width}-${mode}.png`), fullPage: true });
  }
  await page.evaluate(() => {
   const long = 'https://' + 'a'.repeat(220) + '.example.test:8443';
   document.querySelectorAll('.vega-import-origins .vega-import-hint')[1].textContent = 'Backend declarado por el archivo: ' + long;
   document.querySelector('.vega-import-reasons li').textContent = 'Origen no autorizado: ' + long;
  });
  const longWidth = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(JSON.stringify({ width, scenario: 'long-origins', measurements: longWidth }));
  if (longWidth.scrollWidth > longWidth.width) throw new Error('Desborde con origen largo');
  await page.screenshot({ path: join(out, `lamina-${width}-long.png`), fullPage: true });
  await page.close();
 }
} finally { await browser.close(); }
