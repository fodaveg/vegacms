import { describe, expect, test } from 'vitest';
import {
	scheduledPublishingFromCrons,
	scheduledPublishingFromSnapshot,
	withServerFeatures
} from './scheduled-publishing';
import type { ContentType } from './types';

/** `GET /api/crons` de un PocketBase 0.39.6 OFICIAL con superusuario (medido el 24 sep 2026). */
const STOCK_POCKETBASE_CRONS = [
	{ id: '__pbDBOptimize__', expression: '0 0 * * *' },
	{ id: '__pbMFACleanup__', expression: '0 * * * *' },
	{ id: '__pbOTPCleanup__', expression: '0 * * * *' },
	{ id: '__pbLogsCleanup__', expression: '0 */6 * * *' }
];

const vega: ContentType = { name: 'vega', readonly: false, fields: [] };
const pages: ContentType = { name: 'pages', readonly: false, fields: [] };

describe('scheduledPublishingFromCrons', () => {
	test('el binario oficial no tiene el job: inactive', () => {
		expect(scheduledPublishingFromCrons(STOCK_POCKETBASE_CRONS)).toBe('inactive');
	});

	test('con el job de vegaschedule registrado: active', () => {
		expect(
			scheduledPublishingFromCrons([
				...STOCK_POCKETBASE_CRONS,
				{ id: 'vegaschedule', expression: '* * * * *' }
			])
		).toBe('active');
	});

	test('una respuesta que no es la lista esperada no se lee como «no está»: unknown', () => {
		for (const raw of [null, undefined, {}, 'crons', { items: STOCK_POCKETBASE_CRONS }]) {
			expect(scheduledPublishingFromCrons(raw), JSON.stringify(raw)).toBe('unknown');
		}
	});
});

describe('withServerFeatures / scheduledPublishingFromSnapshot', () => {
	test('anota solo la entrada vega, sin mutar el esquema, y el editor lo lee de vuelta', () => {
		const types = [pages, vega];
		for (const state of ['active', 'inactive'] as const) {
			const snapshot = withServerFeatures(types, state);
			expect(snapshot[0]).toBe(pages);
			expect(snapshot[1].serverFeatures).toEqual({ scheduledPublishing: state === 'active' });
			expect(scheduledPublishingFromSnapshot(snapshot)).toBe(state);
		}
		expect(vega).not.toHaveProperty('serverFeatures');
	});

	test('unknown no anota y además QUITA un dato viejo: no se presenta como bueno', () => {
		const stale = withServerFeatures([vega], 'active');
		const snapshot = withServerFeatures(stale, 'unknown');
		expect(snapshot[0]).not.toHaveProperty('serverFeatures');
		expect(scheduledPublishingFromSnapshot(snapshot)).toBe('unknown');
	});

	test('un snapshot anterior a esta comprobación (sin serverFeatures) es unknown', () => {
		expect(scheduledPublishingFromSnapshot([pages, vega])).toBe('unknown');
		expect(scheduledPublishingFromSnapshot([pages])).toBe('unknown');
	});
});
