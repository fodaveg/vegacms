/**
 * Suite de componente de `VisualPublishControl.svelte` (lámina del audit p2): estado de la página
 * en la cabecera del editor visual. El puerto es un doble con solo `update`/`buildApiUrl`: lo que
 * se comprueba es QUÉ se escribe (solo `statusField`, con versión esperada), que la etiqueta no
 * cambia hasta que el servidor confirma, y cada estado de la lámina.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualPublishControl from './VisualPublishControl.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, VegaRecord } from '$lib/backend/types';
import { VegaConflictError, VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import type { ResolvedContentType } from '$lib/model/types';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

const pagesType: ContentType = {
	name: 'pages',
	readonly: false,
	fields: [
		{
			name: 'title',
			type: 'text',
			subtype: 'plain',
			required: true,
			readonly: false,
			presentable: true,
			hidden: false,
			unique: false
		},
		{
			name: 'status',
			type: 'select',
			options: ['draft', 'published', 'archived'],
			multiple: false,
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

function resolvedPages(): ResolvedContentType {
	const model = resolveContentModel({
		types: [pagesType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				pages: {
					statusLabels: { draft: 'Borrador', published: 'Publicado', archived: 'Archivada' }
				}
			}
		}
	});
	return model.types.find((t) => t.name === 'pages')!;
}

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

function page(status: string | null): VegaRecord {
	return { id: 'p1', type: 'pages', values: { title: 'Inicio', status } };
}

interface Harness {
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
	update: ReturnType<typeof vi.fn>;
	feedback: { toast: ReturnType<typeof vi.fn>; reportError: ReturnType<typeof vi.fn> };
}

function mountControl(opts: {
	record: VegaRecord;
	type?: ResolvedContentType;
	pendingBlocks?: string[];
	update?: ReturnType<typeof vi.fn>;
	buildApiUrl?: string | null;
}): Harness {
	const update =
		opts.update ??
		vi.fn(async (_type: string, id: string, data: Record<string, unknown>) => ({
			id,
			type: 'pages',
			values: { ...opts.record.values, ...data }
		}));
	const feedback = { toast: vi.fn(), reportError: vi.fn() };
	const ctx = {
		port: { update, buildApiUrl: opts.buildApiUrl ?? null },
		t,
		locale: 'es',
		feedback
	} as unknown as VegaAppContext;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(VisualPublishControl, {
		target,
		props: {
			type: opts.type ?? resolvedPages(),
			record: opts.record,
			name: 'Inicio',
			pendingBlocks: opts.pendingBlocks ?? []
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	return { target, instance, update, feedback };
}

async function settle(): Promise<void> {
	await tick();
	await Promise.resolve();
	await Promise.resolve();
	await tick();
}

const tagText = (h: Harness) =>
	h.target.querySelector('.vega-visual-publish-tag')?.textContent?.trim() ?? null;
const action = (h: Harness) =>
	h.target.querySelector<HTMLButtonElement>('.vega-visual-publish-btn');

describe('VisualPublishControl.svelte', () => {
	let h: Harness | null = null;

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h = null;
		}
	});

	test('sin statusField no pinta nada, ni deshabilitado', () => {
		const type = { ...resolvedPages(), statusField: null };
		h = mountControl({ record: page('draft'), type });
		expect(h.target.querySelector('.vega-visual-publish')).toBeNull();
	});

	test('sin permiso de edición: solo la etiqueta', () => {
		const base = resolvedPages();
		const type = { ...base, permissions: { ...base.permissions, update: false } };
		h = mountControl({ record: page('draft'), type });
		expect(tagText(h)).toBe('Borrador');
		expect(action(h)).toBeNull();
	});

	test('borrador → «Marcar como publicada»: escribe SOLO statusField con la versión, sin optimismo', async () => {
		let release!: (r: VegaRecord) => void;
		const update = vi.fn(
			() =>
				new Promise<VegaRecord>((resolve) => {
					release = resolve;
				})
		);
		const record = page('draft');
		h = mountControl({ record, update });

		expect(tagText(h)).toBe('Borrador');
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.publish'));
		expect(action(h)!.classList.contains('vega-visual-publish-btn--primary')).toBe(true);
		// Rotulado distinto del «Publicar» de la barra superior (`PublishButton`).
		expect(action(h)!.textContent?.trim()).not.toBe(t('topbar.publish.ready'));

		action(h)!.click();
		await settle();

		expect(update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'published' },
			{ expectedVersion: recordVersion(record) }
		);
		// En vuelo: la etiqueta NO cambia; el botón avisa y no pierde el foco.
		expect(tagText(h)).toBe('Borrador');
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.changing'));
		expect(action(h)!.getAttribute('aria-disabled')).toBe('true');
		action(h)!.click();
		expect(update).toHaveBeenCalledTimes(1);

		release(page('published'));
		await settle();
		expect(tagText(h)).toBe('Publicado');
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.unpublish'));
		expect(h.feedback.toast).toHaveBeenCalledWith(
			t('editor.visual.status.success', { name: 'Inicio', label: 'Publicado' }),
			{ kind: 'success' }
		);
	});

	test('con reconstrucción configurada, el éxito avisa de que se verá tras la próxima publicación', async () => {
		h = mountControl({ record: page('draft'), buildApiUrl: 'https://x/api/vega-build' });
		action(h)!.click();
		await settle();
		const [message] = h.feedback.toast.mock.calls[0] as [string];
		expect(message).toContain(t('editor.visual.status.success.rebuild'));
	});

	test('publicada → «Pasar a borrador» no pregunta aunque haya bloques sin guardar', async () => {
		h = mountControl({ record: page('published'), pendingBlocks: ['Galería'] });
		expect(action(h)!.classList.contains('vega-visual-publish-btn--primary')).toBe(false);
		action(h)!.click();
		await settle();
		expect(h.target.querySelector('[role="alertdialog"]')).toBeNull();
		expect(h.update).toHaveBeenCalledWith('pages', 'p1', { status: 'draft' }, expect.anything());
	});

	test('con bloques sin guardar, publicar pide confirmación en línea: foco en Cancelar, Esc cierra', async () => {
		h = mountControl({ record: page('draft'), pendingBlocks: ['Portada: bienvenida', 'Galería'] });
		const button = action(h)!;
		expect(button.getAttribute('aria-expanded')).toBe('false');

		button.click();
		await settle();
		const pop = h.target.querySelector<HTMLElement>('[role="alertdialog"]')!;
		expect(pop).not.toBeNull();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(pop.textContent).toContain(t('editor.visual.status.confirm.title', { count: 2 }));
		expect(pop.textContent).toContain('«Galería»');
		expect(document.activeElement?.textContent?.trim()).toBe(t('common.cancel'));
		expect(h.update).not.toHaveBeenCalled();

		pop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(h.target.querySelector('[role="alertdialog"]')).toBeNull();
		expect(document.activeElement).toBe(button);

		button.click();
		await settle();
		const confirm = [
			...h.target.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')
		].find((b) => b.textContent?.trim() === t('editor.visual.status.confirm.publish'))!;
		confirm.click();
		await settle();
		expect(h.update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'published' },
			expect.anything()
		);
	});

	test('un fallo deja el error junto al botón, reintenta, y la etiqueta no se mueve', async () => {
		const update = vi
			.fn()
			.mockRejectedValueOnce(VegaError.network(undefined, 'Sin conexión con el backend'))
			.mockResolvedValueOnce(page('published'));
		h = mountControl({ record: page('draft'), update });

		action(h)!.click();
		await settle();
		const error = h.target.querySelector<HTMLElement>('.vega-visual-publish-error')!;
		expect(error.getAttribute('role')).toBe('alert');
		expect(error.textContent?.trim()).toBe(t('editor.visual.status.error.publish'));
		expect(error.title).toBe('Sin conexión con el backend');
		expect(h.feedback.reportError).toHaveBeenCalledTimes(1);
		expect(tagText(h)).toBe('Borrador');
		expect(action(h)!.textContent?.trim()).toBe(t('common.retry'));

		action(h)!.click();
		await settle();
		expect(update).toHaveBeenCalledTimes(2);
		expect(tagText(h)).toBe('Publicado');
		expect(h.target.querySelector('.vega-visual-publish-error')).toBeNull();
	});

	test('conflicto de versión: adopta el registro del servidor y pide revisar, sin reintentar solo', async () => {
		const server = page('published');
		const update = vi.fn(async () => {
			throw new VegaConflictError(server, recordVersion(server));
		});
		h = mountControl({ record: page('draft'), update });

		action(h)!.click();
		await settle();
		expect(update).toHaveBeenCalledTimes(1);
		expect(tagText(h)).toBe('Publicado');
		expect(h.target.querySelector('.vega-visual-publish-error')?.textContent?.trim()).toBe(
			t('editor.visual.status.error.conflict')
		);
		// La acción se recalcula sobre la verdad del servidor.
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.unpublish'));
		expect(h.feedback.reportError).not.toHaveBeenCalled();
	});

	test('un valor desconocido sale como «other» con su etiqueta, y la acción es publicar', () => {
		h = mountControl({ record: page('archived') });
		const tag = h.target.querySelector<HTMLElement>('.vega-visual-publish-tag')!;
		expect(tag.textContent?.trim()).toBe('Archivada');
		expect(tag.dataset.statusKind).toBe('other');
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.publish'));
		flushSync();
	});
});
