/**
 * Módulo de sembrado `blog`: las colecciones `tags` y `posts` y sus entradas de manifiesto.
 *
 * `posts` se publica igual que `pages`, así que comparte con ella —mismas constantes de
 * `site-seeding.ts`, no una copia— el campo de estado, «Publicar el», los tres campos de SEO, las
 * fechas automáticas y las reglas de acceso: quien no ha iniciado sesión lee solo lo publicado, y
 * solo los editores escriben. `tags` usa esas mismas reglas de escritura, y se lee sin sesión: una
 * etiqueta no tiene estado de publicación (existe o no) y el sitio la necesita para pintar las
 * entradas publicadas que la enlazan.
 *
 * `posts.date` es la fecha VISIBLE de la entrada. Existe porque `publishAt` no sirve para eso: la
 * extensión `vegaschedule` la vacía al publicar.
 *
 * El campo `posts.tags` enlaza etiquetas que ya existen: el formulario de una relación no deja
 * crear el destino, así que las etiquetas se crean antes, en su propio listado (lo dice la ayuda
 * del campo).
 *
 * NAVEGACIÓN. Las dos colecciones van al grupo «Sitio», detrás de `pages` y `redirects` (`order`
 * 2 y 3). Qué colección sale en qué grupo lo dice su `group`, así que aparecen en el menú también
 * en un sitio ya sembrado. El fragmento declara además el grupo en `nav.groups`: si el menú
 * guardado no lo tiene (alguien renombró los grupos), la fusión lo añade al final.
 */

import {
	SITE_SEED_AUTODATE_FIELDS,
	SITE_SEED_EDITOR_ACCESS_RULE,
	SITE_SEED_PAGES_READ_RULE,
	SITE_SEED_PUBLISH_AT_FIELD,
	SITE_SEED_SEO_FIELDS,
	SITE_SEED_STATUS_FIELD,
	type SiteSeedModule
} from './site-seeding';
import type { CollectionSpec } from './collections';
import type { JsonValue } from './types';
import { VEGA_MEDIA_COLLECTION } from '$lib/media/media-collection';

/** Una etiqueta se lee sin sesión, como una redirección: no tiene estado de publicación. */
export const SITE_SEED_TAGS_READ_RULE = '';

const TAGS_COLLECTION: CollectionSpec = {
	name: 'tags',
	listRule: SITE_SEED_TAGS_READ_RULE,
	viewRule: SITE_SEED_TAGS_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{ name: 'name', type: 'text', required: true, max: 80 },
		{ name: 'slug', type: 'text', required: true, max: 80, unique: true },
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const POSTS_COLLECTION: CollectionSpec = {
	name: 'posts',
	listRule: SITE_SEED_PAGES_READ_RULE,
	viewRule: SITE_SEED_PAGES_READ_RULE,
	createRule: SITE_SEED_EDITOR_ACCESS_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{ name: 'title', type: 'text', required: true, max: 200 },
		{ name: 'slug', type: 'text', required: true, max: 200, unique: true },
		{ name: 'excerpt', type: 'text', max: 300 },
		{ name: 'body', type: 'editor' },
		// Portada: relación simple a `vega_media`, sin cascada (borrar un medio no borra la entrada),
		// igual que `pages.socialImage`.
		{
			name: 'cover',
			type: 'relation',
			target: VEGA_MEDIA_COLLECTION.name,
			multiple: false,
			cascadeDelete: false
		},
		SITE_SEED_STATUS_FIELD,
		SITE_SEED_PUBLISH_AT_FIELD,
		// La fecha que se enseña en el sitio (ver la cabecera).
		{ name: 'date', type: 'date' },
		// Sin cascada: borrar una etiqueta la quita de las entradas, no borra las entradas.
		{
			name: 'tags',
			type: 'relation',
			target: TAGS_COLLECTION.name,
			multiple: true,
			cascadeDelete: false
		},
		...SITE_SEED_SEO_FIELDS,
		...SITE_SEED_AUTODATE_FIELDS
	]
};

const BLOG_MANIFEST: JsonValue = {
	nav: { groups: ['Sitio'] },
	collections: {
		posts: {
			label: 'Entradas',
			labelSingular: 'Entrada',
			icon: 'document',
			group: 'Sitio',
			order: 2,
			titleField: 'title',
			subtitleField: 'slug',
			slugField: 'slug',
			statusField: 'status',
			statusLabels: { draft: 'Borrador', published: 'Publicado' },
			publishAtField: 'publishAt',
			listFields: ['title', 'status', 'date'],
			fieldGroups: [{ name: 'SEO', placement: 'aside' }],
			// `title` y `status` no llevan etiqueta: la pone el catálogo en el idioma de quien edita.
			fields: {
				slug: {
					label: 'Dirección (slug)',
					help: 'La parte de la dirección del sitio que identifica la entrada. Se puede regenerar a partir del título.'
				},
				excerpt: {
					label: 'Resumen',
					help: 'Una o dos frases que acompañan al título en el listado de entradas.',
					widget: 'textarea'
				},
				body: { label: 'Contenido' },
				cover: { label: 'Portada' },
				publishAt: {
					label: 'Publicar el',
					help: 'Si la entrada está en borrador, se publica sola a esta hora. Requiere la extensión vegaschedule en el servidor; sin ella, la fecha no hace nada.'
				},
				date: {
					label: 'Fecha',
					help: 'La fecha que se enseña en el sitio. No cambia sola al publicar.'
				},
				tags: {
					label: 'Etiquetas',
					help: 'Las etiquetas se crean antes en su propio listado, «Etiquetas». Aquí solo se eligen.'
				},
				description: {
					label: 'Descripción',
					help: 'Resumen de una o dos frases para buscadores y redes sociales. Si lo dejas vacío, el sitio usa su descripción general.',
					widget: 'textarea',
					group: 'SEO'
				},
				socialImage: {
					label: 'Imagen para redes',
					help: 'Aparece al compartir la entrada en redes y mensajería. Mejor apaisada, de unos 1200 × 630 px.',
					group: 'SEO'
				},
				noindex: {
					label: 'No indexar',
					help: 'Pide a los buscadores que no muestren esta entrada y la saca del mapa del sitio. Quien tenga el enlace puede seguir abriéndola.',
					group: 'SEO'
				}
			}
		},
		tags: {
			label: 'Etiquetas',
			labelSingular: 'Etiqueta',
			icon: 'tag',
			group: 'Sitio',
			order: 3,
			titleField: 'name',
			subtitleField: 'slug',
			slugField: 'slug',
			listFields: ['name', 'slug'],
			fields: {
				slug: {
					label: 'Dirección (slug)',
					help: 'La parte de la dirección del sitio que identifica la etiqueta. Se puede regenerar a partir del nombre.'
				}
			}
		}
	}
};

/** `tags` va antes que `posts`, que la enlaza. */
export const SITE_SEED_BLOG_MODULE: SiteSeedModule = {
	id: 'blog',
	collections: [TAGS_COLLECTION, POSTS_COLLECTION],
	manifest: BLOG_MANIFEST
};
