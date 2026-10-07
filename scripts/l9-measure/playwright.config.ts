import { defineConfig } from '@playwright/test';
export default defineConfig({
	tsconfig: './tsconfig.json',
	testDir: '.',
	testMatch: '*.spec.ts',
	workers: 1,
	fullyParallel: false,
	timeout: 240_000,
	expect: { timeout: 15_000 },
	retries: 0,
	reporter: [['line']],
	outputDir: '/private/tmp/vega-l9-measure-playwright',
	use: {
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
		browserName: 'chromium',
		headless: true,
		locale: 'es-ES',
		viewport: { width: 1440, height: 1000 },
		trace: 'off',
		screenshot: 'off',
		video: 'off'
	}
});
