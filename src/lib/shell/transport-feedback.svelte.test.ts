/**
 * Tests de `transport-feedback.svelte.ts`: `markDisconnected()`/`markConnected()` mueven la
 * píldora de conexión SIN tocar el banner global (el listado pinta su fallo en contexto, L-P4.4).
 */
import { afterEach, describe, expect, test } from 'vitest';
import { VegaError } from '$lib/backend';
import { transportFeedback } from './transport-feedback.svelte';

afterEach(() => {
	transportFeedback.dismiss();
	transportFeedback.markConnected();
});

describe('transportFeedback.markDisconnected / markConnected', () => {
	test('markDisconnected pone el transporte caído sin abrir el banner', () => {
		transportFeedback.markDisconnected();
		expect(transportFeedback.state).toBe('disconnected');
		expect(transportFeedback.bannerError).toBeNull();
	});

	test('markConnected recupera el estado', () => {
		transportFeedback.markDisconnected();
		transportFeedback.markConnected();
		expect(transportFeedback.state).toBe('connected');
	});

	test('markConnected cierra un banner de RED: la píldora y el banner no se contradicen', () => {
		transportFeedback.report(VegaError.network());
		expect(transportFeedback.state).toBe('disconnected');
		transportFeedback.markConnected();
		expect(transportFeedback.state).toBe('connected');
		expect(transportFeedback.bannerError).toBeNull();
	});

	test('markConnected conserva un banner de backend: el transporte respondió y el aviso sigue vigente', () => {
		const err = VegaError.backend('boom');
		transportFeedback.report(err);
		transportFeedback.markDisconnected();
		transportFeedback.markConnected();
		expect(transportFeedback.bannerError).toBe(err);
	});
});
