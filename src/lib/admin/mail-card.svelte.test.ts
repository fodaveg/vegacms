/**
 * `MailCard` (tarjeta «Correo para invitaciones» de `/editores`, láminas B1 y B2) con una sección
 * `serverSettings` de mentira, en todos sus estados: sin configurar, configurado, formulario,
 * guardando, errores de campo y de formulario, prueba en curso/correcta/fallida (mensaje largo),
 * quitar la contraseña con confirmación y los avisos de la dirección de Vega. El recorrido contra
 * PocketBase real vive en `tests/contract/pocketbase.server-settings.contract.test.ts`.
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
import MailCard from '../../routes/editores/MailCard.svelte';

const RESET_URL = 'https://admin.aguja.example/restablecer';

const EMPTY: ServerSettings = {
	meta: {
		appURL: 'https://admin.aguja.example',
		senderName: 'Support',
		senderAddress: 'support@example.com'
	},
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

const CONFIGURED: ServerSettings = {
	...EMPTY,
	meta: {
		appURL: 'https://admin.aguja.example',
		senderName: 'Aguja',
		senderAddress: 'web@aguja.example'
	},
	smtp: {
		enabled: true,
		host: 'smtp.proveedor.example',
		port: 587,
		username: 'web@aguja.example',
		tls: false
	}
};

function withAppUrl(settings: ServerSettings, appURL: string): ServerSettings {
	return { ...settings, meta: { ...settings.meta, appURL } };
}

function fakeSection(overrides: Partial<ServerSettingsPort> = {}): ServerSettingsPort {
	return {
		get: vi.fn(async () => CONFIGURED),
		update: vi.fn(async () => CONFIGURED),
		testS3: vi.fn(async () => ({ ok: true }) as ConnectionTestOutcome),
		testEmail: vi.fn(async () => ({ ok: true }) as ConnectionTestOutcome),
		...overrides
	};
}

type Mounted = { target: HTMLElement; instance: Record<string, never>; ctx: VegaAppContext };
let mounted: Mounted | null = null;

function mountCard(settings: ServerSettings, section = fakeSection()) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const ctx = {
		t: (key: string, params?: Record<string, string | number>) =>
			params ? `${key}:${JSON.stringify(params)}` : key,
		locale: 'es',
		feedback: { toast: vi.fn(), reportError: vi.fn() }
	} as unknown as VegaAppContext;
	const onSaved = vi.fn();
	const instance = mount(MailCard as never, {
		target,
		props: {
			settings,
			section,
			resetUrl: RESET_URL,
			defaultTestTo: 'david@aguja.example',
			onSaved
		},
		context: new Map([[VEGA_CONTEXT_KEY, ctx]])
	}) as Record<string, never>;
	mounted = { target, instance, ctx };
	return { target, ctx, section, onSaved };
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

/** Un campo por el final de su id (`-from`, `-url`, `-host`…). */
function field(target: HTMLElement, suffix: string): HTMLInputElement {
	const found = target.querySelector<HTMLInputElement>(`input[id$="-${suffix}"]`);
	if (!found) throw new Error(`No hay campo -${suffix}`);
	return found;
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
}

async function submit(target: HTMLElement): Promise<void> {
	target
		.querySelector('form')!
		.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
	await settle();
}

