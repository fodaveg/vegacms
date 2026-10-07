/** Creación inline real: el formulario padre sigue montado; P5 es el único controlador. */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, Field, VegaRecord } from '$lib/backend/types';
import { VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

const navigation = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ beforeNavigate: navigation }));
Element.prototype.scrollIntoView = vi.fn();
const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;
const schemas: ContentType[] = [
	{
		name: 'posts',
		readonly: false,
		fields: [
			{ ...base, name: 'name', type: 'text', subtype: 'plain' },
			{ ...base, name: 'attachment', type: 'file', multiple: false, protected: false },
			{ ...base, name: 'tags', type: 'relation', target: 'tags', multiple: true, maxSelect: 2 }
		] as Field[]
	},
	{
		name: 'tags',
		readonly: false,
		fields: [
			{ ...base, name: 'name', type: 'text', subtype: 'plain', required: true },
			{ ...base, name: 'slug', type: 'text', subtype: 'plain', required: true, unique: true },
			{ ...base, name: 'related', type: 'relation', target: 'tags', multiple: false }
		] as Field[]
	}
];
const created: VegaRecord = {
	id: 'tagnew',
	type: 'tags',
	values: { name: 'Taller', slug: 'taller', related: null }
};
let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;
beforeEach(() => {
	navigation.mockClear();
});
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.restoreAllMocks();
});
async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 5));
	await tick();
}
function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}
function dialog() {
	return document.querySelector<HTMLElement>('[data-relation-create]')!;
}
function button(text: string, root: ParentNode = dialog()) {
	return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
		(button) => button.textContent?.trim() === text
	)!;
}
async function setup(
	create = vi.fn(async () => created),
	pendingFile = false,
	initialSelection: string[] = []
) {
	const initialModel = resolveContentModel({
		types: schemas,
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				posts: { titleField: 'name', labelSingular: 'entrada' },
				tags: { titleField: 'name', slugField: 'slug', labelSingular: 'etiqueta' }
			}
		}
	});
	const model = $state(initialModel);
	const type = model.types.find((type) => type.name === 'posts')!;
	const list = vi.fn(async () => ({
		items: [],
		page: 1,
		perPage: 20,
		totalPages: 1,
		totalItems: 0
	}));
	const onSubmit = vi.fn(async () => ({ id: 'post', type: 'posts', values: {} }));
	const ctx = {
		port: { create, list, capabilities: {} },
		model,
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const formModel = buildFormModel(type, null);
	formModel.baseline.tags = initialSelection;
	const props = $state({
		type,
		model: formModel,
		typeReadonly: false,
		onSubmit,
		onSaved: vi.fn(),
		onCancel: vi.fn()
	});
	mounted = {
		target,
		instance: mount(RecordForm, { target, props, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) })
	};
	await settle();
	input(target.querySelector<HTMLTextAreaElement>('#vega-field-name')!, 'Padre sin guardar');
	const parentName = target.querySelector<HTMLTextAreaElement>('#vega-field-name')!;
	let attachment: File | null = null;
	if (pendingFile) {
		URL.createObjectURL = vi.fn(() => 'blob:pending-parent');
		URL.revokeObjectURL = vi.fn();
		attachment = new File(['pending'], 'padre.txt', { type: 'text/plain' });
		const fileInput = target.querySelector<HTMLInputElement>('input[type="file"]')!;
		Object.defineProperty(fileInput, 'files', { value: [attachment], configurable: true });
		fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
	}
	const search = target.querySelector<HTMLInputElement>('.vega-relation-search')!;
	input(search, 'Taller');
	const originalInert = target.querySelector<HTMLFormElement>('form')!.inert;
	const opener = target.querySelector<HTMLButtonElement>('.vega-relation-create')!;
	opener.focus();
	opener.click();
	await vi.waitFor(() => expect(dialog()).not.toBeNull());
	await settle();
	return {
		target,
		parentName,
		opener,
		create,
		onSubmit,
		ctx,
		list,
		props,
		attachment,
		originalInert
	};
}

