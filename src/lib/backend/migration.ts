/**
 * Generador de migraciones JS de PocketBase (lote "esquema", mitad 2): produce el fichero
 * `pb_migrations/<timestamp>_<slug>.js`. Cuando el operador aplica un cambio directamente desde
 * `/settings`, ese fichero documenta en el repo del proyecto lo que
 * `ensureCollections`/`addCollectionFields` acaban de hacer contra el servidor real. El camino de
 * reconciliación de columnas de bloque (`block-schema.ts`) usa el mismo generador al revés: propone
 * el fichero ANTES de ejecutar nada contra el puerto, y es el operador quien decide aplicarlo. Sin
 * el primer camino, cada edición de esquema desde `/settings` alejaría producción del repo EN
 * SILENCIO — ningún commit la registra —, justo el problema que ya resuelven proyectos reales
 * (p.ej. `lumbre.pro`) con migraciones versionadas.
 *
 * Módulo PURO (ley L1/L5): no toca red, no importa `pocketbase` (el paquete npm) ni conoce el
 * `BackendPort` — solo texto determinista a partir de `CollectionSpec`/`CollectionFieldSpec`.
 * `collectionFieldSpecToMigrationField` es un DUPLICADO deliberado de
 * `collectionFieldSpecToPbField` (`adapters/pocketbase/schema.ts`): ese vive en el adaptador y
 * este módulo, bajo `backend/` a secas, no puede importarlo sin romper la separación de capas
 * (mismo criterio que `collectionFieldSpecToPbImportField` en `model/editor/editor-state.ts`).
 *
 * Formato JS verificado contra la documentación de migraciones de PocketBase (runtime JSVM,
 * disponible en el rango de servidor soportado 0.26+): `migrate(up, down)`, con `new
 * Collection({...})` para crear y `collection.fields.add(new Field({...}))`/`removeByName(...)`
 * para tocar una ya existente. El `up`/`down` que emite este módulo describe, en el mismo orden,
 * el mismo par de operaciones que aplicaría el adaptador por red. Cuando el llamador ya ejecutó
 * ese cambio (flujo directo de `/settings`), pégalo tal cual en `pb_migrations/` del proyecto y
 * commítalo junto al cambio de esquema. Cuando el llamador genera antes de ejecutar nada
 * (reconciliación de columnas de bloque), el fichero es la migración PROPUESTA: aplicarla queda a
 * criterio del operador.
 *
 * Cuando una creación incluye varias colecciones, sus relaciones forman un grafo: el destino
 * debe guardarse antes que la colección que lo referencia. Este módulo ordena ese grafo y
 * RECHAZA los ciclos reales, nombrando su recorrido, en vez de emitir una migración que sabemos
 * inaplicable. Resolver ciclos en dos fases (crear sin relaciones y añadirlas después) queda
 * deliberadamente fuera: cambiaría la forma de la operación y no hace falta para el caso
 * desbloqueado aquí. Las autorreferencias no forman arista porque PocketBase las admite.
 */

import {
	collectionUniqueIndexes,
	collectionSpecCreationMetadata,
	type CollectionFieldSpec,
	type CollectionSpec
} from './collections';

/** Una operación de esquema (§ "Emitir migración"): o bien colecciones nuevas, o bien campos
 *  añadidos a una colección existente — nunca ambas mezcladas en la misma llamada, así cada acción
 *  del operador en la UI genera su propia migración, de una en una (más fácil de revisar en el PR
 *  que un fichero con varias intenciones distintas). El flujo directo de `/settings` la construye
 *  ya EJECUTADA contra el backend real; la reconciliación de columnas de bloque la construye ANTES
 *  de ejecutar nada, como propuesta pendiente de aplicar. */
export type SchemaMigrationOp =
	| { kind: 'create'; specs: CollectionSpec[] }
	| { kind: 'add-fields'; collection: string; fields: CollectionFieldSpec[] };

export interface GeneratedMigration {
	/** Nombre de fichero PocketBase-style: `<segundos-unix>_<slug>.js`. `pb_migrations/` las
	 *  aplica en orden de NOMBRE, así que el timestamp al frente es obligatorio. */
	filename: string;
	/** Contenido JS completo, con `migrate(up, down)` — pégalo tal cual en `pb_migrations/`. */
	contents: string;
}

/** Genera la migración para `op`. `now` es inyectable (tests deterministas); por defecto la
 *  hora real, como cualquier sello de tiempo de un fichero que se genera al vuelo. */
