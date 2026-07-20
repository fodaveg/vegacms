/**
 * Tests DOM de `backend-override.ts` (lote L5): toca `localStorage` directamente, así que
 * necesita jsdom real — misma convención `*.dom.test.ts` que `theme/apply.dom.test.ts` (proyecto
 * `dom` de `vite.config.ts`), en vez de vivir junto a `backend-config.test.ts` (proyecto
 * `server`, sin DOM real).
 */

import { beforeEach, describe, expect, test } from 'vitest';
import {
	clearBackendOverride,
	readBackendOverride,
	writeBackendOverride
} from './backend-override';

const KEY = 'vega.backendUrl.v1';

beforeEach(() => {
	localStorage.clear();
});

describe('readBackendOverride', () => {
	test('sin nada guardado → null', () => {
		expect(readBackendOverride()).toBeNull();
	});

	test('lee lo que haya bajo vega.backendUrl.v1', () => {
		localStorage.setItem(KEY, 'https://pb.example.com');
		expect(readBackendOverride()).toBe('https://pb.example.com');
	});
});

describe('writeBackendOverride', () => {
	test('persiste bajo la clave vega.backendUrl.v1', () => {
		writeBackendOverride('https://pb.example.com');
		expect(localStorage.getItem(KEY)).toBe('https://pb.example.com');
	});

	test('una escritura posterior sobrescribe la anterior', () => {
		writeBackendOverride('https://uno.example.com');
		writeBackendOverride('https://dos.example.com');
		expect(readBackendOverride()).toBe('https://dos.example.com');
	});
});

describe('clearBackendOverride', () => {
	test('borra la clave', () => {
		writeBackendOverride('https://pb.example.com');
		clearBackendOverride();
		expect(readBackendOverride()).toBeNull();
	});

	test('sin nada guardado, no lanza', () => {
		expect(() => clearBackendOverride()).not.toThrow();
	});
});