describe('L12: diálogo de creación de relación', () => {
	test('portal, ids propios, prefijo, padre intacto y single guard; CmdS no guarda ninguno', async () => {
		const { target, parentName, onSubmit, create } = await setup();
		expect(dialog().closest('form')).toBeNull();
		expect(target.querySelector('#vega-field-name')).toBe(parentName);
		expect(parentName.value).toBe('Padre sin guardar');
		expect(target.querySelector('form')!.inert).toBe(true);
		const name = dialog().querySelector<HTMLTextAreaElement>('textarea')!;
		expect(name.value).toBe('Taller');
		expect(name.id).not.toBe(parentName.id);
		expect(dialog().querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('taller');
		expect(document.activeElement).toBe(name);
		expect(dialog().querySelector('.vega-relation-create')).toBeNull();
		expect(navigation).toHaveBeenCalledTimes(1);
		name.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
		);
		await settle();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});
	test('crea y selecciona sin guardar el padre ni perder la edición; enfoca el chip', async () => {
		const { target, parentName, create, onSubmit, originalInert } = await setup();
		button('Crear y seleccionar').click();
		await settle();
		expect(create).toHaveBeenCalledWith('tags', { name: 'Taller', slug: 'taller' });
		expect(onSubmit).not.toHaveBeenCalled();
		expect(dialog()).toBeNull();
		expect(target.querySelector('#vega-field-name')).toBe(parentName);
		expect(parentName.value).toBe('Padre sin guardar');
		expect(target.querySelector('form')!.inert).toBe(originalInert);
		expect(target.querySelector('.vega-relation-chip')?.textContent).toContain('Taller');
		expect(document.activeElement).toBe(target.querySelector('.vega-relation-chip'));
		expect(target.querySelector('.vega-editor-dirty')).not.toBeNull();
	});

	test('el fichero pendiente y el scroll del padre sobreviven a crear el hijo', async () => {
		const { target, attachment, onSubmit } = await setup(
			vi.fn(async () => created),
			true
		);
		const parentForm = target.querySelector<HTMLFormElement>('form')!;
		parentForm.scrollTop = 80;
		button('Crear y seleccionar').click();
		await settle();
		expect(parentForm.scrollTop).toBe(80);
		expect(target.textContent).toContain('padre.txt');
		expect(onSubmit).not.toHaveBeenCalled();
		parentForm.requestSubmit();
		await settle();
		expect(onSubmit).toHaveBeenCalledWith({
			name: 'Padre sin guardar',
			tags: ['tagnew'],
			attachment
		});
	});
	test('prefijo sin editar cancela sin confirmar; cambios del hijo confirman dentro del mismo modal', async () => {
		const { opener, parentName, create } = await setup();
		button('Cancelar').click();
		await settle();
		expect(dialog()).toBeNull();
		expect(document.activeElement).toBe(opener);
		opener.click();
		await settle();
		input(dialog().querySelector<HTMLTextAreaElement>('textarea')!, 'Otra');
		button('Cancelar').click();
		await settle();
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(document.activeElement).toBe(button('Seguir editando'));
		button('Seguir editando').click();
		await settle();
		expect(dialog().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Otra');
		button('Cancelar').click();
		await settle();
		button('Descartar borrador').click();
		await settle();
		expect(dialog()).toBeNull();
		expect(parentName.value).toBe('Padre sin guardar');
		expect(create).not.toHaveBeenCalled();
	});
	test('busy bloquea doble submit y Escape hasta que el registro está confirmado', async () => {
		let resolve!: (record: VegaRecord) => void;
		const create = vi.fn(
			() =>
				new Promise<VegaRecord>((done) => {
					resolve = done;
				})
		);
		await setup(create);
		button('Crear y seleccionar').click();
		await settle();
		button('Creando…').click();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		await settle();
		expect(dialog()).not.toBeNull();
		expect(create).toHaveBeenCalledTimes(1);
		resolve(created);
		await settle();
		expect(dialog()).toBeNull();
	});
	test('validation conserva ambos borradores, muestra campo/registro y mueve el foco', async () => {
		const create = vi.fn(async (): Promise<VegaRecord> => {
			throw VegaError.validation({
				slug: { code: 'validation_not_unique', message: 'Dirección duplicada' },
				'': { code: 'record_problem', message: 'Problema del registro' }
			});
		});
		const { parentName } = await setup(create);
		button('Crear y seleccionar').click();
		await settle();
		expect(dialog().textContent).toContain('Problema del registro');
		expect(dialog().querySelector('.vega-field-error')).not.toBeNull();
		expect(document.activeElement).toBe(dialog().querySelector('input[type="text"]'));
		expect(dialog().querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('taller');
		expect(parentName.value).toBe('Padre sin guardar');
		expect(button('Buscar registros coincidentes')).toBeDefined();
	});
	test('network conserva el borrador y bloquea retry; reconciliación vacía no asegura ausencia', async () => {
		const create = vi.fn(async (): Promise<VegaRecord> => {
			throw VegaError.network();
		});
		const { ctx, list, parentName } = await setup(create);
		button('Crear y seleccionar').click();
		await settle();
		expect(dialog().textContent).toContain('El registro puede haberse creado');
		expect(button('Crear y seleccionar').getAttribute('aria-disabled')).toBe('true');
		button('Crear y seleccionar').click();
		await settle();
		expect(create).toHaveBeenCalledTimes(1);
		button('Buscar registros coincidentes').click();
		await settle();
		expect(list).toHaveBeenCalledWith('tags', {
			filter: { kind: 'cond', field: 'name', op: 'eq', value: 'Taller' },
			perPage: 20
		});
		expect(dialog().textContent).toContain('No encontrarlo no confirma');
		expect(ctx.feedback.reportError).toHaveBeenCalled();
		expect(parentName.value).toBe('Padre sin guardar');
	});

	for (const error of [
		VegaError.forbidden('Sin permiso'),
		VegaError.authExpired('Sesión caducada')
	]) {
		test(`${error.kind} conserva ambos borradores y delega a feedback; otro overlay controla el teclado`, async () => {
			const create = vi.fn(async (): Promise<VegaRecord> => {
				throw error;
			});
			const { ctx, parentName } = await setup(create);
			button('Crear y seleccionar').click();
			await settle();
			expect(ctx.feedback.reportError).toHaveBeenCalledWith(error, { action: 'create:save' });
			expect(parentName.value).toBe('Padre sin guardar');
			expect(dialog().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Taller');
			const overlay = document.createElement('div');
			overlay.setAttribute('aria-modal', 'true');
			const login = document.createElement('input');
			overlay.append(login);
			document.body.append(overlay);
			login.focus();
			login.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
			await settle();
			expect(dialog()).not.toBeNull();
			overlay.remove();
		});
	}
	test('un cambio del modelo que quita el destino no desmonta el borrador del hijo', async () => {
		const { ctx, parentName } = await setup();
		ctx.model.types = ctx.model.types.filter((type) => type.name !== 'tags');
		flushSync();
		await settle();
		expect(dialog()).not.toBeNull();
		expect(dialog().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Taller');
		expect(button('Crear y seleccionar').getAttribute('aria-disabled')).toBe('true');
		expect(parentName.value).toBe('Padre sin guardar');
	});
	for (const transition of ['readonly', 'target', 'capacity'] as const) {
		test(`${transition} antes de enviar conserva el hijo y bloquea la creación`, async () => {
			const { props, ctx, parentName, create, onSubmit } = await setup(
				vi.fn(async () => created),
				false,
				transition === 'capacity' ? ['tagold'] : []
			);
			const relation = props.type.fields.find((field) => field.name === 'tags')!;
			if (transition === 'readonly') props.typeReadonly = true;
			if (transition === 'target' && relation.schema.type === 'relation') {
				const target = ctx.model.types.find((type) => type.name === 'tags')!;
				ctx.model.types = [...ctx.model.types, { ...target, name: 'other_tags' }];
				relation.schema.target = 'other_tags';
			}
			if (transition === 'capacity' && relation.schema.type === 'relation') {
				relation.schema.maxSelect = 1;
			}
			flushSync();
			await settle();
			expect(dialog()).not.toBeNull();
			expect(dialog().querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Taller');
			expect(button('Crear y seleccionar').getAttribute('aria-disabled')).toBe('true');
			button('Crear y seleccionar').click();
			await settle();
			expect(create).not.toHaveBeenCalled();
			expect(onSubmit).not.toHaveBeenCalled();
			expect(parentName.value).toBe('Padre sin guardar');
		});
	}
	test('creación confirmada imposible de incorporar informa parcial y no vuelve a crear', async () => {
		let resolve!: (record: VegaRecord) => void;
		const create = vi.fn(
			() =>
				new Promise<VegaRecord>((done) => {
					resolve = done;
				})
		);
		const { props } = await setup(create);
		button('Crear y seleccionar').click();
		await settle();
		props.typeReadonly = true;
		flushSync();
		resolve(created);
		await settle();
		expect(dialog().textContent).toContain('se ha creado, pero no se ha añadido');
		expect(dialog().textContent).toContain('tagnew');
		expect(button('Crear y seleccionar')).toBeUndefined();
		expect(create).toHaveBeenCalledTimes(1);
	});
});