export function generateSchemaMigration(
	op: SchemaMigrationOp,
	now: Date = new Date()
): GeneratedMigration {
	const filename = `${Math.floor(now.getTime() / 1000)}_${slugFor(op)}.js`;
	const contents =
		op.kind === 'create' ? renderCreateMigration(op.specs) : renderAddFieldsMigration(op);
	return { filename, contents };
}

function slugFor(op: SchemaMigrationOp): string {
	if (op.kind === 'create') {
		return op.specs.length === 1 ? `create_${op.specs[0].name}` : 'create_collections';
	}
	return `add_fields_to_${op.collection}`;
}

/** Indenta cada línea de `text` (salvo la primera) `level` tabulaciones — para incrustar un
 *  `JSON.stringify(…, null, 2)` multilínea dentro de una plantilla ya indentada. */
function indent(text: string, level: number): string {
	const tabs = '\t'.repeat(level);
	return text.split('\n').join(`\n${tabs}`);
}

/** Payload puro que debe conservar paridad con el enviado por el adaptador PocketBase. */
export function collectionSpecToMigrationPayload(
	spec: CollectionSpec,
	fields: CollectionFieldSpec[] = spec.fields
): Record<string, unknown> {
	return {
		...collectionSpecCreationMetadata(spec),
		fields: fields.map(collectionFieldSpecToMigrationField),
		indexes: collectionUniqueIndexes(spec.name, fields)
	};
}

function renderCreateMigration(specs: CollectionSpec[]): string {
	const orderedSpecs = topologicallySortCollectionSpecs(specs);
	const single = specs.length === 1;
	const ups = orderedSpecs
		.map((spec, i) => {
			const varName = single ? 'collection' : `collection${i + 1}`;
			const selfRelations = spec.fields.filter(
				(field) => field.type === 'relation' && field.target === spec.name
			);
			const initialFields = spec.fields.filter(
				(field) => field.type !== 'relation' || field.target !== spec.name
			);
			const payload = collectionSpecToMigrationPayload(spec, initialFields);
			const create =
				`\tconst ${varName} = new Collection(${indent(renderMigrationPayload(payload, initialFields), 1)});\n` +
				`\tapp.save(${varName});`;
			if (selfRelations.length === 0) return create;

			const addSelfRelations = selfRelations
				.map((field) => {
					const fieldPayload = collectionFieldSpecToMigrationField(field);
					const rendered = renderMigrationPayload(fieldPayload, [field], {
						collectionName: spec.name,
						varName
					});
					return `\t${varName}.fields.add(new Field(${indent(rendered, 1)}));`;
				})
				.join('\n');
			return `${create}\n\n${addSelfRelations}\n` + `\tapp.save(${varName});`;
		})
		.join('\n\n');

	// Borrado en orden INVERSO al orden topológico de creación: primero desaparecen quienes
	// referencian y después sus destinos.
	const downs = [...orderedSpecs]
		.reverse()
		.map((spec) => `\tapp.delete(app.findCollectionByNameOrId(${JSON.stringify(spec.name)}));`)
		.join('\n');

	return migrateTemplate(ups, downs);
}

/**
 * Orden topológico determinista: visita antes cada destino `relation` incluido en el mismo lote
 * e ignora destinos externos (deben existir ya) y autorreferencias. El DFS permite informar el
 * ciclo REAL, sin mezclar colecciones que solo dependan de él.
 */
function topologicallySortCollectionSpecs(specs: CollectionSpec[]): CollectionSpec[] {
	const byName = new Map(specs.map((spec) => [spec.name, spec]));
	const state = new Map<string, 'visiting' | 'visited'>();
	const stack: string[] = [];
	const ordered: CollectionSpec[] = [];

	const visit = (spec: CollectionSpec): void => {
		const currentState = state.get(spec.name);
		if (currentState === 'visited') return;
		if (currentState === 'visiting') {
			const cycleStart = stack.indexOf(spec.name);
			const cycle = [...stack.slice(cycleStart), spec.name];
			throw new Error(`Ciclo de dependencias relation entre colecciones: ${cycle.join(' -> ')}.`);
		}

		state.set(spec.name, 'visiting');
		stack.push(spec.name);

		for (const field of spec.fields) {
			if (field.type !== 'relation' || field.target === spec.name) continue;
			const dependency = byName.get(field.target);
			if (dependency) visit(dependency);
		}

		stack.pop();
		state.set(spec.name, 'visited');
		ordered.push(spec);
	};

	for (const spec of specs) visit(spec);
	return ordered;
}

