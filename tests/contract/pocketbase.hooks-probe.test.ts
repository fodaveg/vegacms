/**
 * Sonda: ¿el binario oficial de PocketBase (0.39.9) carga un `pb_hooks/*.pb.js` y, desde él, puede
 * dejar una señal, mandar correo y limitar la frecuencia? Medido contra el binario real del arnés,
 * con `--hooksDir` apuntando a `pb-harness/hooks-probe/` y un SMTP sumidero LOCAL (nada sale).
 *
 * Nombre vigente del hook: `onRecordAfterCreateSuccess(cb, "coleccion")`. Correo:
 * `$app.newMailClient().send(new MailerMessage({...}))`. Límite: `$app.countRecords("outbox", ...)`
 * sobre los registros recientes, dentro del propio hook.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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
const HOOKS_DIR = path.join(import.meta.dirname, 'pb-harness', 'hooks-probe');

describe.skipIf(!AVAILABLE)('pb_hooks: aviso al crear un message (PocketBase real)', () => {
	let instance: PocketBaseInstanceDir;
	let server: PocketBaseServerHandle;
	let sink: SmtpSink;
	let token: string;

	async function api(method: string, route: string, body?: object, auth = token) {
		const res = await fetch(`${server.url}${route}`, {
			method,
			headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
		return { status: res.status, body: (await res.json()) as Record<string, unknown> };
	}
	const sendMessage = (n: number) =>
		api('POST', '/api/collections/messages/records', {
			name: `Ana ${n}`,
			email: 'ana@example.com',
			message: 'Hola'
		});
	async function outboxKinds(): Promise<string[]> {
		const res = await api('GET', '/api/collections/outbox/records?perPage=100&sort=created');
		return (res.body.items as { kind: string }[]).map((r) => r.kind);
	}

	beforeAll(async () => {
		sink = await startSmtpSink();
		instance = createPocketBaseInstanceDir();
		await createPocketBaseSuperuser(instance.dataDir);
		server = await startPocketBaseServerOn(instance, { hooksDir: HOOKS_DIR });
		token = (
			await api(
				'POST',
				'/api/collections/_superusers/auth-with-password',
				{ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
				''
			)
		).body.token as string;
		await api('POST', '/api/collections', {
			name: 'messages',
			type: 'base',
			fields: [
				{ name: 'name', type: 'text' },
				{ name: 'email', type: 'email' },
				{ name: 'message', type: 'text' }
			],
			createRule: ''
		});
		await api('POST', '/api/collections', {
			name: 'outbox',
			type: 'base',
			fields: [
				{ name: 'kind', type: 'text' },
				{ name: 'messageId', type: 'text' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
			]
		});
		await api('PATCH', '/api/settings', {
			smtp: { enabled: true, host: '127.0.0.1', port: sink.port, tls: false },
			meta: { senderAddress: 'noreply@vega.test', senderName: 'Vega' }
		});
	}, 30_000);

	afterAll(async () => {
		await server?.stop();
		await sink?.stop();
		if (instance) destroyPocketBaseInstanceDir(instance);
	});

	test('el binario carga el hook: crear un message deja una señal «notified» en outbox', async () => {
		await sendMessage(1);
		expect(await outboxKinds()).toEqual(['notified']);
	});

	test('el hook manda el correo por el cliente de PocketBase (llega al SMTP sumidero)', async () => {
		const [mail] = await sink.waitForMessages(1);
		expect(mail).toContain('Subject: Nuevo mensaje de contacto');
	});

	test('límite de frecuencia: con MAX=3 por ventana, el 4.º y el 5.º no mandan correo', async () => {
		await sendMessage(2);
		await sendMessage(3);
		await sendMessage(4);
		await sendMessage(5);
		expect(await outboxKinds()).toEqual([
			'notified',
			'notified',
			'notified',
			'throttled',
			'throttled'
		]);
	});

	test('los avisos limitados no llegan a SMTP: el sumidero sigue en 3 correos', async () => {
		expect(sink.messages.length).toBe(3);
	});

	test('el aviso nunca bloquea el alta: los 5 messages existen', async () => {
		const res = await api('GET', '/api/collections/messages/records');
		expect(res.body.totalItems).toBe(5);
	});
});
