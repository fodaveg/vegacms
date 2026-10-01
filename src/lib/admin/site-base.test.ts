import { describe, expect, test } from 'vitest';
import { t as translate } from '$lib/i18n';
import {
	buildPlanView,
	describeDivergence,
	divergencesText,
	invitationLinkNote,
	joinList,
	siteBaseKind,
	summarizeResult
} from './site-base';

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

describe('site-base', () => {
	test('joinList une con coma y «y»', () => {
		expect(joinList(t, [])).toBe('');
		expect(joinList(t, ['A'])).toBe('A');
		expect(joinList(t, ['A', 'B'])).toBe('A y B');
		expect(joinList(t, ['A', 'B', 'C'])).toBe('A, B y C');
	});

	test('describeDivergence deduce la frase en llano y conserva el literal', () => {
		const field = describeDivergence(
			{ piece: 'campo "pages.status"', expected: '{a}', actual: '{b}' },
			t
		);
		expect(field.title).toBe('El campo «status» de Páginas');
		expect(field.detail).toBe('campo "pages.status": encontró {b}; esperaba {a}');

		const edited = describeDivergence(
			{
				piece: 'registro "vega/default"',
				expected: 'manifiesto inicial exacto',
				actual: 'manifiesto distinto ({})'
			},
			t
		);
		expect(edited.body).toContain('Se ha editado a mano');

		const unknown = describeDivergence({ piece: 'algo raro', expected: 'x', actual: 'y' }, t);
		expect(unknown.title).toBe('algo raro');
	});

	test('divergencesText junta los literales, uno por línea', () => {
		expect(
			divergencesText([
				{ piece: 'a', expected: '1', actual: '2' },
				{ piece: 'b', expected: '3', actual: '4' }
			])
		).toBe('a: encontró 2; esperaba 1\nb: encontró 4; esperaba 3');
	});

	test('el plan lista las constricciones de redirects y las cuenta como «Se añade»', () => {
		const view = buildPlanView(
			{
				createdCollections: [],
				addedFields: {},
				constrainedFields: { redirects: ['from', 'to'] },
				manifest: 'keep',
				pageMissing: false,
				upToDate: false
			},
			t
		);
		const add = view.groups.find((group) => group.id === 'add')!;
		expect(add.items.map((item) => item.title)).toContain('Formato de las rutas en Redirecciones');
		expect(add.items.find((item) => item.code === 'from, to')).toBeDefined();
	});

	test('siteBaseKind: aborto, sin preparar, actualización y al día', () => {
		const base = {
			addedFields: {},
			manifest: 'keep' as const,
			pageMissing: false
		};
		expect(siteBaseKind({ status: 'blocked', divergences: [] })).toBe('blocked');
		expect(
			siteBaseKind({
				status: 'ready',
				plan: { ...base, createdCollections: ['pages'], upToDate: false }
			})
		).toBe('unprepared');
		expect(
			siteBaseKind({
				status: 'ready',
				plan: { ...base, createdCollections: [], manifest: 'upgrade', upToDate: false }
			})
		).toBe('update');
		expect(
			siteBaseKind({ status: 'ready', plan: { ...base, createdCollections: [], upToDate: true } })
		).toBe('current');
	});

	test('el resumen cuenta el resultado y el enlace ajeno es una nota, no un error', () => {
		const result = {
			createdCollections: ['pages'],
			addedFields: { vega_media: ['focal'] },
			createdRecords: ['manifest' as const, 'page:/' as const],
			upgradedRecords: [],
			invitationLink: 'foreign-origin' as const
		};
		expect(summarizeResult(result, t)).toBe(
			'Hecho: 1 colección, los campos nuevos de Medios, el modelo de contenido y la página «Inicio», que queda en borrador.'
		);
		expect(invitationLinkNote(result, t)).toContain('sigue llevando al panel de PocketBase');
		expect(invitationLinkNote({ ...result, invitationLink: 'updated' }, t)).toBeNull();
		expect(
			summarizeResult(
				{ createdCollections: [], addedFields: {}, createdRecords: [], upgradedRecords: [] },
				t
			)
		).toContain('Todo estaba ya en su sitio');
	});
});
