/**
 * Suite de `list-load.ts` (Fase 4c del contrato P4): anti-carrera (`RequestSequencer`), mapeo de
 * error (`normalizeListError`) y fallback de título de fila (`resolveTitleCellText`) — la lógica
 * delicada de `list-state.svelte.ts` extraída a funciones puras testeables sin runas.
 */
import { describe, expect, it } from 'vitest';
import { VegaError } from '$lib/backend/errors';
import { normalizeListError, RequestSequencer, resolveTitleCellText } from './list-load';

describe('RequestSequencer (anti-carrera, L-P4.10)', () => {
	it('la última llamada emitida es "latest"; una anterior deja de serlo', () => {
		const seq = new RequestSequencer();
		const a = seq.next();
		expect(seq.isLatest(a)).toBe(true);

		const b = seq.next();
		expect(seq.isLatest(a)).toBe(false);
		expect(seq.isLatest(b)).toBe(true);
	});

	it('nunca repite un número de secuencia', () => {
		const seq = new RequestSequencer();
		const seen = new Set([seq.next(), seq.next(), seq.next()]);
		expect(seen.size).toBe(3);
	});

	it('una respuesta que llega en orden inverso (b resuelve antes que a) se detecta correctamente', () => {
		// Simula el escenario real: dos `list()` en vuelo, la MÁS RECIENTE (b) resuelve primero.
		const seq = new RequestSequencer();
		const a = seq.next();
		const b = seq.next();
		expect(seq.isLatest(b)).toBe(true); // b (la última pedida) manda: se pinta
		expect(seq.isLatest(a)).toBe(false); // a, aunque resuelva después, se descarta
	});
});

describe('normalizeListError', () => {
	it('un VegaError pasa tal cual (misma instancia, ningún envoltorio)', () => {
		const err = VegaError.notFound();
		expect(normalizeListError(err)).toBe(err);
	});

	it('cualquier otro valor atrapado se envuelve en un VegaError "backend"', () => {
		const err = normalizeListError(new Error('boom'));
		expect(err).toBeInstanceOf(VegaError);
		expect(err.kind).toBe('backend');
	});

	it('un valor no-Error (p.ej. un string lanzado) también se envuelve', () => {
		const err = normalizeListError('algo raro');
		expect(err).toBeInstanceOf(VegaError);
		expect(err.kind).toBe('backend');
	});
});

describe('resolveTitleCellText (fallback de título, L-P4.15)', () => {
	const FALLBACK = '(sin título)';

	it('sin columna título (descriptor null) usa el fallback', () => {
		expect(resolveTitleCellText(null, FALLBACK)).toBe(FALLBACK);
	});

	it('celda vacía usa el fallback', () => {
		expect(resolveTitleCellText({ kind: 'empty' }, FALLBACK)).toBe(FALLBACK);
	});

	it('celda de texto no vacía usa el texto de la celda', () => {
		expect(resolveTitleCellText({ kind: 'text', text: 'Hola' }, FALLBACK)).toBe('Hola');
	});

	it('defensa en profundidad: una variante inesperada (no text/empty) cae al fallback', () => {
		expect(resolveTitleCellText({ kind: 'number', text: '3' }, FALLBACK)).toBe(FALLBACK);
	});
});
