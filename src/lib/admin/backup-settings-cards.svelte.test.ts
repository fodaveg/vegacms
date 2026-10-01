/**
 * Las dos tarjetas de ajustes de `/copias` (`AutoBackupsCard`, `DestinationCard`) con una sección
 * `serverSettings` de mentira, en todos sus estados: resumen, formularios, errores locales y del
 * servidor, guardando, prueba en curso/correcta/fallida y lo que viaja (o no) en el parche.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { VEGA_CONTEXT_KEY, type VegaAppContext } from '$lib/app-context';
import {
	VegaError,
	type ConnectionTestOutcome,
	type ServerSettings,
	type ServerSettingsPort
} from '$lib/backend';
import AutoBackupsCard from '../../routes/copias/AutoBackupsCard.svelte';
import DestinationCard from '../../routes/copias/DestinationCard.svelte';

const BASE: ServerSettings = {
	meta: { appURL: 'https://cms.example.test' },
	smtp: { enabled: false, host: '', port: 587, username: '', tls: false },
	backups: {
		cron: '',
		cronMaxKeep: 3,
		s3: {
			enabled: false,
			endpoint: '',
			bucket: '',
			region: '',
			accessKey: '',
			forcePathStyle: false
		}
	}
};

function withBackups(patch: Partial<ServerSettings['backups']>): ServerSettings {
	return { ...BASE, backups: { ...BASE.backups, ...patch } };
}

const EXTERNAL = withBackups({
	cron: '0 0 * * *',
	cronMaxKeep: 7,
	s3: {
		enabled: true,
		endpoint: 'https://s3.example.test',
		bucket: 'copias',
		region: 'eu',
		accessKey: 'AK',
		forcePathStyle: false
	}
});

function fakeSection(overrides: Partial<ServerSettingsPort> = {}): ServerSettingsPort {
	return {
		get: vi.fn(async () => BASE),
		update: vi.fn(async () => BASE),
		testS3: vi.fn(async () => ({ ok: true }) as ConnectionTestOutcome),
		testEmail: vi.fn(async () => ({ ok: true }) as ConnectionTestOutcome),
		...overrides
	};
}

type Mounted = { target: HTMLElement; instance: Record<string, never>; ctx: VegaAppContext };

function mountCard(
	component: typeof AutoBackupsCard | typeof DestinationCard,
	props: Record<string, unknown>
): Mounted {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const instance = mount(component as never, {
		target,
		props,
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	return { target, instance, ctx };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 6; i++) await Promise.resolve();
	await tick();
}

function button(target: HTMLElement, text: string): HTMLButtonElement {
	const found = Array.from(target.querySelectorAll('button')).find((b) =>
		b.textContent?.includes(text)
	);
	if (!found) throw new Error(`No hay botón con «${text}»`);
	return found;
}

function field<T extends HTMLElement>(target: HTMLElement, selector: string): T {
	const found = target.querySelector<T>(selector);
	if (!found) throw new Error(`No hay ${selector}`);
	return found;
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
	select.value = value;
	select.dispatchEvent(new Event('change', { bubbles: true }));
	await settle();
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
}

async function submit(target: HTMLElement): Promise<void> {
	field<HTMLFormElement>(target, 'form').dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true })
	);
	await settle();
}

function validation(fieldErrors: Record<string, string>, message = 'Server says no'): VegaError {
	return VegaError.validation(
		Object.fromEntries(
			Object.entries(fieldErrors).map(([path, text]) => [
				path,
				{ code: 'validation_error', message: text }
			])
		),
		message
	);
}

let mounted: Mounted | null = null;
afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.restoreAllMocks();
});

describe('AutoBackupsCard', () => {
	function mountAuto(settings: ServerSettings, section = fakeSection()) {
		const onSaved = vi.fn();
		mounted = mountCard(AutoBackupsCard, { settings, section, onSaved });
		return { section, onSaved, target: mounted.target };
	}

	test('desactivadas: explica que solo hay copia manual y ofrece «Programar copias»', () => {
		const { target } = mountAuto(BASE);
		expect(target.textContent).toContain('admin.backups.auto.offBody');
		expect(target.querySelector('.vega-admin-tag')).toBeNull();
		expect(button(target, 'admin.backups.auto.schedule')).toBeTruthy();
	});

	test('activadas con una de la lista: etiqueta, frecuencia en llano y cuántas se conservan', () => {
		const { target } = mountAuto(withBackups({ cron: '0 0 * * 0', cronMaxKeep: 4 }));
		expect(target.querySelector('.vega-admin-tag')?.textContent).toBe('admin.backups.auto.on');
		expect(target.textContent).toContain('admin.backups.auto.weekly');
		expect(target.textContent).toContain('admin.backups.auto.keepValue:{"count":4}');
	});

	test('expresión propia: se enseña literal, sin traducirla', () => {
		const { target } = mountAuto(withBackups({ cron: '30 3 * * 1,4', cronMaxKeep: 12 }));
		expect(target.querySelector('dd code')?.textContent).toBe('30 3 * * 1,4');
	});

	test('formulario desde «Nunca»: sin «cuántas conservar» y con su ayuda', async () => {
		const { target } = mountAuto(BASE);
		button(target, 'admin.backups.auto.schedule').click();
		await settle();
		expect(field<HTMLSelectElement>(target, 'select').value).toBe('never');
		expect(target.querySelector('input[type="number"]')).toBeNull();
		expect(target.textContent).toContain('admin.backups.auto.neverHelp');
	});

	test('una expresión guardada que no es de la lista abre en «Personalizada» con su valor', async () => {
		const { target } = mountAuto(withBackups({ cron: '30 3 * * 1,4', cronMaxKeep: 12 }));
		button(target, 'admin.settings.change').click();
		await settle();
		expect(field<HTMLSelectElement>(target, 'select').value).toBe('custom');
		expect(field<HTMLInputElement>(target, 'input[type="text"]').value).toBe('30 3 * * 1,4');
		expect(field<HTMLInputElement>(target, 'input[type="number"]').value).toBe('12');
	});

	test('guardar solo manda lo que cambió y nunca toca backups.s3', async () => {
		const next = withBackups({ cron: '0 0 * * 0', cronMaxKeep: 7 });
		const section = fakeSection({ update: vi.fn(async () => next) });
		const { target, onSaved } = mountAuto(
			withBackups({ cron: '0 0 * * *', cronMaxKeep: 7 }),
			section
		);
		button(target, 'admin.settings.change').click();
		await settle();
		await choose(field<HTMLSelectElement>(target, 'select'), 'weekly');
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({ backups: { cron: '0 0 * * 0' } });
		expect(onSaved).toHaveBeenCalledWith(next);
		expect(mounted!.ctx.feedback.toast).toHaveBeenCalled();
		expect(target.querySelector('form')).toBeNull();
	});

	test('«Nunca» manda la expresión vacía', async () => {
		const section = fakeSection();
		const { target } = mountAuto(withBackups({ cron: '0 0 * * *', cronMaxKeep: 7 }), section);
		button(target, 'admin.settings.change').click();
		await settle();
		await choose(field<HTMLSelectElement>(target, 'select'), 'never');
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({ backups: { cron: '' } });
	});

	test('sin cambios, guardar cierra sin pedir nada al servidor', async () => {
		const section = fakeSection();
		const { target } = mountAuto(withBackups({ cron: '0 0 * * *', cronMaxKeep: 7 }), section);
		button(target, 'admin.settings.change').click();
		await settle();
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
		expect(target.querySelector('form')).toBeNull();
	});

	test('un 0 en «cuántas conservar» lo para Vega, al salir del campo y al guardar', async () => {
		const section = fakeSection();
		const { target } = mountAuto(withBackups({ cron: '0 0 * * *', cronMaxKeep: 7 }), section);
		button(target, 'admin.settings.change').click();
		await settle();
		const keep = field<HTMLInputElement>(target, 'input[type="number"]');
		await type(keep, '0');
		keep.dispatchEvent(new Event('blur'));
		await settle();
		expect(target.querySelector('.vega-admin-field-error')?.textContent).toBe(
			'admin.backups.auto.keepMin'
		);
		expect(keep.getAttribute('aria-invalid')).toBe('true');
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
	});

	test('«Personalizada» sin expresión se para en local', async () => {
		const section = fakeSection();
		const { target } = mountAuto(BASE, section);
		button(target, 'admin.backups.auto.schedule').click();
		await settle();
		await choose(field<HTMLSelectElement>(target, 'select'), 'custom');
		await submit(target);
		expect(target.textContent).toContain('admin.backups.auto.cronRequired');
		expect(section.update).not.toHaveBeenCalled();
	});

	test('el servidor rechaza la expresión: su mensaje va tal cual bajo el campo y el formulario sigue abierto', async () => {
		const section = fakeSection({
			update: vi.fn(async () => {
				throw validation({ 'backups.cron': 'Invalid cron expression' });
			})
		});
		const { target } = mountAuto(BASE, section);
		button(target, 'admin.backups.auto.schedule').click();
		await settle();
		await choose(field<HTMLSelectElement>(target, 'select'), 'custom');
		await type(field<HTMLInputElement>(target, 'input[type="text"]'), 'cada lunes');
		await submit(target);
		expect(
			target.querySelector(
				'#' + field(target, 'input[type="text"]').getAttribute('aria-describedby')
			)?.textContent
		).toContain('Invalid cron expression');
		expect(target.querySelector('form')).not.toBeNull();
		// Escribir de nuevo limpia el error de ese campo.
		await type(field<HTMLInputElement>(target, 'input[type="text"]'), '0 3 * * 1');
		expect(field(target, 'input[type="text"]').getAttribute('aria-invalid')).toBeNull();
	});

	test('guardando: formulario ocupado, botones con aria-disabled y un segundo envío no repite', async () => {
		let release: (value: ServerSettings) => void = () => {};
		const section = fakeSection({
			update: vi.fn(() => new Promise<ServerSettings>((resolve) => (release = resolve)))
		});
		const { target } = mountAuto(BASE, section);
		button(target, 'admin.backups.auto.schedule').click();
		await settle();
		await choose(field<HTMLSelectElement>(target, 'select'), 'daily');
		await submit(target);
		expect(field(target, 'form').getAttribute('aria-busy')).toBe('true');
		expect(button(target, 'admin.settings.saving').getAttribute('aria-disabled')).toBe('true');
		expect(button(target, 'common.cancel').getAttribute('aria-disabled')).toBe('true');
		await submit(target);
		expect(section.update).toHaveBeenCalledTimes(1);
		release(withBackups({ cron: '0 0 * * *' }));
		await settle();
		expect(target.querySelector('form')).toBeNull();
	});

	test('cancelar vuelve al resumen sin guardar', async () => {
		const section = fakeSection();
		const { target } = mountAuto(withBackups({ cron: '0 0 * * *' }), section);
		button(target, 'admin.settings.change').click();
		await settle();
		button(target, 'common.cancel').click();
		await settle();
		expect(target.querySelector('form')).toBeNull();
		expect(section.update).not.toHaveBeenCalled();
	});
});

describe('DestinationCard', () => {
	function mountDest(settings: ServerSettings, section = fakeSection()) {
		const onSaved = vi.fn();
		mounted = mountCard(DestinationCard, { settings, section, onSaved });
		return { section, onSaved, target: mounted.target };
	}

	test('sin configurar: dice sin adornos que es este servidor y no ofrece probar', () => {
		const { target } = mountDest(BASE);
		expect(target.textContent).toContain('admin.backups.dest.local');
		expect(target.querySelector('.vega-admin-tag')).toBeNull();
		expect(target.querySelector('.vega-admin-test')).toBeNull();
	});

	test('almacén externo: etiqueta, servidor, bucket y región, y «Probar conexión»', () => {
		const { target } = mountDest(EXTERNAL);
		expect(target.querySelector('.vega-admin-tag')?.textContent).toBe(
			'admin.backups.dest.external'
		);
		const codes = Array.from(target.querySelectorAll('dd code')).map((c) => c.textContent);
		expect(codes).toEqual(['https://s3.example.test', 'copias', 'eu']);
		expect(button(target, 'admin.settings.test')).toBeTruthy();
	});

	test('prueba en curso: «Cambiar» y la propia prueba quedan con aria-disabled; luego, correcta con la hora', async () => {
		let resolve: (outcome: ConnectionTestOutcome) => void = () => {};
		const section = fakeSection({
			testS3: vi.fn(() => new Promise<ConnectionTestOutcome>((r) => (resolve = r)))
		});
		const { target } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.test').click();
		await settle();
		expect(target.querySelector('[data-backups-test="testing"]')).not.toBeNull();
		expect(button(target, 'admin.settings.testing').getAttribute('aria-disabled')).toBe('true');
		expect(button(target, 'admin.settings.change').getAttribute('aria-disabled')).toBe('true');
		button(target, 'admin.settings.change').click();
		await settle();
		expect(target.querySelector('form')).toBeNull();

		resolve({ ok: true });
		await settle();
		const result = target.querySelector('[role="status"]');
		expect(result?.textContent).toContain('admin.settings.testOk');
		expect(result?.textContent).toContain('admin.backups.dest.testOkAt');
	});

	test('prueba fallida: el texto del servidor va como TEXTO, con la consecuencia y «Cambiar los datos»', async () => {
		const raw = 'Failed to test the S3 filesystem. Raw error: <img src=x onerror=alert(1)> 403';
		const section = fakeSection({ testS3: vi.fn(async () => ({ ok: false, message: raw })) });
		const { target } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.test').click();
		await settle();
		const output = field(target, 'pre.vega-admin-output');
		expect(output.textContent).toBe(raw);
		expect(output.querySelector('img')).toBeNull();
		expect(target.querySelector('[role="alert"]')?.textContent).toContain(
			'admin.backups.dest.testFailBody'
		);
		button(target, 'admin.backups.dest.testFailChange').click();
		await settle();
		expect(target.querySelector('form')).not.toBeNull();
	});

	test('una prueba que no llega al servidor sale por el aviso general y no deja la tarjeta atascada', async () => {
		const section = fakeSection({
			testS3: vi.fn(async () => {
				throw VegaError.network();
			})
		});
		const { target } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.test').click();
		await settle();
		expect(mounted!.ctx.feedback.reportError).toHaveBeenCalled();
		expect(button(target, 'admin.settings.test').getAttribute('aria-disabled')).toBe('false');
	});

	test('formulario desde «este servidor»: sin campos del almacén y sin nota', async () => {
		const { target } = mountDest(BASE);
		button(target, 'admin.settings.change').click();
		await settle();
		expect(target.querySelectorAll('input[type="radio"]')).toHaveLength(2);
		expect(target.querySelector('input[type="url"]')).toBeNull();
		expect(target.querySelector('[data-backups-note]')).toBeNull();
	});

	test('elegir el almacén enseña los campos con la clave secreta SIEMPRE vacía y la nota de que no se mueve nada', async () => {
		const { target } = mountDest(BASE);
		button(target, 'admin.settings.change').click();
		await settle();
		field<HTMLInputElement>(target, 'input[value="s3"]').click();
		await settle();
		expect(field<HTMLInputElement>(target, 'input[type="password"]').value).toBe('');
		expect(target.textContent).toContain('admin.backups.dest.secretHelp');
		expect(target.querySelector('[data-backups-note="s3"]')?.textContent).toContain(
			'admin.backups.dest.noteToExternal'
		);
		expect(field<HTMLInputElement>(target, 'input[type="password"]').autocomplete).toBe(
			'new-password'
		);
	});

	test('guardar el almacén por primera vez manda lo escrito, con la clave secreta, y avisa de que cambió el destino', async () => {
		const next = EXTERNAL;
		const section = fakeSection({ update: vi.fn(async () => next) });
		const { target, onSaved } = mountDest(BASE, section);
		button(target, 'admin.settings.change').click();
		await settle();
		field<HTMLInputElement>(target, 'input[value="s3"]').click();
		await settle();
		await type(field(target, 'input[type="url"]'), ' https://s3.example.test ');
		const texts = target.querySelectorAll<HTMLInputElement>('input[type="text"]');
		await type(texts[0], 'copias');
		await type(texts[1], 'eu');
		await type(texts[2], 'AK');
		await type(field(target, 'input[type="password"]'), 'la-clave');
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({
			backups: {
				s3: {
					enabled: true,
					endpoint: 'https://s3.example.test',
					bucket: 'copias',
					region: 'eu',
					accessKey: 'AK',
					secret: 'la-clave'
				}
			}
		});
		expect(onSaved).toHaveBeenCalledWith(next, true);
	});

	test('cambiar otro campo con la clave vacía NO manda ninguna clave secreta, y no avisa de cambio de destino', async () => {
		const section = fakeSection({ update: vi.fn(async () => EXTERNAL) });
		const { target, onSaved } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.change').click();
		await settle();
		expect(target.querySelector('[data-backups-note]')).toBeNull();
		const texts = target.querySelectorAll<HTMLInputElement>('input[type="text"]');
		await type(texts[0], 'otro-bucket');
		await submit(target);
		const patch = (section.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(patch).toEqual({ backups: { s3: { bucket: 'otro-bucket' } } });
		expect(JSON.stringify(patch)).not.toContain('secret');
		expect(onSaved).toHaveBeenCalledWith(EXTERNAL, false);
	});

	test('volver a este servidor: solo enabled:false, con la nota de que los datos se conservan', async () => {
		const section = fakeSection({ update: vi.fn(async () => BASE) });
		const { target, onSaved } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.change').click();
		await settle();
		field<HTMLInputElement>(target, 'input[value="local"]').click();
		await settle();
		expect(target.querySelector('input[type="url"]')).toBeNull();
		expect(target.querySelector('[data-backups-note="local"]')?.textContent).toContain(
			'admin.backups.dest.noteToLocal'
		);
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({ backups: { s3: { enabled: false } } });
		expect(onSaved).toHaveBeenCalledWith(BASE, true);
	});

	test('errores del servidor: uno bajo cada campo y el mensaje general, con el formulario abierto', async () => {
		const section = fakeSection({
			update: vi.fn(async () => {
				throw validation(
					{
						'backups.s3.endpoint': 'Must be a valid URL.',
						'backups.s3.secret': 'Cannot be blank.'
					},
					'An error occurred while saving the new settings.'
				);
			})
		});
		const { target } = mountDest(BASE, section);
		button(target, 'admin.settings.change').click();
		await settle();
		field<HTMLInputElement>(target, 'input[value="s3"]').click();
		await settle();
		await submit(target);
		const errors = Array.from(target.querySelectorAll('.vega-admin-field-error')).map(
			(e) => e.textContent
		);
		expect(errors).toEqual([
			'admin.settings.fieldRejected:{"message":"Must be a valid URL."}',
			'admin.settings.fieldRejected:{"message":"Cannot be blank."}',
			'admin.settings.rejected:{"message":"An error occurred while saving the new settings."}'
		]);
		expect(field(target, 'input[type="url"]').getAttribute('aria-invalid')).toBe('true');
		expect(target.querySelector('form')).not.toBeNull();
	});

	test('guardando: formulario ocupado y los botones con aria-disabled', async () => {
		let release: (value: ServerSettings) => void = () => {};
		const section = fakeSection({
			update: vi.fn(() => new Promise<ServerSettings>((resolve) => (release = resolve)))
		});
		const { target } = mountDest(EXTERNAL, section);
		button(target, 'admin.settings.change').click();
		await settle();
		field<HTMLInputElement>(target, 'input[value="local"]').click();
		await settle();
		await submit(target);
		expect(field(target, 'form').getAttribute('aria-busy')).toBe('true');
		expect(button(target, 'admin.settings.saving').getAttribute('aria-disabled')).toBe('true');
		release(BASE);
		await settle();
		expect(target.querySelector('form')).toBeNull();
	});
});
