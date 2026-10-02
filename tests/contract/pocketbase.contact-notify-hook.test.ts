/**
 * Contrato del hook de PRODUCTO `infra/production/pb_hooks/vega-contact-notify.pb.js` contra el
 * binario real de PocketBase y un SMTP sumidero local: el alta de un `messages` solo MARCA el
 * mensaje (`notifyState`) y un cron avisa por correo, con el contenido escapado, el tope por
 * ventana, la tolerancia a un SMTP caído o que no contesta y sin solaparse consigo mismo.
 *
 * Cada escenario arranca su propio PocketBase porque el hook lee su configuración del entorno del
 * proceso (`VEGA_CONTACT_NOTIFY_*`, vía `$os.getenv`).
 *
 * CÓMO SE DISPARA EL CRON sin esperar un minuto: `POST /api/crons/<id>` (superusuario) lo ejecuta
 * ya y responde 204 SIN esperar a que termine, así que cada test sondea el efecto (correo recibido
 * o `notifyState` del mensaje). El cron real sigue programado cada minuto y puede coincidir con una
 * ejecución manual; los asertos son por eso sobre estados finales, no sobre el número de ticks.
 */

import { afterEach, beforeAll, afterAll, describe, expect, test } from 'vitest';
import net from 'node:net';
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
const CRON = 'vega-contact-notify';

