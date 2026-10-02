/**
 * Contrato del hook de PRODUCTO `infra/production/pb_hooks/vega-contact-notify.pb.js` contra el
 * binario real de PocketBase (0.39.9) y un SMTP sumidero local: aviso por correo al crear un
 * `messages`, escapado del contenido, tope por ventana y tolerancia a un SMTP caído.
 *
 * Cada escenario arranca su propio PocketBase porque el hook lee su configuración del entorno del
 * proceso (`VEGA_CONTACT_NOTIFY_*`, vía `$os.getenv`).
 */

import { afterEach, beforeAll, afterAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import { startSmtpSink, type SmtpSink } from './pb-harness/smtp-sink';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	destroyPocketBaseInstanceDir,
	startPocketBaseServerOn,
	type PocketBaseInstanceDir,
	type PocketBaseServerHandle
} from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();
const HOOKS_DIR = path.join(import.meta.dirname, '..', '..', 'infra', 'production', 'pb_hooks');
const TO = 'editor@example.test';

describe.skipIf(!AVAILABLE)('pb_hooks de producto: aviso de mensajes de contacto', () => {
	let sink: SmtpSink;
	let instance: PocketBaseInstanceDir | undefined;
	let server: PocketBaseServerHandle | undefined;
	let token = '';

	beforeAll(async () => {
		sink = await startSmtpSink();
	});
	afterAll(async () => {
		await sink?.stop();
	});
	afterEach(async () => {
		await server?.stop();
		if (instance) destroyPocketBaseInstanceDir(instance);
		server = instance = undefined;
		sink.messages.length = 0;
	});

	async function api(method: string, route: string, body?: object, auth = token) {
		const res = await fetch(`${server!.url}${route}`, {
			method,
			headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
		return { status: res.status, body: (await res.json()) as Record<string, unknown> };
	}

	/** Arranca PocketBase con el hook de producto, el entorno dado y el SMTP en `smtpPort`. */
	async function start(env: Record<string, string>, smtpPort = sink.port, withMessages = true) {
		instance = createPocketBaseInstanceDir();
		await createPocketBaseSuperuser(instance.dataDir);
		server = await startPocketBaseServerOn(instance, { hooksDir: HOOKS_DIR, env });
		token = (
			await api(
				'POST',
				'/api/collections/_superusers/auth-with-password',
				{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				''
			)
		).body.token as string;
		if (withMessages)
			await api('POST', '/api/collections', {
				name: 'messages',
				type: 'base',
				fields: [
					{ name: 'name', type: 'text' },
					{ name: 'email', type: 'email' },
					{ name: 'message', type: 'text' },
					{ name: 'read', type: 'bool' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
				],
				createRule: ''
			});
		await api('PATCH', '/api/settings', {
			smtp: { enabled: true, host: '127.0.0.1', port: smtpPort, tls: false },
			meta: { appName: 'Sitio de prueba', senderAddress: 'noreply@vega.test', senderName: 'Vega' }
		});
	}
	/** Entradas del log de PocketBase de nivel ERROR (8) o superior. */
	const errorLogs = async () =>
		(await api('GET', '/api/logs?filter=' + encodeURIComponent('level>=8'))).body.totalItems;
	const send = (n: number, message = 'Hola') =>
		api(
			'POST',
			'/api/collections/messages/records',
			{ name: `Ana ${n}`, email: 'ana@example.com', message, read: false },
			''
		);
	const totalMessages = async () =>
		(await api('GET', '/api/collections/messages/records')).body.totalItems;
	/** Margen para que un correo que NO debe llegar tuviera tiempo de hacerlo. */
	const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

	test('(a) con destinatario: un mensaje, un correo con el contenido escapado', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO });
		const res = await send(1, '<script>alert(1)</script> & "x"');
		expect(res.status).toBe(200);
		const [mail] = await sink.waitForMessages(1);
		expect(mail).toContain(`To: ${TO}`);
		expect(mail).toContain('Subject: Nuevo mensaje de contacto en Sitio de prueba');
		expect(mail).toContain('Reply-To: ana@example.com');
		const html = mail
			.slice(mail.indexOf('Content-Type: text/html'))
			.replace(/=\n/g, '')
			.replace(/=3D/gi, '=');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
		expect(html).not.toContain('<script>');
		await settle();
		expect(sink.messages.length).toBe(1);
	}, 30_000);

	test('(b) sin VEGA_CONTACT_NOTIFY_TO: cero correos y el mensaje se crea', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: '' });
		const res = await send(1);
		expect(res.status).toBe(200);
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await totalMessages()).toBe(1);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(b2) sin la variable definida (ni vacía) el arranque y el alta tampoco fallan', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: undefined as unknown as string });
		expect((await send(1)).status).toBe(200);
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(e) sin colección messages el hook registrado no rompe el arranque ni otras altas', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, sink.port, false);
		await api('POST', '/api/collections', {
			name: 'otra',
			type: 'base',
			fields: [{ name: 'x', type: 'text' }]
		});
		expect((await api('POST', '/api/collections/otra/records', { x: 'a' })).status).toBe(200);
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(c) tope: con máximo 2, tres mensajes dan dos correos y tres mensajes', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO, VEGA_CONTACT_NOTIFY_MAX: '2' });
		for (const n of [1, 2, 3]) expect((await send(n)).status).toBe(200);
		await sink.waitForMessages(2);
		await settle();
		expect(sink.messages.length).toBe(2);
		expect(await totalMessages()).toBe(3);
	}, 30_000);

	test('(c2) valores inválidos del tope usan los de por defecto (5)', async () => {
		await start({
			VEGA_CONTACT_NOTIFY_TO: TO,
			VEGA_CONTACT_NOTIFY_MAX: 'abc',
			VEGA_CONTACT_NOTIFY_WINDOW_MINUTES: '-3'
		});
		for (const n of [1, 2, 3, 4, 5, 6]) expect((await send(n)).status).toBe(200);
		await sink.waitForMessages(5);
		await settle();
		expect(sink.messages.length).toBe(5);
	}, 30_000);

	test('(d) SMTP caído: el mensaje se crea y el visitante recibe 200', async () => {
		// Puerto cerrado: se abre un sumidero efímero y se para para quedarse con un puerto libre.
		const dead = await startSmtpSink();
		const deadPort = dead.port;
		await dead.stop();
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, deadPort);
		const res = await send(1);
		expect(res.status).toBe(200);
		expect(await totalMessages()).toBe(1);
		await settle();
		expect(sink.messages.length).toBe(0);
		// El fallo queda en el log de PocketBase (el volcado a base es por lotes) sin datos del visitante.
		await expect.poll(errorLogs, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
		const logs = await api('GET', '/api/logs?filter=' + encodeURIComponent('level>=8'));
		const text = JSON.stringify(logs.body);
		expect(text).toContain('vega-contact-notify');
		expect(text).not.toContain('ana@example.com');
		expect(text).not.toContain('Ana 1');
	}, 30_000);
});
