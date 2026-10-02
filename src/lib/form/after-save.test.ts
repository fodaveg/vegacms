/**
 * Suite de `createAfterSaveRegistry` (lote 12, lámina 5): orden, secuencia, baja y que un gancho
 * que lanza no tumba ni el guardado ni a los demás. Puro, sin Svelte (el `setContext`/`getContext`
 * de al lado solo se ejercita montado, en `FileInput.svelte.test.ts`).
 */
import { describe, expect, test, vi } from 'vitest';
import type { VegaRecord } from '$lib/backend/types';
import { createAfterSaveRegistry } from './after-save';

const saved: VegaRecord = { id: 'r1', type: 'posts', values: {} };

describe('createAfterSaveRegistry', () => {
	test('sin ganchos devuelve una lista vacía', async () => {
		expect(await createAfterSaveRegistry().run(saved)).toEqual([]);
	});

	test('ejecuta los ganchos en orden de alta, uno tras otro, y recoge sus frases', async () => {
		const registry = createAfterSaveRegistry();
		const trace: string[] = [];
		registry.register(async (record) => {
			trace.push(`a:${record.id}`);
			await Promise.resolve();
			trace.push('a:fin');
			return 'Imagen añadida a Medios.';
		});
		registry.register(async () => {
			trace.push('b');
			return undefined;
		});

		const notes = await registry.run(saved);

		expect(trace).toEqual(['a:r1', 'a:fin', 'b']); // `b` no arranca hasta que `a` termina
		expect(notes).toEqual(['Imagen añadida a Medios.']);
	});

	test('la baja saca al gancho: no vuelve a ejecutarse', async () => {
		const registry = createAfterSaveRegistry();
		const hook = vi.fn(async () => 'x');
		const unregister = registry.register(hook);
		unregister();

		expect(await registry.run(saved)).toEqual([]);
		expect(hook).not.toHaveBeenCalled();
	});

	test('un gancho que lanza se salta: el resto corre y `run` nunca rechaza', async () => {
		const registry = createAfterSaveRegistry();
		registry.register(async () => {
			throw new Error('la copia a Medios falló');
		});
		registry.register(async () => 'segundo');

		await expect(registry.run(saved)).resolves.toEqual(['segundo']);
	});

	test('las frases vacías no cuentan', async () => {
		const registry = createAfterSaveRegistry();
		registry.register(async () => '');
		registry.register(async () => undefined);

		expect(await registry.run(saved)).toEqual([]);
	});
});
