/**
 * Verificación de contrato PENDIENTE del lote "esquema": ninguna migración GENERADA por
 * `generateSchemaMigration` (`src/lib/backend/migration.ts`) se había aplicado nunca contra un
 * PocketBase real — `migration.test.ts` solo comprueba el TEXTO emitido (parseable, con las
 * cadenas esperadas), nunca que el propio binario lo acepte y lo ejecute. Este fichero cierra esa
 * verificación: escribe el fichero `.js` tal cual lo genera el módulo, lo aplica con
 * `pocketbase migrate up` contra el binario descargado en `.pbbin/`, comprueba el esquema
 * resultante por la API real, y ejercita el `down` — la mitad que NUNCA se había corrido.
 *
 * LANDMINE nº1 (por qué el `down` es el 90% de este fichero): `pocketbase migrate down` PIDE
 * confirmación interactiva por stdin ("Do you really want to revert...? (y/N)"). Con stdin
 * cerrado/vacío el comando se CANCELA en silencio — "The command has been cancelled" — y SALE
 * CON CÓDIGO 0, indistinguible de un revert real si solo se mira el exit code. Por eso
 * `runPocketBaseMigrate` (`pb-harness/server.ts`) escribe siempre "y\n" en el stdin del proceso, y
 * cada test de `down` de aquí exige además "Reverted <fichero>" en el `stdout` — un test que solo
 * comprobara el exit code pasaría en VERDE sin haber revertido nada, exactamente el guardarraíl
 * ciego que este lote debía cerrar.
 *
 * LANDMINE nº2 (verificada a mano, ver `pb-harness/server.ts#startPocketBaseServerOn`): el
 * runner de migraciones de usuario reaplica en CADA arranque cualquier fichero de
 * `migrationsDir` que no conste en `_migrations` — incluida una migración recién revertida, si su
 * `.js` sigue en disco. `--automigrate=false` NO evita esto (ese flag solo gobierna si PB
 * AUTOGENERA una migración al cambiar el esquema desde la Admin UI/API, no si EJECUTA las que ya
 * existen como fichero). Por eso cada test de `down` de aquí BORRA el fichero de la migración
 * revertida antes de reiniciar el servidor para comprobar el estado — igual que en un revert
 * real, donde el fichero se revierte junto con su commit en git.
 *
 * Los tests de cada `describe` son SECUENCIALES A PROPÓSITO y comparten la instancia del
 * `beforeAll`: el de `down` destruye lo que afirman los anteriores, así que solo tienen sentido en
 * el orden declarado (aplicar → comprobar → revertir → comprobar). Es deliberado —montar una
 * instancia de PocketBase por test multiplicaría por 3 un fichero que ya tarda ~30s—, pero implica
 * que NO se pueden correr en orden aleatorio (`--sequence.shuffle`, hoy sin activar en
 * `vite.config.ts`) ni aislados por `-t` sin arrastrar los previos de su bloque.
 */

import { unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import PocketBase from 'pocketbase';
import { generateBlockSchemaMigration } from '$lib/backend/block-schema';
import { generateSchemaMigration } from '$lib/backend/migration';
import type { CollectionFieldSpec, CollectionSpec } from '$lib/backend/collections';
import type { ResolvedBlockField, ResolvedBlockType } from '$lib/model/types';
import { isPocketBaseBinaryAvailable } from './pb-harness/binary';
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	createPocketBaseInstanceDir,
	createPocketBaseSuperuser,
	destroyPocketBaseInstanceDir,
	runPocketBaseMigrate,
	startPocketBaseServerOn
} from './pb-harness/server';
import type { PocketBaseInstanceDir, PocketBaseServerHandle } from './pb-harness/server';

const AVAILABLE = isPocketBaseBinaryAvailable();

function recordBlockField(name: string, required = false): ResolvedBlockField {
	return {
		name,
		label: name,
		widget: 'relation',
		source: 'record',
		required,
		options: null
	};
}

function recordBlockType(name: string, fields: ResolvedBlockField[]): ResolvedBlockType {
	return { name, label: name, icon: null, fields };
}

/** Escribe el `.js` de una migración GENERADA en `migrationsDir`, tal cual saldría de
 *  `generateSchemaMigration` — nunca se reescribe a mano, es el mismo fichero que se commitea. */
function writeMigrationFile(
	instance: PocketBaseInstanceDir,
	filename: string,
	contents: string
): void {
	writeFileSync(path.join(instance.migrationsDir, filename), contents);
}

/** Borra el fichero de una migración ya revertida (landmine nº2, cabecera del fichero). */
function deleteMigrationFile(instance: PocketBaseInstanceDir, filename: string): void {
	unlinkSync(path.join(instance.migrationsDir, filename));
}

