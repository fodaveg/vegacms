/**
 * El escaparate (`SHOWCASE_SEED`) por el sitio donde se ve: `RecordForm` montado sobre el adaptador
 * `memory` con la semilla y su manifiesto, resueltos con `loadContentModel` como en la app. Mide
 * los rótulos que el manifiesto del escaparate da a los campos de `paginas`, que sin él salen con
 * la humanización inglesa del nombre técnico («Publish at»).
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import RecordForm from '$lib/form/RecordForm.svelte';
import { buildFormModel } from '$lib/form/form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { loadContentModel } from '$lib/model/load';
import { t as translate } from '$lib/i18n';
import { DEMO_CREDENTIALS, SHOWCASE_SEED } from './demo-seed';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
	await cleanup?.();
	cleanup = null;
});

test('el formulario de una página del escaparate rotula «Publicar el», no «Publish at»', async () => {
	// Sin `files`: su getter pinta los bitmaps del escaparate con `<canvas>`, que jsdom no tiene, y
	// aquí no se mira ninguna imagen.
	const { users, contentTypes, records, scheduledPublishing } = SHOWCASE_SEED;
	const port = createMemoryBackend({ users, contentTypes, records, scheduledPublishing });
	await port.login(DEMO_CREDENTIALS);
	const model = await loadContentModel(port);
	const type = model.types.find((candidate) => candidate.name === 'paginas')!;
	expect(type.publishAtField).toBe('publishAt');
	const record = await port.get('paginas', 'pagina_2');
	const ctx = {
		port,
		model,
		session: { token: 't', user: { id: 'u', email: DEMO_CREDENTIALS.email } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		registerExitGuard: () => () => {},
		reloadModel: async () => {}
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(RecordForm, {
		target,
		props: {
			type,
			model: buildFormModel(type, record),
			typeReadonly: false,
			onSubmit: async () => record,
			onSaved: () => {},
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	cleanup = async () => {
		await unmount(instance);
		target.remove();
	};
	flushSync();
	await tick();

	const label = target.querySelector('[data-field="publishAt"] label');
	expect(label?.textContent?.trim()).toBe('Publicar el');
});
