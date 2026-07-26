/**
 * Tests de la composición de permisos (`#lote-shell`, `access.ts`). El caso que más importa no es
 * ninguno de los "denegado": son los DOS caminos por los que no se sabe nada (adaptador sin
 * lectura de reglas, y regla condicional), que DEBEN acabar en "se ofrece" — si se invirtieran,
 * cualquier backend sin reglas legibles quedaría convertido en un CMS de solo lectura.
 */

import { describe, expect, test } from 'vitest';
import type { ContentType, TypeAccess } from './types';
import { isOperationOffered, resolvePermissions } from './access';

const OPEN: TypeAccess = {
	list: 'allowed',
	view: 'allowed',
	create: 'allowed',
	update: 'allowed',
	delete: 'allowed'
};

function type(overrides: Partial<ContentType> = {}): ContentType {
	return { name: 'posts', readonly: false, fields: [], ...overrides };
}

describe('isOperationOffered', () => {
	test('sin `access` (adaptador que no lee reglas): se ofrece todo', () => {
		expect(isOperationOffered(undefined, 'create', false)).toBe(true);
		expect(isOperationOffered(undefined, 'delete', false)).toBe(true);
	});

	test('`conditional` se ofrece: evaluarlo en cliente sería reimplementar el motor de reglas', () => {
		expect(isOperationOffered({ ...OPEN, update: 'conditional' }, 'update', false)).toBe(true);
	});

	test('`denied` no se ofrece… salvo que la sesión salte las reglas (superuser)', () => {
		const closed: TypeAccess = { ...OPEN, create: 'denied' };
		expect(isOperationOffered(closed, 'create', false)).toBe(false);
		expect(isOperationOffered(closed, 'create', true)).toBe(true);
	});
});

describe('resolvePermissions', () => {
	test('un tipo sin `access` conserva EXACTAMENTE el comportamiento previo al lote', () => {
		expect(resolvePermissions(type(), false)).toEqual({
			list: true,
			view: true,
			create: true,
			update: true,
			delete: true
		});
	});

	test('`readonly` (vista del backend) veda las tres escrituras aunque las reglas las permitan', () => {
		expect(resolvePermissions(type({ readonly: true, access: OPEN }), false)).toEqual({
			list: true,
			view: true,
			create: false,
			update: false,
			delete: false
		});
	});

	test('reglas mixtas: cada operación se decide por su propia regla', () => {
		const access: TypeAccess = {
			list: 'allowed',
			view: 'allowed',
			create: 'denied',
			update: 'conditional',
			delete: 'denied'
		};

		expect(resolvePermissions(type({ access }), false)).toEqual({
			list: true,
			view: true,
			create: false,
			update: true, // condicional ⇒ se ofrece; el 403 sigue siendo posible y es honesto
			delete: false
		});
	});

	test('con bypass, un tipo con TODO denegado se ofrece entero (superuser de PB)', () => {
		const access: TypeAccess = {
			list: 'denied',
			view: 'denied',
			create: 'denied',
			update: 'denied',
			delete: 'denied'
		};

		expect(resolvePermissions(type({ access }), true)).toEqual({
			list: true,
			view: true,
			create: true,
			update: true,
			delete: true
		});
		// …pero `readonly` NO lo salta ningún bypass: una vista no admite escrituras ni para un
		// superuser (PocketBase no expone esos endpoints para colecciones `view`).
		expect(resolvePermissions(type({ readonly: true, access }), true)).toMatchObject({
			create: false,
			update: false,
			delete: false
		});
	});
});
