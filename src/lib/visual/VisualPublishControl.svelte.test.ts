/**
 * Suite de componente de `VisualPublishControl.svelte` (lámina del audit p2): estado de la página
 * en la cabecera del editor visual. El puerto es un doble con solo `update`/`buildApiUrl`: lo que
 * se comprueba es QUÉ se escribe (solo `statusField`, con versión esperada), que la etiqueta no
 * cambia hasta que el servidor confirma, y cada estado de la lámina.
 *
 * «Programar…» (lámina 2, pieza 2.11): la segunda mitad mide el cableado en este sitio, no la
 * función pura (`schedule.test.ts` ya la cubre): cuándo aparece el botón, que abre el diálogo y
 * que confirmar escribe por el MISMO `update`, con `statusField: 'draft'` + `publishAtField`.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import VisualPublishControl from './VisualPublishControl.svelte';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import type { ContentType, ScheduledPublishingState, VegaRecord } from '$lib/backend/types';
import { VegaConflictError, VegaError } from '$lib/backend/errors';
import { recordVersion } from '$lib/backend/version';
import { formatScheduleMoment, proposeScheduleLocal } from '$lib/form/schedule';
import { isoUtcToLocalInput, localInputToIsoUtc } from '$lib/form/widgets/datetime';
import type { ResolvedContentType } from '$lib/model/types';
import { resolveContentModel } from '$lib/model/resolve';
import type { ReviewFinding } from '$lib/publish-review/publish-review';
import type { ReviewState } from '$lib/publish-review/review-state.svelte';
import {
	blockTarget,
	fakeReviewState,
	fieldTarget,
	finding
} from '$lib/publish-review/review-state.fixture';
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

/** `pages` con «Publicar el» (`publishAtField`), la colección de los casos de «Programar…». */
const scheduledPagesType: ContentType = {
	...pagesType,
	fields: [
		...pagesType.fields,
		{
			name: 'publishAt',
			type: 'date',
			required: false,
			readonly: false,
			presentable: false,
			hidden: false,
			unique: false
		}
	]
};

function resolvedPages(withPublishAt = false): ResolvedContentType {
	const model = resolveContentModel({
		types: [withPublishAt ? scheduledPagesType : pagesType],
		manifestRaw: {
			schemaVersion: 1,
			collections: {
				pages: {
					statusLabels: { draft: 'Borrador', published: 'Publicado', archived: 'Archivada' },
					...(withPublishAt ? { publishAtField: 'publishAt' } : {})
				}
			}
		}
	});
	return model.types.find((t) => t.name === 'pages')!;
}

const t = (key: string, params?: Record<string, string | number>) => translate('es', key, params);

