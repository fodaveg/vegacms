/**
 * «Programar…» junto al campo Estado (lote 12, lámina 2), por el sitio donde se enchufa: `RecordForm`
 * montado sobre el adaptador `memory` real, con una colección `posts` con estado y «Publicar el».
 * Se mide QUÉ queda en el servidor y qué dice el aviso, no solo qué se pinta. Cada estado de la
 * lámina (2.1 a 2.10) y el conflicto con el diálogo abierto tienen su caso.
 */
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import RecordForm from './RecordForm.svelte';
import { buildFormModel } from './form-model';
import { proposeScheduleLocal } from './schedule';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import { createMemoryBackend } from '$lib/backend/adapters/memory';
import type { MemoryBackendPort } from '$lib/backend/adapters/memory';
import type { ContentType, Field, ScheduledPublishingState, VegaRecord } from '$lib/backend/types';
import { VegaConflictError, VegaError } from '$lib/backend/errors';
import { resolveContentModel } from '$lib/model/resolve';
import { t as translate } from '$lib/i18n';

vi.mock('$app/navigation', () => ({ beforeNavigate: () => {} }));

const base = {
	required: false,
	readonly: false,
	presentable: false,
	hidden: false,
	unique: false
} as const;

const postsType: ContentType = {
	name: 'posts',
	readonly: false,
	fields: [
		{ ...base, name: 'title', type: 'text', subtype: 'plain', required: true, presentable: true },
		{ ...base, name: 'status', type: 'select', options: ['draft', 'published'], multiple: false },
		{ ...base, name: 'publishAt', type: 'date' }
	] as Field[]
};

const MANIFEST = {
	collections: { posts: { statusField: 'status', publishAtField: 'publishAt' } }
};

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

interface World {
	port: MemoryBackendPort;
	toast: ReturnType<typeof vi.fn>;
	reportError: ReturnType<typeof vi.fn>;
	saved: ReturnType<typeof vi.fn>;
	target: HTMLElement;
	instance: ReturnType<typeof mount>;
}

let world: World | null = null;

// jsdom no implementa `scrollIntoView`, que el foco al primer campo con error sí usa.
Element.prototype.scrollIntoView = vi.fn();

afterEach(async () => {
	if (world) {
		await unmount(world.instance);
		world.target.remove();
		world = null;
	}
});

async function setup(opts: {
	status?: string;
	publishAt?: string | null;
	scheduling?: ScheduledPublishingState;
	title?: string;
	typeReadonly?: boolean;
	onSubmit?: (input: Record<string, unknown>, o?: unknown) => Promise<VegaRecord>;
}): Promise<World> {
	const values = {
		title: opts.title ?? 'Notas del huerto: octubre',
		status: opts.status ?? 'draft',
		publishAt: opts.publishAt ?? null
	};
	const port = createMemoryBackend({
		users: [{ email: 'a@b.c', password: 'pw' }],
		contentTypes: [postsType],
		records: { posts: [{ id: 'p1', values }] }
	});
	await port.login({ email: 'a@b.c', password: 'pw' });
	const resolved = resolveContentModel({ types: [postsType], manifestRaw: MANIFEST });
	const model = { ...resolved, scheduledPublishing: opts.scheduling ?? 'active' };
	const type = model.types.find((t) => t.name === 'posts')!;
	const record: VegaRecord = { id: 'p1', type: 'posts', values };
	const toast = vi.fn();
	const reportError = vi.fn();
	const saved = vi.fn();
	const ctx = {
		port,
		model,
		session: { token: 't', user: { id: 'u', email: 'a@b.c' } },
		t: (key: string, params?: Record<string, string | number>) => translate('es', key, params),
		locale: 'es',
		nav: {},
		// Como la ruta `/c/[type]/[id]`: «Guardado.» + la nota que traiga el formulario.
		feedback: { toast, reportError },
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
			typeReadonly: opts.typeReadonly ?? false,
			onSubmit:
				opts.onSubmit ??
				((input: Record<string, unknown>, o?: unknown) =>
					port.update('posts', 'p1', input as never, o as never)),
			onSaved: (rec: VegaRecord, note?: string) => {
				saved(rec, note);
				toast(note ? `${ctx.t('editor.saveSuccess')} ${note}` : ctx.t('editor.saveSuccess'));
			},
			onCancel: () => {}
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	});
	world = { port, toast, reportError, saved, target, instance };
	await tick();
	return world;
}

