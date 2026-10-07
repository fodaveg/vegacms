/**
 * Opt-in: VEGA_CONTACT_TEST_IMAGE=sha256:<image ID local acreditado>. Sin pulls ni binario host.
 * PB Linux real, USER de imagen y /pb/pb_hooks empaquetado; CA pública montada solo en el proceso.
 * El gateway Docker Desktop debe haber pasado la sonda TCP mínima antes de ejecutar este contrato.
 * No acredita SMTP del proveedor, AUTH, STARTTLS ni habilita NOTIFY_TO en producción.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { startTlsSmtpSink, type TlsSmtpSink } from './pb-harness/smtp-sink';
import { imageGatewayIp, startImagePocketBase } from './pb-harness/docker-server';
import { type RunningPocketBase } from './pb-harness/server';

const IMAGE = process.env.VEGA_CONTACT_TEST_IMAGE ?? '';
const HOST = 'host.docker.internal';

describe.skipIf(!IMAGE)('contacto TLS en imagen backend exacta', () => {
	let sink: TlsSmtpSink | undefined;
	let pb: RunningPocketBase | undefined;
	let token = '';
	afterEach(async () => {
		try {
			await pb?.stop();
		} finally {
			await sink?.stop();
			pb = sink = undefined;
		}
	});
	async function api(method: string, route: string, body?: object, auth = token) {
		const response = await fetch(`${pb!.url}${route}`, {
			method,
			headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: body ? JSON.stringify(body) : undefined
		});
		const text = await response.text();
		return {
			status: response.status,
			body: (text ? JSON.parse(text) : {}) as Record<string, unknown>
		};
	}
	async function start(trust: boolean) {
		sink = await startTlsSmtpSink(HOST);
		pb = await startImagePocketBase(IMAGE, trust ? sink.trustEnv.SSL_CERT_FILE : undefined);
		const login = await api(
			'POST',
			'/api/collections/_superusers/auth-with-password',
			{
				identity: pb.adminEmail,
				password: pb.adminPassword
			},
			''
		);
		expect(login.status).toBe(200);
		token = login.body.token as string;
		expect(
			(
				await api('POST', '/api/collections', {
					name: 'messages',
					type: 'base',
					createRule: '',
					fields: [
						{ name: 'name', type: 'text' },
						{ name: 'email', type: 'email' },
						{ name: 'message', type: 'text' },
						{ name: 'read', type: 'bool' },
						{ name: 'notifyState', type: 'text', max: 20, hidden: true },
						{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
					]
				})
			).status
		).toBe(200);
	}
	async function smtpHost(host: string) {
		expect(
			(
				await api('PATCH', '/api/settings', {
					smtp: { enabled: true, host, port: sink!.port, tls: true },
					meta: { appName: 'TLS fixture', senderAddress: 'noreply@vega.test', senderName: 'Vega' }
				})
			).status
		).toBe(200);
	}
	async function send() {
		const start = Date.now();
		const response = await api(
			'POST',
			'/api/collections/messages/records',
			{
				name: 'Ana fixture',
				email: 'ana@example.test',
				message: 'TLS fixture',
				read: false
			},
			''
		);
		expect(response.status).toBe(200);
		expect(Date.now() - start).toBeLessThan(3000);
		return response.body.id as string;
	}
	const state = async (id: string) =>
		(await api('GET', `/api/collections/messages/records/${id}`)).body.notifyState;
	const cron = async () =>
		expect((await api('POST', '/api/crons/vega-contact-notify')).status).toBe(204);
	async function rejected(id: string) {
		await cron();
		await expect.poll(() => sink!.stats.rejected, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
		await expect.poll(() => state(id), { timeout: 10_000 }).toBe('pending');
		expect(sink!.stats.handshakes).toBe(0);
		expect(sink!.messages).toHaveLength(0);
	}

	test('CA desconocida: handshake rechazado, cero correos, pending y POST independiente', async () => {
		await start(false);
		await smtpHost(HOST);
		const id = await send();
		expect(await state(id)).toBe('pending');
		await rejected(id);
		const second = await send();
		expect(second).not.toBe(id);
		expect(await state(second)).toBe('pending');
	}, 40_000);

	test('CA confiable solo en proceso: IP inválida → pending; hostname válido → mismo registro sent', async () => {
		const gateway = await imageGatewayIp(IMAGE);
		await start(true);
		await smtpHost(gateway);
		const id = await send();
		await rejected(id);
		await smtpHost(HOST);
		await cron();
		const [message] = await sink!.waitForMessages(1);
		expect(message).toContain('To: editor@example.test');
		await expect.poll(() => state(id), { timeout: 10_000 }).toBe('sent');
		expect(sink!.stats.handshakes).toBeGreaterThanOrEqual(1);
		expect(
			sink!.stats.protocols.every((protocol) => ['TLSv1.2', 'TLSv1.3'].includes(protocol))
		).toBe(true);
		await cron();
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(sink!.messages).toHaveLength(1);
		const second = await send();
		expect(await state(second)).toBe('pending');
	}, 40_000);
});