async function authAdmin(url: string): Promise<PocketBase> {
	const pb = new PocketBase(url);
	pb.autoCancellation(false);
	await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
	return pb;
}

describe.skipIf(!AVAILABLE)(
	'migración generada contra PocketBase real (binario en .pbbin/) — kind: "create", un spec con variedad de tipos',
	() => {
		let instance: PocketBaseInstanceDir;
		let server: PocketBaseServerHandle;
		let pb: PocketBase;

		const spec: CollectionSpec = {
			name: 'kitchen_sink_mig',
			fields: [
				{ name: 'title', type: 'text', required: true, max: 120 },
				{ name: 'featured', type: 'bool' },
				{ name: 'rating', type: 'number' },
				{ name: 'releaseDate', type: 'date' },
				{ name: 'metadata', type: 'json' },
				{ name: 'createdAt', type: 'autodate', onUpdate: false },
				// `multiple` por defecto (false) → maxSelect 1, frente a `gallery` más abajo (99):
				// es la comprobación explícita de "maxSelect 1 vs 99" que pide el contrato.
				{ name: 'cover', type: 'file' },
				{
					name: 'gallery',
					type: 'file',
					multiple: true,
					maxSizeBytes: 2_000_000,
					mimeTypes: ['image/png', 'image/jpeg'],
					thumbs: ['100x100', '300x300']
				}
			]
		};
		const migration = generateSchemaMigration(
			{ kind: 'create', specs: [spec] },
			new Date('2026-01-01T00:00:00.000Z')
		);

		beforeAll(async () => {
			instance = createPocketBaseInstanceDir();
			writeMigrationFile(instance, migration.filename, migration.contents);
			await createPocketBaseSuperuser(instance.dataDir);

			const up = await runPocketBaseMigrate(instance, ['up']);
			expect(up.stdout).toContain(`Applied ${migration.filename}`);

			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);
		}, 30_000);

		afterAll(async () => {
			await server?.stop();
			// `instance` puede no estar asignada si `beforeAll` falló en su primera línea: sin la
			// guarda, `afterAll` lanzaría un TypeError que ENMASCARARÍA el error real del arranque.
			if (instance) destroyPocketBaseInstanceDir(instance);
		});

		test('crea la colección con cada campo en la forma exacta emitida por el generador', async () => {
			const collection = await pb.collections.getOne('kitchen_sink_mig');
			const byName = new Map(collection.fields.map((f) => [f.name, f]));

			expect(byName.get('title')).toMatchObject({ type: 'text', required: true, max: 120 });
			expect(byName.get('featured')).toMatchObject({ type: 'bool', required: false });
			expect(byName.get('rating')).toMatchObject({ type: 'number', required: false });
			expect(byName.get('releaseDate')).toMatchObject({ type: 'date', required: false });
			expect(byName.get('metadata')).toMatchObject({ type: 'json' });
			expect(byName.get('createdAt')).toMatchObject({
				type: 'autodate',
				onCreate: true,
				onUpdate: false
			});
			expect(byName.get('cover')).toMatchObject({ type: 'file', maxSelect: 1 });
			expect(byName.get('gallery')).toMatchObject({
				type: 'file',
				maxSelect: 99,
				maxSize: 2_000_000,
				mimeTypes: ['image/png', 'image/jpeg'],
				thumbs: ['100x100', '300x300']
			});
		});

		test('la colección resultante es usable: crear un registro autopuebla el campo autodate', async () => {
			const record = await pb.collection('kitchen_sink_mig').create({ title: 'hola' });
			expect(record.createdAt).toBeTruthy();
		});

		test('down: revierte con "y", exige "Reverted" en la salida, y la colección desaparece', async () => {
			await server.stop();

			const down = await runPocketBaseMigrate(instance, ['down', '1']);
			// El corazón del test (landmine nº1, cabecera del fichero): NO basta con el exit
			// code, hay que exigir la cadena "Reverted <fichero>" en el stdout.
			expect(down.stdout).toContain(`Reverted ${migration.filename}`);

			deleteMigrationFile(instance, migration.filename);
			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);

			await expect(pb.collections.getOne('kitchen_sink_mig')).rejects.toMatchObject({
				status: 404
			});
		}, 20_000);
	}
);

