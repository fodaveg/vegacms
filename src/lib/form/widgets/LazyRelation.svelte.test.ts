import { mount, tick, unmount } from 'svelte';
import { expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY } from '$lib/app-context';
import type { WidgetProps } from './types';
import LazyRelation from './LazyRelation.svelte';
import UnsupportedField from './UnsupportedField.svelte';
const load = vi.hoisted(() => vi.fn());
vi.mock('./relation-loader', () => ({ loadRelationWidget: load }));

test('descarga fallida ofrece reintento y conserva las props del campo al montar', async () => {
	let reject!: (cause: Error) => void;
	load
		.mockImplementationOnce(
			() =>
				new Promise((_resolve, fail) => {
					reject = fail;
				})
		)
		.mockResolvedValueOnce({ default: UnsupportedField });
	const target = document.createElement('div');
	document.body.append(target);
	const props = {
		field: { name: 'author', schema: { name: 'author', type: 'relation' }, label: 'Autor' },
		value: null,
		error: null,
		disabled: false,
		readonly: false,
		onChange: vi.fn()
	} as unknown as WidgetProps;
	const instance = mount(LazyRelation, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, { t: (key: string) => key }]])
	});
	try {
		await vi.waitFor(() => expect(target.textContent).toContain('common.loading'));
		reject(new Error('network'));
		await vi.waitFor(() => expect(target.textContent).toContain('form.relation.loadError'));
		target.querySelector('button')!.click();
		await tick();
		await vi.waitFor(() =>
			expect(target.querySelector('[data-widget="unsupported"]')).not.toBeNull()
		);
		expect(target.textContent).toContain('relation');
		expect(load).toHaveBeenCalledTimes(2);
		expect(props.onChange).not.toHaveBeenCalled();
	} finally {
		await unmount(instance);
		target.remove();
	}
});
