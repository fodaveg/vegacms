/**
 * Suite de `mediaPickerState` (Fase P6·6e, fix de code-review 🟡): la semántica promise-based que
 * el contrato pedía ("open() resuelve al Insertar/Cancelar, cancelar una petición en vuelo") vivía
 * solo documentada en comentarios, sin test — este fichero la afirma.
 *
 * Sin Svelte/componentes: `open`/`settle` son funciones planas sobre un `$state` de módulo, así
 * que no hace falta el proyecto vitest `component` (jsdom + `resolve.conditions:['browser']`) — el
 * proyecto `server` (node) basta, mismo criterio que el resto de `.svelte.ts` sin test dedicado
 * hasta ahora (`toasts.svelte.ts`/`transport-feedback.svelte.ts`).
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { mediaPickerState } from './media-picker-state.svelte';
import type { MediaPickResult } from './media-picker';

// El store es un singleton de MÓDULO (mismo criterio que `toastStore`): se reasienta a `null`
// entre tests para que uno no deje una petición colgada que contamine al siguiente.
beforeEach(() => {
	mediaPickerState.settle(null);
});

function fakeResults(): MediaPickResult[] {
	return [{ file: new File([], 'foto.png'), mediaId: 'media_2', alt: '' }];
}

describe('mediaPickerState.open/settle (patrón promise-based, D-P6.6)', () => {
	test('open() devuelve una Promise que settle(results) resuelve con esos MISMOS results', async () => {
		const promise = mediaPickerState.open({ multiple: false });
		expect(mediaPickerState.request).not.toBeNull();

		const results = fakeResults();
		mediaPickerState.settle(results);

		await expect(promise).resolves.toBe(results);
		expect(mediaPickerState.request).toBeNull();
	});

	test('open() devuelve una Promise que settle(null) resuelve a null (Cancelar/Esc)', async () => {
		const promise = mediaPickerState.open({ multiple: true, accept: ['image/*'] });

		mediaPickerState.settle(null);

		await expect(promise).resolves.toBeNull();
		expect(mediaPickerState.request).toBeNull();
	});

	test('una segunda open() mientras la primera sigue en vuelo CANCELA la primera con null (montaje único, L-P6.11)', async () => {
		const first = mediaPickerState.open({ multiple: false });
		const second = mediaPickerState.open({ multiple: true });

		// La primera se resuelve a `null` SOLO por el efecto de abrir la segunda — nunca se llamó a
		// `settle` explícitamente para ella.
		await expect(first).resolves.toBeNull();

		// La segunda sigue abierta, sin resolver todavía: `request` refleja SUS opciones.
		expect(mediaPickerState.request?.opts).toEqual({ multiple: true });

		const results = fakeResults();
		mediaPickerState.settle(results);
		await expect(second).resolves.toBe(results);
	});

	test('un segundo settle() sobre una petición YA resuelta es un no-op seguro (nunca lanza)', async () => {
		const promise = mediaPickerState.open({ multiple: false });
		const results = fakeResults();
		mediaPickerState.settle(results);
		await expect(promise).resolves.toBe(results);

		// Nada pendiente que resolver: `request` ya es `null`. Llamar a `settle` otra vez (p.ej. un
		// segundo evento de cierre disparado por error) no debe lanzar ni tocar nada.
		expect(() => mediaPickerState.settle(null)).not.toThrow();
		expect(() => mediaPickerState.settle(fakeResults())).not.toThrow();
		expect(mediaPickerState.request).toBeNull();
	});

	test('sin ninguna petición abierta, settle() es un no-op seguro (nunca lanza)', () => {
		expect(mediaPickerState.request).toBeNull();
		expect(() => mediaPickerState.settle(null)).not.toThrow();
	});

	test('fix de code-review (🟡, navegación con el picker abierto): `settle(null)` cancela la petición en vuelo, mismo mecanismo que dispara `afterNavigate` en `+layout.svelte`', async () => {
		// `+layout.svelte` no se monta aquí (sin Svelte/DOM, ver cabecera) — este test aísla el
		// mecanismo que ese `afterNavigate` dispara: `mediaPickerState.settle(null)` en cuanto hay
		// una navegación, sea cual sea el motivo. El widget de origen (si sigue montado) recibe
		// `null` y no añade nada; si ya se desmontó, la resolución no tiene ningún efecto visible
		// (Svelte descarta un `onChange` de un componente desmontado).
		const promise = mediaPickerState.open({ multiple: false });
		expect(mediaPickerState.request).not.toBeNull();

		mediaPickerState.settle(null); // lo que dispara `afterNavigate`

		await expect(promise).resolves.toBeNull();
		expect(mediaPickerState.request).toBeNull();
	});
});
