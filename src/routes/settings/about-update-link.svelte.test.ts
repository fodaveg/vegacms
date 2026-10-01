/**
 * «Acerca de» de `/settings`: con `releaseUrl` nulo (URL del release que no es de
 * `https://github.com/`, ver `release-url.ts`) el aviso de versión sigue pero NO hay `<a>`; con URL
 * válida, sí.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend';
import type { UpdateStatus } from '$lib/update/check-update';

const checkForUpdate = vi.hoisted(() => vi.fn());
vi.mock('$lib/update/check-update', () => ({ checkForUpdate }));

import SettingsPage from './+page.svelte';

function mountPage() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		model: { warnings: [], types: [] },
		port: {
			capabilities: { schemaBootstrap: false },
			listContentTypes: vi.fn(async () => [])
		} as unknown as BackendPort,
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

async function checkWith(status: UpdateStatus, target: HTMLElement): Promise<HTMLElement> {
	checkForUpdate.mockResolvedValue(status);
	const button = target.querySelector<HTMLButtonElement>('.vega-update-check button');
	if (!button) throw new Error('No hay botón «Comprobar»');
	button.click();
	await settle();
	const result = target.querySelector<HTMLElement>('.vega-update-check-result');
	if (!result) throw new Error('No hay resultado de la comprobación');
	return result;
}

describe('/settings: enlace «Ver el release»', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('con releaseUrl nulo: el aviso sigue y no hay enlace', async () => {
		mounted = mountPage();
		await settle();
		const result = await checkWith(
			{ kind: 'update-available', current: '0.9.0', latest: '0.10.0', releaseUrl: null },
			mounted.target
		);
		expect(result.textContent).toContain('settings.about.updateAvailable');
		expect(result.querySelector('a')).toBeNull();
	});

	test('con releaseUrl válido: enlace al release', async () => {
		mounted = mountPage();
		await settle();
		const url = 'https://github.com/fodaveg/vega/releases/tag/v0.10.0';
		const result = await checkWith(
			{ kind: 'update-available', current: '0.9.0', latest: '0.10.0', releaseUrl: url },
			mounted.target
		);
		expect(result.querySelector('a')?.getAttribute('href')).toBe(url);
	});
});
