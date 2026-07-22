import { describe, expect, it, vi } from 'vitest';
import {
	applyProjectDiscovery,
	fetchProjectDiscovery,
	parseProjectDiscovery
} from './project-discovery';

const DOCUMENT = {
	protocolVersion: 1,
	project: { key: 'default', name: 'Fodaveg' },
	auth: { collection: 'vega_editors', apiBasePath: '/api/vega-auth' },
	manifest: { collection: 'vega', key: 'fodaveg-main', schemaVersion: 1 },
	siteSettings: { collection: 'site_settings', key: 'default' }
};

describe('project discovery', () => {
	it('parses the versioned contract', () => {
		expect(parseProjectDiscovery(DOCUMENT)).toEqual(DOCUMENT);
	});

	it('rejects unsupported or incomplete documents', () => {
		expect(parseProjectDiscovery({ ...DOCUMENT, protocolVersion: 2 })).toBeNull();
		expect(parseProjectDiscovery({ ...DOCUMENT, manifest: { key: 'default' } })).toBeNull();
	});

	it('loads discovery from the selected backend, not from the Vega origin', async () => {
		const fetcher = vi.fn(async () => new Response(JSON.stringify(DOCUMENT), { status: 200 }));
		await expect(fetchProjectDiscovery('https://pb.example.test/base/', fetcher)).resolves.toEqual(
			DOCUMENT
		);
		expect(fetcher).toHaveBeenCalledWith(
			new URL('https://pb.example.test/api/vega/discovery'),
			expect.objectContaining({ cache: 'no-store' })
		);
	});

	it('uses remote project auth while preserving the already resolved backend URL', () => {
		expect(
			applyProjectDiscovery(
				{ backendUrl: 'https://pb.example.test', authCollection: '_superusers' },
				parseProjectDiscovery(DOCUMENT)
			)
		).toEqual({
			backendUrl: 'https://pb.example.test',
			authCollection: 'vega_editors',
			authApiBasePath: '/api/vega-auth',
			manifestKey: 'fodaveg-main'
		});
	});
});
