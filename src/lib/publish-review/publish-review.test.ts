import { beforeAll, describe, expect, test } from 'vitest';
import type { ContentType, Field, JsonValue, VegaRecord } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import type { ContentModel, ResolvedContentType } from '$lib/model/types';
import { toMediaItemView, type MediaItemView } from '$lib/media/media-item';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import {
	CHECK_SEVERITY,
	collectMediaIds,
	DESCRIPTION_LONG_AT,
	reviewRecord,
	type ReviewCheckId,
	type ReviewInput,
	type ReviewPage,
	type ReviewRedirect
} from './publish-review';
import { seededWorld, type ReviewWorld } from './review-world.fixture';

let world: ReviewWorld;
beforeAll(async () => {
	world = await seededWorld();
});

// ————— Utilidades —————

const rec = (type: string, id: string, values: VegaRecord['values']): VegaRecord => ({
	id,
	type,
	values
});

/** Una página del sembrado, con SEO completo salvo lo que se diga. */
function page(over: VegaRecord['values'] = {}): VegaRecord {
	return rec('pages', 'p1', {
		title: 'Inicio',
		path: '/inicio',
		status: 'published',
		description: 'Una descripción razonable.',
		socialImage: 'm-og',
		noindex: false,
		...over
	});
}

function block(
	position: number,
	type: string,
	data: Record<string, JsonValue>,
	columns: VegaRecord['values'] = {}
): VegaRecord {
	return rec('blocks', `b${position}`, { parent: 'p1', order: position, type, data, ...columns });
}

const sitePages: ReviewPage[] = [
	{ type: 'pages', id: 'p1', path: '/inicio', published: true },
	{ type: 'pages', id: 'p2', path: '/sobre-mi', published: true },
	{ type: 'pages', id: 'p3', path: '/pronto', published: false }
];

function mediaMap(...entries: Array<[string, string, string]>): ReadonlyMap<string, MediaItemView> {
	return new Map(
		entries.map(([id, file, alt]) => [
			id,
			toMediaItemView(rec('vega_media', id, { file, alt, title: '', tags: null }))
		])
	);
}

function input(over: Partial<ReviewInput> = {}): ReviewInput {
	return {
		type: world.pagesType,
		record: page(),
		model: world.model,
		blocks: [],
		pages: sitePages,
		redirects: [],
		media: new Map(),
		...over
	};
}

function checks(result: { findings: Array<{ check: ReviewCheckId }> }): ReviewCheckId[] {
	return result.findings.map((finding) => finding.check);
}

// ————— SEO —————