function page(status: string | null, publishAt: string | null = null): VegaRecord {
	return { id: 'p1', type: 'pages', values: { title: 'Inicio', status, publishAt } };
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
	/** `ContentModel.scheduledPublishing`; default `'active'`, como un servidor con `vegaschedule`. */
	scheduling?: ScheduledPublishingState;
	/** La revisión antes de publicar (lote 13), o nada: como un tipo sin revisión. */
	review?: ReviewState;
	onReviewGo?: (finding: ReviewFinding) => void;
	onReviewDescribe?: (finding: ReviewFinding) => void;
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
		model: { scheduledPublishing: opts.scheduling ?? 'active' },
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
			pendingBlocks: opts.pendingBlocks ?? [],
			review: opts.review ?? null,
			onReviewGo: opts.onReviewGo,
			onReviewDescribe: opts.onReviewDescribe
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

	test('con UN bloque sin guardar, la confirmación dice «1 bloque» en singular', async () => {
		h = mountControl({ record: page('draft'), pendingBlocks: ['Galería'] });
		action(h)!.click();
		await settle();
		const pop = h.target.querySelector<HTMLElement>('[role="alertdialog"]')!;
		expect(pop.textContent).toContain('Hay 1 bloque sin guardar');
		expect(pop.textContent).not.toContain('bloques');
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
		expect(pop.textContent).toContain(t('editor.visual.status.confirm.title.many', { count: 2 }));
		// Plural REAL, con el texto literal (no con `t()`, que sería tautológico): ni «bloque(s)».
		expect(pop.textContent).toContain('Hay 2 bloques sin guardar');
		expect(pop.textContent).not.toContain('(s)');
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

// ————— «Programar…» en la cabecera (lámina 2, pieza 2.11): el cableado, no la función pura —————

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const scheduleButton = (h: Harness) =>
	h.target.querySelector<HTMLButtonElement>('.vega-visual-publish-schedule');
const dialog = (h: Harness) => h.target.querySelector<HTMLElement>('[role="dialog"]');
const dateInput = (h: Harness) =>
	dialog(h)?.querySelector<HTMLInputElement>('input[type="datetime-local"]') ?? null;

function dialogButton(h: Harness, label: string): HTMLButtonElement {
	return [...dialog(h)!.querySelectorAll<HTMLButtonElement>('button')].find(
		(b) => b.textContent?.trim() === label
	)!;
}

/** Abre el diálogo desde el botón de la cabecera y devuelve el campo de fecha ya enfocado. */
async function openSchedule(h: Harness): Promise<HTMLInputElement> {
	scheduleButton(h)!.focus();
	scheduleButton(h)!.click();
	flushSync();
	await tick();
	await tick();
	return dateInput(h)!;
}

describe('VisualPublishControl.svelte — «Programar…»', () => {
	let h: Harness | null = null;

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h = null;
		}
	});

	test('borrador con «Publicar el»: «Programar…» junto al botón de estado, mismo rótulo que el formulario', () => {
		h = mountControl({ record: page('draft'), type: resolvedPages(true) });
		expect(tagText(h)).toBe('Borrador');
		expect(action(h)!.textContent?.trim()).toBe(t('editor.visual.status.publish'));
		const button = scheduleButton(h)!;
		expect(button.textContent?.trim()).toBe('Programar…');
		expect(button.type).toBe('button');
		expect(button.dataset.scheduleKind).toBe('draft');
		expect(dialog(h)).toBeNull();
	});

	test('no se ofrece: publicada, sin permiso, sin «Publicar el», o servidor comprobado SIN vegaschedule', () => {
		const withPublishAt = resolvedPages(true);

		h = mountControl({ record: page('published'), type: withPublishAt });
		expect(scheduleButton(h)).toBeNull();
		flushSync();
		void unmount(h.instance);
		h.target.remove();

		const locked = {
			...withPublishAt,
			permissions: { ...withPublishAt.permissions, update: false }
		};
		h = mountControl({ record: page('draft'), type: locked });
		expect(scheduleButton(h)).toBeNull();
		expect(dialog(h)).toBeNull();
		void unmount(h.instance);
		h.target.remove();

		h = mountControl({ record: page('draft') });
		expect(scheduleButton(h)).toBeNull();
		void unmount(h.instance);
		h.target.remove();

		h = mountControl({ record: page('draft'), type: withPublishAt, scheduling: 'inactive' });
		expect(scheduleButton(h)).toBeNull();
		// Deshabilitado tampoco: no se promete nada que el servidor no va a cumplir.
		expect(h.target.querySelector('[aria-disabled="true"]')).toBeNull();
	});

	test('abre el diálogo y confirmar escribe draft + fecha por el MISMO update, con la versión esperada', async () => {
		const record = page('draft');
		h = mountControl({ record, type: resolvedPages(true) });

		const input = await openSchedule(h);
		expect(dialog(h)!.querySelector('h2')?.textContent).toBe(t('editor.schedule.title'));
		expect(dialog(h)!.textContent).toContain('Inicio');
		expect(input.value).toBe(proposeScheduleLocal());
		expect(document.activeElement).toBe(input);
		const expectedIso = localInputToIsoUtc(input.value)!;

		dialogButton(h, t('editor.schedule.confirm')).click();
		await settle();

		expect(h.update).toHaveBeenCalledTimes(1);
		expect(h.update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'draft', publishAt: expectedIso },
			{ expectedVersion: recordVersion(record) }
		);
		expect(dialog(h)).toBeNull();
		expect(h.feedback.toast).toHaveBeenCalledWith(
			t('editor.schedule.savedNote', {
				when: formatScheduleMoment(Date.parse(expectedIso), 'es', t)
			}),
			{ kind: 'success' }
		);
		// La etiqueta es la del registro confirmado: «Programada · fecha», y el botón cambia de rótulo.
		expect(tagText(h)).toMatch(/^Programada · /);
		expect(
			h.target.querySelector<HTMLElement>('.vega-visual-publish-tag')!.dataset.statusKind
		).toBe('scheduled');
		expect(scheduleButton(h)!.textContent?.trim()).toBe('Cambiar fecha…');
		expect(scheduleButton(h)!.dataset.scheduleKind).toBe('scheduled');
		// El foco vuelve al botón que abrió el diálogo.
		expect(document.activeElement).toBe(scheduleButton(h));
	});

	test('ya programada: «Cambiar fecha…» y el diálogo abre con la fecha puesta', async () => {
		const at = iso(Date.now() + 2 * DAY);
		h = mountControl({ record: page('draft', at), type: resolvedPages(true) });
		expect(tagText(h)).toMatch(/^Programada · /);
		expect(scheduleButton(h)!.textContent?.trim()).toBe('Cambiar fecha…');
		const input = await openSchedule(h);
		expect(input.value).toBe(isoUtcToLocalInput(at));
	});

	test('servidor sin confirmar: se ofrece, y el diálogo lleva el aviso', async () => {
		h = mountControl({ record: page('draft'), type: resolvedPages(true), scheduling: 'unknown' });
		expect(scheduleButton(h)!.textContent?.trim()).toBe('Programar…');
		await openSchedule(h);
		expect(dialog(h)!.querySelector('[data-schedule="unconfirmed"]')).not.toBeNull();
	});

	test('Escape cierra sin escribir y el foco vuelve a «Programar…»', async () => {
		h = mountControl({ record: page('draft'), type: resolvedPages(true) });
		await openSchedule(h);
		expect(dialog(h)).not.toBeNull();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		await tick();

		expect(dialog(h)).toBeNull();
		expect(h.update).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(scheduleButton(h));
		expect(tagText(h)).toBe('Borrador');
	});

	test('un fallo al guardar deja el diálogo abierto con el motivo y «Reintentar»; la etiqueta no se mueve', async () => {
		const update = vi
			.fn()
			.mockRejectedValueOnce(VegaError.network(undefined, 'Sin conexión con el backend'))
			.mockImplementationOnce(async (_type: string, id: string, data: Record<string, unknown>) => ({
				id,
				type: 'pages',
				values: { title: 'Inicio', status: 'draft', ...data }
			}));
		h = mountControl({ record: page('draft'), type: resolvedPages(true), update });

		await openSchedule(h);
		dialogButton(h, t('editor.schedule.confirm')).click();
		await settle();

		expect(update).toHaveBeenCalledTimes(1);
		expect(dialog(h)).not.toBeNull();
		const failed = dialog(h)!.querySelector<HTMLElement>('[data-schedule="failed"]')!;
		expect(failed.getAttribute('role')).toBe('alert');
		expect(failed.textContent).toContain('Sin conexión con el backend');
		expect(dialogButton(h, t('editor.schedule.retry'))).not.toBeUndefined();
		// El motivo se lee en el diálogo, no en el feedback global (como en el formulario).
		expect(h.feedback.reportError).not.toHaveBeenCalled();
		expect(tagText(h)).toBe('Borrador');
		expect(h.target.querySelector('.vega-visual-publish-error')).toBeNull();

		dialogButton(h, t('editor.schedule.retry')).click();
		await settle();
		expect(update).toHaveBeenCalledTimes(2);
		expect(dialog(h)).toBeNull();
		expect(tagText(h)).toMatch(/^Programada · /);
	});

	test('conflicto de versión: cierra el diálogo, adopta el registro del servidor y pide revisar', async () => {
		const server = page('published');
		const update = vi.fn(async () => {
			throw new VegaConflictError(server, recordVersion(server));
		});
		h = mountControl({ record: page('draft'), type: resolvedPages(true), update });

		await openSchedule(h);
		dialogButton(h, t('editor.schedule.confirm')).click();
		await settle();
		await settle();

		expect(dialog(h)).toBeNull();
		expect(tagText(h)).toBe('Publicado');
		expect(h.target.querySelector('.vega-visual-publish-error')?.textContent?.trim()).toBe(
			t('editor.visual.status.error.conflict')
		);
		// Publicada: ya no hay nada que programar; el foco cae en el botón de estado.
		expect(scheduleButton(h)).toBeNull();
		expect(document.activeElement).toBe(action(h));
		expect(h.feedback.reportError).not.toHaveBeenCalled();
	});
});

