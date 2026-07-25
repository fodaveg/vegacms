/**
 * Suite de los selectores PUROS de poda (`#lote-integridad`, Fase B §7): `selectUpdateRevisionsToPrune`
 * (por registro) y `selectTrashRevisionsToPrune` (global, techo por pasada). Ninguno de los dos
 * toca un `BackendPort` — eso es cosa de `with-revisions.ts` (`pruneUpdateRevisions`).
 */

import { describe, expect, test } from 'vitest';
import {
	DEFAULT_KEEP_PER_RECORD,
	DEFAULT_TRASH_RETENTION_DAYS,
	TRASH_PRUNE_BATCH_LIMIT,
	selectTrashRevisionsToPrune,
	selectUpdateRevisionsToPrune,
	type RevisionPruneCandidate
} from './retention';

describe('constantes con nombre (§7)', () => {
	test('defaults documentados', () => {
		expect(DEFAULT_KEEP_PER_RECORD).toBe(20);
		expect(DEFAULT_TRASH_RETENTION_DAYS).toBe(30);
		expect(TRASH_PRUNE_BATCH_LIMIT).toBe(50);
	});
});

function candidate(id: string, kind: 'update' | 'delete', created: string): RevisionPruneCandidate {
	return { id, kind, created };
}

describe('selectUpdateRevisionsToPrune', () => {
	test('conserva las N más recientes por created desc, poda el resto', () => {
		const revisions = [
			candidate('r1', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('r2', 'update', '2026-01-02T00:00:00.000Z'),
			candidate('r3', 'update', '2026-01-03T00:00:00.000Z'),
			candidate('r4', 'update', '2026-01-04T00:00:00.000Z')
		];
		// keepPerRecord=2: conserva r4/r3 (más recientes), poda r2/r1.
		expect(selectUpdateRevisionsToPrune(revisions, 2).sort()).toEqual(['r1', 'r2']);
	});

	test('menos revisiones que keepPerRecord: no poda nada', () => {
		const revisions = [candidate('r1', 'update', '2026-01-01T00:00:00.000Z')];
		expect(selectUpdateRevisionsToPrune(revisions, 20)).toEqual([]);
	});

	test('keepPerRecord 0: poda TODAS las de kind update (caso límite válido)', () => {
		const revisions = [
			candidate('r1', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('r2', 'update', '2026-01-02T00:00:00.000Z')
		];
		expect(selectUpdateRevisionsToPrune(revisions, 0).sort()).toEqual(['r1', 'r2']);
	});

	test('ignora entradas kind:delete mezcladas en la misma lista', () => {
		const revisions = [
			candidate('u1', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('u2', 'update', '2026-01-02T00:00:00.000Z'),
			candidate('d1', 'delete', '2026-01-03T00:00:00.000Z')
		];
		expect(selectUpdateRevisionsToPrune(revisions, 1)).toEqual(['u1']);
	});

	test('no muta el array de entrada', () => {
		const revisions = [
			candidate('r1', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('r2', 'update', '2026-01-02T00:00:00.000Z')
		];
		const copy = [...revisions];
		selectUpdateRevisionsToPrune(revisions, 0);
		expect(revisions).toEqual(copy);
	});

	// ————— Casos límite (fix de code-review: la función BORRA, su comportamiento no estaba fijado) —————

	test('created vacío: se trata como la MÁS ANTIGUA — nunca "más reciente" por accidente', () => {
		const revisions = [
			candidate('sin-fecha', 'update', ''),
			candidate('r1', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('r2', 'update', '2026-01-02T00:00:00.000Z')
		];
		// keepPerRecord=2: conserva las dos con fecha real, poda la de `created` vacío PRIMERO.
		expect(selectUpdateRevisionsToPrune(revisions, 2)).toEqual(['sin-fecha']);
	});

	test('varias con created vacío: se podan todas antes que ninguna con fecha real', () => {
		const revisions = [
			candidate('sin-fecha-1', 'update', ''),
			candidate('sin-fecha-2', 'update', ''),
			candidate('r1', 'update', '2026-01-01T00:00:00.000Z')
		];
		expect(selectUpdateRevisionsToPrune(revisions, 1).sort()).toEqual([
			'sin-fecha-1',
			'sin-fecha-2'
		]);
	});

	test('empates en created: orden ESTABLE respecto al orden de entrada (nunca aleatorio)', () => {
		const revisions = [
			candidate('a', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('b', 'update', '2026-01-01T00:00:00.000Z'),
			candidate('c', 'update', '2026-01-01T00:00:00.000Z')
		];
		// keepPerRecord=1: conserva la PRIMERA del empate (orden de entrada), poda el resto —
		// determinista mientras el array de entrada no cambie de orden.
		expect(selectUpdateRevisionsToPrune(revisions, 1)).toEqual(['b', 'c']);
	});
});

describe('selectTrashRevisionsToPrune', () => {
	const NOW = new Date('2026-07-25T00:00:00.000Z').getTime();

	test('poda entradas delete más antiguas que trashDays, conserva las recientes', () => {
		const revisions = [
			candidate('old', 'delete', '2026-01-01T00:00:00.000Z'), // muy viejo, cae
			candidate('recent', 'delete', '2026-07-20T00:00:00.000Z') // hace 5 días, se queda
		];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW)).toEqual(['old']);
	});

	test('ignora entradas kind:update', () => {
		const revisions = [candidate('u1', 'update', '2020-01-01T00:00:00.000Z')];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW)).toEqual([]);
	});

	test('techo por pasada (TRASH_PRUNE_BATCH_LIMIT / limit explícito)', () => {
		const revisions: RevisionPruneCandidate[] = Array.from({ length: 10 }, (_, i) =>
			candidate(`old-${i}`, 'delete', '2020-01-01T00:00:00.000Z')
		);
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW, 3)).toHaveLength(3);
	});

	test('exactamente en el borde de trashDays: se conserva (estrictamente ANTERIOR al corte)', () => {
		const cutoffIso = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
		const revisions = [candidate('edge', 'delete', cutoffIso)];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW)).toEqual([]);
	});

	// ————— Casos límite (fix de code-review: la función BORRA, su comportamiento no estaba fijado) —————

	test('created vacío: NUNCA se poda (fail-safe — una fecha inválida no es "muy vieja")', () => {
		const revisions = [candidate('sin-fecha', 'delete', '')];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW)).toEqual([]);
	});

	test('created vacío mezclado con entradas realmente vencidas: solo caen las que sí tienen fecha', () => {
		const revisions = [
			candidate('sin-fecha', 'delete', ''),
			candidate('vencida', 'delete', '2020-01-01T00:00:00.000Z')
		];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW)).toEqual(['vencida']);
	});

	test('empates en created: ambas caen sin importar el orden de entrada', () => {
		const revisions = [
			candidate('a', 'delete', '2020-01-01T00:00:00.000Z'),
			candidate('b', 'delete', '2020-01-01T00:00:00.000Z')
		];
		expect(selectTrashRevisionsToPrune(revisions, 30, NOW).sort()).toEqual(['a', 'b']);
	});
});
