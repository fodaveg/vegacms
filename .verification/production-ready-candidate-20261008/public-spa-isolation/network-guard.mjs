/** Classify proof URLs without retaining paths, query values, headers or credentials. */
export function classifyURL(value) {
	let url;
	try { url = new URL(value); } catch { return 'blocked'; }
	if (url.username || url.password) return 'blocked';
	if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
		&& ['4173', '4174', '4175', '4176', '4177'].includes(url.port)) return 'owned';
	if (url.origin === 'https://vega-visual-site.example') return 'synthetic-mock-only';
	return 'blocked';
}

/** The terminal context guard permits network only to the owned HTTP proof ports. */
export function createGuard() {
	const counts = { owned: 0, blocked: 0, unhandledSynthetic: 0 };
	return {
		counts,
		async handle(route) {
			const classification = classifyURL(route.request().url());
			if (classification === 'owned') {
				counts.owned++;
				await route.continue();
				return;
			}
			if (classification === 'synthetic-mock-only') counts.unhandledSynthetic++;
			else counts.blocked++;
			await route.abort('blockedbyclient');
		},
		async guardedFetch(route) {
			// APIRequest route.fetch bypasses routing; never call it before this explicit gate.
			if (classifyURL(route.request().url()) !== 'owned') {
				await route.fallback();
				return null;
			}
			// Redirects cannot escape through APIRequest; any browser follow-up hits the guard.
			return await route.fetch({ maxRedirects: 0 });
		}
	};
}