describe.skipIf(!AVAILABLE)('pb_hooks de producto: aviso de mensajes de contacto', () => {
	let sink: SmtpSink;
	let instance: PocketBaseInstanceDir | undefined;
	let server: PocketBaseServerHandle | undefined;
	let token = '';
	/** Servidores TCP auxiliares de un test (SMTP que no contesta, que rechaza…). */
	let extras: net.Server[] = [];

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
		for (const extra of extras) extra.close();
		extras = [];
	});

	async function api(method: string, route: string, body?: object, auth = token) {
		const res = await fetch(`${server!.url}${route}`, {
			method,
			headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
		const text = await res.text();
		return {
			status: res.status,
			body: (text ? JSON.parse(text) : {}) as Record<string, unknown>
		};
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
					{ name: 'notifyState', type: 'text', max: 20, hidden: true },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
				],
				createRule: ''
			});
		await setSmtp(smtpPort);
	}
	const setSmtp = (port: number) =>
		api('PATCH', '/api/settings', {
			smtp: { enabled: true, host: '127.0.0.1', port, tls: false },
			meta: { appName: 'Sitio de prueba', senderAddress: 'noreply@vega.test', senderName: 'Vega' }
		});
	/** Entradas del log de PocketBase de nivel ERROR (8) o superior. */
	const errorLogs = async () =>
		(await api('GET', '/api/logs?filter=' + encodeURIComponent('level>=8'))).body.totalItems;
	/** Alta del VISITANTE: sin sesión. */
	const send = (n: number, message = 'Hola', extra: object = {}) =>
		api(
			'POST',
			'/api/collections/messages/records',
			{ name: `Ana ${n}`, email: 'ana@example.com', message, read: false, ...extra },
			''
		);
	const totalMessages = async () =>
		(await api('GET', '/api/collections/messages/records')).body.totalItems;
	/** `notifyState` de cada mensaje por orden de llegada (lo lee el superusuario: el campo es oculto). */
	const states = async () =>
		(
			(await api('GET', '/api/collections/messages/records?sort=created,id&perPage=100')).body
				.items as { notifyState: string }[]
		).map((item) => item.notifyState);
	const runCron = () => api('POST', `/api/crons/${CRON}`);
	/** Margen para que un correo que NO debe llegar tuviera tiempo de hacerlo. */
	const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

	/** Un SMTP que acepta la conexión, saluda y NO contesta nunca más. Cuenta las conexiones. */
	async function startSilentSmtp() {
		const stats = { connections: 0 };
		const silent = net.createServer((socket) => {
			stats.connections++;
			socket.write('220 silencio ESMTP\r\n');
			socket.on('error', () => {});
		});
		await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
		extras.push(silent);
		return { stats, port: (silent.address() as net.AddressInfo).port };
	}

	test('(a) con destinatario: un mensaje, un correo con el contenido escapado', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO });
		const res = await send(1, '<script>alert(1)</script> & "x"');
		expect(res.status).toBe(200);
		// El alta NO envía: al volver el POST el mensaje está pendiente y no ha salido ningún correo. Se
		// mira de inmediato, sin margen: el cron programado (cada minuto) podría caer en medio.
		expect(await states()).toEqual(['pending']);
		expect(sink.messages.length).toBe(0);

		expect((await runCron()).status).toBe(204);
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
		await expect.poll(states, { timeout: 10_000 }).toEqual(['sent']);
		// Otra ejecución no repite el aviso.
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(1);
	}, 30_000);

	test('(b) sin VEGA_CONTACT_NOTIFY_TO: cero correos, el mensaje se crea y no queda pendiente', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: '' });
		const res = await send(1);
		expect(res.status).toBe(200);
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await totalMessages()).toBe(1);
		expect(await states()).toEqual(['']);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(b2) sin la variable definida (ni vacía) el arranque y el alta tampoco fallan', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: undefined as unknown as string });
		expect((await send(1)).status).toBe(200);
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(e) sin colección messages el hook registrado no rompe el arranque ni otras altas ni el cron', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, sink.port, false);
		await api('POST', '/api/collections', {
			name: 'otra',
			type: 'base',
			fields: [{ name: 'x', type: 'text' }]
		});
		expect((await api('POST', '/api/collections/otra/records', { x: 'a' })).status).toBe(200);
		expect((await runCron()).status).toBe(204);
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(e2) una colección messages SIN notifyState (anterior al módulo) ni se marca ni da error', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, sink.port, false);
		await api('POST', '/api/collections', {
			name: 'messages',
			type: 'base',
			fields: [
				{ name: 'name', type: 'text' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
			],
			createRule: ''
		});
		expect((await send(1)).status).toBe(200);
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await errorLogs()).toBe(0);
	}, 30_000);

	test('(c) tope: con máximo 2, tres mensajes dan dos avisos y UN «hay más»; el cuarto se calla', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO, VEGA_CONTACT_NOTIFY_MAX: '2' });
		for (const n of [1, 2, 3, 4]) expect((await send(n)).status).toBe(200);
		await runCron();
		await sink.waitForMessages(3);
		await expect.poll(states, { timeout: 10_000 }).toEqual(['sent', 'sent', 'more', 'capped']);
		await settle();
		expect(sink.messages.length).toBe(3);
		expect(sink.messages.filter((mail) => /Hay[ _]m/.test(mail)).length).toBe(1);
		// El aviso de «hay más» no lleva datos de ningún visitante.
		const more = sink.messages.find((mail) => /Hay[ _]m/.test(mail))!;
		expect(more).not.toContain('Ana ');
		expect(more).not.toContain('ana@example.com');
		expect(await totalMessages()).toBe(4);
	}, 30_000);

	test('(c2) valores inválidos del tope usan los de por defecto (5)', async () => {
		await start({
			VEGA_CONTACT_NOTIFY_TO: TO,
			VEGA_CONTACT_NOTIFY_MAX: 'abc',
			VEGA_CONTACT_NOTIFY_WINDOW_MINUTES: '-3'
		});
		for (const n of [1, 2, 3, 4, 5, 6, 7]) expect((await send(n)).status).toBe(200);
		await runCron();
		await sink.waitForMessages(6);
		await expect
			.poll(states, { timeout: 10_000 })
			.toEqual(['sent', 'sent', 'sent', 'sent', 'sent', 'more', 'capped']);
	}, 30_000);

	test('(g) solo avisa de las altas SIN sesión: un superusuario (como el botón «Nuevo») no', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO });
		const res = await api('POST', '/api/collections/messages/records', {
			name: 'Editor',
			email: 'editor@example.com',
			message: 'Alta interna',
			// Aunque la traiga, nadie con sesión ni sin ella puede pedir que se avise.
			notifyState: 'pending'
		});
		expect(res.status).toBe(200);
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(0);
		expect(await states()).toEqual(['']);
	}, 30_000);

	test('(g2) el visitante no puede fijar ni leer el campo de control', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO });
		// Intenta darse por avisado (no habría correo) y por «capado».
		const res = await send(1, 'Hola', { notifyState: 'sent' });
		expect(res.status).toBe(200);
		expect(res.body).not.toHaveProperty('notifyState');
		expect(await states()).toEqual(['pending']);
		await runCron();
		// Se avisó aunque pidiera «sent»: lo que fija el visitante no cuenta.
		await sink.waitForMessages(1);
	}, 30_000);

	test('(d) SMTP caído: el mensaje se crea, el visitante recibe 200 y el mensaje sigue pendiente', async () => {
		// Puerto cerrado: se abre un sumidero efímero y se para para quedarse con un puerto libre.
		const dead = await startSmtpSink();
		const deadPort = dead.port;
		await dead.stop();
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, deadPort);
		const res = await send(1);
		expect(res.status).toBe(200);
		expect(await totalMessages()).toBe(1);
		await runCron();
		await settle();
		expect(sink.messages.length).toBe(0);
		// El fallo NO marca el mensaje como avisado: vuelve a la cola.
		await expect.poll(states, { timeout: 10_000 }).toEqual(['pending']);
		// El fallo queda en el log de PocketBase (el volcado a base es por lotes) sin datos del visitante.
		await expect.poll(errorLogs, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
		const logs = await api('GET', '/api/logs?filter=' + encodeURIComponent('level>=8'));
		const text = JSON.stringify(logs.body);
		expect(text).toContain('vega-contact-notify');
		expect(text).not.toContain('ana@example.com');
		expect(text).not.toContain('Ana 1');

		// Cuando el SMTP vuelve, el siguiente tick avisa.
		await setSmtp(sink.port);
		await runCron();
		await sink.waitForMessages(1);
		await expect.poll(states, { timeout: 10_000 }).toEqual(['sent']);
	}, 40_000);

	test('(d2) un SMTP que rechaza repitiendo datos del visitante no los deja en el log', async () => {
		const rejecting = net.createServer((socket) => {
			socket.write('220 rechazo ESMTP\r\n');
			let buffer = '';
			socket.on('data', (chunk) => {
				buffer += chunk.toString('utf8');
				let end: number;
				while ((end = buffer.indexOf('\r\n')) >= 0) {
					const line = buffer.slice(0, end).toUpperCase();
					buffer = buffer.slice(end + 2);
					if (line.startsWith('EHLO') || line.startsWith('HELO')) socket.write('250 hola\r\n');
					else if (line.startsWith('QUIT')) socket.end('221 adios\r\n');
					else socket.write('550 rechazado: ana@example.com Ana 7 Texto secreto del mensaje\r\n');
				}
			});
			socket.on('error', () => {});
		});
		await new Promise<void>((resolve) => rejecting.listen(0, '127.0.0.1', resolve));
		extras.push(rejecting);
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, (rejecting.address() as net.AddressInfo).port);
		expect((await send(7, 'Texto secreto del mensaje')).status).toBe(200);
		await runCron();
		await expect.poll(errorLogs, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
		const text = JSON.stringify(
			(await api('GET', '/api/logs?filter=' + encodeURIComponent('level>=8'))).body
		);
		expect(text).toContain('vega-contact-notify');
		expect(text).not.toContain('ana@example.com');
		expect(text).not.toContain('Ana 7');
		expect(text).not.toContain('Texto secreto');
	}, 40_000);

	test('(f) SMTP que acepta la conexión y no contesta: el POST del visitante responde en tiempo normal', async () => {
		const silent = await startSilentSmtp();
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, silent.port);

		const t0 = Date.now();
		const res = await send(1);
		const elapsed = Date.now() - t0;
		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(3000);

		// Con el cron colgado en el SMTP, PocketBase sigue atendiendo peticiones...
		await runCron();
		await expect.poll(() => silent.stats.connections, { timeout: 10_000 }).toBe(1);
		const t1 = Date.now();
		expect((await send(2)).status).toBe(200);
		expect(Date.now() - t1).toBeLessThan(3000);
		expect(await totalMessages()).toBe(2);

		// ...y un segundo disparo no se solapa con el primero: no abre otra conexión.
		const t2 = Date.now();
		expect((await runCron()).status).toBe(204);
		expect(Date.now() - t2).toBeLessThan(3000);
		await settle();
		expect(silent.stats.connections).toBe(1);
		// El mensaje que se estaba enviando queda reservado ('sending'); el otro, pendiente.
		expect(await states()).toEqual(['sending', 'pending']);
	}, 40_000);

	test('(h) lo que no se puede avisar no se reintenta siempre: pendiente de hace 2 h y envío sin terminar pasan a failed', async () => {
		await start({ VEGA_CONTACT_NOTIFY_TO: TO }, sink.port, false);
		// `created` como fecha corriente (no autodate) para poder fijar un mensaje antiguo: el
		// autodate no admite que se le dé valor ni al crear ni al editar.
		await api('POST', '/api/collections', {
			name: 'messages',
			type: 'base',
			fields: [
				{ name: 'name', type: 'text' },
				{ name: 'email', type: 'email' },
				{ name: 'message', type: 'text' },
				{ name: 'notifyState', type: 'text', max: 20, hidden: true },
				{ name: 'created', type: 'date' }
			],
			createRule: ''
		});
		const hoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString().replace('T', ' ');
		const now = new Date().toISOString().replace('T', ' ');
		// El alta es del visitante (así el hook la deja `pending`); el estado de partida lo pone un
		// superusuario, único que puede escribir el campo.
		const create = async (name: string, state: string, created: string) => {
			const res = await api(
				'POST',
				'/api/collections/messages/records',
				{ name, email: 'a@example.com', message: 'x', created },
				''
			);
			if (state !== 'pending') {
				await api('PATCH', `/api/collections/messages/records/${res.body.id}`, {
					notifyState: state
				});
			}
		};
		await create('vieja', 'pending', hoursAgo);
		await create('colgada', 'sending', now);
		await create('reciente', 'pending', now);
		await runCron();
		await sink.waitForMessages(1);
		// `colgada` y `reciente` se crean en el mismo milisegundo: el orden entre ellas no es fiable.
		await expect
			.poll(async () => (await states()).sort(), { timeout: 10_000 })
			.toEqual(['failed', 'failed', 'sent']);
		await settle();
		// Solo el reciente se avisa; la vieja y la colgada no.
		expect(sink.messages.length).toBe(1);
		expect(sink.messages[0]).toContain('reciente');
	}, 30_000);
});
