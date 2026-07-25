/**
 * Suite del heurístico de etiqueta (`#lote-integridad`, Fase B §1): `title` > `name` > id — ver
 * la cabecera del módulo para por qué NO resuelve `titleField` (P3 no tiene `ContentModel`).
 */

import { describe, expect, test } from 'vitest';
import { guessRecordLabel } from './record-label';

describe('guessRecordLabel', () => {
	test('prefiere "title" cuando es un texto no vacío', () => {
		expect(guessRecordLabel({ title: 'Mi entrada', name: 'otra' }, 'rec1')).toBe('Mi entrada');
	});

	test('cae a "name" si "title" está ausente/vacío', () => {
		expect(guessRecordLabel({ title: '', name: 'Autor X' }, 'rec1')).toBe('Autor X');
		expect(guessRecordLabel({ name: 'Autor X' }, 'rec1')).toBe('Autor X');
	});

	test('sin title/name utilizables: cae al id', () => {
		expect(guessRecordLabel({}, 'rec1')).toBe('rec1');
		expect(guessRecordLabel({ title: 42, name: null }, 'rec1')).toBe('rec1');
	});

	test('title en blanco (solo espacios) se trata como vacío', () => {
		expect(guessRecordLabel({ title: '   ', name: 'Autor X' }, 'rec1')).toBe('Autor X');
	});
});
