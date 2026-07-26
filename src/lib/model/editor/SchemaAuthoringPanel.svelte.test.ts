/**
 * Suite de `SchemaAuthoringPanel.svelte` (lote "esquema", Fase 1): gate por capability, el
 * camino feliz de "Crear colección" (incl. el caso "ya existía", sin migración) y el de "Añadir
 * campos" (incl. "ningún campo era nuevo"), y la validación del nombre de colección. Montaje
 * real (proyecto vitest `component`, Svelte 5 `mount()`/`unmount()`), mismo patrón que
 * `session/BackendUrlForm.svelte.test.ts` — el componente no usa `VegaAppContext` (recibe
 * `port`/`types`/`t`/`onSchemaChanged` como props), así que no hace falta montarlo bajo el shell.
 *
 * `t` de prueba es un passthrough que expone la clave (y los params, si los hay) tal cual, para
 * poder aserta sobre el TEXTO renderizado sin acoplarse a la redacción real de `es.ts`/`en.ts`.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
	BackendPort,
	Capabilities,
	CollectionFieldSpec,
	CollectionSpec,
	ContentType
} from '$lib/backend';
import SchemaAuthoringPanel from './SchemaAuthoringPanel.svelte';

function t(key: string, params?: Record<string, string | number>): string {
	return params ? `${key}:${JSON.stringify(params)}` : key;
}

const BASE_CAPABILITIES: Capabilities = {
	realtime: true,
	thumbs: true,
	schemaDiscovery: true,
	filePerRecord: true,
	protectedFiles: false,
	schemaBootstrap: false,
	schemaFieldBootstrap: false,
	strongAuth: false,
	explicitRecordId: false,
	accessBypass: false
};

function fakePort(overrides: {
	capabilities?: Partial<Capabilities>;
	ensureCollections?: BackendPort['ensureCollections'];
	addCollectionFields?: BackendPort['addCollectionFields'];
}): BackendPort {
	return {
		capabilities: { ...BASE_CAPABILITIES, ...overrides.capabilities },
		ensureCollections: overrides.ensureCollections ?? vi.fn(),
		addCollectionFields: overrides.addCollectionFields ?? vi.fn()
	} as unknown as BackendPort;
}

const POST_TYPE: ContentType = { name: 'post', readonly: false, fields: [] };
const VEGA_TYPE: ContentType = { name: 'vega', readonly: false, fields: [] };

function mountPanel(props: {
	port: BackendPort;
	types?: ContentType[];
	onSchemaChanged?: () => Promise<void>;
}): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(SchemaAuthoringPanel, {
		target,
		props: {
			port: props.port,
			types: props.types ?? [],
			t,
			onSchemaChanged: props.onSchemaChanged ?? vi.fn(async () => undefined)
		}
	});
	return { target, instance };
}

function setInputValue(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('SchemaAuthoringPanel.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
	});

	test('sin ninguna capability: no pinta ninguna tarjeta (ley de capacidades)', () => {
		mounted = mountPanel({ port: fakePort({}) });
		expect(mounted.target.querySelectorAll('.vega-schema-card')).toHaveLength(0);
	});

	test('solo schemaBootstrap: solo la tarjeta de "Crear colección"', () => {
		mounted = mountPanel({ port: fakePort({ capabilities: { schemaBootstrap: true } }) });
		const cards = mounted.target.querySelectorAll('.vega-schema-card');
		expect(cards).toHaveLength(1);
		expect(mounted.target.textContent).toContain('settings.schema.create.title');
		expect(mounted.target.textContent).not.toContain('settings.schema.addFields.title');
	});

	test('solo schemaFieldBootstrap, sin colecciones propias: aviso de "empty", sin formulario', () => {
		mounted = mountPanel({
			port: fakePort({ capabilities: { schemaFieldBootstrap: true } }),
			types: [VEGA_TYPE] // solo namespace reservado: targetCollections queda vacío
		});
		expect(mounted.target.textContent).toContain('settings.schema.addFields.empty');
		expect(mounted.target.querySelector('form')).toBeNull();
	});

	test('nombre de colección inválido: error inline y submit deshabilitado', async () => {
		mounted = mountPanel({ port: fakePort({ capabilities: { schemaBootstrap: true } }) });
		const nameInput = mounted.target.querySelector<HTMLInputElement>('#vega-schema-create-name')!;
		setInputValue(nameInput, '1-no-valido');
		await tick();

		expect(mounted.target.textContent).toContain('settings.schema.create.nameInvalid');
		const submit = mounted.target.querySelector<HTMLButtonElement>('.vega-schema-submit')!;
		expect(submit.disabled).toBe(true);
	});

	test.each(['vega', 'vega_media', 'vega_revisions'])(
		'nombre del namespace interno de Vega (%s): rechazado con SU mensaje, no con el de forma',
		async (reserved) => {
			// Regresión del agujero que cazó el code-review: el guardarraíl solo validaba la FORMA
			// del nombre, así que `vega`/`vega_*` pasaban. Ambos bootstraps internos son perezosos
			// (`saveManifest` crea `vega`; `/media` crea `vega_media`), de modo que crearlas antes a
			// mano las dejaba con el esquema equivocado y el bootstrap real las saltaba EN SILENCIO.
			mounted = mountPanel({ port: fakePort({ capabilities: { schemaBootstrap: true } }) });
			const nameInput = mounted.target.querySelector<HTMLInputElement>('#vega-schema-create-name')!;
			setInputValue(nameInput, reserved);
			await tick();

			expect(mounted.target.textContent).toContain('settings.schema.create.nameReserved');
			expect(mounted.target.textContent).not.toContain('settings.schema.create.nameInvalid');
			const submit = mounted.target.querySelector<HTMLButtonElement>('.vega-schema-submit')!;
			expect(submit.disabled).toBe(true);
		}
	);

	test('crear colección: éxito → migración mostrada y onSchemaChanged llamado', async () => {
		const ensureCollections = vi.fn(async (_specs: CollectionSpec[]) => ({
			created: ['posts'],
			skipped: []
		}));
		const onSchemaChanged = vi.fn(async () => undefined);
		mounted = mountPanel({
			port: fakePort({ capabilities: { schemaBootstrap: true }, ensureCollections }),
			onSchemaChanged
		});

		const nameInput = mounted.target.querySelector<HTMLInputElement>('#vega-schema-create-name')!;
		setInputValue(nameInput, 'posts');

		const fieldNameInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-field-row input[type="text"]'
		)!;
		setInputValue(fieldNameInput, 'title');
		await tick();

		const form = mounted.target.querySelector('form')!;
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		await tick();

		expect(ensureCollections).toHaveBeenCalledTimes(1);
		const specs = ensureCollections.mock.calls[0][0];
		expect(specs).toEqual([
			{ name: 'posts', fields: [{ name: 'title', type: 'text', required: false, max: undefined }] }
		]);
		expect(onSchemaChanged).toHaveBeenCalledTimes(1);
		expect(mounted.target.textContent).toContain('settings.schema.migration.title');
		// nombre determinista `create_<name>`, timestamp aparte (verificado a fondo en migration.test.ts)
		expect(mounted.target.textContent).toContain('create_posts.js');
	});

	test('crear colección: ya existía → aviso "alreadyExists", sin migración ni refresco', async () => {
		const ensureCollections = vi.fn(async () => ({ created: [], skipped: ['posts'] }));
		const onSchemaChanged = vi.fn(async () => undefined);
		mounted = mountPanel({
			port: fakePort({ capabilities: { schemaBootstrap: true }, ensureCollections }),
			onSchemaChanged
		});

		const nameInput = mounted.target.querySelector<HTMLInputElement>('#vega-schema-create-name')!;
		setInputValue(nameInput, 'posts');
		const form = mounted.target.querySelector('form')!;
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		await tick();

		expect(mounted.target.textContent).toContain('settings.schema.create.alreadyExists');
		expect(mounted.target.textContent).not.toContain('settings.schema.migration.title');
		expect(onSchemaChanged).not.toHaveBeenCalled();
	});

	test('añadir campos: éxito → migración mostrada y onSchemaChanged llamado', async () => {
		const addCollectionFields = vi.fn(
			async (_collection: string, _fields: CollectionFieldSpec[]) => ({
				added: ['excerpt'],
				skipped: []
			})
		);
		const onSchemaChanged = vi.fn(async () => undefined);
		mounted = mountPanel({
			port: fakePort({ capabilities: { schemaFieldBootstrap: true }, addCollectionFields }),
			types: [POST_TYPE],
			onSchemaChanged
		});

		const targetSelect =
			mounted.target.querySelector<HTMLSelectElement>('#vega-schema-add-target')!;
		targetSelect.value = 'post';
		targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

		const fieldNameInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-field-row input[type="text"]'
		)!;
		setInputValue(fieldNameInput, 'excerpt');
		await tick();

		const form = mounted.target.querySelector('form')!;
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		await tick();

		expect(addCollectionFields).toHaveBeenCalledTimes(1);
		expect(addCollectionFields.mock.calls[0][0]).toBe('post');
		expect(addCollectionFields.mock.calls[0][1]).toEqual([
			{ name: 'excerpt', type: 'text', required: false, max: undefined }
		]);
		expect(onSchemaChanged).toHaveBeenCalledTimes(1);
		expect(mounted.target.textContent).toContain('settings.schema.addFields.success');
		expect(mounted.target.textContent).toContain('add_fields_to_post.js');
	});

	test('añadir campos: ningún campo era nuevo → aviso "noneAdded", sin migración', async () => {
		const addCollectionFields = vi.fn(async () => ({ added: [], skipped: ['excerpt'] }));
		mounted = mountPanel({
			port: fakePort({ capabilities: { schemaFieldBootstrap: true }, addCollectionFields }),
			types: [POST_TYPE]
		});

		const targetSelect =
			mounted.target.querySelector<HTMLSelectElement>('#vega-schema-add-target')!;
		targetSelect.value = 'post';
		targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

		const fieldNameInput = mounted.target.querySelector<HTMLInputElement>(
			'.vega-field-row input[type="text"]'
		)!;
		setInputValue(fieldNameInput, 'excerpt');
		await tick();

		const form = mounted.target.querySelector('form')!;
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await tick();
		await tick();

		expect(mounted.target.textContent).toContain('settings.schema.addFields.noneAdded');
		expect(mounted.target.textContent).not.toContain('settings.schema.migration.title');
	});

	test('aviso de la landmine number+required (0 rechazado) solo cuando aplica', async () => {
		mounted = mountPanel({ port: fakePort({ capabilities: { schemaBootstrap: true } }) });

		const typeSelect = mounted.target.querySelector<HTMLSelectElement>('.vega-field-row select')!;
		typeSelect.value = 'number';
		typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
		await tick();
		expect(mounted.target.textContent).not.toContain(
			'settings.schema.fields.numberRequiredWarning'
		);

		const requiredCheckbox = mounted.target.querySelector<HTMLInputElement>(
			'.vega-field-checkbox input[type="checkbox"]'
		)!;
		requiredCheckbox.checked = true;
		requiredCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
		await tick();

		expect(mounted.target.textContent).toContain('settings.schema.fields.numberRequiredWarning');
	});
});
