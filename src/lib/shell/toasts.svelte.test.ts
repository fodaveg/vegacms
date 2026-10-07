import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { toastStore } from './toasts.svelte';

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	for (const entry of toastStore.entries) toastStore.dismiss(entry.id);
	vi.useRealTimers();
});
describe('acciones de avisos', () => {
	test('el éxito normal sigue siendo efímero y el accionable permanece hasta descartarlo', () => {
		toastStore.push('normal', { kind: 'success' });
		toastStore.push('saved', {
			kind: 'success',
			timeoutMs: 1,
			action: { label: 'Trash', isCurrent: () => true, invoke: vi.fn() }
		});
		vi.advanceTimersByTime(5000);
		expect(toastStore.entries.map((entry) => entry.message)).toEqual(['saved']);
		toastStore.dismiss(toastStore.entries[0].id);
		expect(toastStore.entries).toHaveLength(0);
	});
	test('la acción se consume una sola vez y respeta la vigencia de sesión', () => {
		const invoke = vi.fn();
		toastStore.push('saved', { action: { label: 'Trash', isCurrent: () => true, invoke } });
		const id = toastStore.entries[0].id;
		toastStore.invokeAction(id);
		toastStore.invokeAction(id);
		expect(invoke).toHaveBeenCalledOnce();
		toastStore.push('stale', { action: { label: 'Trash', isCurrent: () => false, invoke } });
		toastStore.invokeAction(toastStore.entries[0].id);
		expect(invoke).toHaveBeenCalledOnce();
		expect(toastStore.entries).toHaveLength(0);
	});
	test('cambiar sesión retira las acciones de la cuenta anterior', () => {
		toastStore.push('action', {
			action: { label: 'Trash', isCurrent: () => true, invoke: vi.fn() }
		});
		toastStore.push('normal');
		toastStore.dismissActions();
		expect(toastStore.entries.map((entry) => entry.message)).toEqual(['normal']);
	});
});
