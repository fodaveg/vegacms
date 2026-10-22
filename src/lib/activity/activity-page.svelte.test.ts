/** Estados observables de la ruta y enlaces; memory no acredita el hook. */
import { mount, tick, unmount } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import { VegaError, type BackendPort } from '$lib/backend';
import { resolveContentModel } from '$lib/model/resolve';
import { t } from '$lib/i18n';
import { activityDemoRecords } from './activity-demo';
import { DEMO_SEED } from '$lib/session/demo-seed';
import { VEGA_REVISIONS_COLLECTION } from '$lib/revisions/revisions-collection';
import ActivityPage from '../../routes/actividad/+page.svelte';

let component: ReturnType<typeof mount> | undefined;
let target: HTMLElement;
afterEach(async () => {
	if (component) await unmount(component);
	component = undefined;
	target?.remove();
});
async function render(
	options: {
		editor?: boolean;
		missing?: boolean;
		empty?: boolean;
		fail?: boolean;
		pending?: boolean;
		openRules?: boolean;
		copied?: boolean;
		many?: boolean;
	} = {}
) {
	let types = options.missing
		? DEMO_SEED.contentTypes.filter((type) => type.name !== 'vega_activity')
		: options.openRules
			? DEMO_SEED.contentTypes.map((type) =>
					type.name === 'vega_activity'
						? { ...type, access: { ...type.access!, list: 'allowed' as const } }
						: type
				)
			: DEMO_SEED.contentTypes;
	const port = createMemoryBackend({
		...DEMO_SEED,
		contentTypes: types,
		records: {
			...DEMO_SEED.records,
			...(options.empty ? { vega_activity: [] } : {}),
			...(options.many
				? {
						vega_activity: Array.from({ length: 60 }, (_, i) => ({
							...activityDemoRecords()[0],
							id: `activity_${String(i).padStart(3, '0')}`
						}))
					}
				: {})
		}
	});
	const listSpy = vi.spyOn(port, 'list');
	const session = await port.login({ email: 'demo@vega.dev', password: 'vega-demo' });
	if (options.copied) {
		await port.ensureCollections([VEGA_REVISIONS_COLLECTION]);
		await port.create('vega_revisions', {
			collection: 'posts',
			recordId: 'deleted_demo',
			kind: 'delete',
			values: {},
			label: 'Una entrada retirada',
			author: 'demo@vega.dev'
		});
		types = await port.listContentTypes();
	}
	if (options.fail) vi.spyOn(port, 'list').mockRejectedValue(VegaError.network('No hay red'));
	if (options.pending) vi.spyOn(port, 'list').mockImplementation(() => new Promise(() => {}));
	const currentPort: BackendPort = options.editor
		? {
				...port,
				capabilities: { ...port.capabilities, administration: false },
				administration: undefined
			}
		: port;
	const ctx = {
		port: currentPort,
		model: resolveContentModel({ types, manifestRaw: null }),
		session,
		locale: 'es',
		t: (key: string, params?: Record<string, string | number>) => t('es', key, params),
		feedback: { reportError: vi.fn() }
	} as unknown as VegaAppContext;
	target = document.createElement('div');
	document.body.append(target);
	component = mount(ActivityPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	for (let i = 0; i < 12; i++) {
		await Promise.resolve();
		await tick();
	}
	return { port, ctx, listSpy };
}
test('puerta para editor, sin consultas de actividad', async () => {
	const { listSpy } = await render({ editor: true });
	expect(target.textContent).toContain('Solo para superusuarios');
	expect(target.querySelector('form')).toBeNull();
	expect(listSpy).not.toHaveBeenCalled();
});
test('instalación ausente explica el hook con enlace de configuración', async () => {
	await render({ missing: true });
	expect(target.textContent).toContain('Registro no disponible');
	expect(target.querySelector('a')?.href).toContain('CONFIG.md#registro-de-actividad');
});
test('esqueleto mientras consulta', async () => {
	await render({ pending: true });
	expect(target.querySelector('[aria-busy="true"]')).not.toBeNull();
	expect(target.querySelectorAll('.activity-skeleton')).toHaveLength(4);
});
test('vacío y filtros sin resultados', async () => {
	await render({ empty: true });
	expect(target.textContent).toContain('Todavía no hay actividad');
	const select = target.querySelector('select')!;
	select.value = '_superusers';
	select.dispatchEvent(new Event('change', { bubbles: true }));
	target
		.querySelector('form')!
		.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	for (let i = 0; i < 12; i++) {
		await Promise.resolve();
		await tick();
	}
	expect(target.textContent).toContain('Sin resultados para estos filtros');
});
test('error con reintento recupera la lista y título vivo', async () => {
	const { port } = await render({ fail: true });
	expect(target.textContent).toContain('No se pudo cargar la actividad');
	vi.mocked(port.list).mockRestore();
	Array.from(target.querySelectorAll('button'))
		.find((button) => button.textContent === 'Reintentar')!
		.click();
	for (let i = 0; i < 15; i++) {
		await Promise.resolve();
		await tick();
	}
	expect(target.querySelector('a[href="/c/posts/post_1"]')?.textContent).toBe('Bienvenido a Vega');
	expect(target.textContent).toContain('sin copia en la papelera');
});
test('una colección de actividad con reglas abiertas se considera no disponible', async () => {
	await render({ openRules: true });
	expect(target.querySelector('[data-activity-state="unavailable"]')).not.toBeNull();
	expect(target.querySelector('form')).toBeNull();
});

test('borrado con copia enlaza con Papelera', async () => {
	await render({ copied: true });
	expect(target.querySelector('a[href="/papelera"]')?.textContent).toBe('Una entrada retirada');
	expect(target.textContent).toContain('con copia en la papelera');
});

test('editar filtros sin aplicarlos no mezcla el cursor con otra consulta al cargar más', async () => {
	await render({ many: true });
	expect(target.textContent).toContain('50 guardados');
	const person = target.querySelector('select')!;
	person.value = '_superusers';
	person.dispatchEvent(new Event('change', { bubbles: true }));
	Array.from(target.querySelectorAll('button'))
		.find((button) => button.textContent === 'Cargar más')!
		.click();
	for (let i = 0; i < 15; i++) {
		await Promise.resolve();
		await tick();
	}
	expect(target.textContent).toContain('60 guardados');
});
