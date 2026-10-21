/** Tests del guard de salida con cambios sin guardar (`leave-guard.ts`). */
import { describe, expect, test, vi } from 'vitest';
import { guardUnsavedLeave } from './leave-guard';

describe('guardUnsavedLeave', () => {
	test('salir del documento (recarga, cerrar, URL externa): cancela sin llamar a confirm', () => {
		const cancel = vi.fn();
		const confirmLeave = vi.fn(() => true);
		guardUnsavedLeave({ willUnload: true, cancel }, confirmLeave);
		expect(cancel).toHaveBeenCalledOnce();
		expect(confirmLeave).not.toHaveBeenCalled();
	});

	test('navegación interna: pregunta; «no» cancela', () => {
		const cancel = vi.fn();
		guardUnsavedLeave({ willUnload: false, cancel }, () => false);
		expect(cancel).toHaveBeenCalledOnce();
	});

	test('navegación interna: «sí» deja pasar', () => {
		const cancel = vi.fn();
		const confirmLeave = vi.fn(() => true);
		guardUnsavedLeave({ willUnload: false, cancel }, confirmLeave);
		expect(confirmLeave).toHaveBeenCalledOnce();
		expect(cancel).not.toHaveBeenCalled();
	});
});
