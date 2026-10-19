import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.VEGA_CSP_PROOF_CANDIDATE_ROOT;
if (!root) throw new Error('Explicit gated candidate root required');
const require = createRequire(join(root, 'package.json'));
const { defineConfig } = require('@playwright/test');
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	testDir: here,
	testMatch: 'seed.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: true,
	reporter: 'list',
	outputDir: join(here, 'current-spa-proof-runtime', 'test-results'),
	use: {
		browserName: 'chromium',
		baseURL: 'http://localhost:4173',
		locale: 'es-ES',
		viewport: { width: 1440, height: 900 },
		trace: 'off',
		video: 'off',
		screenshot: 'off'
	}
	// Deliberately no webServer: no implicit build/install/server startup.
});
