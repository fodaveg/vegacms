/** Una bandeja es esquema tipado y manifiesto aditivo, nunca respuestas en JSON. */
import {
	checkCollectionFieldSpecs,
	isUserAuthorableCollectionName,
	type CollectionSpec
} from '$lib/backend/collections';
import type { ContentType, JsonValue } from '$lib/backend/types';
import { FORM_INBOX_CREATE_RULE } from '$lib/backend/site-seeding-contact';
import { SITE_SEED_EDITOR_ACCESS_RULE, type SiteSeedModule } from '$lib/backend/site-seeding';
import { draftToSpec, type FieldDraft } from '$lib/model/editor/field-draft';
export { FORM_INBOX_CREATE_RULE };
export const RESERVED_FORM_FIELDS = ['website', 'read', 'notifyState', 'created', 'updated', 'id'];
export interface FormFieldDraft {
	label: string;
	draft: FieldDraft;
	longText: boolean;
}
export interface FormInboxDraft {
	name: string;
	label: string;
	singular: string;
	fields: FormFieldDraft[];
}

/** Propuesta editable; nunca vuelve a derivarse después de crear la colección. */
export function formName(label: string): string {
	return label
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Marca estructural de la bandeja, compartida con el hook de servidor. */
export function isFormInbox(type: ContentType): boolean {
	return (
		!type.readonly &&
		type.fields.some(
			(field) => field.name === 'notifyState' && field.type === 'text' && field.hidden
		) &&
		type.fields.some((field) => field.name === 'created' && field.type === 'date' && field.readonly)
	);
}

/** Construye el módulo dinámico; rechaza nombres reservados y vocabulario fuera del asistente. */
export function buildFormInbox(
	input: FormInboxDraft,
	manifest: JsonValue | null = null
): SiteSeedModule {
	const name = input.name.trim();
	if (!isUserAuthorableCollectionName(name)) throw new Error('forms.invalidName');
	if (!input.label.trim() || input.fields.length === 0) throw new Error('forms.required');
	const seen = new Set<string>();
	const decorations: Record<string, JsonValue> = {};
	const allowed = ['text', 'email', 'url', 'number', 'bool', 'select', 'date'];
	const fields = input.fields.map((row) => {
		if (!allowed.includes(row.draft.type)) throw new Error('forms.invalidType');
		const field = draftToSpec({ ...row.draft, unique: false, max: row.longText ? '5000' : '200' });
		if (!field || RESERVED_FORM_FIELDS.includes(field.name) || seen.has(field.name))
			throw new Error('forms.reservedField');
		seen.add(field.name);
		decorations[field.name] = {
			label: row.label.trim() || field.name,
			...(row.longText && field.type === 'text' ? { widget: 'textarea' } : {})
		};
		return field;
	});
	if (Object.keys(checkCollectionFieldSpecs(fields)).length) throw new Error('forms.invalidFields');
	const spec: CollectionSpec = {
		name,
		listRule: SITE_SEED_EDITOR_ACCESS_RULE,
		viewRule: SITE_SEED_EDITOR_ACCESS_RULE,
		createRule: FORM_INBOX_CREATE_RULE,
		updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
		deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
		fields: [
			...fields,
			{ name: 'read', type: 'bool' },
			{ name: 'notifyState', type: 'text', max: 20, hidden: true },
			{ name: 'created', type: 'autodate' }
		]
	};
	const doc = manifest && typeof manifest === 'object' && !Array.isArray(manifest) ? manifest : {};
	const entries =
		doc.collections && typeof doc.collections === 'object' && !Array.isArray(doc.collections)
			? Object.values(doc.collections)
			: [];
	const orders = entries
		.filter(
			(value) =>
				value && typeof value === 'object' && !Array.isArray(value) && value.group === 'Sitio'
		)
		.map((value) =>
			value && typeof value === 'object' && !Array.isArray(value) && typeof value.order === 'number'
				? value.order
				: 0
		);
	const title = fields.find((field) => field.type === 'text')?.name || fields[0].name;
	const email = fields.find((field) => field.name === 'email' && field.type === 'email')?.name;
	return {
		id: `form:${name}`,
		collections: [spec],
		manifest: {
			nav: { groups: ['Sitio'] },
			collections: {
				[name]: {
					hideCreate: true,
					label: input.label.trim(),
					labelSingular: input.singular.trim() || input.label.trim(),
					icon: 'archive',
					group: 'Sitio',
					order: Math.max(0, ...orders) + 1,
					titleField: title,
					...(email ? { subtitleField: email } : {}),
					listFields: [title, ...(email && email !== title ? [email] : []), 'created', 'read'],
					defaultSort: { field: 'created', dir: 'desc' },
					fields: { ...decorations, read: { label: 'Leído' }, created: { label: 'Fecha' } }
				}
			}
		}
	};
}
