import { describe, expect, test } from 'vitest';
import { SITE_SEED_OPTIONAL_MODULES } from '$lib/backend/site-seeding-modules';
import { ensureLocaleLoaded, t as translate } from '$lib/i18n';
import {
	buildPlanView,
	describeDivergence,
	divergencesText,
	invitationLinkNote,
	joinList,
	moduleDescription,
	moduleName,
	moduleNote,
	onlyModuleWrites,
	SITE_BASE_MODULES,
	siteBaseKind,
	siteModuleState,
	skippedNote,
	summarizeResult
} from './site-base';

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

describe('site-base', () => {
	test('joinList une con coma y «y»', () => {
		expect(joinList(t, [])).toBe('');
		expect(joinList(t, ['A'])).toBe('A');
		expect(joinList(t, ['A', 'B'])).toBe('A y B');
		expect(joinList(t, ['A', 'B', 'C'])).toBe('A, B y C');
	});

	test('describeDivergence deduce la frase en llano y conserva el literal', () => {
		const field = describeDivergence(
			{ piece: 'campo "pages.status"', expected: '{a}', actual: '{b}' },
			t
		);
		expect(field.title).toBe('El campo «status» de Páginas');
		expect(field.detail).toBe('campo "pages.status": encontró {b}; esperaba {a}');

		const edited = describeDivergence(
			{
				piece: 'registro "vega/default"',
				expected: 'manifiesto inicial exacto',
				actual: 'manifiesto distinto ({})'
			},
			t
		);
		expect(edited.body).toContain('Se ha editado a mano');

		const worded = describeDivergence(
			{
				piece: 'registro "vega/default"',
				expected: 'manifiesto inicial exacto (actual o de una versión anterior del sembrado)',
				actual: 'manifiesto distinto ({})'
			},
			t
		);
		expect(worded.detail).not.toMatch(/sembrado/i);

		const unknown = describeDivergence({ piece: 'algo raro', expected: 'x', actual: 'y' }, t);
		expect(unknown.title).toBe('algo raro');
	});

	test('divergencesText junta los literales, uno por línea', () => {
		expect(
			divergencesText([
				{ piece: 'a', expected: '1', actual: '2' },
				{ piece: 'b', expected: '3', actual: '4' }
			])
		).toBe('a: encontró 2; esperaba 1\nb: encontró 4; esperaba 3');
	});

	test('el plan lista las constricciones de redirects y las cuenta como «Se añade»', () => {
		const view = buildPlanView(
			{
				createdCollections: [],
				addedFields: {},
				constrainedFields: { redirects: ['from', 'to'] },
				manifest: 'keep',
				pageMissing: false,
				upToDate: false
			},
			t
		);
		const add = view.groups.find((group) => group.id === 'add')!;
		expect(add.items.map((item) => item.title)).toContain('Formato de las rutas en Redirecciones');
		expect(add.items.find((item) => item.code === 'from, to')).toBeDefined();
	});

	test('el plan de la base nombra una a una las entradas que se añaden al modelo de contenido y dice cómo evitar que una vuelva', () => {
		const plan = {
			createdCollections: [],
			addedFields: {},
			manifest: 'upgrade' as const,
			pageMissing: false,
			upToDate: false
		};
		const view = buildPlanView(plan, t, {
			modules: [
				{
					id: 'base',
					createdCollections: [],
					addedFields: {},
					manifestEntries: [
						'collections.redirects',
						'collections.pages.fields.publishAt',
						'collections.pages.publishAtField',
						'blockTypes.hero',
						'nav.groups.Mi. grupo',
						'nav',
						'site'
					],
					manifestSkipped: []
				}
			]
		});

		expect(view.groups.map((group) => group.id)).toEqual(['add', 'manifest']);
		const manifest = view.groups.find((group) => group.id === 'manifest')!;
		expect(manifest.heading).toBe('Se añade al modelo de contenido');
		expect(manifest.items.map((item) => [item.title, item.code])).toEqual([
			['Colección «Redirecciones»', 'collections.redirects'],
			['Campo «Publicar el» de Páginas', 'collections.pages.fields.publishAt'],
			['Opción «publishAtField» de Páginas', 'collections.pages.publishAtField'],
			['Tipo de bloque «hero»', 'blockTypes.hero'],
			// El nombre de un grupo puede llevar puntos: es todo lo que sigue a `nav.groups.`.
			['Grupo «Mi. grupo» del menú', 'nav.groups.Mi. grupo'],
			['El menú', 'nav'],
			['«site»', 'site']
		]);
		expect(manifest.note).toBe(
			'Se añaden las entradas que faltan; lo que ya tiene no se toca. Una entrada borrada vuelve en cada actualización. Para que no aparezca, márcala como oculta ("hidden": true) en vez de borrarla.'
		);
		// El texto viejo («Se sustituye… Nadie lo había editado») ya no sale en ningún grupo.
		expect(JSON.stringify(view)).not.toMatch(/sustituye|Nadie lo había editado/);
	});

	test('un modelo de contenido que se CREA no se lista entrada a entrada', () => {
		const view = buildPlanView(
			{
				createdCollections: ['vega'],
				addedFields: {},
				manifest: 'create',
				pageMissing: false,
				upToDate: false
			},
			t,
			{
				modules: [
					{
						id: 'base',
						createdCollections: ['vega'],
						addedFields: {},
						manifestEntries: ['schemaVersion', 'site', 'collections.pages'],
						manifestSkipped: []
					}
				]
			}
		);

		expect(view.groups.map((group) => group.id)).toEqual(['create']);
	});

	test('lo que no se ha podido añadir va en su grupo, con el motivo de cada pieza', () => {
		const view = buildPlanView(
			{
				createdCollections: [],
				addedFields: {},
				manifest: 'keep',
				pageMissing: false,
				upToDate: false
			},
			t,
			{
				modules: [
					{
						id: 'base',
						createdCollections: [],
						addedFields: {},
						manifestEntries: [],
						manifestSkipped: [
							{ kind: 'navGroup', path: 'nav.groups.Sitio', owner: null, name: 'Sitio' },
							{
								kind: 'fieldGroup',
								path: 'collections.pages.fieldGroups.SEO',
								owner: 'pages',
								name: 'SEO'
							},
							{
								kind: 'blockTypeField',
								path: 'blockTypes.hero.fields.eyebrow',
								owner: 'hero',
								name: 'eyebrow'
							}
						]
					}
				]
			}
		);

		const skipped = view.groups.find((group) => group.id === 'skipped')!;
		expect(skipped.heading).toBe('No se añade');
		expect(skipped.items).toEqual([
			{
				title: 'Grupo «Sitio» del menú',
				text: 'El menú guardado tiene una forma que Vega no sabe completar.',
				code: 'nav.groups.Sitio'
			},
			{
				title: 'Grupo de campos «SEO» de Páginas',
				text: 'La colección ya tiene sus propios grupos de campos.',
				code: 'collections.pages.fieldGroups.SEO'
			},
			{
				title: 'Campo «eyebrow» del bloque «hero»',
				text: 'El tipo de bloque ya existe y se conserva entero.',
				code: 'blockTypes.hero.fields.eyebrow'
			}
		]);
		expect(skipped.note).toContain('añádelo a mano en «Modelo de contenido»');
		expect(
			skippedNote(
				{
					createdCollections: [],
					addedFields: {},
					createdRecords: [],
					upgradedRecords: [],
					manifestSkipped: {
						base: [{ kind: 'navGroup', path: 'nav.groups.Sitio', owner: null, name: 'Sitio' }]
					}
				},
				t
			)
		).toBe(
			'No se ha podido añadir al modelo de contenido: Grupo «Sitio» del menú. Lo que ya había se ha conservado tal cual.'
		);
		expect(
			skippedNote(
				{ createdCollections: [], addedFields: {}, createdRecords: [], upgradedRecords: [] },
				t
			)
		).toBeNull();
	});

	describe('módulos', () => {
		const empty = {
			createdCollections: [],
			addedFields: {},
			manifestEntries: [],
			manifestSkipped: []
		};
		const plan = {
			createdCollections: ['tags', 'posts'],
			addedFields: {},
			manifest: 'upgrade' as const,
			pageMissing: false,
			upToDate: false
		};
		const blog = SITE_BASE_MODULES.find((module) => module.id === 'blog')!;

		test('la tarjeta ofrece los opcionales del registro, y cada uno tiene nombre, descripción y los textos de sus colecciones en los dos idiomas', async () => {
			await ensureLocaleLoaded('en');
			expect(SITE_BASE_MODULES).toBe(SITE_SEED_OPTIONAL_MODULES);
			expect(SITE_BASE_MODULES.map((module) => module.id)).toEqual(['blog', 'contacto']);
			for (const locale of ['es', 'en'] as const) {
				const tr = (key: string) => translate(locale, key);
				for (const module of SITE_BASE_MODULES) {
					const keys = [
						`settings.site.module.${module.id}.name`,
						`settings.site.module.${module.id}.desc`,
						...module.collections.flatMap((spec) => [
							`settings.site.collection.${spec.name}`,
							`settings.site.create.${spec.name}`
						])
					];
					// Una clave que falta se devuelve tal cual: sería lo que vería quien administra.
					for (const key of keys) expect(tr(key), `${locale}: ${key}`).not.toBe(key);
				}
			}
			expect(moduleName(t, 'blog')).toBe('Blog');
			expect(moduleName(t, 'contacto')).toBe('Formulario de contacto');
			expect(moduleDescription(t, 'blog')).toContain('Entradas');
			// Solo el de contacto lleva la línea de «se configura en el servidor».
			expect(moduleNote(t, 'blog')).toBeNull();
			expect(moduleNote(t, 'contacto')).toContain('se configura en el servidor');
		});

		test('siteModuleState: ninguna colección = no añadido; algo pendiente = incompleto; nada = añadido', () => {
			expect(
				siteModuleState(blog, { ...empty, id: 'blog', createdCollections: ['tags', 'posts'] })
			).toBe('absent');
			expect(siteModuleState(blog, { ...empty, id: 'blog', createdCollections: ['posts'] })).toBe(
				'incomplete'
			);
			expect(
				siteModuleState(blog, { ...empty, id: 'blog', addedFields: { posts: ['date'] } })
			).toBe('incomplete');
			expect(
				siteModuleState(blog, { ...empty, id: 'blog', manifestEntries: ['collections.tags'] })
			).toBe('incomplete');
			expect(siteModuleState(blog, { ...empty, id: 'blog' })).toBe('added');
			// Lo que no se puede añadir no cuenta como pendiente: no hay nada que «Añadir» pueda hacer.
			expect(
				siteModuleState(blog, {
					...empty,
					id: 'blog',
					manifestSkipped: [
						{ kind: 'navGroup', path: 'nav.groups.Sitio', owner: null, name: 'Sitio' }
					]
				})
			).toBe('added');
		});

		test('onlyModuleWrites: con algo de la base pendiente, añadir un módulo escribiría más de lo que enseña', () => {
			const base = { ...empty, id: 'base' };
			expect(onlyModuleWrites(plan, base)).toBe(true);
			expect(onlyModuleWrites(plan, { ...base, manifestEntries: ['nav.groups.Sitio'] })).toBe(
				false
			);
			expect(onlyModuleWrites(plan, { ...base, addedFields: { pages: ['publishAt'] } })).toBe(
				false
			);
			expect(onlyModuleWrites(plan, { ...base, createdCollections: ['redirects'] })).toBe(false);
			expect(onlyModuleWrites({ ...plan, pageMissing: true }, base)).toBe(false);
			expect(onlyModuleWrites({ ...plan, constrainedFields: { redirects: ['from'] } }, base)).toBe(
				false
			);
		});

		test('el plan de un módulo enseña solo lo suyo: colecciones que se crean y entradas que se añaden', () => {
			const view = buildPlanView(plan, t, {
				target: 'blog',
				modules: [
					{ ...empty, id: 'base' },
					{
						...empty,
						id: 'blog',
						createdCollections: ['tags', 'posts'],
						manifestEntries: ['collections.posts', 'collections.tags']
					}
				]
			});

			expect(view.rest).toBeNull();
			expect(view.groups.map((group) => group.id)).toEqual(['create', 'manifest']);
			expect(view.groups[0]!.items).toEqual([
				{
					title: 'Etiquetas',
					code: 'tags',
					codeFirst: true,
					text: 'el nombre y la dirección de cada etiqueta'
				},
				{
					title: 'Entradas',
					code: 'posts',
					codeFirst: true,
					text: 'título, dirección, resumen, contenido, portada, estado, fechas, etiquetas y SEO'
				}
			]);
			expect(view.groups[1]!.items.map((item) => item.title)).toEqual([
				'Colección «Entradas»',
				'Colección «Etiquetas»'
			]);
			// Ni «Editores», ni la página «Inicio», ni «ya está al día»: eso es de la base.
			expect(JSON.stringify(view)).not.toMatch(/vega_editors|Inicio|al día/);
		});
	});

	test('siteBaseKind: aborto, sin preparar, actualización y al día', () => {
		const base = {
			addedFields: {},
			manifest: 'keep' as const,
			pageMissing: false
		};
		expect(siteBaseKind({ status: 'blocked', divergences: [] })).toBe('blocked');
		expect(
			siteBaseKind({
				status: 'ready',
				plan: { ...base, createdCollections: ['pages'], upToDate: false }
			})
		).toBe('unprepared');
		expect(
			siteBaseKind({
				status: 'ready',
				plan: { ...base, createdCollections: [], manifest: 'upgrade', upToDate: false }
			})
		).toBe('update');
		expect(
			siteBaseKind({ status: 'ready', plan: { ...base, createdCollections: [], upToDate: true } })
		).toBe('current');
	});

	test('el resumen cuenta el resultado y el enlace ajeno es una nota, no un error', () => {
		const result = {
			createdCollections: ['pages'],
			addedFields: { vega_media: ['focal'] },
			createdRecords: ['manifest' as const, 'page:/' as const],
			upgradedRecords: [],
			invitationLink: 'foreign-origin' as const
		};
		expect(summarizeResult(result, t)).toBe(
			'Hecho: 1 colección, los campos nuevos de Medios, el modelo de contenido y la página «Inicio», que queda en borrador.'
		);
		expect(invitationLinkNote(result, t)).toContain('sigue llevando al panel de PocketBase');
		expect(invitationLinkNote({ ...result, invitationLink: 'updated' }, t)).toBeNull();
		expect(
			summarizeResult(
				{ createdCollections: [], addedFields: {}, createdRecords: [], upgradedRecords: [] },
				t
			)
		).toContain('Todo estaba ya en su sitio');
	});
});
