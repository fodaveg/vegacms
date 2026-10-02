import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { VegaError, type BackendPort } from '$lib/backend';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { seedSiteProject } from '$lib/backend/site-seeding';
import { SITE_SEED_BLOG_MODULE } from '$lib/backend/site-seeding-blog';
import { SITE_SEED_CONTACT_MODULE } from '$lib/backend/site-seeding-contact';
import {
	handEditedManifest,
	seedLikePrevious0ace139,
	seedLikePrevious1bda988
} from '$lib/backend/site-seeding-previous.fixture';
import type { JsonValue } from '$lib/backend/types';
import { ensureLocaleLoaded, t } from '$lib/i18n';
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

function mountCard(port: BackendPort, onChanged = vi.fn(), translate: VegaAppContext['t'] = es) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const feedback = { toast: vi.fn(), reportError: vi.fn() };
	const ctx = { t: translate, port, feedback } as unknown as VegaAppContext;
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

/** Los títulos de las filas de un grupo del plan, por el rótulo exacto del grupo. */
function groupTitles(scope: HTMLElement, heading: string): string[] {
	const title = Array.from(scope.querySelectorAll('h3')).find(
		(item) => item.textContent?.trim() === heading
	);
	if (!title) throw new Error(`no hay grupo «${heading}»`);
	return Array.from(title.parentElement!.querySelectorAll('li > b')).map(
		(item) => item.textContent ?? ''
	);
}

