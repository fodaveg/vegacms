/**
 * `/settings` según el rol (lote 11, tarea 6): quien no es administrador (sin
 * `capabilities.schemaBootstrap`) no ve «Modelo de contenido» (ni editor ni aviso) y tiene la
 * conexión plegada bajo «Avanzado», cerrado; un administrador ve la conexión tal cual.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend';

import SettingsPage from './+page.svelte';

function mountPage(schemaBootstrap: boolean) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string) => key,
		locale: 'es',
		model: { warnings: [], types: [], blockTypes: [] },
		port: {
			capabilities: { schemaBootstrap, strongAuth: false },
			listContentTypes: vi.fn(async () => []),
			list: vi.fn(async () => ({ items: [], page: 1, perPage: 30, totalItems: 0, totalPages: 1 }))
		} as unknown as BackendPort,
		icons: { knownIcons: [] },
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		reloadModel: vi.fn(async () => undefined)
	} as unknown as VegaAppContext;
	const instance = mount(SettingsPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 6; i++) await Promise.resolve();
	await tick();
}

describe('/settings: secciones por rol', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin permisos de administración: conexión plegada bajo «Avanzado» y sin modelo de contenido', async () => {
		mounted = mountPage(false);
		await settle();
		const advanced = mounted.target.querySelector<HTMLDetailsElement>('[data-settings-advanced]');
		expect(advanced).not.toBeNull();
		expect(advanced?.open).toBe(false);
		expect(advanced?.querySelector('summary')?.textContent).toBe('settings.advanced.title');
		expect(advanced?.querySelector('#vega-backend-title')).not.toBeNull();
		// Ni editor del manifiesto ni el antiguo aviso de «Modelo de contenido».
		expect(mounted.target.querySelector('#manifest-editor-textarea')).toBeNull();
		expect(mounted.target.querySelector('[data-manifest-state]')).toBeNull();
		expect(mounted.target.textContent).not.toContain('settings.manifest.editorGateTitle');
	});

	test('administrador: la conexión se ve tal cual, sin «Avanzado»', async () => {
		mounted = mountPage(true);
		await settle();
		expect(mounted.target.querySelector('[data-settings-advanced]')).toBeNull();
		expect(mounted.target.querySelector('#vega-backend-title')).not.toBeNull();
	});
});
