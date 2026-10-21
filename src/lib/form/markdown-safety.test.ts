import { describe, expect, test } from 'vitest';
import {
	changedMarkdownFields,
	MARKDOWN_UNSAFE_CODE,
	markdownSafetyErrors
} from './markdown-safety';
import { t as translate } from '$lib/i18n';

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

/** El cuerpo real de «Sobre mí» en fodaveg: Markdown con el botón heredado en HTML. */
const LEGACY = 'Puedes contactarme aquí:\n<a href="/contacto" class="btn">Contacto</a>\n';

const fields = [
	{ name: 'bodyEs', widget: 'markdown' as const },
	{ name: 'notes', widget: 'textarea' as const }
];

describe('changedMarkdownFields', () => {
	test('solo los campos markdown cambiados y con texto', () => {
		expect(
			changedMarkdownFields(
				fields,
				{ bodyEs: LEGACY, notes: '<b>x</b>' },
				{ bodyEs: LEGACY, notes: '<b>y</b>' }
			)
		).toEqual([]);
		expect(changedMarkdownFields(fields, { bodyEs: LEGACY, notes: '' }, { bodyEs: '' })).toEqual(
			[]
		);
		expect(
			changedMarkdownFields(fields, { bodyEs: LEGACY, notes: '' }, { bodyEs: `${LEGACY} más` })
		).toEqual(['bodyEs']);
	});
});

describe('markdownSafetyErrors: la regla de guardado de un campo markdown', () => {
	test('un texto heredado con HTML que nadie toca no impide guardar los demás campos', async () => {
		const errors = await markdownSafetyErrors(
			fields,
			{ bodyEs: LEGACY, notes: '' },
			{ bodyEs: LEGACY, notes: 'otra cosa' },
			t
		);
		expect(errors).toEqual({});
	});

	test('sin campo markdown cambiado responde en el acto, sin promesa: el guardado no espera', () => {
		const errors = markdownSafetyErrors(
			fields,
			{ bodyEs: LEGACY, notes: '' },
			{ bodyEs: LEGACY, notes: 'otra cosa' },
			t
		);
		expect(errors).not.toBeInstanceOf(Promise);
		expect(errors).toEqual({});
		expect(
			markdownSafetyErrors(fields, { bodyEs: LEGACY }, { bodyEs: `${LEGACY} más` }, t)
		).toBeInstanceOf(Promise);
	});

	test('cambiarlo y dejar el HTML lo rechaza, con el fragmento', async () => {
		const errors = await markdownSafetyErrors(
			fields,
			{ bodyEs: LEGACY },
			{ bodyEs: `${LEGACY}\nY algo más.` },
			t
		);
		expect(errors.bodyEs).toMatchObject({ code: MARKDOWN_UNSAFE_CODE, known: false });
		expect(errors.bodyEs.message).toContain('No se puede guardar');
		expect(errors.bodyEs.message).toContain('<a href="/contacto" class="btn">');
	});

	test('un destino peligroso también; un enlace Markdown relativo no', async () => {
		const unsafe = await markdownSafetyErrors(
			fields,
			{ bodyEs: '' },
			{ bodyEs: '[x](javascript:alert(1))' },
			t
		);
		expect(Object.keys(unsafe)).toEqual(['bodyEs']);
		const safe = await markdownSafetyErrors(
			fields,
			{ bodyEs: LEGACY },
			{ bodyEs: 'Puedes contactarme aquí: [Contacto](/contacto)' },
			t
		);
		expect(safe).toEqual({});
	});

	test('el HTML dentro de código es código, no HTML', async () => {
		const errors = await markdownSafetyErrors(
			fields,
			{ bodyEs: '' },
			{ bodyEs: 'Usa `<div>` así:\n\n```html\n<a class="btn">x</a>\n```\n' },
			t
		);
		expect(errors).toEqual({});
	});
});
