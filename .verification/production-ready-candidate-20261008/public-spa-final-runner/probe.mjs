/** Synthetic route objects discriminate the guard without opening any connection/browser. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { classifyURL, createGuard } from './network-guard.mjs';
const rows = [];
for (const url of ['http://localhost:4173/login', 'http://127.0.0.1:4174/login', 'http://[::1]:4175/', 'http://localhost:4176/', 'http://localhost:4177/csp-parent']) {
	assert.equal(classifyURL(url), 'owned');
	const guard = createGuard(); let continued = 0; let aborted = 0;
	await guard.handle({ request: () => ({ url: () => url }), continue: async () => continued++, abort: async () => aborted++ });
	assert.equal(continued, 1); assert.equal(aborted, 0);
	rows.push({ category: 'owned', continued, aborted });
}
for (const url of ['https://admin.vegacms.com/api/health', 'https://admin.lumbre.pro/', 'https://admin.fodaveg.net/', 'http://localhost:8090/', 'http://localhost:4178/', 'http://localhost:4173@admin.vegacms.com/', 'http://user:secret@localhost:4173/']) {
	const guard = createGuard(); let continued = 0; let aborted = 0; let fetches = 0;
	const route = { request: () => ({ url: () => url }), continue: async () => continued++, abort: async () => aborted++, fetch: async () => fetches++, fallback: async () => guard.handle(route) };
	assert.equal(await guard.guardedFetch(route), null);
	assert.equal(guard.counts.blocked, 1); assert.equal(aborted, 1); assert.equal(continued, 0); assert.equal(fetches, 0);
	rows.push({ category: 'blocked', blocked: guard.counts.blocked, continued, aborted, fetches });
}
const synthetic = createGuard(); let syntheticAborts = 0;
await synthetic.handle({ request: () => ({ url: () => 'https://vega-visual-site.example/preview' }), abort: async () => syntheticAborts++ });
assert.equal(synthetic.counts.unhandledSynthetic, 1); assert.equal(syntheticAborts, 1);
let options;
const ownedFetch = await createGuard().guardedFetch({ request: () => ({ url: () => 'http://localhost:4173/c/posts' }), fetch: async (value) => { options = value; return 'local-response'; } });
assert.equal(ownedFetch, 'local-response'); assert.deepEqual(options, { maxRedirects: 0 });
const result = { status: 'PASSED', cases: rows.length + 2, rows, unhandledSyntheticAborts: syntheticAborts, ownedFetchRedirects: options.maxRedirects, realNetworkRequests: 0, browserStarted: false };
writeFileSync(new URL('./probe-result.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, cases: result.cases, realNetworkRequests: 0, browserStarted: false }));