describe('SEO de una página del sembrado', () => {
	test('una página en regla no tiene hallazgos ni comprobaciones omitidas', () => {
		expect(reviewRecord(input())).toEqual({ findings: [], skipped: [] });
	});

	test.each(['', '   ', null])('descripción vacía (%j) avisa y apunta al campo', (value) => {
		const { findings } = reviewRecord(input({ record: page({ description: value }) }));
		expect(findings).toEqual([
			{
				id: 'seo.description-empty:f.description:1',
				check: 'seo.description-empty',
				severity: 'warning',
				target: { kind: 'field', field: 'description', label: 'Descripción' },
				messageKey: 'review.seo.descriptionEmpty',
				params: {}
			}
		]);
	});

	test('el umbral es exclusivo: 160 no avisa, 161 sí, con su longitud y su máximo', () => {
		expect(DESCRIPTION_LONG_AT).toBe(160);
		const ok = reviewRecord(input({ record: page({ description: 'a'.repeat(160) }) }));
		expect(ok.findings).toEqual([]);
		const long = reviewRecord(input({ record: page({ description: 'a'.repeat(161) }) }));
		expect(long.findings).toHaveLength(1);
		expect(long.findings[0]).toMatchObject({
			check: 'seo.description-long',
			messageKey: 'review.seo.descriptionLong',
			params: { length: 161, max: 160 }
		});
	});

	test('una descripción en texto enriquecido cuenta sin etiquetas', () => {
		const html = `<p>${'a'.repeat(160)}</p>`;
		expect(reviewRecord(input({ record: page({ description: html }) })).findings).toEqual([]);
		const long = reviewRecord(
			input({ record: page({ description: `<p><b>${'a'.repeat(161)}</b></p>` }) })
		);
		expect(long.findings[0]).toMatchObject({
			check: 'seo.description-long',
			params: { length: 161 }
		});
	});

	test.each(['<p></p>', '<p> </p>', '<p><br></p>'])(
		'una descripción que solo tiene etiquetas (%s) cuenta como vacía',
		(value) => {
			expect(checks(reviewRecord(input({ record: page({ description: value }) })))).toEqual([
				'seo.description-empty'
			]);
		}
	);

	test('los espacios de los extremos no cuentan para la longitud', () => {
		const padded = ` ${'a'.repeat(160)} `;
		expect(reviewRecord(input({ record: page({ description: padded }) })).findings).toEqual([]);
	});

	test('el umbral se puede sobreescribir', () => {
		const result = reviewRecord(
			input({
				record: page({ description: 'a'.repeat(50) }),
				options: { descriptionLongAt: 40 }
			})
		);
		expect(result.findings[0]).toMatchObject({
			check: 'seo.description-long',
			params: { max: 40 }
		});
	});

	test.each(['', null])('sin imagen social (%j) avisa', (value) => {
		const { findings } = reviewRecord(input({ record: page({ socialImage: value }) }));
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			check: 'seo.social-image-missing',
			target: { kind: 'field', field: 'socialImage', label: 'Imagen para redes' },
			messageKey: 'review.seo.socialImageMissing'
		});
	});

	test('`noindex` marcado avisa; sin marcar no', () => {
		const on = reviewRecord(input({ record: page({ noindex: true }) }));
		expect(checks(on)).toEqual(['seo.noindex']);
		expect(on.findings[0].target).toMatchObject({ field: 'noindex', label: 'No indexar' });
		expect(reviewRecord(input({ record: page({ noindex: false }) })).findings).toEqual([]);
	});

	test('varios problemas a la vez salen en orden y con ids distintos', () => {
		const { findings } = reviewRecord(
			input({ record: page({ description: '', socialImage: '', noindex: true }) })
		);
		expect(checks({ findings })).toEqual([
			'seo.description-empty',
			'seo.social-image-missing',
			'seo.noindex'
		]);
		expect(new Set(findings.map((f) => f.id)).size).toBe(3);
	});
});

