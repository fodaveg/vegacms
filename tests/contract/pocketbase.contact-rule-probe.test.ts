/**
 * Sonda: regla de creación PÚBLICA de una colección `messages` (formulario de contacto) con campo
 * trampa, medida contra PocketBase real y SIN autenticar. Fija lo que se midió el 1 oct 2026
 * (PocketBase 0.39.9) para que la función que se construya encima no parta de una suposición.
 *
 * Hallazgo: `@request.body.website` SE PUEDE leer aunque `website` NO sea campo de la colección
 * (PocketBase no filtra el cuerpo antes de evaluar la regla); una clave ausente se compara igual a
 * `""`. `@request.body.read != true` rechaza `read: true` y admite tanto el cuerpo sin `read` como
 * `read: false`. (`read = false` a secas NO vale: con la clave ausente es falso.) Y como `website`
 * no es campo, no se guarda: no hace falta ocultarlo.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	startPocketBase,
	type RunningPocketBase
} from './pb-harness/server';

/** La expresión EXACTA que pasa los cinco casos con `website` fuera del esquema. */
export const CONTACT_CREATE_RULE = '@request.body.website = "" && @request.body.read != true';
const EDITOR_ONLY = '@request.auth.collectionName = "vega_editors"';

const AVAILABLE = isPocketBaseBinaryAvailable();
const BASE = { name: 'Ana', email: 'ana@example.com', message: 'Hola' };

describe.skipIf(!AVAILABLE)('messages: creación pública con campo trampa (PocketBase real)', () => {
	let pb: RunningPocketBase;

	async function post(path: string, body: object, auth?: string) {
		const res = await fetch(`${pb.url}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
			body: JSON.stringify(body)
		});
		return { status: res.status, body: (await res.json()) as Record<string, unknown> };
	}
	const create = (body: object) => post('/api/collections/messages/records', body);

	beforeAll(async () => {
		pb = await startPocketBase();
		const auth = await post('/api/collections/_superusers/auth-with-password', {
			identity: ADMIN_EMAIL,
			password: ADMIN_PASSWORD
		});
		const made = await post(
			'/api/collections',
			{
				name: 'messages',
				type: 'base',
				fields: [
					{ name: 'name', type: 'text' },
					{ name: 'email', type: 'email' },
					{ name: 'message', type: 'text', max: 50 },
					{ name: 'read', type: 'bool' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
				],
				listRule: EDITOR_ONLY,
				viewRule: EDITOR_ONLY,
				updateRule: EDITOR_ONLY,
				deleteRule: EDITOR_ONLY,
				createRule: CONTACT_CREATE_RULE
			},
			auth.body.token as string
		);
		if (made.status !== 200) throw new Error(`no se pudo crear messages: ${JSON.stringify(made)}`);
	}, 30_000);

	afterAll(async () => {
		await pb?.stop();
	});

	test('un envío normal (sin website ni read) se crea con read=false', async () => {
		const res = await create(BASE);
		expect([res.status, res.body.read]).toEqual([200, false]);
	});

	test('con la trampa website rellena → 400 «Failed to create record.»', async () => {
		const res = await create({ ...BASE, website: 'http://spam' });
		expect([res.status, res.body.message]).toEqual([400, 'Failed to create record.']);
	});

	test('con la trampa website vacía (el navegador la manda así) → se crea', async () => {
		expect((await create({ ...BASE, website: '' })).status).toBe(200);
	});

	test('con read: true → 400 «Failed to create record.»', async () => {
		const res = await create({ ...BASE, read: true });
		expect([res.status, res.body.message]).toEqual([400, 'Failed to create record.']);
	});

	test('con read: false explícito → se crea', async () => {
		expect((await create({ ...BASE, read: false })).status).toBe(200);
	});

	test('website no es campo: no se guarda en el registro', async () => {
		const res = await create({ ...BASE, website: '' });
		expect('website' in res.body).toBe(false);
	});

	test('un mensaje por encima del max del campo → 400 con el error en data.message', async () => {
		const res = await create({ ...BASE, message: 'x'.repeat(51) });
		expect([res.status, Object.keys(res.body.data as object)]).toEqual([400, ['message']]);
	});

	test('sin autenticar, listar devuelve 200 con cero elementos (aunque haya registros)', async () => {
		const res = await fetch(`${pb.url}/api/collections/messages/records`);
		const json = (await res.json()) as { items: unknown[]; totalItems: number };
		expect([res.status, json.items.length, json.totalItems]).toEqual([200, 0, 0]);
	});

	test('sin autenticar, ver un registro concreto → 404', async () => {
		const made = await create(BASE);
		const res = await fetch(`${pb.url}/api/collections/messages/records/${made.body.id as string}`);
		expect(res.status).toBe(404);
	});
});
