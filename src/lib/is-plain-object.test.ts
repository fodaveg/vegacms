import { describe, expect, it } from 'vitest';
import { isPlainObject } from './is-plain-object';

class Foo {}

describe('isPlainObject', () => {
	it.each<[string, unknown, boolean]>([
		['null', null, false],
		['undefined', undefined, false],
		['array vacío', [], false],
		['array con datos', [1], false],
		['string', 's', false],
		['número', 1, false],
		['booleano', true, false],
		['función', () => 1, false],
		['{}', {}, true],
		['objeto con claves', { a: 1 }, true],
		['prototipo null', Object.create(null), true],
		// Sin distinguir por prototipo (comportamiento heredado de las cuatro copias).
		['Date', new Date(), true],
		['instancia de clase', new Foo(), true],
		['Map', new Map(), true],
		['Set', new Set(), true],
		['RegExp', /re/, true]
	])('%s -> %s', (_name, value, expected) => {
		expect(isPlainObject(value)).toBe(expected);
	});
});
