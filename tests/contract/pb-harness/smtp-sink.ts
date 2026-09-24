/**
 * Servidor SMTP mínimo que acepta todo y guarda cada mensaje, para medir contra PocketBase real lo
 * que pasa DESPUÉS de un correo (la invitación de un editor: `request-password-reset` → token →
 * `confirm-password-reset`). Sin dependencias: `node:net` y el diálogo SMTP justo que usa el
 * cliente de PocketBase sin TLS ni autenticación (EHLO, MAIL, RCPT, DATA, QUIT). No anuncia
 * STARTTLS ni AUTH, así que PocketBase no los intenta.
 */

import net from 'node:net';

export interface SmtpSink {
	port: number;
	/** Cuerpos de los mensajes recibidos (cabeceras incluidas), en orden de llegada. */
	messages: string[];
	/** Espera a que haya al menos `count` mensajes, o lanza al pasar `timeoutMs`. */
	waitForMessages(count: number, timeoutMs?: number): Promise<string[]>;
	stop(): Promise<void>;
}

export async function startSmtpSink(): Promise<SmtpSink> {
	const messages: string[] = [];
	const server = net.createServer((socket) => {
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
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
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
		stop: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}

/**
 * Saca el token del enlace de restablecimiento de un correo de PocketBase
 * (`…/_/#/auth/confirm-password-reset/<token>`), deshaciendo el quoted-printable del cuerpo.
 */
export function passwordResetTokenFrom(message: string): string | null {
	const decoded = message.replace(/=\n/g, '').replace(/=3D/gi, '=');
	return decoded.match(/confirm-password-reset\/([A-Za-z0-9._-]+)/)?.[1] ?? null;
}
