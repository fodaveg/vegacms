/**
 * `/papelera` montada de verdad: el CABLEADO de `restoreTargetType` (revisión de seguridad del 30
 * sep 2026). `restore.test.ts` prueba la función; este prueba que la página la usa — que una
 * entrada cuya colección es interna de Vega o ya no está en el modelo no ofrece «Restaurar» ni
 * llega a `port.create`, y que una normal restaura con el `name` del tipo del modelo.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { BackendPort, FieldValue } from '$lib/backend';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/papelera') } }));

import TrashPage from '../../routes/papelera/+page.svelte';

const TEXT_FIELD = { name: 'title', type: 'text', required: false, readonly: false };

function contentType(name: string, fields: object[] = [TEXT_FIELD]) {
	return {
		name,
		titleField: 'title',
		schema: { readonly: false, fields }
	};
}

// El `file` obligatorio de `vega_media` (`media-collection.ts`, D-P6.1).
const REQUIRED_FILE_FIELD = { name: 'file', type: 'file', required: true, readonly: false };

/** Una entrada `kind:'delete'` de la papelera, tal y como la devuelve `port.list`. */
function trashEntry(id: string, collection: string) {
	return {
		id,
		type: 'vega_revisions',
		values: {
			collection,
			recordId: `rec_${id}`,
			kind: 'delete',
			label: `Entrada ${id}`,
			author: '',
			created: '2026-09-30T10:00:00.000Z',
			values: { title: 'Hola' } as unknown as FieldValue
		}
	};
}

function mountPage(entries: ReturnType<typeof trashEntry>[], mediaFields?: object[]) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const create = vi.fn(async () => ({ id: 'x', type: 'x', values: {} }));
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		model: {
			revisions: { enabled: true, trashDays: 30 },
			// `vega_revisions` está en el modelo (la papelera está disponible) y `posts` es el tipo
			// normal; `vega_media` es contenido real (se guarda en la papelera) con `file` obligatorio.
			types: [
				contentType('vega_revisions'),
				contentType('vega_media', mediaFields ?? [TEXT_FIELD, REQUIRED_FILE_FIELD]),
				contentType('posts')
			]
		},
		port: {
			capabilities: { explicitRecordId: true },
			list: vi.fn(async () => ({
				items: entries,
				page: 1,
				perPage: 30,
				totalItems: entries.length,
				totalPages: 1
			})),
			create,
			delete: vi.fn(async () => undefined)
		} as unknown as BackendPort,
		feedback: { toast: vi.fn(), reportError: vi.fn() },
		nav: { toSettings: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(TrashPage, { target, context: new Map([[VEGA_CONTEXT_KEY, ctx]]) });
	return { target, instance, create };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 6; i++) await Promise.resolve();
	await tick();
}

function restoreButtons(target: HTMLElement): HTMLButtonElement[] {
	return Array.from(target.querySelectorAll<HTMLButtonElement>('.vega-trash-item')).flatMap(
		(item) =>
			Array.from(item.querySelectorAll('button')).filter(
				(b) => b.textContent?.trim() === 'revisions.trash.restore'
			)
	);
}

describe('/papelera: restaurar valida el destino contra el modelo', () => {
	let mounted: ReturnType<typeof mountPage> | null = null;

	afterEach(async () => {
		if (mounted) {
			await unmount(mounted.instance);
			mounted.target.remove();
			mounted = null;
		}
		vi.restoreAllMocks();
	});

	test.each(['vega_revisions', 'vega', 'vega_editors', 'borrada_del_esquema'])(
		'una entrada de «%s» no ofrece Restaurar y no llega a port.create',
		async (collection) => {
			mounted = mountPage([trashEntry('a', collection)]);
			await settle();
			expect(mounted.target.querySelectorAll('.vega-trash-item')).toHaveLength(1);
			expect(restoreButtons(mounted.target)).toHaveLength(0);
			expect(mounted.target.querySelector('.vega-trash-item-restore-unavailable')).not.toBeNull();
			expect(mounted.create).not.toHaveBeenCalled();
		}
	);

	test('una entrada de un tipo normal restaura con el name del tipo del modelo', async () => {
		mounted = mountPage([trashEntry('b', 'posts')]);
		await settle();
		const buttons = restoreButtons(mounted.target);
		expect(buttons).toHaveLength(1);
		buttons[0].click();
		await settle();
		expect(mounted.create).toHaveBeenCalledTimes(1);
		expect(mounted.create).toHaveBeenCalledWith('posts', { title: 'Hola' }, { id: 'rec_b' });
	});

	test('vega_media con file obligatorio: bloqueada por requiredFile, no por «no existe en el esquema»', async () => {
		mounted = mountPage([trashEntry('m', 'vega_media')]);
		await settle();
		const reason = mounted.target.querySelector('.vega-trash-item-restore-unavailable');
		expect(reason?.textContent).toContain('revisions.trash.restoreBlockedRequiredFile');
		expect(reason?.textContent).not.toContain('restoreUnknownSchema');
		expect(restoreButtons(mounted.target)).toHaveLength(0);
		expect(mounted.create).not.toHaveBeenCalled();
	});

	test('vega_media sin file obligatorio (inalcanzable con el esquema real): sería restaurable', async () => {
		mounted = mountPage([trashEntry('n', 'vega_media')], [TEXT_FIELD]);
		await settle();
		const buttons = restoreButtons(mounted.target);
		expect(buttons).toHaveLength(1);
		buttons[0].click();
		await settle();
		expect(mounted.create).toHaveBeenCalledWith('vega_media', { title: 'Hola' }, { id: 'rec_n' });
	});
});
