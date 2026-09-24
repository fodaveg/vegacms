/**
 * Corre la suite de contrato (§10) contra `createMemoryBackend`. En Fase 2, un fichero
 * hermano (`pocketbase.contract.test.ts`) llamará a `describeBackendContract` con un
 * `makePort` que arranque/sembre un PocketBase real — sin tocar `backend-contract.ts`.
 */

import { describe, expect, test } from 'vitest';
import { createMemoryBackend, type MemoryBackendPort } from '$lib/backend/adapters/memory';
import { describeBackendContract } from './backend-contract';
import { FIXTURE_ADMIN_EMAIL, FIXTURE_ADMIN_PASSWORD, kitchenSinkSeed } from './fixture';

describeBackendContract(
	(overrides) => createMemoryBackend(kitchenSinkSeed({ sessionTtlMs: overrides?.sessionTtlMs })),
	{
		name: 'memory',
		capabilities: createMemoryBackend().capabilities,
		inspectCollection: (port, name) => (port as MemoryBackendPort).inspectCollection(name)
	}
);

/**
 * Detalles de implementación de `memory` que NO son parte del contrato genérico del puerto
 * (por eso no viven en `describeBackendContract`, que debe poder correr sin cambios contra
 * PocketBase real en Fase 2): aislamiento entre instancias, no-aliasing y blindaje del `pattern`.
 */