async function openForm(target: HTMLElement, label: string): Promise<void> {
	button(target, label).click();
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

afterEach(async () => {
	if (mounted) {
		await unmount(mounted.instance);
		mounted.target.remove();
		mounted = null;
	}
	vi.restoreAllMocks();
});

describe('MailCard: reposo', () => {
	test('B1.1 sin configurar: explica qué falta y ofrece un botón NEUTRO, sin etiqueta ni prueba', () => {
		const { target } = mountCard(EMPTY);
		expect(target.textContent).toContain('admin.mail.unconfiguredBody');
		expect(target.querySelector('.vega-admin-tag')).toBeNull();
		expect(target.querySelector('.vega-admin-test')).toBeNull();
		const configure = button(target, 'admin.mail.configure');
		expect(configure.className).not.toContain('primary');
	});

	test('B1.2 configurado: etiqueta, resumen y prueba con el email de la sesión', () => {
		const { target } = mountCard(CONFIGURED);
		expect(target.querySelector('.vega-admin-tag')?.textContent).toBe('admin.mail.configured');
		const values = Array.from(target.querySelectorAll('dd')).map((dd) => dd.textContent?.trim());
		expect(values[0]).toBe('smtp.proveedor.example:587');
		expect(values[1]).toContain('Aguja');
		expect(values[1]).toContain('web@aguja.example');
		expect(values[2]).toBe('https://admin.aguja.example');
		expect(field(target, 'test').value).toBe('david@aguja.example');
	});

	test('sin nombre de remitente el resumen enseña solo la dirección', () => {
		const settings = { ...CONFIGURED, meta: { ...CONFIGURED.meta, senderName: '' } };
		const { target } = mountCard(settings);
		const sender = target.querySelectorAll('dd')[1].textContent?.trim();
		expect(sender).toBe('web@aguja.example');
	});

	test('B2.6 la dirección que no coincide avisa CON LA TARJETA CERRADA, con un botón que abre el formulario', async () => {
		const { target } = mountCard(withAppUrl(CONFIGURED, 'https://aguja.example'));
		const notice = target.querySelector('[data-mail-mismatch="closed"]');
		expect(notice?.textContent).toContain('admin.appUrl.mismatchClosed');
		expect(notice?.textContent).toContain('https://admin.aguja.example');
		(notice!.querySelector('button') as HTMLButtonElement).click();
		await settle();
		expect(target.querySelector('form')).not.toBeNull();
	});

	test('si coincide, la tarjeta cerrada no avisa de nada', () => {
		const { target } = mountCard(CONFIGURED);
		expect(target.querySelector('[data-mail-mismatch]')).toBeNull();
	});
});

describe('MailCard: formulario', () => {
	test('B1.6 abre con lo guardado, la contraseña SIEMPRE vacía y sin resumen ni prueba', async () => {
		const { target } = mountCard(CONFIGURED);
		await openForm(target, 'admin.settings.change');
		expect(field(target, 'name').value).toBe('Aguja');
		expect(field(target, 'from').value).toBe('web@aguja.example');
		expect(field(target, 'url').value).toBe('https://admin.aguja.example');
		expect(field(target, 'host').value).toBe('smtp.proveedor.example');
		expect(field(target, 'port').value).toBe('587');
		expect(field(target, 'user').value).toBe('web@aguja.example');
		expect(field(target, 'pass').value).toBe('');
		expect(target.textContent).toContain('admin.mail.passwordHelp');
		expect(target.querySelector('.vega-admin-test')).toBeNull();
		expect(target.querySelector('dl')).toBeNull();
	});

	test('desde «sin configurar» el puerto de fábrica viene puesto y el host, vacío', async () => {
		const { target } = mountCard(EMPTY);
		await openForm(target, 'admin.mail.configure');
		expect(field(target, 'host').value).toBe('');
		expect(field(target, 'port').value).toBe('587');
	});

	test('guardar solo manda lo que cambió, NO manda la contraseña vacía y activa el correo', async () => {
		const section = fakeSection({ update: vi.fn(async () => CONFIGURED) });
		const { target, onSaved, ctx } = mountCard(EMPTY, section);
		await openForm(target, 'admin.mail.configure');
		await type(field(target, 'name'), 'Aguja');
		await type(field(target, 'from'), 'web@aguja.example');
		await type(field(target, 'host'), 'smtp.proveedor.example');
		await type(field(target, 'user'), 'web@aguja.example');
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({
			meta: { senderName: 'Aguja', senderAddress: 'web@aguja.example' },
			smtp: { enabled: true, host: 'smtp.proveedor.example', username: 'web@aguja.example' }
		});
		expect(onSaved).toHaveBeenCalledWith(CONFIGURED);
		expect(ctx.feedback.toast).toHaveBeenCalledWith('admin.mail.saved', { kind: 'success' });
		expect(target.querySelector('form')).toBeNull();
	});

	test('una contraseña escrita viaja; el casillero TLS y el puerto también', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'pass'), 'nueva');
		await type(field(target, 'port'), '465');
		const tls = target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		tls.checked = true;
		tls.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({
			smtp: { port: 465, tls: true, password: 'nueva' }
		});
	});

	test('sin cambios no hay petición: el formulario se cierra', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
		expect(target.querySelector('form')).toBeNull();
	});

	test('Cancelar cierra sin pedir nada y devuelve el foco a «Cambiar»', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		button(target, 'common.cancel').click();
		await settle();
		expect(target.querySelector('form')).toBeNull();
		expect(section.update).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(button(target, 'admin.settings.change'));
	});

	test('B1.8 guardando: botones con aria-disabled, el formulario ocupado y sin doble envío', async () => {
		let release: (settings: ServerSettings) => void = () => {};
		const section = fakeSection({
			update: vi.fn(() => new Promise<ServerSettings>((resolve) => (release = resolve)))
		});
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'host'), 'otro.example');
		await submit(target);
		await submit(target);
		expect(section.update).toHaveBeenCalledTimes(1);
		expect(target.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
		const save = button(target, 'admin.settings.saving');
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(button(target, 'common.cancel').getAttribute('aria-disabled')).toBe('true');
		release(CONFIGURED);
		await settle();
		expect(target.querySelector('form')).toBeNull();
	});
});

