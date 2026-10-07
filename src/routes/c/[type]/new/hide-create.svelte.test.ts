/** La entrada directa a `/new` explica hideCreate sin montar un formulario ni escribir. */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { resolveContentModel } from '$lib/model/resolve';
import { resolveSingletonTarget } from '$lib/nav/singleton';
import { t as translate } from '$lib/i18n';
import type { ContentType } from '$lib/backend/types';

vi.mock('$app/state', () => ({ page: { params: { type: 'notes' } } }));
import NewPage from './+page.svelte';

const notes: ContentType = { name: 'notes', readonly: false, fields: [] };
let mounted: { instance: Record<string, never>; target: HTMLElement } | null = null;
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
});

function mountPage(locale: 'es' | 'en', schema = notes, singleton = false) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const type = resolveContentModel({
		types: [schema],
		manifestRaw: { schemaVersion: 1, collections: { notes: { hideCreate: true, singleton } } },
		accessBypass: false
	}).types[0]!;
	const create = vi.fn();
	const toList = vi.fn();
	const ctx = {
		locale,
		t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
		model: { types: [type] },
		port: { create },
		nav: { toList }
	} as unknown as VegaAppContext;
	const instance = mount(NewPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	mounted = { instance, target };
	return { target, type, create, toList };
}

describe('/new con altas manuales ocultas', () => {
	test.each(['es', 'en'] as const)('motivo honesto en %s y vuelta al listado', async (locale) => {
		const { target, type, create, toList } = mountPage(locale);
		await tick();
		expect(type.permissions.create).toBe(true);
		expect(target.querySelector('h1')!.textContent).toBe(
			translate(locale, 'errors.creationUnavailable.title')
		);
		expect(target.textContent).toContain(translate(locale, 'errors.creationUnavailable.body'));
		expect(target.querySelector('form')).toBeNull();
		target.querySelector<HTMLButtonElement>('button')!.click();
		expect(toList).toHaveBeenCalledWith('notes');
		expect(create).not.toHaveBeenCalled();
	});

	test('permiso denegado conserva su motivo antes de la decoración', async () => {
		const schema: ContentType = {
			...notes,
			access: {
				list: 'allowed',
				view: 'allowed',
				create: 'denied',
				update: 'allowed',
				delete: 'allowed'
			}
		};
		const { target } = mountPage('es', schema);
		await tick();
		expect(target.querySelector('h1')!.textContent).toBe('No tienes permiso');
		expect(target.textContent).toContain('No tienes permiso para crear contenido');
	});

	test('readonly conserva el motivo de solo lectura', async () => {
		const { target } = mountPage('es', { ...notes, readonly: true });
		await tick();
		expect(target.textContent).toContain(
			translate('es', 'errors.forbidden.readonlyType.body', { label: 'Notes' })
		);
		expect(target.querySelector('form')).toBeNull();
	});

	test('singleton vacío llega al estado sin formulario y el existente sigue resolviendo edición', async () => {
		const { target, type, create } = mountPage('es', notes, true);
		await tick();
		expect(type.singleton).toBe(true);
		expect(resolveSingletonTarget(type.name, 0).url).toBe('/c/notes/new');
		expect(target.querySelector('form')).toBeNull();
		expect(resolveSingletonTarget(type.name, 1, 'existing').url).toBe('/c/notes/existing');
		expect(type.permissions.update).toBe(true);
		expect(create).not.toHaveBeenCalled();
	});
});