describe('registros sin el grupo SEO del sembrado', () => {
	const base = {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	const text = (name: string) => ({ ...base, name, type: 'text', subtype: 'plain' }) as Field;
	const file = (name: string) => ({ ...base, name, type: 'file', multiple: false }) as Field;

	function modelOf(types: ContentType[], collections: Record<string, unknown>): ContentModel {
		return resolveContentModel({ types, manifestRaw: { schemaVersion: 1, collections } as never });
	}
	const typeNamed = (model: ContentModel, name: string): ResolvedContentType =>
		model.types.find((candidate) => candidate.name === name)!;

	test('con `social` y `fieldGroups` propios se revisan los campos que `social` nombra', () => {
		const model = modelOf(
			[{ name: 'posts', readonly: false, fields: [text('title'), text('excerpt'), file('cover')] }],
			{
				posts: {
					fieldGroups: [{ name: 'Publicación', placement: 'aside' }],
					social: { descriptionField: 'excerpt', imageField: 'cover' }
				}
			}
		);
		const result = reviewRecord(
			input({
				model,
				type: typeNamed(model, 'posts'),
				record: rec('posts', 'x', { title: 'Hola', excerpt: '', cover: '' })
			})
		);
		expect(result.findings.map((f) => [f.check, f.target])).toEqual([
			['seo.description-empty', { kind: 'field', field: 'excerpt', label: 'Excerpt' }],
			['seo.social-image-missing', { kind: 'field', field: 'cover', label: 'Cover' }]
		]);
	});

	test('sin `social`, el campo `description` se resuelve por su nombre', () => {
		const model = modelOf(
			[{ name: 'posts', readonly: false, fields: [text('title'), text('description')] }],
			{ posts: { fieldGroups: [{ name: 'Otro' }] } }
		);
		const result = reviewRecord(
			input({
				model,
				type: typeNamed(model, 'posts'),
				record: rec('posts', 'x', { title: 'Hola', description: '' })
			})
		);
		expect(checks(result)).toEqual(['seo.description-empty']);
	});

	test('un tipo sin ninguna pieza SEO no recibe avisos de SEO ni `skipped`', () => {
		const model = modelOf([{ name: 'notes', readonly: false, fields: [text('title')] }], {});
		const result = reviewRecord(
			input({ model, type: typeNamed(model, 'notes'), record: rec('notes', 'x', { title: 'a' }) })
		);
		expect(result).toEqual({ findings: [], skipped: [] });
	});

	test('un campo llamado `noindex` que no es `bool` no se interpreta', () => {
		const model = modelOf(
			[{ name: 'notes', readonly: false, fields: [text('title'), text('noindex')] }],
			{}
		);
		const result = reviewRecord(
			input({
				model,
				type: typeNamed(model, 'notes'),
				record: rec('notes', 'x', { title: 'a', noindex: 'true' })
			})
		);
		expect(result.findings).toEqual([]);
	});
});

// ————— Enlaces —————

const richtextBlock = (body: string, position = 1) => block(position, 'richtext', { body });
const link = (href: string) => `<p><a href="${href}">enlace</a></p>`;

describe('enlaces internos', () => {
	test('un enlace roto en un texto enriquecido apunta al bloque y al campo', () => {
		const { findings } = reviewRecord(
			input({ blocks: [block(1, 'hero', {}), richtextBlock(link('/no-existe'), 2)] })
		);
		expect(findings).toEqual([
			{
				id: 'link.broken:b.b2.body:1',
				check: 'link.broken',
				severity: 'warning',
				reason: 'not-found',
				target: {
					kind: 'block',
					blockId: 'b2',
					blockType: 'richtext',
					blockLabel: 'Texto rico',
					position: 2,
					field: 'body',
					label: 'Contenido'
				},
				messageKey: 'review.link.notFound',
				params: { href: '/no-existe' }
			}
		]);
	});

	test.each([
		'/sobre-mi',
		'/sobre-mi/',
		'/sobre-mi?utm=x',
		'/sobre-mi#equipo',
		'/sobre-mi/?utm=x#equipo'
	])('%s lleva a una página que existe: sin aviso', (href) => {
		expect(reviewRecord(input({ blocks: [richtextBlock(link(href))] })).findings).toEqual([]);
	});

	test('el enlace a la propia página vale', () => {
		expect(
			reviewRecord(input({ blocks: [richtextBlock(link('/inicio#arriba'))] })).findings
		).toEqual([]);
	});

	test('un borrador que enlaza a sí mismo no sale como enlace a un borrador', () => {
		const stored: ReviewPage[] = [
			{ type: 'pages', id: 'p1', path: '/inicio', published: false },
			{ type: 'pages', id: 'p3', path: '/pronto', published: false }
		];
		const draft = page({ status: 'draft' });
		expect(
			reviewRecord(
				input({ record: draft, pages: stored, blocks: [richtextBlock(link('/inicio#arriba'))] })
			).findings
		).toEqual([]);
		// Otro borrador sigue avisando.
		expect(
			checks(
				reviewRecord(
					input({ record: draft, pages: stored, blocks: [richtextBlock(link('/pronto'))] })
				)
			)
		).toEqual(['link.draft-target']);
	});

	test('un borrador con la ruta cambiada sin guardar se enlaza a sí mismo con la ruta nueva', () => {
		const stored: ReviewPage[] = [{ type: 'pages', id: 'p1', path: '/inicio', published: false }];
		const draft = page({ status: 'draft', path: '/portada' });
		expect(
			reviewRecord(
				input({ record: draft, pages: stored, blocks: [richtextBlock(link('/portada'))] })
			).findings
		).toEqual([]);
	});

	test('enlaces que no son rutas propias no se miran', () => {
		const html = [
			link('https://ejemplo.com/no-existe'),
			link('mailto:a@b.c'),
			link('tel:+34123456'),
			link('#ancla'),
			link('relativo/sin-barra'),
			link('//otro.com/x')
		].join('');
		expect(reviewRecord(input({ blocks: [richtextBlock(html)] })).findings).toEqual([]);
	});

	test('una ruta que solo existe como origen de una redirección NO es rota', () => {
		const redirects: ReviewRedirect[] = [{ from: '/vieja', to: '/sobre-mi' }];
		const result = reviewRecord(input({ redirects, blocks: [richtextBlock(link('/vieja'))] }));
		expect(result.findings).toEqual([]);
	});

	test('una redirección cuyo destino no existe avisa con el destino', () => {
		const redirects: ReviewRedirect[] = [{ from: '/vieja', to: '/borrada' }];
		const { findings } = reviewRecord(
			input({ redirects, blocks: [richtextBlock(link('/vieja'))] })
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			check: 'link.broken',
			reason: 'redirect-dead-end',
			messageKey: 'review.link.redirectDeadEnd',
			params: { href: '/vieja', to: '/borrada' }
		});
	});

	test('un bucle de redirecciones avisa', () => {
		const redirects: ReviewRedirect[] = [
			{ from: '/a', to: '/b' },
			{ from: '/b', to: '/a' }
		];
		const { findings } = reviewRecord(input({ redirects, blocks: [richtextBlock(link('/a'))] }));
		expect(findings[0]).toMatchObject({
			check: 'link.broken',
			reason: 'redirect-loop',
			messageKey: 'review.link.redirectLoop'
		});
	});

	test('un destino en borrador avisa aparte, directo o tras una redirección', () => {
		const direct = reviewRecord(input({ blocks: [richtextBlock(link('/pronto'))] }));
		expect(direct.findings).toHaveLength(1);
		expect(direct.findings[0]).toMatchObject({
			check: 'link.draft-target',
			messageKey: 'review.link.draftTarget',
			params: { href: '/pronto' }
		});
		const viaRedirect = reviewRecord(
			input({
				redirects: [{ from: '/antes', to: '/pronto' }],
				blocks: [richtextBlock(link('/antes'))]
			})
		);
		expect(checks(viaRedirect)).toEqual(['link.draft-target']);
	});

	test('un campo `url` de un bloque también se revisa; uno externo no', () => {
		const roto = block(1, 'hero', { actionHref: '/no-existe' });
		const externo = block(2, 'cta', { href: 'https://ejemplo.com' });
		const { findings } = reviewRecord(input({ blocks: [roto, externo] }));
		expect(findings).toHaveLength(1);
		expect(findings[0].target).toMatchObject({
			kind: 'block',
			blockId: 'b1',
			field: 'actionHref',
			label: 'Enlace'
		});
	});

	test('dos enlaces rotos en el mismo campo salen como hallazgos distintos', () => {
		const { findings } = reviewRecord(input({ blocks: [richtextBlock(link('/a') + link('/b'))] }));
		expect(findings.map((f) => f.id)).toEqual([
			'link.broken:b.b1.body:1',
			'link.broken:b.b1.body:2'
		]);
		expect(findings.map((f) => f.params.href)).toEqual(['/a', '/b']);
	});

	test('un bloque de un tipo que el vocabulario no conoce no aporta nada', () => {
		const { findings } = reviewRecord(
			input({ blocks: [block(1, 'inventado', { body: link('/no-existe') })] })
		);
		expect(findings).toEqual([]);
	});

	test('sin páginas o sin redirecciones legibles NO se inventan enlaces rotos: se omite', () => {
		const blocks = [richtextBlock(link('/no-existe'))];
		for (const over of [{ pages: null }, { redirects: null }] as const) {
			const result = reviewRecord(input({ blocks, ...over }));
			expect(result.findings).toEqual([]);
			expect(result.skipped).toEqual(['link.broken', 'link.draft-target']);
		}
	});

	test('sin enlaces que revisar, no haber leído las páginas no se declara omitido', () => {
		expect(reviewRecord(input({ blocks: [], pages: null, redirects: null })).skipped).toEqual([]);
	});

	test('un enlace dentro de un campo del propio registro (no de un bloque) apunta al campo', () => {
		const types: ContentType[] = [
			{
				name: 'landing',
				readonly: false,
				fields: [
					{
						name: 'web',
						type: 'url',
						required: false,
						readonly: false,
						presentable: false,
						hidden: false,
						unique: false
					} as unknown as Field
				]
			}
		];
		const model = resolveContentModel({ types, manifestRaw: null });
		const type = model.types.find((t) => t.name === 'landing')!;
		const result = reviewRecord(
			input({ model, type, record: rec('landing', 'l1', { web: '/no-existe' }) })
		);
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].target).toMatchObject({ kind: 'field', field: 'web' });
	});
});