describe('MailCard: errores', () => {
	test('local: remitente sin forma de email, servidor vacío y puerto fuera de rango; no se manda nada', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'from'), 'web@aguja');
		await type(field(target, 'host'), '');
		await type(field(target, 'port'), '70000');
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
		expect(target.textContent).toContain('admin.mail.senderAddressInvalid');
		expect(target.textContent).toContain('admin.mail.hostRequired');
		expect(target.textContent).toContain('admin.mail.portInvalid');
		expect(field(target, 'from').getAttribute('aria-invalid')).toBe('true');
	});

	test('B1.7 del servidor: campo rechazado en su sitio y el mensaje general encima de los botones; lo escrito se conserva', async () => {
		const section = fakeSection({
			update: vi.fn(async () => {
				throw validation(
					{ 'meta.senderAddress': 'Must be a valid email address.' },
					'Failed to save: smtp: (host: cannot be blank.)'
				);
			})
		});
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'name'), 'Otro nombre');
		await submit(target);
		expect(target.textContent).toContain(
			'admin.settings.fieldRejected:{"message":"Must be a valid email address."}'
		);
		expect(target.querySelector('[role="alert"]')?.textContent).toContain(
			'admin.form.rejected:{"message":"Failed to save: smtp: (host: cannot be blank.)"}'
		);
		expect(field(target, 'name').value).toBe('Otro nombre');
		expect(target.querySelector('form')).not.toBeNull();
	});

	test('escribir en un campo limpia SU error', async () => {
		const section = fakeSection({
			update: vi.fn(async () => {
				throw validation({ 'smtp.host': 'Cannot be blank.' });
			})
		});
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'user'), 'otro');
		await submit(target);
		expect(field(target, 'host').getAttribute('aria-invalid')).toBe('true');
		await type(field(target, 'host'), 'smtp.x.example');
		expect(field(target, 'host').getAttribute('aria-invalid')).toBeNull();
	});

	test('un fallo que no es de validación va al feedback global y el formulario sigue abierto', async () => {
		const boom = VegaError.network(new Error('caído'), 'Sin red');
		const section = fakeSection({ update: vi.fn(async () => Promise.reject(boom)) });
		const { target, ctx } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'host'), 'otro.example');
		await submit(target);
		expect(ctx.feedback.reportError).toHaveBeenCalledWith(boom, { action: 'mail:save' });
		expect(target.querySelector('form')).not.toBeNull();
	});
});