// ————— Revisión antes de publicar (lote 13, lámina 2.1-2.5): el popover con los avisos —————

const DESCRIPTION = finding('seo.description-long', fieldTarget('description', 'Descripción'), {
	params: { length: 211, max: 160 }
});
const BROKEN = finding('link.broken', blockTarget('b2', 2, 'Texto rico', 'body', 'Contenido'), {
	params: { href: '/precios' },
	reason: 'not-found'
});
const ALT = finding('media.alt-missing', blockTarget('b3', 3, 'Galería', 'images', 'Imágenes'), {
	params: { file: 'chaqueta.jpg' },
	mediaId: 'm1'
});

const pop = (h: Harness) => h.target.querySelector<HTMLElement>('[role="alertdialog"]');
const popTitle = (h: Harness) =>
	pop(h)?.querySelector('.vega-visual-publish-pop-title')?.textContent?.trim() ?? null;
const popButton = (h: Harness, label: string) =>
	[...(pop(h)?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
		(b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label
	) ?? null;

describe('VisualPublishControl.svelte — revisión antes de publicar', () => {
	let h: Harness | null = null;

	afterEach(async () => {
		if (h) {
			await unmount(h.instance);
			h.target.remove();
			h = null;
		}
	});

	test('2.5 sin avisos (todo comprobado): publica a la primera, sin popover', async () => {
		h = mountControl({ record: page('draft'), review: fakeReviewState() });
		action(h)!.click();
		await settle();
		expect(pop(h)).toBeNull();
		expect(h.update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'published' },
			expect.anything()
		);
	});

	test('un tipo sin comprobaciones que apliquen tampoco pregunta', async () => {
		h = mountControl({
			record: page('draft'),
			review: fakeReviewState({ enabled: false, phase: 'idle', groups: [] })
		});
		action(h)!.click();
		await settle();
		expect(pop(h)).toBeNull();
		expect(h.update).toHaveBeenCalledTimes(1);
	});

	test('2.1 con avisos: confirmación en tono de aviso con la lista, foco en Cancelar, Esc cierra, y publica solo al confirmar', async () => {
		h = mountControl({
			record: page('draft'),
			review: fakeReviewState({ findings: [DESCRIPTION, BROKEN, ALT] })
		});
		const button = action(h)!;
		expect(button.getAttribute('aria-expanded')).toBe('false');
		button.click();
		await settle();

		const dialog = pop(h)!;
		expect(dialog.classList.contains('vega-visual-publish-pop--review')).toBe(true);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(popTitle(h)).toBe('Antes de publicar: 3 avisos');
		expect(dialog.querySelectorAll('[data-review-group]')).toHaveLength(3);
		expect(
			dialog.querySelector('#' + dialog.getAttribute('aria-describedby'))?.textContent?.trim()
		).toBe('Ningún aviso impide publicar. Puedes publicar igualmente o arreglarlos antes.');
		expect(document.activeElement?.textContent?.trim()).toBe(t('common.cancel'));
		expect(h.update).not.toHaveBeenCalled();

		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(pop(h)).toBeNull();
		expect(document.activeElement).toBe(button);
		expect(h.update).not.toHaveBeenCalled();

		button.click();
		await settle();
		popButton(h, 'Publicar igualmente')!.click();
		await settle();
		expect(h.update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'published' },
			expect.anything()
		);
	});

	test('2.1 las acciones del popover: campo → abrir el formulario; bloque → el árbol; imagen → su ficha; y se cierra', async () => {
		const onReviewGo = vi.fn();
		const onReviewDescribe = vi.fn();
		h = mountControl({
			record: page('draft'),
			review: fakeReviewState({ findings: [DESCRIPTION, BROKEN, ALT] }),
			onReviewGo,
			onReviewDescribe
		});
		action(h)!.click();
		await settle();
		const toForm = popButton(h, 'Abrir Descripción en el formulario')!;
		expect(toForm.textContent?.trim()).toBe('Abrir Descripción en el formulario');
		toForm.click();
		await settle();
		expect(onReviewGo).toHaveBeenLastCalledWith(DESCRIPTION);
		expect(pop(h)).toBeNull();

		action(h)!.click();
		await settle();
		const toBlock = popButton(h, 'Bloque 2 · Texto rico: elegirlo en el árbol')!;
		expect(toBlock.textContent?.trim()).toBe('Bloque 2 · Texto rico');
		expect(toBlock.getAttribute('aria-label')?.startsWith('Bloque 2 · Texto rico')).toBe(true);
		toBlock.click();
		await settle();
		expect(onReviewGo).toHaveBeenLastCalledWith(BROKEN);
		expect(pop(h)).toBeNull();

		action(h)!.click();
		await settle();
		popButton(h, 'Describir la imagen…')!.click();
		await settle();
		expect(onReviewDescribe).toHaveBeenCalledWith(ALT);
		expect(pop(h)).toBeNull();
		expect(h.update).not.toHaveBeenCalled();
	});

	test('2.2 con avisos Y un bloque sin guardar: UNA sola confirmación con las dos cosas', async () => {
		h = mountControl({
			record: page('draft'),
			pendingBlocks: ['Reserva tu plaza'],
			review: fakeReviewState({ findings: [BROKEN] })
		});
		action(h)!.click();
		await settle();
		expect(h.target.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
		const dialog = pop(h)!;
		expect(popTitle(h)).toBe('Antes de publicar');
		expect(dialog.textContent).toContain('Hay 1 bloque sin guardar');
		expect(dialog.textContent).toContain('«Reserva tu plaza»');
		expect(dialog.textContent).toContain(t('editor.visual.status.confirm.body'));
		expect(dialog.querySelectorAll('[data-review-group]')).toHaveLength(3);
		expect(document.activeElement?.textContent?.trim()).toBe(t('common.cancel'));

		popButton(h, 'Publicar igualmente')!.click();
		await settle();
		expect(h.update).toHaveBeenCalledTimes(1);
		expect(h.target.querySelectorAll('[role="alertdialog"]')).toHaveLength(0);
	});

	test('bloques sin guardar con la revisión cargando o fallida: el pie no dice «Ningún aviso impide publicar»', async () => {
		const review = fakeReviewState({ phase: 'loading' });
		h = mountControl({ record: page('draft'), pendingBlocks: ['Reserva tu plaza'], review });
		action(h)!.click();
		await settle();
		const body = () => {
			const dialog = pop(h!)!;
			return dialog.querySelector('#' + dialog.getAttribute('aria-describedby'))!;
		};
		expect(popTitle(h)).toBe('Antes de publicar');
		expect(body().textContent?.trim()).toBe(
			`${t('editor.visual.review.checking.title')} ${t('editor.visual.review.checking.body')}`
		);
		expect(pop(h)!.textContent).not.toContain(t('review.notBlocking'));

		review.set({ phase: 'error', errorMessage: 'Demasiados bloques' });
		flushSync();
		await settle();
		expect(body().textContent?.trim()).toBe(t('editor.visual.review.error'));
		expect(pop(h)!.textContent).not.toContain(t('review.notBlocking'));
		expect(pop(h)!.querySelector('.vega-review-error')).not.toBeNull();
	});

	test('solo bloques sin guardar (revisión en regla): el popover de siempre, en tono info', async () => {
		h = mountControl({
			record: page('draft'),
			pendingBlocks: ['Galería'],
			review: fakeReviewState()
		});
		action(h)!.click();
		await settle();
		expect(popTitle(h)).toBe('Hay 1 bloque sin guardar');
		expect(pop(h)!.classList.contains('vega-visual-publish-pop--review')).toBe(false);
		expect(pop(h)!.querySelector('[data-review-group]')).toBeNull();
	});

	test('2.3 revisando todavía: «Publicar sin esperar»; al terminar sin avisos se rellena en el sitio y NO publica solo', async () => {
		const review = fakeReviewState({ phase: 'loading' });
		h = mountControl({ record: page('draft'), review });
		action(h)!.click();
		await settle();
		const dialog = pop(h)!;
		expect(popTitle(h)).toBe('Revisando la página…');
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		const body = dialog.querySelector('#' + dialog.getAttribute('aria-describedby'))!;
		expect(body.textContent?.trim()).toBe(
			'Tarda un momento. Puedes esperar o publicar sin la revisión.'
		);
		expect(body.getAttribute('aria-live')).toBe('polite');
		expect(popButton(h, 'Publicar sin esperar')).not.toBeNull();
		expect(document.activeElement?.textContent?.trim()).toBe(t('common.cancel'));

		review.set({ phase: 'ready' });
		flushSync();
		await settle();
		expect(pop(h)).not.toBeNull();
		expect(popTitle(h)).toBe('Sin avisos');
		expect(popButton(h, 'Marcar como publicada')).not.toBeNull();
		expect(h.update).not.toHaveBeenCalled();

		popButton(h, 'Marcar como publicada')!.click();
		await settle();
		expect(h.update).toHaveBeenCalledTimes(1);
	});

	test('2.3 al terminar CON avisos, el popover pasa a la lista', async () => {
		const review = fakeReviewState({ phase: 'loading' });
		h = mountControl({ record: page('draft'), review });
		action(h)!.click();
		await settle();
		review.set({ phase: 'ready', findings: [DESCRIPTION] });
		flushSync();
		await settle();
		expect(popTitle(h)).toBe('Antes de publicar: 1 aviso');
		expect(pop(h)!.querySelectorAll('[data-review-group]')).toHaveLength(3);
		expect(popButton(h, 'Publicar igualmente')).not.toBeNull();
		expect(h.update).not.toHaveBeenCalled();
	});

	test('«Publicar sin esperar» publica sin la revisión', async () => {
		h = mountControl({ record: page('draft'), review: fakeReviewState({ phase: 'loading' }) });
		action(h)!.click();
		await settle();
		popButton(h, 'Publicar sin esperar')!.click();
		await settle();
		expect(h.update).toHaveBeenCalledWith(
			'pages',
			'p1',
			{ status: 'published' },
			expect.anything()
		);
	});

	test('2.4 no se pudo revisar: el error con «Reintentar», y publicar sigue a mano', async () => {
		const review = fakeReviewState({ phase: 'error', errorMessage: 'Demasiados bloques' });
		h = mountControl({ record: page('draft'), review });
		action(h)!.click();
		await settle();
		expect(popTitle(h)).toBe('No se ha podido revisar la página');
		const error = pop(h)!.querySelector<HTMLElement>('.vega-review-error')!;
		expect(error.textContent).toContain('No se han podido leer los bloques de la página');
		popButton(h, t('common.retry'))!.click();
		expect(review.reload).toHaveBeenCalledTimes(1);
		expect(pop(h)!.textContent).toContain('Ningún aviso impide publicar.');
		expect(popButton(h, 'Publicar igualmente')).not.toBeNull();
		expect(h.update).not.toHaveBeenCalled();
	});

	test('cero avisos con algo sin comprobar también pregunta («revisión incompleta»)', async () => {
		h = mountControl({
			record: page('draft'),
			review: fakeReviewState({ skipped: ['link.broken', 'link.draft-target'] })
		});
		action(h)!.click();
		await settle();
		expect(popTitle(h)).toBe('Antes de publicar: revisión incompleta');
		expect(pop(h)!.textContent).toContain('No comprobado');
		expect(popButton(h, 'Publicar igualmente')).not.toBeNull();
	});

	test('«Pasar a borrador» nunca pregunta, ni con avisos', async () => {
		h = mountControl({
			record: page('published'),
			review: fakeReviewState({ findings: [DESCRIPTION] })
		});
		action(h)!.click();
		await settle();
		expect(pop(h)).toBeNull();
		expect(h.update).toHaveBeenCalledWith('pages', 'p1', { status: 'draft' }, expect.anything());
	});
});
