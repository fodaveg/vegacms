import { describe, expect, test } from 'vitest';
import { backendInstallationIdentity, resolveAuthApiBasePath } from './backend-config';

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

describe('backendInstallationIdentity', () => {
	test('no persiste credenciales ni query/hash y conserva el subpath', () => {
		expect(
			backendInstallationIdentity(
				'https://user:secret@pb.example.com:8090/sitio///?token=secret#x',
				' project '
			)
		).toBe(JSON.stringify(['https://pb.example.com:8090/sitio', 'project']));
		expect(backendInstallationIdentity('https://pb.example.com/sitio', 'project')).not.toBe(
			backendInstallationIdentity('https://pb.example.com/otro', 'project')
		);
	});
	test('distingue proyectos del mismo backend y normaliza el default real', () => {
		expect(backendInstallationIdentity('https://pb.example.com/', ' ')).toBe(
			backendInstallationIdentity('https://pb.example.com', 'default')
		);
		expect(backendInstallationIdentity('https://pb.example.com', 'a')).not.toBe(
			backendInstallationIdentity('https://pb.example.com', 'b')
		);
		expect(backendInstallationIdentity('invalid')).toBeNull();
	});
});
