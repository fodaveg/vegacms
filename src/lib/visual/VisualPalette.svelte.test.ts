/**
 * Suite de `VisualPalette.svelte` (encargo "paleta de bloques arrastrable del editor visual"):
 * montaje real contra un `BlocksState` de MENTIRA, mismo criterio que el resto de `$lib/visual`.
 * Cubre lo que le compete a ESTE componente en aislado: qué pinta (o no) según `hasTypeMenu`, el
 * `dataTransfer` del arrastre, la creación-al-final por clic/teclado (`onclick` cubre las dos
 * activaciones nativas de un `<button>`) y sus guardas — la integración con
 * `VisualBlockTree.svelte` (que la instancia dentro del panel) y con `VisualOverlay.svelte` (que
 * recibe el arrastre por prop y resuelve la caída en el lienzo) tienen sus propias suites.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualPalette from './VisualPalette.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BlocksState } from '$lib/form/blocks-state.svelte';
import type { ResolvedBlockType } from '$lib/model/types';
import type { VegaRecord } from '$lib/backend';
import { t as translate } from '$lib/i18n';

const HERO_TYPE = {
	name: 'hero',
	label: 'Portada',
	icon: 'box',
	fields: [
		{
			name: 'heading',
			label: 'Titular',
			widget: 'text',
			source: 'data',
			required: true,
			options: null
		},
		{
			name: 'body',
			label: 'Descripción',
			widget: 'textarea',
			source: 'data',
			required: false,
			options: null
		}
	]
} as ResolvedBlockType;
const GALLERY_TYPE = {
	name: 'gallery',
	label: 'Galería',
	icon: null,
	fields: [
		{
			name: 'image',
			label: 'Imagen',
			widget: 'file',
			source: 'record',
			required: false,
			options: null
		}
	]
} as ResolvedBlockType;
/** Relleno para pasar del umbral del buscador (más de 6 tipos): con menos, la paleta de la lámina
 *  enseña solo las baldosas. Ninguno casa con las búsquedas de los tests. */
const FILLER_TYPES = Array.from(
	{ length: 6 },
	(_, index) =>
		({
			...GALLERY_TYPE,
			name: `relleno-${index}`,
			label: `Relleno ${index + 1}`
		}) as ResolvedBlockType
);

function record(id: string, heading: string): VegaRecord {
	return { id, type: 'post_block', values: { heading } };
}

interface FakeOptions {
	records?: VegaRecord[];
	hasTypeMenu?: boolean;
	hidden?: boolean;
	blockTypes?: ResolvedBlockType[];
	anyDirty?: boolean;
	anySaving?: boolean;
	structuralBusy?: boolean;
	handleCreate?: BlocksState['handleCreate'];
	say?: BlocksState['say'];
}

/** Doble MÍNIMO de `BlocksState` (ver cabecera): implementa lo que `VisualPalette` LEE, más
 *  espías por defecto para lo que llama. */
function fakeBlocksState(opts: FakeOptions = {}): BlocksState {
	const records = opts.records ?? [];
	return {
		status: { kind: 'ready', records },
		records,
		loading: false,
		failed: false,
		hidden: opts.hidden ?? false,
		blocksConfig: null,
		childType: null,
		structuralFields: [],
		blockDuplicateAllowed: false,
		hasTypeColumn: opts.hasTypeMenu ?? false,
		hasTypeMenu: opts.hasTypeMenu ?? false,
		blockTypes: opts.blockTypes ?? [],
		structuralBusy: opts.structuralBusy ?? false,
		pendingDelete: null,
		deleting: false,
		announce: '',
		say: opts.say ?? vi.fn(),
		anyDirty: opts.anyDirty ?? false,
		anySaving: opts.anySaving ?? false,
		isExpanded: () => false,
		isDirty: () => false,
		isSaving: () => false,
		isDuplicating: () => false,
		blockTypeOf: () => null,
		blockTypeRawName: () => null,
		blockTitle: (r) => (r.values.heading as string) ?? '',
		currentDraftRecords: () => [],
		load: async () => {},
		toggle: () => {},
		expand: () => {},
		setDirty: () => {},
		setSaving: () => {},
		handleBlockDraftChange: () => {},
		handleBlockSaved: () => {},
		handleCreate: opts.handleCreate ?? vi.fn(async () => {}),
		handleDuplicate: async () => {},
		requestDelete: vi.fn(),
		cancelDelete: vi.fn(),
		confirmDelete: async () => {},
		handleReorder: vi.fn(async () => false)
	} satisfies BlocksState;
}