// ————— Alt —————

describe('imágenes sin texto alternativo', () => {
	test('una imagen de la biblioteca sin alt en un bloque avisa con su fichero', () => {
		const { findings } = reviewRecord(
			input({
				blocks: [block(1, 'image', {}, { image: 'm1' })],
				media: mediaMap(['m1', 'gato.jpg', ''])
			})
		);
		expect(findings).toEqual([
			{
				id: 'media.alt-missing:b.b1.image:1',
				check: 'media.alt-missing',
				severity: 'warning',
				target: {
					kind: 'block',
					blockId: 'b1',
					blockType: 'image',
					blockLabel: 'Imagen',
					position: 1,
					field: 'image',
					label: 'Imagen'
				},
				messageKey: 'review.media.altMissing',
				params: { file: 'gato.jpg' }
			}
		]);
	});

	test('con alt no avisa; un alt de solo espacios cuenta como vacío', () => {
		const ok = reviewRecord(
			input({
				blocks: [block(1, 'image', {}, { image: 'm1' })],
				media: mediaMap(['m1', 'gato.jpg', 'Un gato naranja'])
			})
		);
		expect(ok.findings).toEqual([]);
		const blank = reviewRecord(
			input({
				blocks: [block(1, 'image', {}, { image: 'm1' })],
				media: mediaMap(['m1', 'gato.jpg', '   '])
			})
		);
		expect(checks(blank)).toEqual(['media.alt-missing']);
	});

	test('en una galería avisa una vez por cada imagen sin alt, con alt o sin él', () => {
		const { findings } = reviewRecord(
			input({
				blocks: [block(1, 'gallery', {}, { images: ['m1', 'm2', 'm3'] })],
				media: mediaMap(['m1', 'a.jpg', ''], ['m2', 'b.jpg', 'Descrita'], ['m3', 'c.png', ''])
			})
		);
		expect(findings.map((f) => f.params.file)).toEqual(['a.jpg', 'c.png']);
		expect(findings.map((f) => f.id)).toEqual([
			'media.alt-missing:b.b1.images:1',
			'media.alt-missing:b.b1.images:2'
		]);
	});

	test('un medio que no es imagen no necesita alt; uno que no se cargó no se juzga', () => {
		const result = reviewRecord(
			input({
				blocks: [block(1, 'gallery', {}, { images: ['doc', 'borrada'] })],
				media: mediaMap(['doc', 'guia.pdf', ''])
			})
		);
		expect(result.findings).toEqual([]);
	});

	test('sin fichas de medios legibles se omite la comprobación en vez de dar «todo bien»', () => {
		const result = reviewRecord(
			input({ blocks: [block(1, 'image', {}, { image: 'm1' })], media: null })
		);
		expect(result).toEqual({ findings: [], skipped: ['media.alt-missing'] });
	});

	test('bloques sin imágenes (o sin ninguna elegida): nada que revisar, nada omitido', () => {
		const result = reviewRecord(
			input({
				blocks: [
					block(1, 'hero', {}),
					block(2, 'image', {}, { image: '' }),
					block(3, 'divider', {})
				],
				media: null
			})
		);
		expect(result).toEqual({ findings: [], skipped: [] });
	});

	test('una <img> del texto sin atributo alt avisa; con alt="" (decorativa) o con texto, no', () => {
		const body =
			'<p><img src="/api/files/vega_media/x/foto.jpg?thumb=1"></p>' +
			'<p><img src="/d.jpg" alt=""></p><p><img src="/e.jpg" alt="Descrita"></p>';
		const { findings } = reviewRecord(input({ blocks: [richtextBlock(body)] }));
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			check: 'media.alt-missing-inline',
			messageKey: 'review.media.altMissingInline',
			params: { file: 'foto.jpg' },
			target: { kind: 'block', field: 'body', blockType: 'richtext' }
		});
	});

	test('la imagen social de la página NO entra en la revisión de alt', () => {
		const result = reviewRecord(
			input({ record: page({ socialImage: 'm1' }), media: mediaMap(['m1', 'og.jpg', '']) })
		);
		expect(result.findings).toEqual([]);
	});
});

