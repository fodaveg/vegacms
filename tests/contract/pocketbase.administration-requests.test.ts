/**
 * Cuántas peticiones HTTP hace `/editores` contra PocketBase real (la tarea «menos peticiones por
 * carga»). Se cuenta lo que llega a `fetch` mientras se ejecuta lo MISMO que hace la página: al
 * cargar, `mailEnabled`, `ensureInvitationLink`, `listEditors` y `serverSettings.get` a la vez; y
 * al guardar el correo, `update` y `ensureInvitationLink`.
 *
 * La línea base («sin compartir») usa un puerto distinto para cada llamada: sin estado común no hay
 * nada que juntar, que es como se comportaba el adaptador antes de `shared-reads.ts`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPocketBaseBackend } from '$lib/backend/adapters/pocketbase';
import type { BackendPort } from '$lib/backend';
import { VEGA_EDITORS_COLLECTION_NAME } from '$lib/backend/administration';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
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
const RESET_URL = 'http://localhost:5173/restablecer';

describe.skipIf(!AVAILABLE)('/editores: peticiones contra PocketBase real', () => {
	let instance: PocketBaseInstanceDir;
	let server: PocketBaseServerHandle;

	beforeAll(async () => {
		instance = createPocketBaseInstanceDir();
		await createPocketBaseSuperuser(instance.dataDir);
		server = await startPocketBaseServerOn(instance);
		const port = await makePort();
		await port.ensureCollections([
			{ name: VEGA_EDITORS_COLLECTION_NAME, type: 'auth', fields: [] }
		]);
	}, 30_000);

	afterAll(async () => {
		await server?.stop();
		if (instance) destroyPocketBaseInstanceDir(instance);
	});

	async function makePort(): Promise<BackendPort> {
		const port = createPocketBaseBackend({ url: server.url });
		await port.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
		return port;
	}

	/** Peticiones (método + ruta, sin query) que salen mientras corre `run`. */
	async function count(run: () => Promise<unknown>): Promise<string[]> {
		const real = globalThis.fetch;
		const seen: string[] = [];
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			seen.push(`${init?.method ?? 'GET'} ${url.pathname}`);
			return real(input, init);
		}) as typeof fetch;
		try {
			await run();
		} finally {
			globalThis.fetch = real;
		}
		return seen;
	}

	/** Lo que hace `load()` + `loadMailSettings()` de la página al abrirse. */
	function pageLoad(port: BackendPort) {
		return Promise.all([
			port.administration!.mailEnabled(),
			port.administration!.ensureInvitationLink(RESET_URL),
			port.administration!.listEditors(),
			port.serverSettings!.get()
		]);
	}

	test('la carga pide una vez cada cosa: 4 peticiones, no 7', async () => {
		const ports = await Promise.all([makePort(), makePort(), makePort(), makePort()]);
		const separate = await count(async () => {
			await ports[0].administration!.mailEnabled();
			await ports[1].administration!.listEditors();
			await ports[2].administration!.ensureInvitationLink(RESET_URL);
			await ports[3].serverSettings!.get();
		});
		expect(separate).toHaveLength(7);

		const shared = await count(async () => pageLoad(await makePort()).then(() => undefined));
		// El login de `makePort` también cuenta: se descuenta aparte para quedarse con la carga.
		const loadOnly = shared.filter((r) => !r.includes('auth-with-password'));
		expect(loadOnly.toSorted()).toEqual([
			'GET /api/collections/meta/scaffolds',
			'GET /api/collections/vega_editors',
			'GET /api/collections/vega_editors/records',
			'GET /api/settings'
		]);
	});

	test('guardar el correo: el guardado más 2 lecturas (la plantilla de fábrica ya está en memoria)', async () => {
		const port = await makePort();
		await pageLoad(port);
		const after = await count(async () => {
			await port.serverSettings!.update({ smtp: { enabled: false } });
			await port.administration!.ensureInvitationLink(RESET_URL);
		});
		expect(after.toSorted()).toEqual([
			'GET /api/collections/vega_editors',
			'GET /api/settings',
			'PATCH /api/settings'
		]);
	});

	test('las acciones sobre una cuenta son una sola escritura, sin lecturas de más', async () => {
		const port = await makePort();
		const admin = port.administration!;
		const created = await count(() =>
			admin.createEditor('ana@editores.test', { kind: 'password', password: 'una-clave-larga-1' })
		);
		expect(created).toEqual(['POST /api/collections/vega_editors/records']);

		const [account] = (await admin.listEditors()).editors;
		const changed = await count(() => admin.setEditorPassword(account.id, 'otra-clave-larga-2'));
		expect(changed).toEqual([`PATCH /api/collections/vega_editors/records/${account.id}`]);

		const removed = await count(() => admin.removeEditor(account.id));
		expect(removed).toEqual([`DELETE /api/collections/vega_editors/records/${account.id}`]);
	});
});
