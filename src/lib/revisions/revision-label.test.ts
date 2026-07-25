/**
 * Suite de `revisionDisplayLabel` (`#lote-integridad`, Fase B §10.1/§10.2): `titleField` gana si
 * resuelve a texto no vacío; si no, cae al `label` almacenado (nunca revienta sin `titleField`).
 */

import { describe, expect, test } from 'vitest';
import { revisionAuthorLabel, revisionDateLabel, revisionDisplayLabel } from './revision-label';

describe('revisionDisplayLabel', () => {
	test('titleField resuelve a texto no vacío: gana sobre el label almacenado', () => {
		const label = revisionDisplayLabel('title', {
			values: { title: 'Del titleField' },
			label: 'Del label almacenado'
		});
		expect(label).toBe('Del titleField');
	});

	test('titleField null (o tipo de origen desconocido): cae al label almacenado', () => {
		const label = revisionDisplayLabel(null, {
			values: { title: 'Ignorado' },
			label: 'Del label almacenado'
		});
		expect(label).toBe('Del label almacenado');
	});

	test('titleField apunta a un campo ausente/vacío en esta revisión: cae al label almacenado', () => {
		expect(revisionDisplayLabel('title', { values: {}, label: 'Reserva' })).toBe('Reserva');
		expect(revisionDisplayLabel('title', { values: { title: '' }, label: 'Reserva' })).toBe(
			'Reserva'
		);
		expect(revisionDisplayLabel('title', { values: { title: '   ' }, label: 'Reserva' })).toBe(
			'Reserva'
		);
	});

	test('titleField apunta a un valor no-string (esquema cambiado): cae al label almacenado', () => {
		expect(revisionDisplayLabel('title', { values: { title: 42 }, label: 'Reserva' })).toBe(
			'Reserva'
		);
	});
});

describe('revisionDateLabel', () => {
	test('created null: unknownText', () => {
		expect(revisionDateLabel(null, 'es', 'Fecha desconocida')).toBe('Fecha desconocida');
	});

	test('created inválido (no parsea): unknownText', () => {
		expect(revisionDateLabel('no-es-una-fecha', 'es', 'Fecha desconocida')).toBe(
			'Fecha desconocida'
		);
	});

	test('created ISO válido: fecha formateada con Intl.DateTimeFormat(locale)', () => {
		const result = revisionDateLabel('2026-01-15T10:30:00.000Z', 'es', 'Fecha desconocida');
		expect(result).not.toBe('Fecha desconocida');
		expect(result.length).toBeGreaterThan(0);
	});
});

describe('revisionAuthorLabel', () => {
	test('author no vacío: se devuelve tal cual', () => {
		expect(revisionAuthorLabel('quien@vega.dev', 'alguien')).toBe('quien@vega.dev');
	});

	test('author vacío (sin sesión): unknownText', () => {
		expect(revisionAuthorLabel('', 'alguien')).toBe('alguien');
	});
});
