/**
 * Portada `/` sin nada que mostrar (lote 11, tarea 8): el texto depende del rol. Quien administra
 * (`capabilities.schemaBootstrap`) recibe la guía a Ajustes; quien edita, que todavía no hay
 * contenido y que hable con quien administre el sitio, sin botón a Ajustes.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort } from '$lib/backend';
import { model } from '$lib/home/fixture';

import HomePage from './+page.svelte';

function mountPage(schemaBootstrap: boolean) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string) => key,
		// Este caso conserva la guía general: el proyecto ha desactivado el historial.
		model: model([], { revisions: { enabled: false, keepPerRecord: 20, trashDays: 30 } }),
		session: { token: 't', user: { id: 'u1', email: 'admin@vega.test' }, expiresAt: null },
		port: { capabilities: { schemaBootstrap } } as unknown as BackendPort,
		nav: { toSettings: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(HomePage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance };
}

describe('/: portada vacía por rol', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('administrador: guía a Ajustes con su botón', async () => {
		mounted = mountPage(true);
		await tick();
		expect(mounted.target.textContent).toContain('nav.emptyBody');
		expect(mounted.target.textContent).not.toContain('nav.emptyBodyEditor');
		expect(mounted.target.querySelector('button')?.textContent).toBe('nav.emptyCta');
	});

	test('editor: avisa de que no hay contenido y que hable con quien administra, sin Ajustes', async () => {
		mounted = mountPage(false);
		await tick();
		expect(mounted.target.textContent).toContain('nav.emptyBodyEditor');
		expect(mounted.target.querySelector('button')).toBeNull();
	});
});
