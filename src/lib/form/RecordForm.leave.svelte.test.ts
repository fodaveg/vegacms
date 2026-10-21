/**
 * Guard de salida del formulario con cambios sin guardar (QA de fodaveg, 21 oct 2026): recargar la
 * página dejaba en consola «Blocked confirm('Hay cambios sin guardar…') during beforeunload»,
 * porque `beforeNavigate` preguntaba con `window.confirm` también cuando la navegación salía del
 * documento. Salir solo cancela (SvelteKit pinta el diálogo nativo); una navegación interna
 * pregunta como siempre. El callback de `beforeNavigate` se captura del mock de SvelteKit.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { fieldIds } from './field-ids';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

type Guard = (navigation: { willUnload: boolean; cancel: () => void }) => void;
const navigation = vi.hoisted(() => ({ guards: [] as Guard[] }));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (guard: Guard) => void navigation.guards.push(guard)
}));

const docsType: ContentType = {
	name: 'docs',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		} as Field
	]
};

const record: VegaRecord = { id: 'd1', type: 'docs', values: { title: 'Hola' } };

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	navigation.guards = [];
	vi.restoreAllMocks();
});

async function mountDirtyForm(): Promise<Guard> {
	const model = resolveContentModel({ types: [docsType], manifestRaw: {} });
	const type = model.types.find((t) => t.name === 'docs')!;
	const ctx = {
		port: {},
		model,
		session: { token: 't', user: { id: 'u', email: 'a@b.c' } },
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
			onSubmit: vi.fn(async () => record),
			onSaved: () => {},
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	mounted = { target, instance };
	await tick();
	const title = target.querySelector<HTMLInputElement>(`#${fieldIds('title').inputId}`)!;
	title.value = 'Hola, sin guardar';
	title.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	expect(navigation.guards).toHaveLength(1);
	return navigation.guards[0];
}

describe('RecordForm: salir con cambios sin guardar', () => {
	test('recargar o cerrar: cancela para el diálogo nativo, sin window.confirm', async () => {
		const guard = await mountDirtyForm();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const cancel = vi.fn();
		guard({ willUnload: true, cancel });
		expect(cancel).toHaveBeenCalledOnce();
		expect(confirm).not.toHaveBeenCalled();
	});

	test('navegación interna: pregunta, y «no» se queda', async () => {
		const guard = await mountDirtyForm();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const cancel = vi.fn();
		guard({ willUnload: false, cancel });
		expect(confirm).toHaveBeenCalledWith('Hay cambios sin guardar. ¿Salir de todos modos?');
		expect(cancel).toHaveBeenCalledOnce();
	});
});
