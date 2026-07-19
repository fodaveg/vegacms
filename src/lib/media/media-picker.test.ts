/**
 * Suite de `media-picker.ts` (Fase P6·6e): `matchesAccept` (filtrado cliente por `accept`, audit
 * H1) y el invariante L-P6.8 (el picker entrega/el widget fusiona SOLO `File`, nunca `mediaId` ni
 * un `FileRef` ajeno en el valor persistible).
 */
import { describe, expect, test } from 'vitest';
import { matchesAccept } from './media-picker';
import { addFilesToMultiple, setSingleFile } from '$lib/form/widgets/file-value';
import { validateFileFieldInput } from '$lib/backend/file-guards';
import type { Field } from '$lib/backend/types';

describe('matchesAccept (filtrado client-side, audit H1: el mime no es consultable)', () => {
	test('sin `accept` (undefined/vacío) → todo pasa', () => {
		expect(matchesAccept('manual.pdf', undefined)).toBe(true);
		expect(matchesAccept('manual.pdf', [])).toBe(true);
	});

	test('`accept` con comodín "image/*" → solo extensiones de imagen conocidas', () => {
		expect(matchesAccept('foto.png', ['image/*'])).toBe(true);
		expect(matchesAccept('foto.JPEG', ['image/*'])).toBe(true); // mayúsculas: normaliza
		expect(matchesAccept('manual.pdf', ['image/*'])).toBe(false);
	});

	test('`accept` con mime exacto → coincidencia exacta, no de familia', () => {
		expect(matchesAccept('foto.png', ['image/png'])).toBe(true);
		expect(matchesAccept('foto.webp', ['image/png'])).toBe(false);
	});

	test('extensión desconocida (fuera de la tabla) con `accept` restrictivo → excluida (conservador)', () => {
		expect(matchesAccept('datos.xyz', ['image/*'])).toBe(false);
	});

	test('varios patrones en `accept`: basta con que uno coincida', () => {
		expect(matchesAccept('manual.pdf', ['image/*', 'application/pdf'])).toBe(true);
	});
});

describe('invariante L-P6.8: el picker entrega File, el valor persistible nunca lleva mediaId/FileRef ajeno', () => {
	// Campo `file` múltiple, mismo esquema mínimo que usa `file-value.test.ts`.
	const fileField: Extract<Field, { type: 'file' }> = {
		name: 'attachments',
		type: 'file',
		multiple: true,
		protected: false,
		required: false,
		readonly: false,
		presentable: false,
		hidden: false,
		unique: false
	};

	function fakeFile(name: string): File {
		return new File([new Uint8Array(4)], name, { type: 'image/png' });
	}

	test('un MediaPickResult simulado fusionado en el widget produce SOLO `File` en el value, nunca el mediaId', () => {
		// Simula lo que `FileInput.applyNewFiles` recibe de `ctx.mediaPicker.open(...)`: un
		// `MediaPickResult[]` del que SOLO se usa `.file` (mediaId/alt nunca cruzan a `onChange`,
		// ver `FileInput.svelte`/`MediaPicker.svelte`).
		const pickResults = [
			{ file: fakeFile('seed_media_photo1.png'), mediaId: 'media_2', alt: 'Atardecer' },
			{ file: fakeFile('seed_media_photo2.png'), mediaId: 'media_3', alt: '' }
		];

		const outcome = addFilesToMultiple(
			fileField,
			[],
			pickResults.map((r) => r.file)
		);

		expect(outcome.rejections).toEqual([]);
		// El value resultante es EXCLUSIVAMENTE `File` — ninguna cadena (`FileRef`) ni el `mediaId`
		// de origen aparece en ningún elemento.
		for (const item of outcome.value) {
			expect(item).toBeInstanceOf(File);
		}
		expect(outcome.value).not.toContain('media_2');
		expect(outcome.value).not.toContain('media_3');

		// El backend re-valida (`file-guards.ts`, §9.9): con `existing` VACÍO (nada conservado
		// todavía), el value producido pasa sin ningún `foreignFileRef` — precisamente porque son
		// `File` nuevos, nunca cadenas ajenas. Si el picker (por error) hubiera colado el `FileRef`
		// del asset de origen como STRING, esta misma llamada lo habría rechazado.
		const error = validateFileFieldInput(fileField, undefined, outcome.value);
		expect(error).toBeNull();
	});

	test('campo single: setSingleFile con el `File` del picker nunca deja pasar el mediaId', () => {
		const singleField: Extract<Field, { type: 'file' }> = { ...fileField, multiple: false };
		const pickResult = { file: fakeFile('seed_media_photo1.png'), mediaId: 'media_2', alt: '' };

		const outcome = setSingleFile(singleField, null, pickResult.file);

		expect(outcome.rejections).toEqual([]);
		expect(outcome.value).toBeInstanceOf(File);
		expect(outcome.value).not.toBe('media_2');

		const error = validateFileFieldInput(singleField, undefined, outcome.value);
		expect(error).toBeNull();
	});

	test('si un `FileRef` ajeno SÍ colara (bug hipotético), `file-guards.ts` lo rechaza — confirma que la barrera existe', () => {
		// Contraste deliberado: demuestra que el camino "colar un `FileRef` de biblioteca a pelo"
		// SÍ está cazado por `file-guards.ts` (la razón de que el picker esté diseñado para nunca
		// alcanzarlo, ver cabecera de `media-picker.ts`).
		const error = validateFileFieldInput(fileField, undefined, ['seed_media_photo1.png']);
		expect(error?.code).toBe('vega_foreign_file_ref');
	});
});
