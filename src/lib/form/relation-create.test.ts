import { describe, expect, test } from 'vitest';
import type { ContentType } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { toRecordInput } from './to-record-input';
import { buildFormModel } from './form-model';
import {
	canCreateRelationTarget,
	incorporateCreatedRelation,
	relationCreationModel,
	relationCreationUnavailable
} from './relation-create';

const base = {
	required: true,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;
const schema: ContentType = {
	name: 'tags',
	readonly: false,
	fields: [
		{ ...base, name: 'name', type: 'text', subtype: 'plain' },
		{ ...base, name: 'slug', type: 'text', subtype: 'plain', unique: true }
	]
};
function type() {
	return resolveContentModel({
		types: [schema],
		manifestRaw: {
			schemaVersion: 1,
			collections: { tags: { titleField: 'name', slugField: 'slug' } }
		}
	}).types[0]!;
}

describe('creación contextual de una relación', () => {
	test('prefija solo título compatible y slug declarado; el prefijo se envía al crear', () => {
		const target = type();
		const initial = relationCreationModel(target, ' Taller ');
		expect(initial.baseline).toEqual({ name: 'Taller', slug: 'taller' });
		expect(
			toRecordInput(target, buildFormModel(target, null).baseline, initial.baseline, 'create')
		).toEqual({ name: 'Taller', slug: 'taller' });
		target.slugField = null;
		expect(relationCreationModel(target, 'Taller').baseline).toEqual({ name: 'Taller', slug: '' });
		target.titleField = null;
		expect(relationCreationModel(target, 'Taller').baseline).toEqual({ name: '', slug: '' });
	});
	test('no prefija un título readonly ni un widget incompatible', () => {
		const target = type();
		target.fields[0]!.schema.readonly = true;
		expect(relationCreationModel(target, 'Taller').baseline.name).toBe('');
		target.fields[0]!.schema.readonly = false;
		target.fields[0]!.widget = 'email';
		expect(relationCreationModel(target, 'Taller').baseline.name).toBe('');
	});
	test('requeridos ocultos/unsupported impiden una alta parcial', () => {
		const target = type();
		expect(relationCreationUnavailable(target)).toBe(false);
		target.fields[1]!.widget = 'unsupported';
		expect(relationCreationUnavailable(target)).toBe(true);
		target.fields[1]!.schema.readonly = true;
		expect(relationCreationUnavailable(target)).toBe(false);
		target.fields[0]!.hidden = true;
		expect(relationCreationUnavailable(target)).toBe(true);
	});
	test('las altas genéricas respetan creación manual y excluyen singleton/técnicos', () => {
		const target = type();
		expect(canCreateRelationTarget(target)).toBe(true);
		target.hideCreate = true;
		expect(canCreateRelationTarget(target)).toBe(false);
		target.hideCreate = false;
		target.singleton = true;
		expect(canCreateRelationTarget(target)).toBe(false);
		target.singleton = false;
		target.name = 'vega_media';
		expect(canCreateRelationTarget(target)).toBe(false);
		expect(canCreateRelationTarget(null)).toBe(false);
	});
	test('single reemplaza y multi añade único al final con recheck del máximo', () => {
		expect(incorporateCreatedRelation(['old'], 'new', false, 1)).toEqual(['new']);
		expect(incorporateCreatedRelation(['a', 'b'], 'c', true, 3)).toEqual(['a', 'b', 'c']);
		expect(incorporateCreatedRelation(['a', 'b'], 'b', true, 2)).toEqual(['a', 'b']);
		expect(incorporateCreatedRelation(['a', 'b'], 'c', true, 2)).toBeNull();
	});
});