describe.skipIf(!AVAILABLE)(
	'migración generada contra PocketBase real — kind: "create" ordena relaciones y aplica el fichero completo',
	() => {
		let instance: PocketBaseInstanceDir;
		let server: PocketBaseServerHandle;

		// Orden deliberadamente malo: `blocks_mig` depende de `pages_mig`, que llega después.
		const specs: CollectionSpec[] = [
			{
				name: 'blocks_mig',
				fields: [
					{
						name: 'parent',
						type: 'relation',
						target: 'pages_mig',
						required: true,
						multiple: false,
						cascadeDelete: false
					},
					{
						name: 'relatedBlock',
						type: 'relation',
						target: 'blocks_mig',
						required: false,
						multiple: false,
						cascadeDelete: false
					}
				]
			},
			{ name: 'pages_mig', fields: [{ name: 'title', type: 'text' }] }
		];
		const migration = generateSchemaMigration(
			{ kind: 'create', specs },
			new Date('2026-01-02T00:00:00.000Z')
		);

		beforeAll(async () => {
			instance = createPocketBaseInstanceDir();
			writeMigrationFile(instance, migration.filename, migration.contents);
			await createPocketBaseSuperuser(instance.dataDir);

			const up = await runPocketBaseMigrate(instance, ['up']);
			expect(up.stdout).toContain(`Applied ${migration.filename}`);

			server = await startPocketBaseServerOn(instance);
		}, 30_000);

		afterAll(async () => {
			await server?.stop();
			// `instance` puede no estar asignada si `beforeAll` falló en su primera línea: sin la
			// guarda, `afterAll` lanzaría un TypeError que ENMASCARARÍA el error real del arranque.
			if (instance) destroyPocketBaseInstanceDir(instance);
		});

		test('crea el destino y la colección dependiente con la relación resuelta', async () => {
			const pb = await authAdmin(server.url);
			const pages = await pb.collections.getOne('pages_mig');
			const blocks = await pb.collections.getOne('blocks_mig');
			expect(blocks.fields.find((field) => field.name === 'parent')).toMatchObject({
				type: 'relation',
				collectionId: pages.id
			});
			expect(blocks.fields.find((field) => field.name === 'relatedBlock')).toMatchObject({
				type: 'relation',
				collectionId: blocks.id
			});
		});

		test('down: borra las dos colecciones (el `down` emitido las recorre en orden inverso)', async () => {
			await server.stop();

			const down = await runPocketBaseMigrate(instance, ['down', '1']);
			expect(down.stdout).toContain(`Reverted ${migration.filename}`);

			deleteMigrationFile(instance, migration.filename);
			server = await startPocketBaseServerOn(instance);
			const pb = await authAdmin(server.url);

			await expect(pb.collections.getOne('blocks_mig')).rejects.toMatchObject({ status: 404 });
			await expect(pb.collections.getOne('pages_mig')).rejects.toMatchObject({
				status: 404
			});
		}, 20_000);
	}
);

describe.skipIf(!AVAILABLE)(
	'puente blockTypes source=record — migración real con columnas físicas utilizables',
	() => {
		let instance: PocketBaseInstanceDir;
		let server: PocketBaseServerHandle;
		let pb: PocketBase;

		const migration = generateBlockSchemaMigration(
			{
				// Orden malo deliberado: blocks depende de pages y vega_media, que llegan después.
				specs: [
					{
						name: 'blocks_bridge_mig',
						fields: [
							{
								name: 'parent',
								type: 'relation',
								target: 'pages_bridge_mig',
								required: true,
								multiple: false,
								cascadeDelete: false
							},
							{ name: 'order', type: 'number' },
							{ name: 'type', type: 'text' },
							{ name: 'data', type: 'json' }
						]
					},
					{ name: 'pages_bridge_mig', fields: [{ name: 'title', type: 'text' }] },
					{ name: 'vega_media', fields: [{ name: 'title', type: 'text' }] }
				],
				blocks: {
					collection: 'blocks_bridge_mig',
					parentField: 'parent',
					orderField: 'order',
					typeField: 'type',
					dataField: 'data'
				},
				blockTypes: [
					recordBlockType('hero', [recordBlockField('image', true)]),
					recordBlockType('image', [recordBlockField('image')]),
					recordBlockType('gallery', [recordBlockField('images')])
				]
			},
			new Date('2026-01-02T00:00:10.000Z')
		);

		beforeAll(async () => {
			instance = createPocketBaseInstanceDir();
			writeMigrationFile(instance, migration.filename, migration.contents);
			await createPocketBaseSuperuser(instance.dataDir);

			const up = await runPocketBaseMigrate(instance, ['up']);
			expect(up.stdout).toContain(`Applied ${migration.filename}`);

			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);
		}, 30_000);

		afterAll(async () => {
			await server?.stop();
			if (instance) destroyPocketBaseInstanceDir(instance);
		});

		test('crea image simple e images múltiple después de vega_media', async () => {
			const media = await pb.collections.getOne('vega_media');
			const blocks = await pb.collections.getOne('blocks_bridge_mig');
			expect(blocks.fields.find((field) => field.name === 'image')).toMatchObject({
				type: 'relation',
				collectionId: media.id,
				maxSelect: 1,
				required: false
			});
			expect(blocks.fields.find((field) => field.name === 'images')).toMatchObject({
				type: 'relation',
				collectionId: media.id,
				maxSelect: 99,
				required: false
			});
		});

		test('las dos columnas aceptan registros y conservan sus relaciones', async () => {
			const page = await pb.collection('pages_bridge_mig').create({ title: 'Inicio' });
			const first = await pb.collection('vega_media').create({ title: 'Uno' });
			const second = await pb.collection('vega_media').create({ title: 'Dos' });
			const block = await pb.collection('blocks_bridge_mig').create({
				parent: page.id,
				type: 'gallery',
				data: {},
				image: first.id,
				images: [first.id, second.id]
			});

			expect(block.image).toBe(first.id);
			expect(block.images).toEqual([first.id, second.id]);
		});

		test('down revierte el lote en orden inverso', async () => {
			await server.stop();

			const down = await runPocketBaseMigrate(instance, ['down', '1']);
			expect(down.stdout).toContain(`Reverted ${migration.filename}`);

			deleteMigrationFile(instance, migration.filename);
			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);

			await expect(pb.collections.getOne('blocks_bridge_mig')).rejects.toMatchObject({
				status: 404
			});
			await expect(pb.collections.getOne('pages_bridge_mig')).rejects.toMatchObject({
				status: 404
			});
			await expect(pb.collections.getOne('vega_media')).rejects.toMatchObject({ status: 404 });
		}, 20_000);
	}
);

