import { describe, expect, test } from 'vitest';
import { resolveAuthApiBasePath } from './backend-config';

describe('resolveAuthApiBasePath', () => {
	test('es opt-in y normaliza la barra final', () => {
		expect(resolveAuthApiBasePath(null)).toBeNull();
		expect(resolveAuthApiBasePath({ authApiBasePath: ' /api/vega-auth/// ' })).toBe(
			'/api/vega-auth'
		);
	});

	test('rechaza URLs externas y paths protocol-relative para no mezclar tokens entre hosts', () => {
		expect(resolveAuthApiBasePath({ authApiBasePath: 'https://auth.example.com/api' })).toBeNull();
		expect(resolveAuthApiBasePath({ authApiBasePath: '//auth.example.com/api' })).toBeNull();
	});
});