describe('bloques homogéneos (sin vocabulario de tipos)', () => {
	const base = {
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};
	const types: ContentType[] = [
		{
			name: 'landing',
			readonly: false,
			fields: [{ ...base, name: 'title', type: 'text', subtype: 'plain' } as Field]
		},
		{
			name: 'sections',
			readonly: false,
			fields: [
				{ ...base, name: 'landing', type: 'relation', target: 'landing', multiple: false } as Field,
				{ ...base, name: 'order', type: 'number' } as Field,
				{
					...base,
					name: 'photo',
					type: 'relation',
					target: 'vega_media',
					multiple: false
				} as Field,
				{ ...base, name: 'link', type: 'url' } as unknown as Field
			]
		}
	];
	const model = resolveContentModel({
		types,
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				landing: {
					blocks: { collection: 'sections', parentField: 'landing', orderField: 'order' }
				},
				sections: { labelSingular: 'Sección' }
			}
		}
	});
	const type = model.types.find((t) => t.name === 'landing')!;

	test('las columnas relation a vega_media y los url del tipo hijo se revisan', () => {
		const section = rec('sections', 's1', {
			landing: 'l1',
			order: 1,
			photo: 'm1',
			link: '/no-existe'
		});
		const result = reviewRecord(
			input({
				model,
				type,
				record: rec('landing', 'l1', { title: 'x' }),
				blocks: [section],
				media: mediaMap(['m1', 'foto.jpg', ''])
			})
		);
		expect(result.findings.map((f) => [f.check, f.target])).toEqual([
			[
				'link.broken',
				{
					kind: 'block',
					blockId: 's1',
					blockType: null,
					blockLabel: 'Sección',
					position: 1,
					field: 'link',
					label: 'Link'
				}
			],
			[
				'media.alt-missing',
				expect.objectContaining({ kind: 'block', blockType: null, field: 'photo' })
			]
		]);
	});

	test('`collectMediaIds` lista los medios que citan los bloques, sin repetir', () => {
		const blocks = [
			rec('sections', 's1', { landing: 'l1', order: 1, photo: 'm1' }),
			rec('sections', 's2', { landing: 'l1', order: 2, photo: 'm1' }),
			rec('sections', 's3', { landing: 'l1', order: 3, photo: 'm2' })
		];
		expect(collectMediaIds({ model, type, blocks })).toEqual(['m1', 'm2']);
	});
});

