import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError, type BackendPort } from '$lib/backend';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import {
	seedLikePrevious0ace139,
	seedLikePrevious1bda988
} from '$lib/backend/site-seeding-previous.fixture';
import { t } from '$lib/i18n';
import SiteBaseCard from './SiteBaseCard.svelte';

const es = (key: string, params?: Record<string, string | number>) => t('es', key, params);

async function authedMemory(): Promise<MemoryBackendPort> {
	const port = createMemoryBackend();
	await port.login({ email: 'admin@vega.test', password: 'test-password' });
	return port;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 8; i += 1) {
		await Promise.resolve();
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

/** Espera (hasta 3 s) a que se cumpla algo que depende de varias lecturas y escrituras en cadena. */
async function until(condition: () => boolean): Promise<void> {
	for (let i = 0; i < 300 && !condition(); i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 10));
		await tick();
	}
}

function mountCard(port: BackendPort, onChanged = vi.fn()) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const feedback = { toast: vi.fn(), reportError: vi.fn() };
	const ctx = { t: es, port, feedback } as unknown as VegaAppContext;
	const instance = mount(SiteBaseCard, {
		target,
		props: { onChanged },
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, feedback, onChanged };
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
	const found = Array.from(target.querySelectorAll<HTMLButtonElement>('button')).find(
		(item) => item.textContent?.trim() === label
	);
	if (!found) throw new Error(`no hay botón «${label}»`);
	return found;
}

async function click(el: HTMLElement): Promise<void> {
	el.click();
	await settle();
}

function dialog(target: HTMLElement): HTMLElement | null {
	return target.querySelector('[role="dialog"]');
}

