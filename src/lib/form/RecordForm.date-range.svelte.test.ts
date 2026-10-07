/** Un date legado fuera de rango debe llegar al guardado y mostrar el error de Vega. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { resolveContentModel } from '$lib/model/resolve';
import { isoUtcToLocalInput } from './widgets/datetime';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));
Element.prototype.scrollIntoView = vi.fn();

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;
const min = '2024-01-15T10:30:00.000Z';
const max = '2030-12-31T23:00:00.000Z';
const docsType: ContentType = {
	name: 'docs',
	readonly: false,
	fields: [
		{ ...base, name: 'title', type: 'text', subtype: 'plain', presentable: true },
		{ ...base, name: 'happenedAt', type: 'date', min, max }
	] as Field[]
};

let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

afterEach(async () => {
	if (!mounted) return;
	await unmount(mounted.instance);
	mounted.target.remove();
	mounted = null;
});

describe('RecordForm — date fuera del rango del esquema', () => {
	for (const scenario of [
		{
			name: 'anterior al mínimo',
			original: '2023-12-01T10:00:00.000Z',
			edited: '2023-12-02T10:00:00.000Z',
			attribute: 'min',
			error: 'La fecha es demasiado temprana.'
		},
		{
			name: 'posterior al máximo',
			original: '2031-01-01T10:00:00.000Z',
			edited: '2031-01-02T10:00:00.000Z',
			attribute: 'max',
			error: 'La fecha es demasiado tardía.'
		}
	] as const) {
		test(`fecha existente ${scenario.name}: envía el cambio y enseña el error del backend`, async () => {
			const values = { title: 'Documento legado', happenedAt: scenario.original };
			const port = createMemoryBackend({
				users: [{ email: 'a@b.c', password: 'pw' }],
				contentTypes: [docsType],
				records: { docs: [{ id: 'd1', values }] }
			});
			await port.login({ email: 'a@b.c', password: 'pw' });
			const model = resolveContentModel({ types: [docsType], manifestRaw: {} });
			const type = model.types.find((candidate) => candidate.name === 'docs')!;
			const record: VegaRecord = { id: 'd1', type: 'docs', values };
			const onSubmit = vi.fn((input: Record<string, unknown>, options?: unknown) =>
				port.update('docs', 'd1', input as never, options as never)
			);
			const ctx = {
				port,
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
					onSubmit,
					onSaved: vi.fn(),
					onCancel: () => {}
				},
				context: new Map([[VEGA_CONTEXT_KEY, ctx]])
			});
			mounted = { target, instance };
			await tick();

			const input = target.querySelector<HTMLInputElement>(
				'[data-field="happenedAt"] input[type="datetime-local"]'
			)!;
			expect(input.value).toBe(isoUtcToLocalInput(scenario.original));
			expect(input.hasAttribute(scenario.attribute)).toBe(false);
			input.value = isoUtcToLocalInput(scenario.edited);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
			await tick();
			expect(input.hasAttribute(scenario.attribute)).toBe(false);

			target.querySelector<HTMLFormElement>('form.vega-record-form')!.requestSubmit();
			await vi.waitFor(() => {
				expect(onSubmit).toHaveBeenCalledTimes(1);
				expect(
					target.querySelector('[data-field="happenedAt"] .vega-field-error')?.textContent
				).toContain(scenario.error);
			});
			expect((await port.get('docs', 'd1')).values.happenedAt).toBe(scenario.original);
		});
	}
});
