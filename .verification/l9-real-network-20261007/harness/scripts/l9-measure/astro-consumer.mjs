/** Starts the actual archived starter preview recipe, without a new adapter or renderer. */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdir, cp, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let server, recipe;
let redactions = [];
try {
	for await (const line of lines) {
		const config = JSON.parse(line);
		redactions = Object.values(config).filter(
			(value) => typeof value === 'string' && value.length > 0
		);
		if (server) break;
		console.error('[l9-phase] config');
		const require = createRequire(join(config.astroRoot, 'package.json'));
		const { dev } = await import(pathToFileURL(require.resolve('astro')));
		console.error('[l9-phase] imported');
		const root = join(config.astroRoot, 'starters/default');
		recipe = join(root, 'src/pages/preview');
		await mkdir(recipe, { recursive: true });
		await cp(join(root, 'editor-mode/preview'), recipe, { recursive: true });
		console.error('[l9-phase] recipe');
		Object.assign(process.env, {
			VEGA_DEMO: 'false',
			VEGA_EDITOR_MODE: 'true',
			POCKETBASE_URL: config.pocketbaseUrl,
			VEGA_PREVIEW_SECRET: config.secret,
			VEGA_PREVIEW_POCKETBASE_TOKEN: config.loaderToken,
			VEGA_VISUAL_BRIDGE_ORIGINS: config.allowedOrigin,
			ASTRO_TELEMETRY_DISABLED: '1'
		});
		server = await dev({
			root,
			configFile: false,
			output: 'server',
			logLevel: 'silent',
			devToolbar: { enabled: false },
			server: { host: '127.0.0.1', port: config.port }
		});
		console.error('[l9-phase] ready');
		console.log(JSON.stringify({ ready: true, port: server.address.port }));
	}
} catch (error) {
	console.error('[l9-phase] failed');
	let message = String(error?.message ?? '');
	for (const value of redactions) message = message.replaceAll(value, '[redacted]');
	message = message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 1500);
	console.log(
		JSON.stringify({
			error: true,
			name: /^[A-Za-z]+Error$/.test(error?.name ?? '') ? error.name : 'Error',
			code: /^[A-Z_0-9]+$/.test(error?.code ?? '') ? error.code : null,
			message
		})
	);
	process.exitCode = 1;
} finally {
	lines.close();
	await server?.stop();
	if (recipe) await rm(recipe, { recursive: true, force: true });
}