describe('SiteBaseCard', () => {
	let mounted: ReturnType<typeof mountCard> | null = null;

	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('A0: mientras comprueba, solo «Comprobando el sitio…», sin botones', async () => {
		const port = await authedMemory();
		const pending = new Promise<never>(() => {});
		vi.spyOn(port, 'listContentTypes').mockReturnValue(pending);
		mounted = mountCard(port);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('checking');
		expect(section.textContent).toContain('Comprobando el sitio…');
		expect(section.querySelectorAll('button')).toHaveLength(0);
	});

	test('A1: sin preparar, con «Preparar el sitio» como acción principal', async () => {
		mounted = mountCard(await authedMemory());
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('unprepared');
		expect(section.textContent).toContain('Sin preparar');
		expect(button(mounted.target, 'Preparar el sitio').className).toContain(
			'vega-admin-btn--primary'
		);
		expect(section.textContent).not.toMatch(/sembrado/i);
	});

	test('A1 parcial: cuenta lo que falta', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		const types = await port.listContentTypes();
		// 1bda988 ya tiene todo menos `redirects`.
		expect(types.some((type) => type.name === 'redirects')).toBe(false);
		mounted = mountCard(port);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('unprepared');
		expect(section.textContent).toContain('Faltan 1 de las 5 colecciones');
		expect(section.textContent).toContain('Redirecciones');
	});

	test('A2: al día, sin botón primario y con «Volver a comprobar»', async () => {
		const port = await authedMemory();
		await seedSiteProject(port);
		mounted = mountCard(port);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('current');
		expect(section.textContent).toContain('Al día');
		expect(section.querySelector('.vega-admin-btn--primary')).toBeNull();
		const recheck = vi.spyOn(port, 'listContentTypes');
		await click(button(mounted.target, 'Volver a comprobar'));
		expect(recheck).toHaveBeenCalled();
	});

	test('A3: con actualización, «Actualizar el sitio» y la frase de lo que cambia', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		mounted = mountCard(port);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('update');
		expect(section.textContent).toContain('Hay una actualización');
		expect(section.textContent).toContain('añadir campos a');
		expect(button(mounted.target, 'Actualizar el sitio').className).toContain(
			'vega-admin-btn--primary'
		);
	});

	describe('manifiesto editado a mano', () => {
		async function blockedPort(): Promise<MemoryBackendPort> {
			const port = await authedMemory();
			await seedSiteProject(port);
			const record = (await port.list('vega', { perPage: 1 })).items[0]!;
			await port.update('vega', record.id, { manifest: { editado: 'a mano' } });
			return port;
		}

		test('A4 y D3: aviso, «Ver por qué» con el detalle técnico plegado y «Copiar el detalle»', async () => {
			const port = await blockedPort();
			const writeText = vi.fn(async () => undefined);
			Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
			const create = vi.spyOn(port, 'ensureCollections');
			mounted = mountCard(port);
			await settle();

			const section = mounted.target.querySelector('section')!;
			expect(section.dataset.siteState).toBe('blocked');
			expect(section.textContent).toContain('Vega no puede actualizar este sitio tal como está');
			expect(section.textContent).toContain('No se ha escrito nada');
			expect(section.querySelector('.vega-admin-btn--primary')).toBeNull();

			await click(button(mounted.target, 'Ver por qué'));
			const open = dialog(mounted.target)!;
			expect(open.textContent).toContain('No se puede actualizar el sitio');
			expect(open.textContent).toContain('El modelo de contenido');
			expect(open.textContent).toContain('Se ha editado a mano');
			const details = open.querySelector('details')!;
			expect(details.open).toBe(false);
			expect(details.querySelector('pre')!.textContent).toContain('registro "vega/default"');
			expect(document.activeElement).toBe(button(open, 'Cerrar'));

			await click(button(open, 'Copiar el detalle'));
			expect(writeText).toHaveBeenCalledWith(expect.stringContaining('registro "vega/default"'));
			expect(mounted.feedback.toast).toHaveBeenCalledWith('Detalle copiado.', { kind: 'success' });

			await click(button(open, 'Cerrar'));
			expect(dialog(mounted.target)).toBeNull();
			expect(create).not.toHaveBeenCalled();
		});
	});

	test('A5: un fallo de lectura lo cuenta el banner global y deja «Reintentar»', async () => {
		const port = await authedMemory();
		const read = vi
			.spyOn(port, 'listContentTypes')
			.mockRejectedValueOnce(VegaError.backend('boom'));
		mounted = mountCard(port);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('error');
		expect(section.textContent).toContain('No se pudo comprobar cómo está el sitio.');
		expect(mounted.feedback.reportError).toHaveBeenCalledWith(expect.any(VegaError), {
			action: 'settings:siteBase'
		});

		await click(button(mounted.target, 'Reintentar'));
		expect(read).toHaveBeenCalledTimes(2);
		expect(section.dataset.siteState).toBe('unprepared');
	});

	test('D1: el botón repite el preflight, enseña el plan y el foco inicial va a «Cancelar»', async () => {
		const port = await authedMemory();
		const read = vi.spyOn(port, 'listContentTypes');
		mounted = mountCard(port);
		await settle();
		const afterMount = read.mock.calls.length;

		await click(button(mounted.target, 'Preparar el sitio'));

		expect(read.mock.calls.length).toBeGreaterThan(afterMount);
		const open = dialog(mounted.target)!;
		expect(open.textContent).toContain('Preparar el sitio');
		expect(open.textContent).toContain('Esto es lo que Vega va a crear en tu PocketBase');
		for (const name of ['pages', 'vega_media', 'blocks', 'redirects', 'vega', 'vega_editors']) {
			expect(open.textContent).toContain(name);
		}
		expect(open.textContent).toContain('Si ya existe, se deja como está');
		expect(open.textContent).toContain('La página «Inicio»');
		// «No se deshace» se dice una vez.
		expect(open.textContent!.match(/no se deshace/gi)).toHaveLength(1);
		expect(document.activeElement).toBe(button(open, 'Cancelar'));

		await click(button(open, 'Cancelar'));
		expect(dialog(mounted.target)).toBeNull();
		expect((await port.listContentTypes()).some((type) => type.name === 'pages')).toBe(false);
	});

	test('D2: el plan de actualización separa lo que se añade, se crea y se sustituye, y lo que ya está al día', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		mounted = mountCard(port);
		await settle();
		// 1bda988 no tiene `redirects`: es «sin preparar» parcial; el plan sigue siendo de creación.
		await click(button(mounted.target, 'Preparar el sitio'));
		const open = dialog(mounted.target)!;
		expect(open.textContent).toContain('Se crea');
		expect(open.textContent).toContain('Se añade');
		expect(open.textContent).toContain('Se sustituye');
		expect(open.textContent).toContain('Publicar el');
	});

	test('D2 puro: sin colecciones ausentes el diálogo es «Actualizar el sitio» con el resto al día', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		mounted = mountCard(port);
		await settle();

		await click(button(mounted.target, 'Actualizar el sitio'));

		const open = dialog(mounted.target)!;
		expect(open.querySelector('h2')!.textContent).toBe('Actualizar el sitio');
		expect(open.textContent).toContain('Esto es lo que cambia');
		expect(open.textContent).toContain('Se añade');
		expect(open.textContent).toContain('Se sustituye');
		expect(open.textContent).toContain('ya está al día');
		expect(open.textContent).not.toContain('Se crea');
	});

	test('D4 y A6: en curso no se puede cerrar ni cancelar, y al terminar enseña el resumen y avisa', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let clock = 1_000_000;
		vi.spyOn(Date, 'now').mockImplementation(() => clock);
		const port = await authedMemory();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ensure = port.ensureCollections.bind(port);
		vi.spyOn(port, 'ensureCollections').mockImplementation(async (specs) => {
			await gate;
			return ensure(specs);
		});
		const onChanged = vi.fn();
		mounted = mountCard(port, onChanged);
		await settle();
		await click(button(mounted.target, 'Preparar el sitio'));
		const open = dialog(mounted.target)!;

		await click(button(open, 'Preparar el sitio'));
		expect(open.textContent).toContain('Preparando el sitio… 0:00');
		expect(button(open, 'Preparando…').getAttribute('aria-disabled')).toBe('true');
		expect(button(open, 'Cancelar').getAttribute('aria-disabled')).toBe('true');

		clock += 6000;
		vi.advanceTimersByTime(1000);
		await tick();
		expect(open.textContent).toContain('Preparando el sitio… 0:06');

		// Ni «Cancelar», ni la X, ni Esc cierran.
		await click(button(open, 'Cancelar'));
		await click(open.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')!);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(dialog(mounted.target)).not.toBeNull();

		release();
		await until(() => dialog(mounted!.target) === null);
		await settle();
		expect(dialog(mounted.target)).toBeNull();
		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('current');
		expect(section.textContent).toContain(
			'Hecho: 6 colecciones, el modelo de contenido y la página «Inicio»'
		);
		expect(section.querySelector('a')!.textContent).toBe('Editores');
		expect(mounted.feedback.toast).toHaveBeenCalledWith('Sitio preparado.', { kind: 'success' });
		expect(onChanged).toHaveBeenCalled();
	});

	test('un enlace de invitación de otro origen se cuenta en el resultado, sin tratarlo como error', async () => {
		const port = await authedMemory();
		mounted = mountCard(port);
		await settle();
		await click(button(mounted.target, 'Preparar el sitio'));
		// Tras el preflight y antes de confirmar: el puerto responde `foreign-origin`.
		vi.spyOn(port.administration!, 'ensureInvitationLink').mockResolvedValue('foreign-origin');

		await click(button(dialog(mounted.target)!, 'Preparar el sitio'));

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('current');
		expect(section.textContent).toContain('El enlace del correo sigue llevando al panel');
		expect(mounted.feedback.reportError).not.toHaveBeenCalled();
		expect(dialog(mounted.target)).toBeNull();
	});

	test('D5: un fallo muestra la salida del servidor y «Reintentar» vuelve a pasar por el preflight', async () => {
		const port = await authedMemory();
		const ensure = port.ensureCollections.bind(port);
		vi.spyOn(port, 'ensureCollections').mockRejectedValueOnce(
			new Error('Failed to update collection "pages": fields: (8: boom)')
		);
		const onChanged = vi.fn();
		mounted = mountCard(port, onChanged);
		await settle();
		await click(button(mounted.target, 'Preparar el sitio'));
		await click(button(dialog(mounted.target)!, 'Preparar el sitio'));

		const open = dialog(mounted.target)!;
		expect(open.textContent).toContain('No se pudo terminar');
		expect(open.textContent).toContain('Lo que se creó antes del fallo se queda como está');
		expect(open.querySelector('pre')!.textContent).toContain('Failed to update collection "pages"');
		expect(document.activeElement).toBe(button(open, 'Reintentar'));
		expect(onChanged).toHaveBeenCalled();

		const read = vi.spyOn(port, 'listContentTypes');
		vi.mocked(port.ensureCollections).mockImplementation(ensure);
		await click(button(open, 'Reintentar'));
		expect(read).toHaveBeenCalled();
		expect(dialog(mounted.target)!.textContent).toContain('Esto es lo que Vega va a crear');
	});
});
