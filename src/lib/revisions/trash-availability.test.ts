/**
 * Suite de `isTrashAvailable` (`#lote-integridad`, Fase B §4/§10.3): las mismas dos condiciones
 * que `shouldSnapshot`/`snapshotBeforeDelete` de `with-revisions.ts`, en versión SÍNCRONA y pura
 * para los diálogos de borrado.
 */

import { describe, expect, test } from 'vitest';
import { isTrashAvailable, type TrashAvailabilityModel } from './trash-availability';

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