function renderAddFieldsMigration(op: {
	collection: string;
	fields: CollectionFieldSpec[];
}): string {
	const getCollection = `\tconst collection = app.findCollectionByNameOrId(${JSON.stringify(op.collection)});`;
	const uniqueIndexes = collectionUniqueIndexes(op.collection, op.fields);

	const ups =
		`${getCollection}\n\n` +
		op.fields
			.map((field) => {
				const payload = collectionFieldSpecToMigrationField(field);
				return `\tcollection.fields.add(new Field(${indent(renderMigrationPayload(payload, [field]), 1)}));`;
			})
			.join('\n') +
		(uniqueIndexes.length > 0
			? `\n${uniqueIndexes
					.map((index) => `\tcollection.indexes.push(${JSON.stringify(index)});`)
					.join('\n')}`
			: '') +
		'\n\n\tapp.save(collection);';

	const downs =
		`${getCollection}\n\n` +
		(uniqueIndexes.length > 0
			? `${uniqueIndexes
					.map(
						(index) =>
							`\tcollection.indexes = collection.indexes.filter((candidate) => candidate !== ${JSON.stringify(index)});`
					)
					.join('\n')}\n`
			: '') +
		op.fields
			.map((field) => `\tcollection.fields.removeByName(${JSON.stringify(field.name)});`)
			.join('\n') +
		'\n\n\tapp.save(collection);';

	return migrateTemplate(ups, downs);
}

function migrateTemplate(up: string, down: string): string {
	return (
		'/// <reference path="../pb_data/types.d.ts" />\n' +
		`migrate((app) => {\n${up}\n}, (app) => {\n${down}\n});\n`
	);
}

/**
 * PocketBase guarda una relación por `collectionId`, pero una migración versionada debe poder
 * aplicarse en entornos donde ese id sea distinto. El payload intermedio conserva el NOMBRE y
 * aquí se sustituye únicamente el valor de su clave `collectionId` por una resolución JSVM en
 * tiempo de ejecución. El resto continúa siendo JSON determinista.
 */
function renderMigrationPayload(
	payload: Record<string, unknown>,
	fields: CollectionFieldSpec[],
	selfRelation?: { collectionName: string; varName: string }
): string {
	let rendered = JSON.stringify(payload, null, 2);
	for (const field of fields) {
		if (field.type !== 'relation') continue;
		const collectionIdExpression =
			selfRelation?.collectionName === field.target
				? `${selfRelation.varName}.id`
				: `app.findCollectionByNameOrId(${JSON.stringify(field.target)}).id`;
		rendered = rendered.replace(
			`"collectionId": ${JSON.stringify(field.target)}`,
			`"collectionId": ${collectionIdExpression}`
		);
	}
	return rendered;
}

/**
 * Compila un `CollectionFieldSpec` (vocabulario Vega REDUCIDO del Anexo A) al payload de campo
 * que entiende el runtime de migraciones de PocketBase — mismo mapeo que
 * `collectionFieldSpecToPbField` del adaptador `pocketbase` (ver cabecera del fichero para por
 * qué está duplicado en vez de importado).
 */
function collectionFieldSpecToMigrationField(spec: CollectionFieldSpec): Record<string, unknown> {
	switch (spec.type) {
		case 'json':
			return { name: spec.name, type: 'json' };
		case 'text':
			return {
				name: spec.name,
				type: 'text',
				required: spec.required ?? false,
				max: spec.max ?? 0
			};
		case 'select':
			return {
				name: spec.name,
				type: 'select',
				required: spec.required ?? false,
				values: spec.options,
				maxSelect: spec.multiple ? 99 : 1
			};
		case 'file':
			return {
				name: spec.name,
				type: 'file',
				required: spec.required ?? false,
				maxSelect: spec.multiple ? 99 : 1,
				maxSize: spec.maxSizeBytes ?? 0,
				mimeTypes: spec.mimeTypes ?? [],
				thumbs: spec.thumbs ?? []
			};
		case 'bool':
			return { name: spec.name, type: 'bool', required: spec.required ?? false };
		case 'number':
			return { name: spec.name, type: 'number', required: spec.required ?? false };
		case 'date':
			return { name: spec.name, type: 'date', required: spec.required ?? false };
		case 'relation':
			return {
				name: spec.name,
				type: 'relation',
				required: spec.required ?? false,
				// Marcador por NOMBRE: `renderMigrationPayload` lo convierte a id en runtime.
				collectionId: spec.target,
				maxSelect: spec.multiple ? 99 : 1,
				cascadeDelete: spec.cascadeDelete
			};
		case 'autodate':
			return {
				name: spec.name,
				type: 'autodate',
				onCreate: true,
				onUpdate: spec.onUpdate ?? false
			};
	}
}
