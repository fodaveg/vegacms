/**
 * Servidor SMTP mínimo que acepta todo y guarda cada mensaje, para medir contra PocketBase real lo
 * que pasa DESPUÉS de un correo (la invitación de un editor: `request-password-reset` → token →
 * `confirm-password-reset`). Sin dependencias: `node:net` y el diálogo SMTP justo que usa el
 * cliente de PocketBase sin TLS ni autenticación (EHLO, MAIL, RCPT, DATA, QUIT). No anuncia
 * STARTTLS ni AUTH, así que PocketBase no los intenta.
 */

import net from 'node:net';
import tls from 'node:tls';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export interface SmtpSink {
	port: number;
	/** Cuerpos de los mensajes recibidos (cabeceras incluidas), en orden de llegada. */
	messages: string[];
	/** Espera a que haya al menos `count` mensajes, o lanza al pasar `timeoutMs`. */
	waitForMessages(count: number, timeoutMs?: number): Promise<string[]>;
	stop(): Promise<void>;
}

/** El mismo diálogo SMTP para conexiones en claro y TLS implícito. */
function smtpSession(socket: net.Socket, messages: string[]) {
	socket.on('error', () => {});
	let buffer = '';
	let inData = false;
	let current: string[] = [];
	socket.write('220 vega-smtp-sink ESMTP\r\n');
	socket.on('data', (chunk) => {
		buffer += chunk.toString('utf8');
		let end: number;
		while ((end = buffer.indexOf('\r\n')) >= 0) {
			const line = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			if (inData) {
				if (line === '.') {
					inData = false;
					messages.push(current.join('\n'));
					socket.write('250 OK\r\n');
				} else {
					current.push(line.startsWith('..') ? line.slice(1) : line);
				}
				continue;
			}
			const verb = line.slice(0, 4).toUpperCase();
			if (verb === 'EHLO' || verb === 'HELO')
				socket.write('250-vega-smtp-sink\r\n250 8BITMIME\r\n');
			else if (verb === 'DATA') {
				inData = true;
				current = [];
				socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
			} else if (verb === 'QUIT') {
				socket.write('221 Bye\r\n');
				socket.end();
			} else socket.write('250 OK\r\n');
		}
	});
}

/** Cierra también conexiones abiertas; un rechazo TLS no deja sockets colgados. */
async function listenSmtp(server: net.Server, messages: string[]): Promise<SmtpSink> {
	const sockets = new Set<net.Socket>();
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('error', () => {});
		socket.on('close', () => sockets.delete(socket));
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve();
		});
	});
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	return {
		port,
		messages,
		async waitForMessages(count, timeoutMs = 5000) {
			const start = Date.now();
			while (messages.length < count) {
				if (Date.now() - start > timeoutMs) {
					throw new Error(`El SMTP de prueba recibió ${messages.length} de ${count} mensajes.`);
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return messages;
		},
		stop: () =>
			new Promise<void>((resolve) => {
				for (const socket of sockets) socket.destroy();
				server.close(() => resolve());
			})
	};
}

export async function startSmtpSink(): Promise<SmtpSink> {
	const messages: string[] = [];
	return listenSmtp(
		net.createServer((socket) => smtpSession(socket, messages)),
		messages
	);
}

export interface TlsSmtpSink extends SmtpSink {
	/** Confianza solo para el entorno del proceso PocketBase bajo prueba, nunca para el sistema. */
	trustEnv: Record<string, string>;
	stats: { handshakes: number; rejected: number; protocols: string[] };
}

/**
 * SMTP TLS implícito con CA efímera propia y certificado válido SOLO para localhost (no para IP).
 * Usa OpenSSL existente; el directorio privado y sus claves se retiran al parar o fallar el arranque.
 * No simula validación: el cliente real debe confiar en la CA y verificar el hostname.
 */
export async function startTlsSmtpSink(): Promise<TlsSmtpSink> {
	const dir = await mkdtemp(path.join(tmpdir(), 'vega-smtp-tls-'));
	const file = (name: string) => path.join(dir, name);
	const openssl = promisify(execFile);
	let sink: SmtpSink | undefined;
	try {
		await mkdir(file('empty-roots'));
		await openssl('openssl', [
			'req',
			'-x509',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-sha256',
			'-days',
			'1',
			'-subj',
			'/CN=Vega SMTP test CA',
			'-addext',
			'basicConstraints=critical,CA:TRUE',
			'-addext',
			'keyUsage=critical,keyCertSign,cRLSign',
			'-keyout',
			file('ca.key'),
			'-out',
			file('ca.pem')
		]);
		await openssl('openssl', [
			'req',
			'-new',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-sha256',
			'-subj',
			'/CN=localhost',
			'-keyout',
			file('server.key'),
			'-out',
			file('server.csr')
		]);
		await writeFile(
			file('server.ext'),
			[
				'basicConstraints=critical,CA:FALSE',
				'keyUsage=critical,digitalSignature,keyEncipherment',
				'extendedKeyUsage=serverAuth',
				'subjectAltName=DNS:localhost'
			].join('\n')
		);
		await openssl('openssl', [
			'x509',
			'-req',
			'-in',
			file('server.csr'),
			'-CA',
			file('ca.pem'),
			'-CAkey',
			file('ca.key'),
			'-set_serial',
			'1',
			'-sha256',
			'-days',
			'1',
			'-extfile',
			file('server.ext'),
			'-out',
			file('server.pem')
		]);
		const messages: string[] = [];
		const stats = { handshakes: 0, rejected: 0, protocols: [] as string[] };
		const server = tls.createServer(
			{
				key: await readFile(file('server.key')),
				cert: await readFile(file('server.pem')),
				minVersion: 'TLSv1.2'
			},
			(socket) => {
				stats.handshakes++;
				stats.protocols.push(socket.getProtocol() ?? '');
				smtpSession(socket, messages);
			}
		);
		server.on('tlsClientError', () => {
			stats.rejected++;
		});
		sink = await listenSmtp(server, messages);
		const running = sink;
		return {
			...running,
			stats,
			trustEnv: {
				SSL_CERT_FILE: file('ca.pem'),
				SSL_CERT_DIR: file('empty-roots'),
				// Go 1.27 conserva por compatibilidad el almacén de plataforma para módulos anteriores.
				GODEBUG: [process.env.GODEBUG, 'x509sslcertoverrideplatform=1'].filter(Boolean).join(',')
			},
			async stop() {
				try {
					await running.stop();
				} finally {
					await rm(dir, { recursive: true, force: true });
				}
			}
		};
	} catch (error) {
		try {
			await sink?.stop();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
		throw error;
	}
}

/**
 * El enlace del botón de un correo de restablecimiento de PocketBase (el `href` del cuerpo HTML),
 * deshaciendo el quoted-printable. Es lo que la persona pulsaría: con la plantilla que escribe Vega,
 * `…/restablecer?token=<token>`; con la de fábrica, `…/_/#/auth/confirm-password-reset/<token>`.
 */
export function resetLinkFrom(message: string): string | null {
	const decoded = message.replace(/=\n/g, '').replace(/=3D/gi, '=').replace(/&amp;/g, '&');
	return decoded.match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? null;
}
