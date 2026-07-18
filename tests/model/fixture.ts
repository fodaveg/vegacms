/**
 * Fixture "kitchen sink" de P2 (§9 del contrato P2 / §10 del contrato P1): un `ContentType`
 * con TODOS los tipos de campo de la unión `Field` de P1, más `category` (destino de las
 * relaciones), `vega`/`vega_media` (para probar L7) y una vista de solo lectura (para
 * singleton/visibilidad). PURO: no depende de ningún adaptador ni del puerto.
 */

import type { ContentType, Field } from '$lib/backend/types';

// ————— category: destino de relation, campo título por convención 'name' —————

export const categoryFields: Field[] = [
	{
		name: 'name',
		type: 'text',
		subtype: 'plain',
		required: true,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: true
	}
];

export const categoryType: ContentType = {
	name: 'category',
	readonly: false,
	fields: categoryFields
};

// ————— post: kitchen sink, un campo de cada tipo de la unión Field —————

export const postFields: Field[] = [
	{
		name: 'title',
		type: 'text',
		subtype: 'plain',
		required: true,
		readonly: false,
		presentable: true,
		hidden: false,
		unique: false,
		minLength: 1,
		maxLength: 120
	},
	{
		name: 'excerpt', // override `textarea` en los tests de widgets
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'body', // override `markdown` en los tests de widgets
		type: 'text',
		subtype: 'plain',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'content', // richtext: NUNCA admite override (widget-incompatible)
		type: 'richtext',
		subtype: 'html',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'rating',
		type: 'number',
		integer: true,
		min: 0,
		max: 5,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'featured',
		type: 'bool',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'contactEmail',
		type: 'email',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'website',
		type: 'url',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'publishedAt',
		type: 'date',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'status',
		type: 'select',
		options: ['draft', 'published', 'archived'],
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'tags',
		type: 'select',
		options: ['a', 'b', 'c'],
		multiple: true,
		maxSelect: 3,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'category',
		type: 'relation',
		target: 'category',
		multiple: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'categories',
		type: 'relation',
		target: 'category',
		multiple: true,
		maxSelect: 3,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'cover',
		type: 'file',
		multiple: false,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'gallery',
		type: 'file',
		multiple: true,
		maxSelect: 5,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'metadata',
		type: 'json',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	},
	{
		name: 'location',
		type: 'unsupported',
		backendType: 'geoPoint',
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	}
];

export const postType: ContentType = {
	name: 'post',
	readonly: false,
	fields: postFields
};

// ————— vega / vega_media: L7, siempre ocultas y fuera de nav, no anulable —————

export const vegaType: ContentType = {
	name: 'vega',
	readonly: false,
	fields: [
		{
			name: 'manifest',
			type: 'json',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

export const vegaMediaType: ContentType = {
	name: 'vega_media',
	readonly: false,
	fields: [
		{
			name: 'file',
			type: 'file',
			multiple: false,
			protected: false,
			required: true,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

// ————— settings: vista de solo lectura, para singleton/visibilidad —————

export const settingsViewType: ContentType = {
	name: 'settings_view',
	readonly: true,
	fields: [
		{
			name: 'name',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		}
	]
};

/** Los tipos del kitchen-sink, en el orden que P1 los entregaría (alfabético). */
export const kitchenSinkTypes: ContentType[] = [
	categoryType,
	postType,
	settingsViewType,
	vegaMediaType,
	vegaType
];
