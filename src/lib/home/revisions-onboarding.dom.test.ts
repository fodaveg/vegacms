import { beforeEach, describe, expect, test, vi } from 'vitest';
import { model, type } from './fixture';
import {
	dismissRevisionsOffer,
	isRevisionsOfferDismissed,
	shouldOfferRevisions
} from './revisions-onboarding';

beforeEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});
describe('oferta de historial por instalación', () => {
	test('solo administradores con historial permitido y colección ausente', () => {
		const missing = model([], { revisions: { enabled: true, keepPerRecord: 20, trashDays: 30 } });
		expect(shouldOfferRevisions(missing, true)).toBe(true);
		expect(shouldOfferRevisions(missing, false)).toBe(false);
		expect(shouldOfferRevisions(model([], { revisions: { enabled: false } }), true)).toBe(false);
		expect(
			shouldOfferRevisions(model([type('vega_revisions')], { revisions: { enabled: true } }), true)
		).toBe(false);
	});
	test('descartar persiste solo en este navegador y esta instalación sin alterar configuración', () => {
		expect(isRevisionsOfferDismissed('site-a')).toBe(false);
		dismissRevisionsOffer('site-a');
		expect(isRevisionsOfferDismissed('site-a')).toBe(true);
		expect(isRevisionsOfferDismissed('site-b')).toBe(false);
		expect(localStorage.length).toBe(1);
	});
	test('almacenamiento bloqueado o sin identidad no rompe Home', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(() => dismissRevisionsOffer('site')).not.toThrow();
		expect(isRevisionsOfferDismissed('site')).toBe(false);
		expect(() => dismissRevisionsOffer(null)).not.toThrow();
		expect(isRevisionsOfferDismissed(null)).toBe(false);
	});
});
