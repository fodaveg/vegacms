/**
 * Suite de `createMediaUploadState`: qué pasa con el RESTO de un lote cuando `create()` falla.
 * Lo que se protege (audit 30 sep 2026): al caducar la sesión a mitad de un lote, cada fichero
 * restante se intentaba, fallaba con `auth-expired` y quedaba en `error` — se perdía el lote
 * entero y el aviso de sesión caducada no llegaba al feedback global. Ahora el lote se CORTA: los
 * no empezados (y el que estaba en vuelo, que el servidor rechazó sin guardar) quedan `pending`,
 * reintentables tras reentrar, y el error va a `ctx.feedback.reportError`.
 *
 * Sin componentes: `.svelte.ts` plano, proyecto vitest `server` (mismo criterio que
 * `media-picker-state.test.ts`).
 */
import { describe, expect, test, vi } from 'vitest';
import { VegaError } from '$lib/backend/errors';
import type { VegaAppContext } from '$lib/app-context';
import { createMediaUploadState } from './media-upload-state.svelte';
import type { MediaFileFieldSchema } from './media-upload';

const schema = { maxSizeBytes: 1_000_000, mimeTypes: [] } as unknown as MediaFileFieldSchema;

function fakeCtx(create: (collection: string, input: unknown) => Promise<unknown>) {
	const reportError = vi.fn();
	const ctx = {
		port: { create },
		t: (key: string) => key,
		feedback: { toast: vi.fn(), reportError }
	} as unknown as VegaAppContext;
	return { ctx, reportError };
}

const files = (n: number): File[] =>
	Array.from({ length: n }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));

describe('createMediaUploadState — sesión caducada a mitad de lote', () => {
	test('corta el lote: no intenta el resto, queda pending (no error) y avisa al feedback global', async () => {
		const expired = VegaError.authExpired('sesión caducada');
		const create = vi
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(expired)
			.mockResolvedValue({});
		const { ctx, reportError } = fakeCtx(create);
		const state = createMediaUploadState();
		const onSummary = vi.fn();

		await state.start(ctx, schema, files(4), () => {}, onSummary);

		// El 3.º y el 4.º no se intentaron: ni una llamada más tras el rechazo.
		expect(create).toHaveBeenCalledTimes(2);
		expect(state.items.map((i) => i.status.kind)).toEqual([
			'done',
			'pending',
			'pending',
			'pending'
		]);
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError).toHaveBeenCalledWith(expired, expect.anything());
		expect(state.running).toBe(false);
		expect(onSummary).toHaveBeenCalledWith({ uploaded: 1, failed: 0, pending: 3 });
	});

	test('un fallo normal de un fichero sigue sin cortar el lote', async () => {
		const create = vi.fn().mockRejectedValueOnce(VegaError.backend('boom')).mockResolvedValue({});
		const { ctx, reportError } = fakeCtx(create);
		const state = createMediaUploadState();
		const onSummary = vi.fn();

		await state.start(ctx, schema, files(2), () => {}, onSummary);

		expect(state.items.map((i) => i.status.kind)).toEqual(['error', 'done']);
		expect(reportError).not.toHaveBeenCalled();
		expect(onSummary).toHaveBeenCalledWith({ uploaded: 1, failed: 1, pending: 0 });
	});
});