function moduleRow(target: HTMLElement, id: string): HTMLElement {
	const row = target.querySelector<HTMLElement>(`[data-site-module="${id}"]`);
	if (!row) throw new Error(`no hay fila del módulo «${id}»`);
	return row;
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

	test('D2: el plan de actualización separa lo que se crea, lo que se añade y las entradas del modelo de contenido, una a una', async () => {
		const port = await authedMemory();
		await seedLikePrevious1bda988(port);
		mounted = mountCard(port);
		await settle();
		// 1bda988 no tiene `redirects`: es «sin preparar» parcial; el plan sigue siendo de creación.
		await click(button(mounted.target, 'Preparar el sitio'));
		const open = dialog(mounted.target)!;
		expect(open.textContent).toContain('Se crea');
		expect(open.textContent).toContain('Se añade');
		expect(open.textContent).toContain('Publicar el');
		// El modelo de contenido ya no se sustituye: se le añaden entradas, y se nombran.
		expect(open.textContent).not.toMatch(/Se sustituye|Nadie lo había editado/);
		expect(groupTitles(open, 'Se añade al modelo de contenido')).toEqual([
			'Opción «publishAtField» de Páginas',
			'Opción «fieldGroups» de Páginas',
			'Campo «Publicar el» de Páginas',
			'Campo «Descripción» de Páginas',
			'Campo «Imagen para redes» de Páginas',
			'Campo «No indexar» de Páginas',
			'Colección «Redirecciones»'
		]);
		expect(open.textContent).toContain('collections.pages.fields.publishAt');
		expect(open.textContent).toContain(
			'Se añaden las entradas que faltan; lo que ya tiene no se toca.'
		);
		expect(open.textContent).toContain('márcala como oculta ("hidden": true) en vez de borrarla');
		expect(open.textContent).not.toContain('No se añade');
	});

	test('D2: una entrada borrada a propósito sale en la lista (va a volver), y lo que no se puede añadir, en «No se añade»', async () => {
		const port = await authedMemory();
		await seedLikePrevious0ace139(port);
		const record = (await port.list('vega', { perPage: 1 })).items[0]!;
		const edited = handEditedManifest() as {
			collections: { pages: { fieldGroups: unknown } };
			blockTypes: { hero: { fields: Array<{ name: string }> } };
		};
		edited.collections.pages.fieldGroups = ['Meta'];
		edited.blockTypes.hero.fields = edited.blockTypes.hero.fields.filter(
			(field) => field.name !== 'eyebrow'
		);
		await port.update('vega', record.id, { manifest: edited as unknown as JsonValue });
		mounted = mountCard(port);
		await settle();

		await click(button(mounted.target, 'Actualizar el sitio'));

		const open = dialog(mounted.target)!;
		// `collections.redirects` la borró quien editó el manifiesto: el plan dice que vuelve.
		expect(groupTitles(open, 'Se añade al modelo de contenido')).toEqual([
			'Opción «publishAtField» de Páginas',
			'Campo «Publicar el» de Páginas',
			'Colección «Redirecciones»'
		]);
		expect(groupTitles(open, 'No se añade')).toEqual([
			'Grupo de campos «SEO» de Páginas',
			'Campo «eyebrow» del bloque «hero»'
		]);
		expect(open.textContent).toContain('La colección ya tiene sus propios grupos de campos.');
		expect(open.textContent).toContain('El tipo de bloque ya existe y se conserva entero.');
		expect(open.textContent).toContain('blockTypes.hero.fields.eyebrow');

		await click(button(open, 'Actualizar el sitio'));
		await until(() => dialog(mounted!.target) === null);
		await settle();

		const section = mounted.target.querySelector('section')!;
		expect(section.dataset.siteState).toBe('current');
		expect(section.querySelector('[data-site-skipped]')!.textContent).toBe(
			'No se ha podido añadir al modelo de contenido: Grupo de campos «SEO» de Páginas y Campo «eyebrow» del bloque «hero». Lo que ya había se ha conservado tal cual.'
		);
		const saved = (await port.list('vega', { perPage: 1 })).items[0]!.values
			.manifest as typeof edited;
		expect(saved.collections.pages.fieldGroups).toEqual(['Meta']);
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
		expect(open.textContent).toContain('Se añade al modelo de contenido');
		expect(open.textContent).not.toContain('Se sustituye');
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

	describe('desajuste de reglas de una colección auth', () => {
		async function failWith(
			error: Error,
			translate: VegaAppContext['t'],
			open: string,
			go: string
		) {
			const port = await authedMemory();
			vi.spyOn(port, 'ensureCollections').mockRejectedValueOnce(error);
			mounted = mountCard(port, vi.fn(), translate);
			await settle();
			await click(button(mounted.target, open));
			await click(button(dialog(mounted.target)!, go));
			return dialog(mounted.target)!.querySelector('pre')!.textContent ?? '';
		}

		const mismatch = (expectsOnlySuperusers: boolean) =>
			VegaError.validation(
				{
					vega_editors: {
						code: 'vega_collection_rules_mismatch',
						message: 'TEXTO DE RESPALDO',
						params: {
							collection: 'vega_editors',
							rules: ['listRule', 'deleteRule'],
							expectsOnlySuperusers
						}
					}
				},
				'TEXTO DE RESPALDO'
			);

		test('en castellano muestra el texto en castellano con los nombres de las reglas', async () => {
			const text = await failWith(mismatch(true), es, 'Preparar el sitio', 'Preparar el sitio');
			expect(text).toContain(
				'La colección "vega_editors" ya existe con reglas de acceso distintas'
			);
			expect(text).toContain('listRule, deleteRule');
			expect(text).toContain('déjalas sin regla (null: solo superusuarios)');
			expect(text).not.toContain('TEXTO DE RESPALDO');
		});

		test('en inglés muestra el texto en inglés, también la variante de reglas declaradas', async () => {
			await ensureLocaleLoaded('en');
			const en = (key: string, params?: Record<string, string | number>) => t('en', key, params);
			const text = await failWith(mismatch(false), en, 'Set up the site', 'Set up the site');
			expect(text).toContain('The "vega_editors" collection already exists');
			expect(text).toContain('listRule, deleteRule');
			expect(text).toContain('set them as Vega declares them');
			expect(text).not.toContain('TEXTO DE RESPALDO');
			expect(text).not.toContain('La colección');
		});

		test('sin params sigue mostrando err.message', async () => {
			const bare = VegaError.validation(
				{ vega_editors: { code: 'vega_collection_rules_mismatch', message: 'TEXTO DE RESPALDO' } },
				'TEXTO DE RESPALDO'
			);
			const text = await failWith(bare, es, 'Preparar el sitio', 'Preparar el sitio');
			expect(text).toBe('TEXTO DE RESPALDO');
		});
	});

	describe('módulos', () => {
		async function seededPort(): Promise<MemoryBackendPort> {
			const port = await authedMemory();
			await seedSiteProject(port);
			return port;
		}

		function writes(port: MemoryBackendPort) {
			return [
				vi.spyOn(port, 'ensureCollections'),
				vi.spyOn(port, 'addCollectionFields'),
				vi.spyOn(port, 'create'),
				vi.spyOn(port, 'update')
			];
		}

		test('M1 no añadido: cada módulo con su estado, su descripción y un «Añadir» que no es la acción principal', async () => {
			mounted = mountCard(await seededPort());
			await settle();

			const section = mounted.target.querySelector('section')!;
			expect(section.dataset.siteState).toBe('current');
			expect(section.textContent).toContain('Módulos');
			const blog = moduleRow(mounted.target, 'blog');
			const contact = moduleRow(mounted.target, 'contacto');
			expect(blog.dataset.moduleState).toBe('absent');
			expect(blog.querySelector('b')!.textContent).toBe('Blog');
			expect(blog.textContent).toContain('No añadido');
			expect(blog.textContent).toContain('Entradas con etiquetas, portada, fecha y SEO.');
			expect(blog.querySelector('[data-module-note]')).toBeNull();
			expect(contact.dataset.moduleState).toBe('absent');
			expect(contact.querySelector('b')!.textContent).toBe('Formulario de contacto');
			// El aviso por correo no se puede comprobar desde aquí: línea fija que remite a la doc.
			expect(contact.querySelector('[data-module-note]')!.textContent).toContain(
				'El aviso por correo de cada mensaje se configura en el servidor'
			);
			for (const row of [blog, contact]) {
				const add = button(row, 'Añadir');
				expect(add.className).not.toContain('vega-admin-btn--primary');
				expect(add.getAttribute('aria-label')).toContain(row.querySelector('b')!.textContent);
			}
			expect(section.textContent).not.toMatch(/sembrado/i);
		});

		test('M2 vista previa: «Añadir» repite el preflight y enseña, sin escribir, qué colecciones se crean y qué entradas se añaden', async () => {
			const port = await seededPort();
			mounted = mountCard(port);
			await settle();
			const read = vi.spyOn(port, 'listContentTypes');
			const written = writes(port);

			await click(button(moduleRow(mounted.target, 'blog'), 'Añadir'));

			expect(read).toHaveBeenCalled();
			const open = dialog(mounted.target)!;
			expect(open.querySelector('h2')!.textContent).toBe('Añadir: Blog');
			expect(open.textContent).toContain(
				'No se borra ni se cambia ningún campo, regla, registro o entrada que ya exista'
			);
			expect(open.textContent).not.toContain('Nada de lo que ya existe se modifica');
			expect(groupTitles(open, 'Se crea')).toEqual(['Etiquetas', 'Entradas']);
			expect(open.textContent).toContain('tags');
			expect(open.textContent).toContain('posts');
			expect(groupTitles(open, 'Se añade al modelo de contenido')).toEqual([
				'Colección «Entradas»',
				'Colección «Etiquetas»'
			]);
			expect(open.textContent).toContain('collections.posts');
			// Nada de la base: ni «Editores», ni «Inicio», ni «ya está al día».
			expect(open.textContent).not.toMatch(/vega_editors|Inicio|al día/);
			expect(open.textContent!.match(/no se deshace/gi)).toHaveLength(1);
			expect(document.activeElement).toBe(button(open, 'Cancelar'));

			await click(button(open, 'Cancelar'));

			expect(dialog(mounted.target)).toBeNull();
			for (const spy of written) expect(spy).not.toHaveBeenCalled();
			expect(moduleRow(mounted.target, 'blog').dataset.moduleState).toBe('absent');
		});

		test('M3 añadiendo y añadido: en curso no se puede cerrar; al terminar la fila dice «Añadido», sin botón, y el otro módulo sigue igual', async () => {
			const port = await seededPort();
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const ensure = port.ensureCollections.bind(port);
			const seed = vi.spyOn(port, 'ensureCollections').mockImplementation(async (specs) => {
				await gate;
				return ensure(specs);
			});
			const onChanged = vi.fn();
			mounted = mountCard(port, onChanged);
			await settle();
			await click(button(moduleRow(mounted.target, 'blog'), 'Añadir'));
			const open = dialog(mounted.target)!;

			await click(button(open, 'Añadir'));

			expect(open.textContent).toContain('Añadiendo… 0:00');
			expect(button(open, 'Añadiendo…').getAttribute('aria-disabled')).toBe('true');
			expect(button(open, 'Cancelar').getAttribute('aria-disabled')).toBe('true');
			await click(button(open, 'Cancelar'));
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await settle();
			expect(dialog(mounted.target)).not.toBeNull();

			release();
			await until(() => dialog(mounted!.target) === null);
			await settle();

			// Solo se pidió el módulo: sus dos colecciones, y ninguna del otro.
			expect(seed.mock.calls.flatMap(([specs]) => specs.map((spec) => spec.name))).toEqual(
				expect.arrayContaining(['tags', 'posts'])
			);
			const names = (await port.listContentTypes()).map((type) => type.name);
			expect(names).toEqual(expect.arrayContaining(['tags', 'posts']));
			expect(names).not.toContain('messages');
			const blog = moduleRow(mounted.target, 'blog');
			expect(blog.dataset.moduleState).toBe('added');
			expect(blog.querySelector('.vega-admin-tag')!.textContent!.trim()).toBe('Añadido');
			expect(blog.querySelector('button')).toBeNull();
			const contact = moduleRow(mounted.target, 'contacto');
			expect(contact.dataset.moduleState).toBe('absent');
			expect(button(contact, 'Añadir')).toBeDefined();
			const section = mounted.target.querySelector('section')!;
			expect(section.dataset.siteState).toBe('current');
			expect(section.textContent).toContain(
				'Hecho: 2 colecciones y las entradas nuevas del modelo de contenido.'
			);
			// El «siguiente paso» (dar acceso a editores) es de preparar el sitio, no de un módulo.
			expect(section.querySelector('a')).toBeNull();
			expect(mounted.feedback.toast).toHaveBeenCalledWith('Añadido: Blog.', { kind: 'success' });
			expect(onChanged).toHaveBeenCalled();
		});

		test('M4 añadido de antes: al montar, el módulo que ya tiene sus colecciones sale «Añadido»', async () => {
			const port = await authedMemory();
			await seedSiteProject(port, { modules: [SITE_SEED_CONTACT_MODULE] });
			mounted = mountCard(port);
			await settle();

			expect(mounted.target.querySelector('section')!.dataset.siteState).toBe('current');
			const contact = moduleRow(mounted.target, 'contacto');
			expect(contact.dataset.moduleState).toBe('added');
			expect(contact.querySelector('button')).toBeNull();
			// La nota del aviso por correo sigue ahí: es justo cuando hace falta.
			expect(contact.querySelector('[data-module-note]')).not.toBeNull();
			expect(moduleRow(mounted.target, 'blog').dataset.moduleState).toBe('absent');
		});

		test('M5 incompleto: con sus colecciones pero sin una entrada del modelo de contenido, «Añadir» pone solo lo que falta', async () => {
			const port = await authedMemory();
			await seedSiteProject(port, { modules: [SITE_SEED_BLOG_MODULE] });
			const record = (await port.list('vega', { perPage: 1 })).items[0]!;
			const edited = structuredClone(record.values.manifest) as {
				collections: Record<string, unknown>;
			};
			delete edited.collections.tags;
			await port.update('vega', record.id, { manifest: edited as unknown as JsonValue });
			mounted = mountCard(port);
			await settle();

			const blog = moduleRow(mounted.target, 'blog');
			expect(blog.dataset.moduleState).toBe('incomplete');
			expect(blog.querySelector('.vega-admin-tag')!.textContent!.trim()).toBe('Incompleto');

			await click(button(blog, 'Añadir'));

			const open = dialog(mounted.target)!;
			expect(open.textContent).not.toContain('Se crea');
			expect(groupTitles(open, 'Se añade al modelo de contenido')).toEqual([
				'Colección «Etiquetas»'
			]);
		});

		describe('reglas de acceso distintas en una colección que ya existe', () => {
			/** Una `messages` anterior al módulo, con la bandeja abierta sin sesión. */
			async function portWithOpenMessages(): Promise<MemoryBackendPort> {
				const port = await seededPort();
				await port.ensureCollections([
					{
						name: 'messages',
						listRule: '',
						viewRule: null,
						createRule: '',
						updateRule: null,
						deleteRule: null,
						fields: [
							{ name: 'name', type: 'text', required: true, max: 200 },
							{ name: 'email', type: 'email', required: true },
							{ name: 'message', type: 'text', required: true, max: 5000 }
						]
					}
				]);
				return port;
			}

			const confirmBox = (scope: HTMLElement) =>
				scope.querySelector<HTMLInputElement>('[data-rules-confirm] input')!;

			test('R1 la fila lo avisa y el plan nombra colección, regla, valor actual y esperado', async () => {
				mounted = mountCard(await portWithOpenMessages());
				await settle();

				const row = moduleRow(mounted.target, 'contacto');
				expect(row.dataset.moduleState).toBe('incomplete');
				expect(row.textContent).toContain('reglas de acceso distintas');

				await click(button(row, 'Añadir'));

				const open = dialog(mounted.target)!;
				expect(groupTitles(open, 'Reglas de acceso distintas')).toEqual([
					'Mensajes · listado',
					'Mensajes · ver un registro',
					'Mensajes · crear',
					'Mensajes · editar',
					'Mensajes · borrar'
				]);
				expect(open.textContent).toContain('Ahora: "" (abierta a todo el mundo)');
				expect(open.textContent).toContain('Ahora: sin regla (solo superusuarios)');
				expect(open.textContent).toContain('@request.auth.collectionName = "vega_editors"');
				expect(open.textContent).toContain('Vega no las cambia');
			});

			test('R2 sin marcar la casilla «Añadir» no hace nada; marcada, añade el módulo y no toca las reglas', async () => {
				const port = await portWithOpenMessages();
				mounted = mountCard(port);
				await settle();
				await click(button(moduleRow(mounted.target, 'contacto'), 'Añadir'));
				const open = dialog(mounted.target)!;
				const written = writes(port);

				const go = button(open, 'Añadir');
				expect(go.getAttribute('aria-disabled')).toBe('true');
				await click(go);
				// Sigue el diálogo del plan y no se escribió nada.
				expect(dialog(mounted.target)).not.toBeNull();
				for (const spy of written) expect(spy).not.toHaveBeenCalled();

				await click(confirmBox(open));
				expect(button(open, 'Añadir').getAttribute('aria-disabled')).toBe('false');
				await click(button(open, 'Añadir'));
				await until(() => dialog(mounted!.target) === null);

				expect(dialog(mounted.target)).toBeNull();
				expect(port.inspectCollection('messages')?.rules).toMatchObject({
					listRule: '',
					createRule: ''
				});
				expect(
					(await port.listContentTypes())
						.find((type) => type.name === 'messages')!
						.fields.map((field) => field.name)
				).toContain('notifyState');
				expect(moduleRow(mounted.target, 'contacto').dataset.moduleState).toBe('added');
			});

			test('R3 un módulo sin diferencias no enseña grupo ni casilla', async () => {
				mounted = mountCard(await seededPort());
				await settle();
				await click(button(moduleRow(mounted.target, 'contacto'), 'Añadir'));

				const open = dialog(mounted.target)!;
				expect(open.textContent).not.toContain('Reglas de acceso distintas');
				expect(open.querySelector('[data-rules-confirm]')).toBeNull();
				expect(button(open, 'Añadir').getAttribute('aria-disabled')).toBe('false');
			});
		});

		test('M6 vista previa bloqueada: una `posts` propia con otra forma bloquea SOLO el blog, y «Ver por qué» enseña la divergencia sin escribir', async () => {
			const port = await seededPort();
			await port.ensureCollections([
				{ name: 'posts', fields: [{ name: 'title', type: 'number' }] }
			]);
			const written = writes(port);
			mounted = mountCard(port);
			await settle();

			// La base no se entera: el sitio sigue al día.
			expect(mounted.target.querySelector('section')!.dataset.siteState).toBe('current');
			const blog = moduleRow(mounted.target, 'blog');
			expect(blog.dataset.moduleState).toBe('blocked');
			expect(blog.textContent).toContain('No se puede añadir tal como está');
			expect(
				Array.from(blog.querySelectorAll('button')).map((item) => item.textContent?.trim())
			).toEqual(['Ver por qué']);
			// El otro módulo no paga por la divergencia del blog.
			const contact = moduleRow(mounted.target, 'contacto');
			expect(contact.dataset.moduleState).toBe('absent');
			expect(button(contact, 'Añadir')).toBeDefined();

			await click(button(blog, 'Ver por qué'));

			const open = dialog(mounted.target)!;
			expect(open.querySelector('h2')!.textContent).toBe('No se puede añadir: Blog');
			expect(open.textContent).toContain('No se ha escrito nada');
			expect(open.textContent).toContain('El campo «title» de Entradas');
			expect(open.querySelector('pre')!.textContent).toContain('campo "posts.title"');
			expect(document.activeElement).toBe(button(open, 'Cerrar'));
			await click(button(open, 'Cerrar'));
			expect(dialog(mounted.target)).toBeNull();
			for (const spy of written) expect(spy).not.toHaveBeenCalled();
		});

		test('M7 error al añadir: la salida del servidor, y «Reintentar» vuelve al plan de ESE módulo', async () => {
			const port = await seededPort();
			const ensure = port.ensureCollections.bind(port);
			const onChanged = vi.fn();
			mounted = mountCard(port, onChanged);
			await settle();
			await click(button(moduleRow(mounted.target, 'contacto'), 'Añadir'));
			vi.spyOn(port, 'ensureCollections').mockRejectedValueOnce(
				new Error('Failed to create collection "messages": boom')
			);

			await click(button(dialog(mounted.target)!, 'Añadir'));

			const open = dialog(mounted.target)!;
			expect(open.querySelector('h2')!.textContent).toBe('Añadir: Formulario de contacto');
			expect(open.textContent).toContain('No se pudo terminar');
			expect(open.querySelector('pre')!.textContent).toContain(
				'Failed to create collection "messages"'
			);
			expect(document.activeElement).toBe(button(open, 'Reintentar'));
			expect(onChanged).toHaveBeenCalled();
			expect(mounted.feedback.toast).not.toHaveBeenCalled();

			vi.mocked(port.ensureCollections).mockImplementation(ensure);
			await click(button(open, 'Reintentar'));

			const again = dialog(mounted.target)!;
			expect(again.querySelector('h2')!.textContent).toBe('Añadir: Formulario de contacto');
			expect(groupTitles(again, 'Se crea')).toEqual(['Mensajes']);
			await click(button(again, 'Añadir'));
			await until(() => dialog(mounted!.target) === null);
			await settle();
			expect(moduleRow(mounted.target, 'contacto').dataset.moduleState).toBe('added');
		});

		test('M8 la base va primero: sin preparar o con una actualización pendiente no hay «Añadir», y se dice por qué', async () => {
			mounted = mountCard(await authedMemory());
			await settle();

			const unprepared = moduleRow(mounted.target, 'blog');
			expect(unprepared.dataset.moduleState).toBe('absent');
			expect(unprepared.querySelector('button')).toBeNull();
			expect(unprepared.querySelector('[data-module-gate]')!.textContent).toContain(
				'Antes hay que preparar el sitio.'
			);
			await unmount(mounted.instance);
			mounted.target.remove();

			const port = await authedMemory();
			await seedLikePrevious0ace139(port);
			mounted = mountCard(port);
			await settle();

			expect(mounted.target.querySelector('section')!.dataset.siteState).toBe('update');
			const pending = moduleRow(mounted.target, 'contacto');
			expect(pending.querySelector('button')).toBeNull();
			expect(pending.querySelector('[data-module-gate]')!.textContent).toContain(
				'Antes hay que actualizar el sitio.'
			);
		});

		test('mientras comprueba y si la comprobación falla no hay lista de módulos', async () => {
			const port = await authedMemory();
			vi.spyOn(port, 'listContentTypes').mockRejectedValueOnce(VegaError.backend('boom'));
			mounted = mountCard(port);
			await settle();

			expect(mounted.target.querySelector('section')!.dataset.siteState).toBe('error');
			expect(mounted.target.querySelector('[data-site-module]')).toBeNull();
		});
	});
});