describe.skipIf(!AVAILABLE)(
	'migración generada contra PocketBase real — kind: "add-fields" sobre una colección existente',
	() => {
		let instance: PocketBaseInstanceDir;
		let server: PocketBaseServerHandle;
		let pb: PocketBase;

		const createSpec: CollectionSpec = {
			name: 'posts_addfields_mig',
			fields: [{ name: 'title', type: 'text', required: true, max: 50 }]
		};
		const createMigration = generateSchemaMigration(
			{ kind: 'create', specs: [createSpec] },
			new Date('2026-01-03T00:00:00.000Z')
		);
		const newFields: CollectionFieldSpec[] = [
			{ name: 'excerpt', type: 'text', required: false },
			{ name: 'featured', type: 'bool', required: true }
		];
		const addFieldsMigration = generateSchemaMigration(
			{ kind: 'add-fields', collection: 'posts_addfields_mig', fields: newFields },
			new Date('2026-01-03T00:00:05.000Z')
		);

		beforeAll(async () => {
			instance = createPocketBaseInstanceDir();
			writeMigrationFile(instance, createMigration.filename, createMigration.contents);
			writeMigrationFile(instance, addFieldsMigration.filename, addFieldsMigration.contents);
			await createPocketBaseSuperuser(instance.dataDir);

			const up = await runPocketBaseMigrate(instance, ['up']);
			expect(up.stdout).toContain(`Applied ${createMigration.filename}`);
			expect(up.stdout).toContain(`Applied ${addFieldsMigration.filename}`);

			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);
		}, 30_000);

		afterAll(async () => {
			await server?.stop();
			// `instance` puede no estar asignada si `beforeAll` falló en su primera línea: sin la
			// guarda, `afterAll` lanzaría un TypeError que ENMASCARARÍA el error real del arranque.
			if (instance) destroyPocketBaseInstanceDir(instance);
		});

		test('los campos nuevos llegan con su forma exacta y el campo previo sigue intacto', async () => {
			const collection = await pb.collections.getOne('posts_addfields_mig');
			const byName = new Map(collection.fields.map((f) => [f.name, f]));

			// El campo previo (creado en OTRA migración) no lo pisó el add-fields. Aquí el mérito es
			// de `collection.fields.add()`, que MUTA el array existente del runtime JSVM; el
			// adaptador HTTP tiene el mismo requisito por otra vía (reenviar el array completo con
			// sus `id` en el PATCH) y lo cubre la suite de contrato, no este fichero.
			expect(byName.get('title')).toMatchObject({ type: 'text', required: true, max: 50 });
			expect(byName.get('excerpt')).toMatchObject({ type: 'text', required: false });
			expect(byName.get('featured')).toMatchObject({ type: 'bool', required: true });
		});

		test('down de add-fields: los campos añadidos desaparecen, el previo sigue intacto', async () => {
			await server.stop();

			const down = await runPocketBaseMigrate(instance, ['down', '1']);
			expect(down.stdout).toContain(`Reverted ${addFieldsMigration.filename}`);

			deleteMigrationFile(instance, addFieldsMigration.filename);
			server = await startPocketBaseServerOn(instance);
			pb = await authAdmin(server.url);

			const collection = await pb.collections.getOne('posts_addfields_mig');
			const names = collection.fields.map((f) => f.name);
			expect(names).toContain('title');
			expect(names).not.toContain('excerpt');
			expect(names).not.toContain('featured');
		}, 20_000);
	}
);