describe('memory: detalles de implementación', () => {
	test('cada instancia aísla su propio estado (ids únicos, sin fuga de registros entre backends)', async () => {
		const portA = createMemoryBackend(kitchenSinkSeed());
		const portB = createMemoryBackend(kitchenSinkSeed());
		// §7: memory exige sesión igual que PB — sin esto, ambas ops fallarían con `forbidden`.
		await portA.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		await portB.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });

		const a1 = await portA.create('kitchen_sink', { title: 'A1' });
		const b1 = await portB.create('kitchen_sink', { title: 'B1' });
		const a2 = await portA.create('kitchen_sink', { title: 'A2' });

		expect(new Set([a1.id, a2.id, b1.id]).size).toBe(3);
		await expect(portB.get('kitchen_sink', a1.id)).rejects.toMatchObject({ kind: 'not-found' });
	});

	test('mutar el valor devuelto por create() no corrompe el almacén (json/select-multi/relation-multi)', async () => {
		const port = createMemoryBackend(kitchenSinkSeed());
		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		const created = await port.create('kitchen_sink', {
			title: 'aliasing',
			tags: ['a'],
			categories: ['cat-alpha'],
			metadata: { count: 1 }
		});

		// Mutación deliberada de lo que devolvió create(): si `normalizeFieldValue` no clona,
		// esto corrompe el registro "persistido" en el Map interno del adaptador.
		(created.values.tags as string[]).push('mutado');
		(created.values.categories as string[]).push('cat-beta');
		(created.values.metadata as Record<string, unknown>).count = 999;

		const fetched = await port.get('kitchen_sink', created.id);
		expect(fetched.values.tags).toEqual(['a']);
		expect(fetched.values.categories).toEqual(['cat-alpha']);
		expect(fetched.values.metadata).toEqual({ count: 1 });
	});

	test('un pattern de esquema inválido no revienta con SyntaxError crudo (degrada, ley L2/L11)', async () => {
		const port = createMemoryBackend({
			users: [{ email: 'admin@vega.test', password: 'x' }],
			contentTypes: [
				{
					name: 'broken_pattern',
					readonly: false,
					fields: [
						{
							name: 'code',
							type: 'text',
							subtype: 'plain',
							required: false,
							readonly: false,
							presentable: false,
							hidden: false,
							unique: false,
							pattern: '(unclosed' // regex inválida a propósito
						}
					]
				}
			],
			records: { broken_pattern: [] }
		});
		await port.login({ email: 'admin@vega.test', password: 'x' });

		// Antes de la corrección, esto lanzaba un SyntaxError nativo (no un VegaError): violaba
		// L2 ("toda promesa del puerto rechaza con VegaError y solo con VegaError").
		await expect(port.create('broken_pattern', { code: 'cualquier-cosa' })).resolves.toMatchObject({
			values: { code: 'cualquier-cosa' }
		});
	});

	test('administration: sin la colección vega_editors, listar o dar de alta → not-found', async () => {
		const port = createMemoryBackend(kitchenSinkSeed());
		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		await expect(port.administration!.listEditors()).rejects.toMatchObject({ kind: 'not-found' });
		await expect(
			port.administration!.createEditor('ana@vega.test', { kind: 'password', password: '12345678' })
		).rejects.toMatchObject({ kind: 'not-found' });
	});

	test('administration: las cuentas sembradas salen de la más antigua a la más reciente, las sin fecha al final', async () => {
		const port = createMemoryBackend({
			...kitchenSinkSeed(),
			editors: [
				{ id: 'e3', email: 'sin-fecha@vega.test', verified: true, created: null },
				{
					id: 'e2',
					email: 'reciente@vega.test',
					verified: false,
					created: '2026-09-22T10:00:00.000Z'
				},
				{
					id: 'e1',
					email: 'antigua@vega.test',
					verified: true,
					created: '2026-02-03T10:00:00.000Z'
				}
			]
		});
		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		const { editors } = await port.administration!.listEditors();
		expect(editors.map((account) => account.id)).toEqual(['e1', 'e2', 'e3']);
	});

	test('administration: sin correo no hay invitación (memory no finge un envío); con correo nace pendiente', async () => {
		const withoutMail = createMemoryBackend({ ...kitchenSinkSeed(), editors: [] });
		await withoutMail.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		await expect(
			withoutMail.administration!.createEditor('ana@vega.test', { kind: 'invite' })
		).rejects.toMatchObject({ kind: 'backend' });
		expect((await withoutMail.administration!.listEditors()).editors).toEqual([]);

		const withMail = createMemoryBackend({ ...kitchenSinkSeed(), editors: [], mailEnabled: true });
		await withMail.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		const invited = await withMail.administration!.createEditor('ana@vega.test', {
			kind: 'invite'
		});
		expect(invited.verified).toBe(false);
		await expect(
			withMail.administration!.sendEditorInvitation(invited.id)
		).resolves.toBeUndefined();
	});

	test('restablecer: el token de una invitación con correo verifica la cuenta y solo sirve una vez', async () => {
		const port = createMemoryBackend({ ...kitchenSinkSeed(), editors: [], mailEnabled: true });
		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		const invited = await port.administration!.createEditor('lucia@vega.test', { kind: 'invite' });
		const token = await port.inspectEditorResetToken('lucia@vega.test');
		expect(token).not.toBeNull();

		// Pública: funciona igual tras cerrar la sesión.
		await port.logout();
		await port.editorPasswordReset!.confirm(token!, 'la-suya-123');
		await expect(port.editorPasswordReset!.confirm(token!, 'la-suya-123')).rejects.toMatchObject({
			kind: 'validation',
			fieldErrors: { token: { code: 'validation_invalid_token' } }
		});

		await port.login({ email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD });
		const listed = (await port.administration!.listEditors()).editors.find(
			(account) => account.id === invited.id
		);
		expect(listed?.verified).toBe(true);
	});

	test('administration: sin login previo → forbidden, también en copias', async () => {
		const port = createMemoryBackend({ ...kitchenSinkSeed(), editors: [] });
		await expect(port.administration!.listEditors()).rejects.toMatchObject({ kind: 'forbidden' });
		await expect(port.administration!.listBackups()).rejects.toMatchObject({ kind: 'forbidden' });
		await expect(port.administration!.createBackup()).rejects.toMatchObject({ kind: 'forbidden' });
	});

	test('operación de datos/esquema sin login previo → forbidden (§7: memory no puede ser mejor que PB)', async () => {
		// Decisión de ingeniería (§7): PB real rechaza toda operación de datos/esquema sin
		// sesión con `forbidden` — `memory` debe hacer lo mismo, nunca ser más permisivo. Cubre
		// los mismos puntos de entrada que `checkSessionAlive` guarda en el adaptador.
		const port = createMemoryBackend(kitchenSinkSeed());

		await expect(port.list('kitchen_sink')).rejects.toMatchObject({ kind: 'forbidden' });
		await expect(port.get('kitchen_sink', 'cualquiera')).rejects.toMatchObject({
			kind: 'forbidden'
		});
		await expect(port.create('kitchen_sink', { title: 'x' })).rejects.toMatchObject({
			kind: 'forbidden'
		});
		await expect(port.update('kitchen_sink', 'cualquiera', { title: 'x' })).rejects.toMatchObject({
			kind: 'forbidden'
		});
		await expect(port.delete('kitchen_sink', 'cualquiera')).rejects.toMatchObject({
			kind: 'forbidden'
		});
		await expect(port.listContentTypes()).rejects.toMatchObject({ kind: 'forbidden' });
		await expect(port.ensureCollections([{ name: 'vega_test', fields: [] }])).rejects.toMatchObject(
			{ kind: 'forbidden' }
		);
		await expect(
			port.addCollectionFields('vega_test', [{ name: 'x', type: 'text' }])
		).rejects.toMatchObject({ kind: 'forbidden' });
	});
});