function fakeCtx(): VegaAppContext {
	return {
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es'
	} as unknown as VegaAppContext;
}

function mountPalette(props: {
	blocks: BlocksState;
	onStructuralChange?: () => void;
	onDragStart?: (blockType: ResolvedBlockType) => void;
	onDragEnd?: () => void;
}): { target: HTMLElement; instance: ReturnType<typeof mount> } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualPalette, {
		target,
		props: {
			onStructuralChange: vi.fn(),
			onDragStart: vi.fn(),
			onDragEnd: vi.fn(),
			...props
		},
		context: new Map([[VEGA_CONTEXT_KEY, fakeCtx()]])
	});
	return { target, instance };
}

/** Drena la cadena de microtasks de una mutación `async` disparada por un `click` (mismo criterio
 *  que `VisualBlockTree.svelte.test.ts`/`VisualOverlay.svelte.test.ts`). */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

describe('VisualPalette.svelte', () => {
	let mounted: { target: HTMLElement; instance: ReturnType<typeof mount> } | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test('el catálogo largo conserva vocabulario y orden y explicita crear al final', async () => {
		// Fixture explícita: veinte variantes del mismo tipo admitido, sin categorías añadidas.
		const types = Array.from({ length: 20 }, (_, index) => ({
			...HERO_TYPE,
			name: `hero-${index}`,
			label: `Portada variante ${index + 1} con nombre editorial largo`
		}));
		mounted = mountPalette({ blocks: fakeBlocksState({ hasTypeMenu: true, blockTypes: types }) });
		await tick();
		expect(mounted.target.querySelector('h2')?.textContent).toBe('Añadir sección');
		// «al final» sigue diciéndose: es la descripción accesible de cada baldosa.
		const where = mounted.target
			.querySelector('.vega-palette-item')
			?.getAttribute('aria-describedby')
			?.split(' ')[0];
		expect(where && document.getElementById(where)?.textContent?.trim()).toBe('Añadir al final');
		expect(
			Array.from(mounted.target.querySelectorAll('.vega-palette-item')).map((el) =>
				el.querySelector('strong')?.textContent?.trim()
			)
		).toEqual(types.map((type) => type.label));
	});

	test('sin menú de tipos (modo homogéneo), no se pinta nada', () => {
		const blocks = fakeBlocksState({ hasTypeMenu: false, blockTypes: [HERO_TYPE] });
		mounted = mountPalette({ blocks });

		expect(mounted.target.querySelector('.vega-palette-panel')).toBeNull();
	});

	/** Hallazgo de la revisión fría del commit que trajo la paleta: `hidden` (que incluye
	 *  `status.kind === 'error'`, o sea "la lista de bloques de este registro NO cargó") es
	 *  independiente de `hasTypeMenu` (que sale del vocabulario GLOBAL de tipos). Sin esta guarda
	 *  la paleta seguía creando con el árbol diciendo "no disponible", y `handleCreate` calculaba
	 *  el orden sobre `records`, que ahí es `[]` — bloque nuevo con orden 0 y `status` en `ready`
	 *  con él solo, o sea los bloques reales fuera de la vista y colisión de orden al recargar. */
	test('con la lista de bloques en error (`hidden`), la paleta no se pinta aunque haya tipos', () => {
		const blocks = fakeBlocksState({
			hasTypeMenu: true,
			hidden: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE]
		});
		mounted = mountPalette({ blocks });

		expect(mounted.target.querySelector('.vega-palette-panel')).toBeNull();
		expect(mounted.target.querySelector('.vega-palette-item')).toBeNull();
	});

	test('con menú de tipos: un botón por tipo, misma fuente que `blockTypes` — con su icono y etiqueta', () => {
		const blocks = fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE, GALLERY_TYPE] });
		mounted = mountPalette({ blocks });

		const items = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-palette-item');
		expect(items).toHaveLength(2);
		expect(items[0].textContent?.trim()).toContain('Portada');
		expect(items[0].querySelector('.vega-palette-fields')?.textContent).toBe(
			'Titular · Descripción'
		);
		expect(items[0].querySelector('svg')).not.toBeNull();
		expect(items[1].textContent?.trim()).toContain('Galería');
		expect(items[1].querySelector('.vega-palette-fields')?.textContent).toBe('Imagen');
	});

	test('con pocos tipos no hay buscador: las baldosas ya se ven todas (lámina)', () => {
		mounted = mountPalette({
			blocks: fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE, GALLERY_TYPE] })
		});
		expect(mounted.target.querySelector('input[type="search"]')).toBeNull();
		expect(mounted.target.querySelectorAll('.vega-palette-item')).toHaveLength(2);
	});

	test('busca por tipo o campo declarado sin perder la acción de crear', async () => {
		const handleCreate = vi.fn(async () => {});
		const blocks = fakeBlocksState({
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE, ...FILLER_TYPES],
			handleCreate
		});
		mounted = mountPalette({ blocks });
		const search = mounted.target.querySelector<HTMLInputElement>('input[type="search"]')!;
		expect(search.labels?.[0]?.textContent?.trim()).toBe('Buscar bloques');
		search.value = 'descripcion';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		const items = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-palette-item');
		expect(items).toHaveLength(1);
		expect(items[0].textContent).toContain('Portada');
		items[0].click();
		await settle();
		expect(handleCreate).toHaveBeenCalledWith(HERO_TYPE);
	});

	test('sin coincidencias muestra vacío y conserva el buscador', async () => {
		mounted = mountPalette({
			blocks: fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE, ...FILLER_TYPES] })
		});
		const search = mounted.target.querySelector<HTMLInputElement>('input[type="search"]')!;
		search.value = 'galeria';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		expect(mounted.target.querySelector('.vega-palette-item')).toBeNull();
		expect(mounted.target.querySelector('.vega-palette-empty')?.textContent).toBe(
			'No hay bloques que coincidan.'
		);
		expect(search.disabled).toBe(false);
	});

	test('un campo al final de una descripción larga sigue encontrando la tarjeta', async () => {
		const longType: ResolvedBlockType = {
			...HERO_TYPE,
			fields: Array.from({ length: 8 }, (_, index) => ({
				...HERO_TYPE.fields[0],
				name: `field${index + 1}`,
				label: `Campo ${index + 1}`
			}))
		};
		mounted = mountPalette({
			blocks: fakeBlocksState({
				hasTypeMenu: true,
				blockTypes: [longType, GALLERY_TYPE, ...FILLER_TYPES]
			})
		});
		const search = mounted.target.querySelector<HTMLInputElement>('input[type="search"]')!;
		search.value = 'campo 8';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		await tick();
		const item = mounted.target.querySelector('.vega-palette-item');
		expect(item?.querySelector('strong')?.textContent).toBe('Portada');
		expect(item?.querySelector('.vega-palette-fields')?.textContent).toContain('Campo 8');
		expect(mounted.target.querySelectorAll('.vega-palette-item')).toHaveLength(1);
	});

	test('región propia con su propio encabezado (`role="region"` + `aria-labelledby`)', () => {
		const blocks = fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE] });
		mounted = mountPalette({ blocks });

		const region = mounted.target.querySelector('.vega-palette-panel');
		expect(region?.getAttribute('role')).toBe('region');
		const labelledBy = region?.getAttribute('aria-labelledby');
		expect(labelledBy).not.toBeNull();
		expect(document.getElementById(labelledBy!)).not.toBeNull();
	});

	test('explica por qué un borrador bloquea la inserción y describe los botones', () => {
		const blocks = fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE], anyDirty: true });
		mounted = mountPalette({ blocks });
		const item = mounted.target.querySelector<HTMLButtonElement>('.vega-palette-item')!;
		expect(item.disabled).toBe(true);
		expect(item.draggable).toBe(false);
		const description = document.getElementById(item.getAttribute('aria-describedby')!);
		expect(description?.textContent).toContain('Inserción bloqueada por cambios sin guardar');
		expect(description?.textContent).toContain('Abre los bloques pendientes');
	});

	test('dragstart: fija `dataTransfer` (`setData`+`effectAllowed`) y avisa con el tipo', () => {
		const onDragStart = vi.fn();
		const blocks = fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE, GALLERY_TYPE] });
		mounted = mountPalette({ blocks, onDragStart });

		const setData = vi.fn();
		const dataTransfer = { setData, effectAllowed: '' };
		const event = new Event('dragstart', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

		const items = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-palette-item');
		items[1].dispatchEvent(event);

		expect(setData).toHaveBeenCalledWith('text/plain', 'gallery');
		expect(dataTransfer.effectAllowed).toBe('copy');
		expect(onDragStart).toHaveBeenCalledWith(GALLERY_TYPE);
	});

	test('dragend: avisa del final del gesto pase lo que pase', () => {
		const onDragEnd = vi.fn();
		const blocks = fakeBlocksState({ hasTypeMenu: true, blockTypes: [HERO_TYPE] });
		mounted = mountPalette({ blocks, onDragEnd });

		mounted.target
			.querySelector('.vega-palette-item')!
			.dispatchEvent(new Event('dragend', { bubbles: true, cancelable: true }));

		expect(onDragEnd).toHaveBeenCalledTimes(1);
	});

	test('clic (Enter/Espacio nativos activan el mismo `<button>`) crea AL FINAL, avisa y anuncia', async () => {
		const b1 = record('b1', 'Hero');
		const created = record('new', 'Galería');
		const records = [b1];
		const handleCreate = vi.fn(async () => {
			records.push(created); // mismo array: `blocks.records` refleja el alta
		});
		const say = vi.fn();
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({
			records,
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE, GALLERY_TYPE],
			handleCreate,
			say
		});
		mounted = mountPalette({ blocks, onStructuralChange });

		const items = mounted.target.querySelectorAll<HTMLButtonElement>('.vega-palette-item');
		items[1].click(); // "Galería"
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(GALLERY_TYPE);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
		expect(say).toHaveBeenCalledWith(
			translate('es', 'editor.visual.tree.announceCreate', {
				label: 'Galería',
				position: 2,
				total: 2
			})
		);
	});

	test('creación fallida (el registro no aparece): `onStructuralChange` se llama igual, pero no anuncia nada', async () => {
		const handleCreate = vi.fn(async () => {}); // no muta `records`: la creación "falló"
		const say = vi.fn();
		const onStructuralChange = vi.fn();
		const blocks = fakeBlocksState({
			records: [record('b1', 'Hero')],
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE],
			handleCreate,
			say
		});
		mounted = mountPalette({ blocks, onStructuralChange });

		mounted.target.querySelector<HTMLButtonElement>('.vega-palette-item')!.click();
		await settle();

		expect(handleCreate).toHaveBeenCalledWith(HERO_TYPE);
		expect(onStructuralChange).toHaveBeenCalledTimes(1);
		expect(say).not.toHaveBeenCalled();
	});

	test('guardas: `anyDirty`/`anySaving`/`structuralBusy` deshabilitan Y frenan el arrastre nativo', () => {
		const blocks = fakeBlocksState({
			hasTypeMenu: true,
			blockTypes: [HERO_TYPE],
			anyDirty: true
		});
		mounted = mountPalette({ blocks });

		const item = mounted.target.querySelector<HTMLButtonElement>('.vega-palette-item')!;
		expect(item.disabled).toBe(true);
		expect(item.draggable).toBe(false);
	});
});
