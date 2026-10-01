/** Tests de la etiqueta del atajo de guardar según la plataforma. */
import { describe, expect, test } from 'vitest';
import { isApplePlatform, saveShortcutLabel } from './save-shortcut';

describe('saveShortcutLabel', () => {
	test.each(['MacIntel', 'macOS', 'iPhone', 'iPad'])('%s → ⌘S', (platform) => {
		expect(isApplePlatform(platform)).toBe(true);
		expect(saveShortcutLabel(platform)).toBe('⌘S');
	});

	test.each(['Win32', 'Windows', 'Linux x86_64', 'Android', ''])('%s → Ctrl S', (platform) => {
		expect(isApplePlatform(platform)).toBe(false);
		expect(saveShortcutLabel(platform)).toBe('Ctrl S');
	});
});