describe('MailCard: prueba (vive en la tarjeta GUARDADA)', () => {
	test('B1.3 en curso: botón y «Cambiar» con aria-disabled y estado anunciado', async () => {
		let release: (outcome: ConnectionTestOutcome) => void = () => {};
		const section = fakeSection({
			testEmail: vi.fn(() => new Promise<ConnectionTestOutcome>((resolve) => (release = resolve)))
		});
		const { target } = mountCard(CONFIGURED, section);
		button(target, 'admin.mail.testSend').click();
		await settle();
		expect(button(target, 'admin.mail.testSending').getAttribute('aria-disabled')).toBe('true');
		expect(button(target, 'admin.settings.change').getAttribute('aria-disabled')).toBe('true');
		expect(target.querySelector('[aria-live="polite"]')?.textContent).toContain(
			'admin.mail.testingStatus'
		);
		// Pulsar otra vez no lanza otra prueba, y «Cambiar» no abre el formulario.
		button(target, 'admin.mail.testSending').click();
		button(target, 'admin.settings.change').click();
		await settle();
		expect(section.testEmail).toHaveBeenCalledTimes(1);
		expect(target.querySelector('form')).toBeNull();
		release({ ok: true });
		await settle();
	});

	test('B1.4 correcta: dice «enviada» con la hora y la dirección, no «recibida»', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await type(field(target, 'test'), '  otra@aguja.example ');
		button(target, 'admin.mail.testSend').click();
		await settle();
		expect(section.testEmail).toHaveBeenCalledWith('otra@aguja.example', 'verification');
		const result = target.querySelector('[role="status"]')!;
		expect(result.textContent).toContain('admin.mail.testOk');
		expect(result.textContent).toContain('"email":"otra@aguja.example"');
		expect(result.textContent).toMatch(/"time":"[^"]+"/);
		expect(target.querySelector('.vega-admin-tag')?.textContent).toBe('admin.mail.configured');
	});

	test('B1.5 fallida con mensaje largo: TEXTO en una caja, la etiqueta sigue en «Configurado» y «Cambiar los datos» abre el formulario', async () => {
		const long =
			'Failed to send the test email. Raw error: dial tcp: lookup smtp.proveedor.example on 127.0.0.11:53: read udp 172.18.0.4:51413->127.0.0.11:53: i/o timeout <b>no-html</b>';
		const section = fakeSection({
			testEmail: vi.fn(async () => ({ ok: false, message: long }) as ConnectionTestOutcome)
		});
		const { target } = mountCard(CONFIGURED, section);
		button(target, 'admin.mail.testSend').click();
		await settle();
		const output = target.querySelector('pre.vega-admin-output')!;
		expect(output.textContent).toBe(long);
		expect(output.querySelector('b')).toBeNull();
		expect(target.querySelector('[role="alert"]')).not.toBeNull();
		expect(target.querySelector('.vega-admin-tag')?.textContent).toBe('admin.mail.configured');
		button(target, 'admin.mail.testFailChange').click();
		await settle();
		expect(target.querySelector('form')).not.toBeNull();
	});

	test('una dirección de prueba que no es un email no llama al servidor', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await type(field(target, 'test'), 'sin-arroba');
		button(target, 'admin.mail.testSend').click();
		await settle();
		expect(section.testEmail).not.toHaveBeenCalled();
		expect(target.textContent).toContain('admin.mail.testToInvalid');
		expect(field(target, 'test').getAttribute('aria-invalid')).toBe('true');
	});

	test('un rechazo del puerto (sesión caducada) va al feedback y la prueba vuelve a reposo', async () => {
		const boom = VegaError.network(new Error('caído'), 'Sin red');
		const section = fakeSection({ testEmail: vi.fn(async () => Promise.reject(boom)) });
		const { target, ctx } = mountCard(CONFIGURED, section);
		button(target, 'admin.mail.testSend').click();
		await settle();
		expect(ctx.feedback.reportError).toHaveBeenCalledWith(boom, { action: 'mail:test' });
		expect(target.querySelector('[data-mail-test="idle"]')).not.toBeNull();
	});

	test('guardar cambios retira el resultado de una prueba anterior', async () => {
		const section = fakeSection({
			testEmail: vi.fn(async () => ({ ok: false, message: 'mal' }) as ConnectionTestOutcome)
		});
		const { target } = mountCard(CONFIGURED, section);
		button(target, 'admin.mail.testSend').click();
		await settle();
		await openForm(target, 'admin.mail.testFailChange');
		await type(field(target, 'host'), 'otro.example');
		await submit(target);
		expect(target.querySelector('[role="alert"]')).toBeNull();
		expect(target.querySelector('[data-mail-test="idle"]')).not.toBeNull();
	});
});

describe('MailCard: quitar la contraseña guardada (B1.9)', () => {
	function dialog(): HTMLElement | null {
		return document.querySelector('[role="alertdialog"]');
	}

	test('pide confirmación con el foco en «Cancelar»; cancelar no manda nada', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		button(target, 'admin.mail.removePassword').click();
		await settle();
		expect(dialog()?.textContent).toContain('admin.mail.removeDialog.title');
		const cancel = Array.from(dialog()!.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('common.cancel')
		)!;
		cancel.click();
		await settle();
		expect(section.update).not.toHaveBeenCalled();
		expect(dialog()).toBeNull();
	});

	test('confirmar manda `clear` (contraseña vacía, explícita) y nada más, y deja el formulario abierto', async () => {
		const section = fakeSection();
		const { target, onSaved, ctx } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'host'), 'sin-guardar.example');
		button(target, 'admin.mail.removePassword').click();
		await settle();
		const confirm = Array.from(dialog()!.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('admin.mail.removeDialog.confirm')
		)!;
		confirm.click();
		await settle();
		expect(section.update).toHaveBeenCalledWith({ smtp: { password: '' } });
		expect(ctx.feedback.toast).toHaveBeenCalledWith('admin.mail.removeDialog.success', {
			kind: 'success'
		});
		expect(onSaved).toHaveBeenCalledTimes(1);
		expect(dialog()).toBeNull();
		expect(field(target, 'host').value).toBe('sin-guardar.example');
	});

	test('si el servidor falla, el aviso va al feedback y el diálogo sigue abierto para reintentar', async () => {
		const boom = VegaError.network(new Error('caído'), 'Sin red');
		const section = fakeSection({ update: vi.fn(async () => Promise.reject(boom)) });
		const { target, ctx } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		button(target, 'admin.mail.removePassword').click();
		await settle();
		Array.from(dialog()!.querySelectorAll('button'))
			.find((b) => b.textContent?.includes('admin.mail.removeDialog.confirm'))!
			.click();
		await settle();
		expect(ctx.feedback.reportError).toHaveBeenCalledWith(boom, {
			action: 'mail:remove-password'
		});
		expect(dialog()).not.toBeNull();
	});
});

