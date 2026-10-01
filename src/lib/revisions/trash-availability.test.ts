/**
 * Suite de `isTrashAvailable` (`#lote-integridad`, Fase B §4/§10.3): las mismas dos condiciones
 * que `shouldSnapshot`/`snapshotBeforeDelete` de `with-revisions.ts`, en versión SÍNCRONA y pura
 * para los diálogos de borrado.
 */

import { describe, expect, test } from 'vitest';
import type { Field } from '$lib/backend/types';
import {
	isDeleteRecoverable,
	isTrashAvailable,
	type TrashAvailabilityModel
} from './trash-availability';

function model(opts: {
	enabled?: boolean;
	hasRevisionsCollection?: boolean;
}): TrashAvailabilityModel {
	return {
		revisions: { enabled: opts.enabled ?? true },
		types:
			(opts.hasRevisionsCollection ?? true)
				? [{ name: 'vega_revisions' }, { name: 'posts' }]
				: [{ name: 'posts' }]
	};
}

describe('isTrashAvailable', () => {
	test('enabled + vega_revisions descubierta: true', () => {
		expect(isTrashAvailable(model({ enabled: true, hasRevisionsCollection: true }))).toBe(true);
	});

	test('vega_revisions NO descubierta (sin bootstrap): false', () => {
		expect(isTrashAvailable(model({ enabled: true, hasRevisionsCollection: false }))).toBe(false);
	});

	test('revisions.enabled === false, aunque la colección exista: false', () => {
		expect(isTrashAvailable(model({ enabled: false, hasRevisionsCollection: true }))).toBe(false);
	});

	test('ninguna de las dos: false', () => {
		expect(isTrashAvailable(model({ enabled: false, hasRevisionsCollection: false }))).toBe(false);
	});
});

describe('isDeleteRecoverable (la papelera no puede prometer lo que no restaura)', () => {
	const file = (required: boolean): Field =>
		({ name: 'file', type: 'file', required, multiple: false }) as unknown as Field;
	const withFiles = (fields: Field[]): TrashAvailabilityModel => ({
		revisions: { enabled: true },
		types: [{ name: 'vega_revisions' }, { name: 'vega_media', schema: { fields } }]
	});

	test('papelera disponible y sin file obligatorio: true', () => {
		expect(isDeleteRecoverable(withFiles([file(false)]), 'vega_media')).toBe(true);
	});

	test('un campo file OBLIGATORIO (vega_media): false aunque la papelera exista', () => {
		expect(isDeleteRecoverable(withFiles([file(true)]), 'vega_media')).toBe(false);
	});

	test('papelera no disponible: false', () => {
		expect(isDeleteRecoverable(model({ hasRevisionsCollection: false }), 'posts')).toBe(false);
	});

	test('colección sin esquema en el modelo: manda la papelera', () => {
		expect(isDeleteRecoverable(model({}), 'posts')).toBe(true);
	});
});
