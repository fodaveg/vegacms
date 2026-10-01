/**
 * Reinicio externo del formulario: un widget con texto propio (`Json.svelte`) no puede conservar
 * un JSON inválido tecleado cuando algo de fuera restablece el registro al MISMO valor que ya
 * tenía (descartar cambios, restaurar una revisión idéntica). El widget solo compara la
 * serialización, así que lo remonta `RecordForm` con `{#key resetCount}`.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

const docsType: ContentType = {
	name: 'docs',
	readonly: false,
	fields: [{ ...base, name: 'meta', type: 'json' } as Field]
};

const record: VegaRecord = { id: 'd1', type: 'docs', values: { meta: { a: 1 } } };

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

describe('RecordForm: reinicio externo con el mismo valor', () => {
	test('un JSON inválido tecleado vuelve al serializado y la validez se limpia', async () => {
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
		const props = $state({
			type,
			model: buildFormModel(type, record),
			typeReadonly: false,
			onSubmit: async () => record,
			onSaved: () => {},
			onCancel: () => {}
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const instance = mount(RecordForm, {
			target,
			props,
			context: new Map([[VEGA_CONTEXT_KEY, ctx]])
		});
		mounted = { target, instance };
		await tick();

		const area = () => target.querySelector<HTMLTextAreaElement>('textarea.vega-widget-json')!;
		area().value = '{"a": ';
		area().dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(area().value).toBe('{"a": ');
		expect(area().validity.customError).toBe(true);

		// Algo externo restablece el registro al MISMO valor: modelo nuevo, mismo contenido.
		props.model = buildFormModel(type, { ...record, values: { meta: { a: 1 } } });
		flushSync();
		await tick();

		expect(area().value).toBe('{\n  "a": 1\n}');
		expect(area().validity.customError).toBe(false);
		expect(target.querySelector('.vega-widget-json-error')).toBeNull();
	});
});