describe('MailCard: dirección de Vega (B2)', () => {
	test('B2.1 coincide y es https: solo la ayuda, sin avisos', async () => {
		const { target } = mountCard(CONFIGURED);
		await openForm(target, 'admin.settings.change');
		expect(target.textContent).toContain('admin.appUrl.help');
		expect(target.querySelector('.vega-admin-notice')).toBeNull();
	});

	test('B2.2 no coincide: aviso con el origen de ahora; «Usar la de ahora» rellena el campo y lo quita', async () => {
		const { target } = mountCard(withAppUrl(CONFIGURED, 'https://aguja.example'));
		await openForm(target, 'admin.settings.change');
		const notice = target.querySelector('.vega-admin-notice')!;
		expect(notice.textContent).toContain(
			'admin.appUrl.mismatch:{"origin":"https://admin.aguja.example"}'
		);
		expect(notice.textContent).not.toContain('http://');
		expect(field(target, 'url').getAttribute('aria-describedby')).toContain('url-mismatch');
		button(target, 'admin.appUrl.useCurrent').click();
		await settle();
		expect(field(target, 'url').value).toBe('https://admin.aguja.example');
		expect(target.querySelector('.vega-admin-notice')).toBeNull();
	});

	test('B2.3 http: avisa pero NO bloquea, y si además no coincide van los dos avisos', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'url'), 'http://otra.aguja.example');
		const notices = Array.from(target.querySelectorAll('.vega-admin-notice')).map(
			(n) => n.textContent
		);
		expect(notices).toHaveLength(2);
		expect(notices[0]).toContain('admin.appUrl.mismatch');
		expect(notices[1]).toContain('admin.appUrl.http');
		await submit(target);
		expect(section.update).toHaveBeenCalledWith({ meta: { appURL: 'http://otra.aguja.example' } });
	});

	test('B2.3 en localhost no sale el aviso de http', async () => {
		const { target } = mountCard(CONFIGURED);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'url'), 'http://localhost:8090');
		expect(target.textContent).not.toContain('admin.appUrl.http');
	});

	test('B2.4 sin http(s) BLOQUEA: el error sale al salir del campo, no al escribir, y al guardar no se manda nada', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'url'), 'admin.aguja.example');
		expect(target.textContent).not.toContain('admin.appUrl.notHttp');
		field(target, 'url').dispatchEvent(new Event('blur'));
		await settle();
		expect(target.textContent).toContain('admin.appUrl.notHttp');
		expect(field(target, 'url').getAttribute('aria-invalid')).toBe('true');
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
		await type(field(target, 'url'), 'https://admin.aguja.example');
		expect(field(target, 'url').getAttribute('aria-invalid')).toBeNull();
	});

	test('B2.4 con otro esquema (ftp://) también bloquea al guardar, aunque PocketBase lo aceptaría', async () => {
		const section = fakeSection();
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'url'), 'ftp://x.example');
		await submit(target);
		expect(section.update).not.toHaveBeenCalled();
		expect(target.textContent).toContain('admin.appUrl.notHttp');
	});

	test('B2.5 larguísima: se muestra entera en aviso y resumen, que parten línea', async () => {
		const long =
			'https://vega-admin-pruebas-2026.interno.cooperativa-de-artesanas-del-textil-de-aguja.example/panel/vega';
		const { target } = mountCard(withAppUrl(CONFIGURED, long));
		expect(target.querySelector('dl')?.textContent).toContain(long);
		expect(target.querySelector('[data-mail-mismatch="closed"]')).not.toBeNull();
		await openForm(target, 'admin.settings.change');
		expect(field(target, 'url').value).toBe(long);
	});

	test('el error de la dirección que da el servidor sale bajo su campo (`meta.appURL`)', async () => {
		const section = fakeSection({
			update: vi.fn(async () => {
				throw validation({ 'meta.appURL': 'Must be a valid url.' });
			})
		});
		const { target } = mountCard(CONFIGURED, section);
		await openForm(target, 'admin.settings.change');
		await type(field(target, 'url'), 'https://admin.aguja.example/otra');
		await submit(target);
		expect(field(target, 'url').getAttribute('aria-invalid')).toBe('true');
		expect(target.textContent).toContain('"message":"Must be a valid url."');
	});
});