describe('collectMediaIds en el sembrado', () => {
	test('recoge `image` e `images` de los bloques heterogéneos; ignora el resto', () => {
		const blocks = [
			block(1, 'image', {}, { image: 'm1' }),
			block(2, 'gallery', {}, { images: ['m2', 'm1', 'm3'] }),
			block(3, 'hero', {}, { image: '' })
		];
		expect(collectMediaIds({ model: world.model, type: world.pagesType, blocks })).toEqual([
			'm1',
			'm2',
			'm3'
		]);
	});

	test('un tipo sin bloques no pide ningún medio', () => {
		const redirects = world.model.types.find((t) => t.name === 'redirects')!;
		expect(collectMediaIds({ model: world.model, type: redirects, blocks: [] })).toEqual([]);
	});
});

// ————— Contrato —————

describe('contrato', () => {
	test('por defecto TODA comprobación es un aviso, ninguna bloquea', () => {
		expect(new Set(Object.values(CHECK_SEVERITY))).toEqual(new Set(['warning']));
	});

	test('cada hallazgo lleva el identificador y la gravedad de su comprobación', () => {
		const { findings } = reviewRecord(
			input({
				record: page({ description: '', socialImage: '', noindex: true }),
				blocks: [richtextBlock(link('/no-existe'))]
			})
		);
		expect(findings.length).toBeGreaterThan(0);
		for (const finding of findings) expect(finding.severity).toBe(CHECK_SEVERITY[finding.check]);
	});

	test('toda clave de mensaje existe en español e inglés y sus {param} cuadran con lo que se pasa', () => {
		const redirects: ReviewRedirect[] = [
			{ from: '/muerta', to: '/borrada' },
			{ from: '/a', to: '/b' },
			{ from: '/b', to: '/a' }
		];
		const body =
			['/no-existe', '/muerta', '/a', '/pronto'].map(link).join('') + '<img src="/x.jpg">';
		const shared = {
			redirects,
			blocks: [richtextBlock(body), block(2, 'image', {}, { image: 'm1' })],
			media: mediaMap(['m1', 'gato.jpg', ''])
		};
		const { findings } = reviewRecord(
			input({
				...shared,
				record: page({ description: 'a'.repeat(200), socialImage: '', noindex: true })
			})
		);
		findings.push(
			...reviewRecord(input({ ...shared, record: page({ description: '' }) })).findings
		);
		// Una muestra de cada comprobación y de cada motivo.
		expect(new Set(checks({ findings }))).toEqual(
			new Set<ReviewCheckId>(Object.keys(CHECK_SEVERITY) as ReviewCheckId[])
		);
		for (const finding of findings) {
			for (const dictionary of [es, en] as Array<Record<string, string>>) {
				const message = dictionary[finding.messageKey];
				expect(message, finding.messageKey).toBeTypeOf('string');
				const placeholders = [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
				expect(placeholders, finding.messageKey).toEqual(Object.keys(finding.params).sort());
			}
		}
	});

	test('es determinista: mismos datos, mismo resultado', () => {
		const data = input({
			record: page({ description: '' }),
			blocks: [richtextBlock(link('/no-existe'))]
		});
		expect(reviewRecord(data)).toEqual(reviewRecord(data));
	});
});
