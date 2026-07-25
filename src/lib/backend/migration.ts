/**
 * Generador de migraciones JS de PocketBase (lote "esquema", mitad 2): produce el fichero
 * `pb_migrations/<timestamp>_<slug>.js` que documenta en el repo del proyecto lo que
 * `ensureCollections`/`addCollectionFields` acaban de hacer contra el servidor real. Sin esto,
 * cada edición de esquema desde `/settings` aleja producción del repo EN SILENCIO — ningún
 * commit la registra —, justo el problema que ya resuelven proyectos reales (p.ej. `lumbre.pro`)
 * con migraciones versionadas.
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
 * para tocar una ya existente. El `up`/`down` que emite este módulo es el MISMO par de
 * operaciones que el adaptador acaba de ejecutar por red, en el mismo orden — pégalo tal cual en
 * `pb_migrations/` del proyecto y commítalo junto al cambio de esquema.
 */

import type { CollectionFieldSpec, CollectionSpec } from './collections';

/** Una operación de esquema ya EJECUTADA contra el backend real (§ "Emitir migración"): o bien
 *  colecciones nuevas creadas, o bien campos añadidos a una existente — nunca ambas mezcladas en
 *  la misma llamada, así cada acción del operador en la UI genera su propia migración, de una en
 *  una (más fácil de revisar en el PR que un fichero con varias intenciones distintas). */
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

function renderCreateMigration(specs: CollectionSpec[]): string {
	const single = specs.length === 1;
	const ups = specs
		.map((spec, i) => {
			const varName = single ? 'collection' : `collection${i + 1}`;
			const payload = {
				name: spec.name,
				type: 'base',
				fields: spec.fields.map(collectionFieldSpecToMigrationField)
			};
			return (
				`\tconst ${varName} = new Collection(${indent(JSON.stringify(payload, null, 2), 1)});\n` +
				`\tapp.save(${varName});`
			);
		})
		.join('\n\n');

	// Borrado en orden INVERSO de creación (defensivo: aunque el vocabulario v1 no tiene
	// `relation`, si un futuro spec dependiera de otro, deshacer al revés es lo seguro).
	const downs = [...specs]
		.reverse()
		.map((spec) => `\tapp.delete(app.findCollectionByNameOrId(${JSON.stringify(spec.name)}));`)
		.join('\n');

	return migrateTemplate(ups, downs);
}

function renderAddFieldsMigration(op: {
	collection: string;
	fields: CollectionFieldSpec[];
}): string {
	const getCollection = `\tconst collection = app.findCollectionByNameOrId(${JSON.stringify(op.collection)});`;

	const ups =
		`${getCollection}\n\n` +
		op.fields
			.map((field) => {
				const payload = collectionFieldSpecToMigrationField(field);
				return `\tcollection.fields.add(new Field(${indent(JSON.stringify(payload, null, 2), 1)}));`;
			})
			.join('\n') +
		'\n\n\tapp.save(collection);';

	const downs =
		`${getCollection}\n\n` +
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
		case 'autodate':
			return {
				name: spec.name,
				type: 'autodate',
				onCreate: true,
				onUpdate: spec.onUpdate ?? false
			};
	}
}
