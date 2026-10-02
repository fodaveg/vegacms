import { describe, expect, test } from 'vitest';
import {
	buildLinkTargets,
	extractAnchorHrefs,
	extractImages,
	MAX_REDIRECT_HOPS,
	normalizeSitePath,
	resolvePath,
	type ReviewPage,
	type ReviewRedirect
} from './review-links';

const page = (path: string, published = true): ReviewPage => ({
	type: 'pages',
	id: `id${path}`,
	path,
	published
});

function targets(pages: ReviewPage[], redirects: ReviewRedirect[] = []) {
	return buildLinkTargets(pages, redirects);
}

describe('normalizeSitePath', () => {
	test.each([
		['/sobre', '/sobre'],
		['/sobre/', '/sobre'],
		['/sobre//', '/sobre'],
		['/sobre?x=1', '/sobre'],
		['/sobre#equipo', '/sobre'],
		['/sobre/?x=1#equipo', '/sobre'],
		['/', '/'],
		['/#contacto', '/'],
		['/?x=1', '/'],
		['/caf%C3%A9', '/café'],
		['  /sobre  ', '/sobre'],
		// Las rutas distinguen mayúsculas: no se pliegan.
		['/Sobre', '/Sobre'],
		// Una secuencia mal formada no lanza: se deja tal cual.
		['/a%E0%A4%A', '/a%E0%A4%A']
	])('%s → %s', (href, expected) => {
		expect(normalizeSitePath(href)).toBe(expected);
	});

	test.each([
		'https://ejemplo.com/sobre',
		'mailto:a@b.c',
		'tel:+34123',
		'#ancla',
		'sobre',
		'//otro.com/sobre',
		'/\\otro.com',
		''
	])('no es una ruta interna: %s', (href) => {
		expect(normalizeSitePath(href)).toBeNull();
	});
});

describe('resolvePath', () => {
	test('una página publicada vale; el borrador se distingue; lo que no existe es not-found', () => {
		const t = targets([page('/sobre'), page('/pronto', false)]);
		expect(resolvePath('/sobre', t)).toEqual({ status: 'ok' });
		expect(resolvePath('/pronto', t)).toEqual({ status: 'draft' });
		expect(resolvePath('/nada', t)).toEqual({ status: 'not-found' });
	});

	test('una ruta que solo es ORIGEN de una redirección vale (el visitante llega)', () => {
		const t = targets([page('/nueva')], [{ from: '/vieja', to: '/nueva' }]);
		expect(resolvePath('/vieja', t)).toEqual({ status: 'ok' });
	});

	test('con página y redirección en la misma ruta gana la página (también si está en borrador)', () => {
		const t = targets([page('/x', false)], [{ from: '/x', to: '/otra' }]);
		expect(resolvePath('/x', t)).toEqual({ status: 'draft' });
	});

	test('la redirección que acaba en una ruta propia inexistente es un callejón, con el destino', () => {
		const t = targets([], [{ from: '/vieja', to: '/borrada' }]);
		expect(resolvePath('/vieja', t)).toEqual({ status: 'redirect-dead-end', to: '/borrada' });
	});

	test('una cadena A → B → C se sigue hasta el final', () => {
		const t = targets(
			[page('/c')],
			[
				{ from: '/a', to: '/b' },
				{ from: '/b', to: '/c' }
			]
		);
		expect(resolvePath('/a', t)).toEqual({ status: 'ok' });
		const dead = targets(
			[],
			[
				{ from: '/a', to: '/b' },
				{ from: '/b', to: '/c' }
			]
		);
		expect(resolvePath('/a', dead)).toEqual({ status: 'redirect-dead-end', to: '/c' });
	});

	test('la cadena que acaba en una página en borrador avisa de borrador', () => {
		const t = targets([page('/b', false)], [{ from: '/a', to: '/b' }]);
		expect(resolvePath('/a', t)).toEqual({ status: 'draft' });
	});

	test('una redirección a una URL externa o a otra parte no comprobable vale', () => {
		const t = targets([], [{ from: '/blog', to: 'https://blog.ejemplo.com' }]);
		expect(resolvePath('/blog', t)).toEqual({ status: 'ok' });
	});

	test('un bucle se detecta', () => {
		const t = targets(
			[],
			[
				{ from: '/a', to: '/b' },
				{ from: '/b', to: '/a' }
			]
		);
		expect(resolvePath('/a', t)).toEqual({ status: 'redirect-loop' });
		const self = targets([], [{ from: '/a', to: '/a/' }]);
		expect(resolvePath('/a', self)).toEqual({ status: 'redirect-loop' });
	});

	test('una cadena más larga que la cota se trata como bucle', () => {
		const redirects: ReviewRedirect[] = [];
		for (let i = 0; i <= MAX_REDIRECT_HOPS + 1; i += 1) {
			redirects.push({ from: `/r${i}`, to: `/r${i + 1}` });
		}
		expect(resolvePath('/r0', targets([], redirects))).toEqual({ status: 'redirect-loop' });
	});

	test('barra final y mayúsculas: la barra no cuenta, las mayúsculas sí', () => {
		const t = targets([page('/sobre/')]);
		expect(resolvePath('/sobre', t)).toEqual({ status: 'ok' });
		expect(resolvePath('/Sobre', t)).toEqual({ status: 'not-found' });
	});

	test('con dos páginas en la misma ruta gana la publicada', () => {
		const t = targets([page('/x', false), page('/x', true)]);
		expect(resolvePath('/x', t)).toEqual({ status: 'ok' });
	});
});

describe('extractAnchorHrefs', () => {
	test('lee href con comillas dobles, simples y sin comillas, en orden', () => {
		const html =
			'<p><a href="/a">uno</a> <a class="x" href=\'/b?x=1\'>dos</a> <a href=/c>tres</a></p>';
		expect(extractAnchorHrefs(html)).toEqual(['/a', '/b?x=1', '/c']);
	});

	test('decodifica entidades y tolera una > dentro del valor', () => {
		expect(extractAnchorHrefs('<a title="a > b" href="/p?a=1&amp;b=2">x</a>')).toEqual([
			'/p?a=1&b=2'
		]);
	});

	test('un <a> sin href no aporta nada; <abbr> no es <a>', () => {
		expect(extractAnchorHrefs('<a name="x">y</a><abbr title="t">z</abbr>')).toEqual([]);
	});
});

describe('extractImages', () => {
	test('distingue alt ausente de alt vacío (decorativa) y de alt con texto', () => {
		const html =
			'<img src="/a.jpg"><img src="/b.jpg" alt=""><img src="/c.jpg" alt="Un gato"><img alt src="/d.jpg">';
		expect(extractImages(html)).toEqual([
			{ src: '/a.jpg', alt: null },
			{ src: '/b.jpg', alt: '' },
			{ src: '/c.jpg', alt: 'Un gato' },
			{ src: '/d.jpg', alt: '' }
		]);
	});
});
