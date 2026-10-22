/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — helpers de la JSVM de PocketBase, cargados dentro de cada callback.
const NAME = 'vega_activity';
const FIELDS = [
	{ name: 'action', type: 'text', required: true },
	{ name: 'collection', type: 'text', required: true },
	{ name: 'recordId', type: 'text', required: true },
	{ name: 'label', type: 'text', max: 200 },
	{ name: 'actorId', type: 'text', required: true },
	{ name: 'actorCollection', type: 'text', required: true },
	{ name: 'actorEmail', type: 'text' },
	{ name: 'changes', type: 'json' },
	{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false }
];

/** Una colección ajena nunca se modifica; también se rechazan reglas abiertas. */
function valid(collection) {
	return (
		collection.type === 'base' &&
		FIELDS.every((field) => {
			const actual = collection.fields.getByName(field.name);
			return (
				actual &&
				actual.type() === field.type &&
				(!field.required || actual.required) &&
				(field.name !== 'created' || (actual.onCreate && !actual.onUpdate))
			);
		}) &&
		['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].every(
			(key) => collection[key] == null
		)
	);
}

/** Crear desde el modelo no genera migraciones de la API, ni escribe en pb_migrations. */
function bootstrap(app) {
	let collection;
	try {
		collection = app.findCollectionByNameOrId(NAME);
	} catch {
		collection = new Collection({
			name: NAME,
			type: 'base',
			fields: FIELDS,
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			indexes: [
				'CREATE INDEX idx_vega_activity_created ON vega_activity (created)',
				'CREATE INDEX idx_vega_activity_record ON vega_activity (collection, recordId)',
				'CREATE INDEX idx_vega_activity_actor ON vega_activity (actorId, created)'
			]
		});
		app.save(collection);
	}
	const ready = valid(collection);
	app.store().set('vegaActivityReady', ready);
	if (!ready) app.logger().warn('vega-activity: esquema incompatible; registro desactivado');
}

/** Frontera idéntica al historial: contenido base y medios, nunca auth ni plomería. */
function eligible(event) {
	const collection = event.record.collection();
	return (
		event.app.store().get('vegaActivityReady') === true &&
		event.auth &&
		collection.type === 'base' &&
		!collection.system &&
		(collection.name === 'vega_media' ||
			(collection.name !== 'vega' && !collection.name.startsWith('vega_')))
	);
}

/** No conservar etiquetas de colecciones con correo; los valores de texto nunca viajan. */
function snapshot(event, action) {
	const record = event.record;
	const collection = record.collection();
	const fields = collection.fields;
	let label = '';
	if (!fields.some((field) => field.type() === 'email')) {
		label =
			['title', 'name', ...(collection.name === 'vega_media' ? ['file'] : [])]
				.map((name) => record.get(name))
				.find((value) => typeof value === 'string' && value.trim()) || '';
	}
	const changes = [];
	if (action === 'update') {
		const original = record.original();
		for (const field of fields) {
			if (field.name === 'id' || field.type() === 'autodate') continue;
			const from = original.get(field.name);
			const to = record.get(field.name);
			if (JSON.stringify(from) === JSON.stringify(to)) continue;
			const change = { field: field.name };
			if (field.type() === 'select' || field.type() === 'bool') Object.assign(change, { from, to });
			changes.push(change);
			if (changes.length === 50) break;
		}
	}
	return {
		action,
		collection: collection.name,
		recordId: record.id,
		label: label.slice(0, 200),
		actorId: event.auth.id,
		actorCollection: event.auth.collection().name,
		actorEmail: event.auth.getString('email'),
		changes
	};
}

/** Preparación tolerante al fallo, separada de e.next para no tragarse errores del negocio. */
function request(event, action) {
	let entry;
	try {
		if (eligible(event)) entry = snapshot(event, action);
	} catch {
		event.app.logger().warn('vega-activity: no se pudo preparar la actividad');
	}
	event.next();
	if (entry) {
		entry.recordId = event.record.id;
		write(event.app, entry);
	}
}

/** El fallo de registro no rompe el guardado ni publica valores en los logs. */
function write(app, entry) {
	try {
		const record = new Record(app.findCollectionByNameOrId(NAME));
		for (const key in entry) record.set(key, entry[key]);
		app.save(record);
	} catch {
		// Los errores de validación pueden incluir el valor rechazado: texto fijo deliberado.
		app
			.logger()
			.warn(
				'vega-activity: no se pudo guardar la actividad',
				'collection',
				entry.collection,
				'recordId',
				entry.recordId,
				'error',
				'activity_write_failed'
			);
	}
}

/** La identidad incluye la colección: ids iguales de dos colecciones auth no se mezclan. */
function anonymize(event) {
	if (!event.app.store().get('vegaActivityReady') || event.record.collection().type !== 'auth')
		return;
	try {
		event.app
			.db()
			.newQuery(
				"UPDATE vega_activity SET actorEmail = '' WHERE actorId = {:id} AND actorCollection = {:collection}"
			)
			.bind({ id: event.record.id, collection: event.record.collection().name })
			.execute();
	} catch {
		event.app.logger().warn('vega-activity: no se pudo anonimizar la cuenta');
	}
}

function positiveInt(value, fallback) {
	const text = String(value || '').trim();
	const n = Number(text);
	return /^[0-9]+$/.test(text) && Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** SQL por tandas, sin cargar snapshots ni disparar hooks por cada fila. */
function prune(app) {
	if (!app.store().get('vegaActivityReady')) return;
	const days = positiveInt($os.getenv('VEGA_ACTIVITY_DAYS'), 90);
	const max = positiveInt($os.getenv('VEGA_ACTIVITY_MAX_ROWS'), 100000);
	const cutoff = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ');
	const remove = (where, params) => {
		let result;
		do {
			result = app
				.db()
				.newQuery(
					'DELETE FROM vega_activity WHERE id IN (SELECT id FROM vega_activity ' +
						where +
						' LIMIT 1000)'
				)
				.bind(params)
				.execute();
		} while (result.rowsAffected() === 1000);
	};
	remove('WHERE created < {:cutoff}', { cutoff });
	remove(
		'WHERE id IN (SELECT id FROM vega_activity ORDER BY created DESC, id DESC LIMIT -1 OFFSET {:max})',
		{ max }
	);
}

module.exports = { bootstrap, eligible, snapshot, request, write, anonymize, prune, positiveInt };