const statusRow = (w: World): HTMLElement => w.target.querySelector('[data-field="status"]')!;

function buttonIn(root: ParentNode, label: string): HTMLButtonElement | null {
	return (
		[...root.querySelectorAll<HTMLButtonElement>('button')].find(
			(b) => b.textContent?.trim() === label
		) ?? null
	);
}

const dialog = (w: World): HTMLElement | null => w.target.querySelector('[role="dialog"]');

async function openDialog(w: World, label = 'Programar…'): Promise<HTMLInputElement> {
	buttonIn(w.target, label)!.click();
	flushSync();
	await tick();
	await tick();
	return dialog(w)!.querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
}

async function typeDate(input: HTMLInputElement, local: string): Promise<void> {
	input.value = local;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
	await tick();
}

/** Fecha local `YYYY-MM-DDTHH:mm` a `days` días de hoy, a las 09:00. */
function localAt(days: number): string {
	const d = new Date(Date.now() + days * DAY);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

async function stored(w: World): Promise<Record<string, unknown>> {
	return (await w.port.get('posts', 'p1')).values;
}

describe('RecordForm — estados del control junto a «Estado»', () => {
	test('2.5 borrador: «Programar…» a la derecha del campo Estado, no junto a «Guardar»', async () => {
		const w = await setup({});
		const button = buttonIn(statusRow(w), 'Programar…');
		expect(button).not.toBeNull();
		expect(button!.type).toBe('button');
		expect(button!.closest('.vega-field-inline')?.querySelector('select')).not.toBeNull();
		// La barra superior no gana ningún botón.
		expect(buttonIn(w.target.querySelector('.vega-edit-top') ?? w.target, 'Programar…')).toBeNull();
		expect(w.target.querySelector('.vega-schedule-summary')).toBeNull();
		expect(w.target.querySelector('.vega-schedule-overdue')).toBeNull();
	});

	test('2.6 programada: «Cambiar fecha…» y la línea con «Quitar programación»', async () => {
		const w = await setup({ publishAt: iso(Date.now() + 2 * DAY) });
		expect(buttonIn(statusRow(w), 'Cambiar fecha…')).not.toBeNull();
		expect(buttonIn(statusRow(w), 'Programar…')).toBeNull();
		const summary = statusRow(w).querySelector('.vega-schedule-summary')!;
		expect(summary.textContent).toContain('Se publicará sola el');
		expect(summary.querySelector('b')!.textContent).toMatch(/ a las \d\d:\d\d$/);
		expect(buttonIn(summary, 'Quitar programación')).not.toBeNull();
	});

	test('2.6 «Quitar programación» vacía la fecha y guarda el registro', async () => {
		const w = await setup({ publishAt: iso(Date.now() + 2 * DAY) });
		buttonIn(statusRow(w), 'Quitar programación')!.click();
		await vi.waitFor(async () => expect((await stored(w)).publishAt).toBeNull());
		expect((await stored(w)).status).toBe('draft');
		expect(w.toast).toHaveBeenLastCalledWith('Guardado.');
		// Y el control vuelve a ser el de un borrador sin fecha.
		await tick();
		expect(buttonIn(statusRow(w), 'Programar…')).not.toBeNull();
		expect(w.target.querySelector('.vega-schedule-summary')).toBeNull();
	});

	test('2.7 publicada: sin botón; al pasar a Borrador, vuelve', async () => {
		const w = await setup({ status: 'published' });
		expect(buttonIn(statusRow(w), 'Programar…')).toBeNull();
		const select = statusRow(w).querySelector('select')!;
		select.value = 'draft';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		select.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await tick();
		expect(buttonIn(statusRow(w), 'Programar…')).not.toBeNull();
	});

	test('2.8 programada que no se publicó: aviso con «Publicar ahora» y «Cambiar fecha…», sin botón junto al campo', async () => {
		const w = await setup({ publishAt: iso(Date.now() - 2 * DAY) });
		const notice = statusRow(w).querySelector<HTMLElement>(
			'.vega-field-notice.vega-schedule-overdue'
		)!;
		expect(notice).not.toBeNull();
		expect(notice.getAttribute('role')).toBe('status');
		expect(notice.textContent).toContain('Tenía que publicarse el');
		expect(notice.textContent).toContain('y sigue en borrador.');
		expect(buttonIn(notice, 'Publicar ahora')).not.toBeNull();
		expect(buttonIn(notice, 'Cambiar fecha…')).not.toBeNull();
		expect(statusRow(w).querySelector('.vega-field-inline')).toBeNull();
	});

	test('2.8 no se señala antes de los 5 minutos de retraso', async () => {
		const w = await setup({ publishAt: iso(Date.now() - 2 * 60_000) });
		expect(statusRow(w).querySelector('.vega-schedule-overdue')).toBeNull();
		expect(buttonIn(statusRow(w), 'Programar…')).not.toBeNull();
	});

	test('2.8 «Publicar ahora» publica y vacía la fecha, como habría hecho el servidor', async () => {
		const w = await setup({ publishAt: iso(Date.now() - 2 * DAY) });
		buttonIn(statusRow(w), 'Publicar ahora')!.click();
		await vi.waitFor(async () => expect((await stored(w)).status).toBe('published'));
		expect((await stored(w)).publishAt).toBeNull();
		expect(w.toast).toHaveBeenLastCalledWith('Guardado.');
		await tick();
		expect(w.target.querySelector('.vega-schedule-overdue')).toBeNull();
		expect(buttonIn(statusRow(w), 'Programar…')).toBeNull();
	});

	test('2.9 servidor comprobado sin la publicación programada: el botón NO se pinta y queda el aviso de hoy', async () => {
		const w = await setup({ scheduling: 'inactive' });
		expect(buttonIn(w.target, 'Programar…')).toBeNull();
		expect(w.target.querySelector('button[disabled]')?.textContent).not.toContain('Programar');
		const notice = w.target.querySelector('[data-field="publishAt"] .vega-field-notice')!;
		expect(notice.textContent).toContain('no tiene activada la publicación programada');
	});

	test('solo lectura: sin botón', async () => {
		const w = await setup({ typeReadonly: true });
		expect(buttonIn(w.target, 'Programar…')).toBeNull();
	});
});

describe('RecordForm — el diálogo de «Programar…»', () => {
	test('2.1 abre con foco atrapado, la fecha propuesta (mañana 09:00) y el foco en la fecha', async () => {
		const w = await setup({});
		const input = await openDialog(w);
		expect(dialog(w)!.getAttribute('aria-modal')).toBe('true');
		expect(dialog(w)!.textContent).toContain('«Notas del huerto: octubre» se queda en borrador');
		expect(input.value).toBe(proposeScheduleLocal());
		expect(document.activeElement).toBe(input);
		expect(dialog(w)!.textContent).toContain('Propuesta: mañana a las 09:00.');
		expect(dialog(w)!.querySelector('[data-schedule="unconfirmed"]')).toBeNull();
	});

	test('con una fecha ya puesta, «Cambiar fecha…» abre con ESA fecha y sin la propuesta', async () => {
		const at = Date.now() + 3 * DAY;
		const w = await setup({ publishAt: iso(at) });
		const input = await openDialog(w, 'Cambiar fecha…');
		expect(new Date(input.value).getTime()).toBe(new Date(at).setSeconds(0, 0));
		expect(dialog(w)!.textContent).not.toContain('Propuesta');
	});

	test('Esc cierra y el foco vuelve al botón que lo abrió; Cancelar no guarda nada', async () => {
		const w = await setup({});
		const opener = buttonIn(statusRow(w), 'Programar…')!;
		opener.focus();
		await openDialog(w);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		await tick();
		expect(dialog(w)).toBeNull();
		expect(document.activeElement).toBe(opener);
		expect((await stored(w)).publishAt).toBeNull();
	});

	test('Tab desde el último control vuelve al primero (foco atrapado)', async () => {
		const w = await setup({});
		await openDialog(w);
		const items = [...dialog(w)!.querySelectorAll<HTMLElement>('button, input')];
		items[items.length - 1].focus();
		const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
		document.dispatchEvent(tab);
		expect(tab.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(items[0]);
	});

	test('2.10 confirmar deja borrador + fecha, guarda el registro entero y el aviso lleva la fecha', async () => {
		const w = await setup({});
		// Un cambio sin guardar en OTRO campo: «Programar» guarda el registro entero.
		const title = w.target.querySelector<HTMLInputElement | HTMLTextAreaElement>(
			'#vega-field-title'
		)!;
		title.value = 'Título retocado';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();

		const input = await openDialog(w);
		const local = localAt(2);
		await typeDate(input, local);
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(async () => expect((await stored(w)).publishAt).not.toBeNull());

		const values = await stored(w);
		expect(values.status).toBe('draft');
		expect(values.title).toBe('Título retocado');
		expect(new Date(values.publishAt as string).getTime()).toBe(new Date(local).getTime());
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
		expect(w.toast).toHaveBeenLastCalledWith(
			expect.stringMatching(/^Guardado\. Se publicará el .+ a las 09:00\.$/)
		);
		// El formulario se reasienta: ya está programada.
		expect(buttonIn(statusRow(w), 'Cambiar fecha…')).not.toBeNull();
	});

	test('2.2 una fecha pasada se dice al salir del campo, y no se guarda', async () => {
		const w = await setup({});
		const input = await openDialog(w);
		await typeDate(input, localAt(-2));
		input.dispatchEvent(new Event('blur'));
		flushSync();
		await tick();
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(dialog(w)!.querySelector('.vega-admin-field-error')!.textContent).toContain(
			'Esa hora ya ha pasado'
		);
		const confirm = buttonIn(dialog(w)!, 'Programar')!;
		expect(confirm.getAttribute('aria-disabled')).toBe('true');
		confirm.click();
		await tick();
		expect((await stored(w)).publishAt).toBeNull();
		expect(dialog(w)).not.toBeNull();
	});

	test('2.2 con el error a la vista, corregir la fecha sin salir del campo lo quita y habilita «Programar»', async () => {
		const w = await setup({});
		const input = await openDialog(w);
		await typeDate(input, localAt(-2));
		input.dispatchEvent(new Event('blur'));
		flushSync();
		await tick();
		const confirm = buttonIn(dialog(w)!, 'Programar')!;
		expect(confirm.getAttribute('aria-disabled')).toBe('true');

		// Sin blur: el foco sigue en el campo.
		await typeDate(input, localAt(2));
		flushSync();
		await tick();
		expect(input.getAttribute('aria-invalid')).toBeNull();
		expect(dialog(w)!.querySelector('.vega-admin-field-error')).toBeNull();
		expect(confirm.getAttribute('aria-disabled')).toBe('false');
	});

	test('2.2 el error no sale por primera vez mientras se teclea una fecha pasada', async () => {
		const w = await setup({});
		const input = await openDialog(w);
		await typeDate(input, localAt(-2));
		flushSync();
		await tick();
		expect(dialog(w)!.querySelector('.vega-admin-field-error')).toBeNull();
		expect(buttonIn(dialog(w)!, 'Programar')!.getAttribute('aria-disabled')).toBe('false');
	});

	test('2.3 servidor sin comprobar: aviso dentro del diálogo y SÍ deja programar', async () => {
		const w = await setup({ scheduling: 'unknown' });
		const input = await openDialog(w);
		expect(dialog(w)!.querySelector('[data-schedule="unconfirmed"]')!.textContent).toContain(
			'No se ha podido comprobar si este servidor publica las fechas programadas'
		);
		await typeDate(input, localAt(2));
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(async () => expect((await stored(w)).publishAt).not.toBeNull());
	});

	test('2.4 fallo del servidor: el diálogo sigue abierto con el motivo, «Reintentar», y el registro no se toca', async () => {
		let fail = true;
		const w = await setup({
			onSubmit: async (input) => {
				if (fail) throw VegaError.backend('Failed to update record.');
				return { id: 'p1', type: 'posts', values: input as VegaRecord['values'] };
			}
		});
		const input = await openDialog(w);
		await typeDate(input, localAt(2));
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(() =>
			expect(dialog(w)!.querySelector('[data-schedule="failed"]')).not.toBeNull()
		);

		const failed = dialog(w)!.querySelector('[data-schedule="failed"]')!;
		expect(failed.textContent).toContain('No se ha podido programar');
		expect(failed.textContent).toContain('Failed to update record.');
		expect(w.reportError).not.toHaveBeenCalled();
		// «La entrada sigue como estaba»: ni el estado ni la fecha del formulario cambiaron.
		expect((w.target.querySelector('#vega-field-publishAt') as HTMLInputElement).value).toBe('');
		const retry = buttonIn(dialog(w)!, 'Reintentar')!;
		expect(retry).not.toBeNull();

		fail = false;
		retry.click();
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
		expect(w.saved).toHaveBeenCalledTimes(1);
	});

	test('mientras guarda: «Programando…» y el diálogo no se puede cerrar', async () => {
		let release: (record: VegaRecord) => void = () => {};
		const w = await setup({
			onSubmit: () => new Promise<VegaRecord>((resolve) => (release = resolve))
		});
		const input = await openDialog(w);
		await typeDate(input, localAt(2));
		buttonIn(dialog(w)!, 'Programar')!.click();
		await tick();
		expect(buttonIn(dialog(w)!, 'Programando…')).not.toBeNull();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await tick();
		expect(dialog(w)).not.toBeNull();
		release({ id: 'p1', type: 'posts', values: { title: 'x', status: 'draft' } });
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
	});

	test('errores en otros campos con el diálogo abierto desde el teclado: el foco acaba en el campo, no en «Programar…»', async () => {
		const w = await setup({ title: '' });
		// Como con teclado: el botón TIENE el foco al activarse (un `.click()` a secas no lo enfoca).
		const opener = buttonIn(w.target, 'Programar…')!;
		opener.focus();
		expect(document.activeElement).toBe(opener);
		opener.click();
		flushSync();
		await tick();
		await tick();
		await typeDate(
			dialog(w)!.querySelector<HTMLInputElement>('input[type="datetime-local"]')!,
			localAt(2)
		);
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
		const title = w.target.querySelector<HTMLElement>('#vega-field-title')!;
		await tick();
		await tick();
		expect(document.activeElement).toBe(title);
	});

	test('⌘S con el diálogo de programar abierto no guarda el formulario', async () => {
		const onSubmit = vi.fn(async () => ({ id: 'p1', type: 'posts', values: {} }) as VegaRecord);
		const w = await setup({ onSubmit });
		const title = w.target.querySelector<HTMLInputElement>('#vega-field-title')!;
		title.value = 'Otro título';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await openDialog(w);
		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true })
		);
		await tick();
		await tick();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	test('errores en otros campos: el diálogo se cierra y el foco va al primer campo con error', async () => {
		const w = await setup({ title: '' });
		const input = await openDialog(w);
		await typeDate(input, localAt(2));
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
		const title = w.target.querySelector<HTMLElement>('#vega-field-title')!;
		expect(title.getAttribute('aria-invalid')).toBe('true');
		await vi.waitFor(() => expect(document.activeElement).toBe(title));
		expect(w.saved).not.toHaveBeenCalled();
		expect((await stored(w)).publishAt).toBeNull();
	});

	test('conflicto de edición con el diálogo abierto: se cierra y sale el aviso de siempre', async () => {
		const serverRecord: VegaRecord = {
			id: 'p1',
			type: 'posts',
			values: { title: 'Cambiado por otra persona', status: 'draft', publishAt: null }
		};
		const w = await setup({
			onSubmit: async () => {
				throw new VegaConflictError(serverRecord, 'v-nueva');
			}
		});
		const input = await openDialog(w);
		await typeDate(input, localAt(2));
		buttonIn(dialog(w)!, 'Programar')!.click();
		await vi.waitFor(() => expect(dialog(w)).toBeNull());
		await vi.waitFor(() => expect(w.target.querySelector('.vega-conflict')).not.toBeNull());
		expect(w.reportError).not.toHaveBeenCalled();
		// Lo que el usuario quiso hacer sigue en el formulario para «Guardar igualmente».
		expect((w.target.querySelector('#vega-field-publishAt') as HTMLInputElement).value).not.toBe(
			''
		);
	});
});
