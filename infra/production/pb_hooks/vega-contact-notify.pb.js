/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — globales de la JSVM de PocketBase ($app, $os, $dbx, MailerMessage), sin tipos aquí.
//
// Aviso por correo de las bandejas de formularios, incluido el contacto `messages`. Se copia a
// `/pb/pb_hooks/` en la imagen (`infra/production/Dockerfile`); documentado en `docs/CONFIG.md`
// («Aviso por correo de los formularios»). Contrato probado contra el binario real en
// `tests/contract/pocketbase.contact-notify-hook.test.ts`.
//
// CONTRATO. Dos piezas y un campo de control:
//   1. `onRecordCreateRequest` (síncrono, dentro de la petición): solo MARCA el mensaje. No envía
//      nada ni toca la red: el POST del visitante no depende del SMTP. Fija `notifyState`:
//        'pending'  el mensaje se creó SIN sesión y hay destinatarios: hay que avisar.
//        ''         no se avisa (alta de un editor desde «Nuevo», importación, migración, o sitio
//                   sin destinatarios).
//      Se fija en el servidor y se pisa siempre; el campo es `hidden` en la colección, así que un
//      cuerpo de petición no puede traerlo ni nadie salvo un superusuario lo lee.
//   2. `cronAdd`, cada minuto: avisa de los `pending`, del más antiguo al más nuevo. Estados:
//        'sending'  reservado mientras se envía (si el proceso muere o el SMTP no responde, se queda
//                   así: el siguiente tick lo da por perdido, ver más abajo).
//        'sent'     avisado.
//        'more'     el mensaje cuyo aviso fue el «hay más mensajes» al llegar al tope.
//        'capped'   pasó del tope de la ventana: no se avisa.
//        'failed'   no se pudo avisar y no se va a reintentar.
//
// GARANTÍAS
//   - El log de un fallo lleva el id del registro y el error recortado a 200 caracteres, sin el
//     nombre, el correo ni el texto del visitante (`describeError`).
//   - Un mensaje no se marca 'sent' si el envío lanzó un error: vuelve a 'pending' y se reintenta
//     en el tick siguiente. NO se reintenta para siempre: pasada una hora desde su `created` (o con
//     un SMTP que lo rechaza cada vez) pasa a 'failed' y deja UNA línea de log con el recuento.
//   - Dos ticks no se solapan: un cerrojo en `$app.store()` hace que el tick que encuentra a otro
//     en marcha salga sin hacer nada. El cerrojo caduca a los 5 minutos, para que un envío colgado
//     no pare los avisos para siempre.
//   - El envío pasa antes por 'sending'. Si un tick que toma el cerrojo encuentra mensajes en
//     'sending', el envío de un tick anterior no terminó y NO se sabe si el correo salió: se
//     marcan 'failed' y no se reenvían (preferimos perder un aviso a mandarlo dos veces). Cuando el
//     envío colgado por fin termine, no pisa el estado que ya cambió otro tick.
// LÍMITES (no garantiza)
//   - Un envío colgado en el SMTP sigue ocupando su hilo en PocketBase hasta que el sistema
//     operativo cierre la conexión: aquí no hay forma de cancelarlo, solo de no esperarle.
//   - El aviso llega hasta un minuto después del mensaje.
//
// Configuración, por entorno del proceso de PocketBase:
//   VEGA_CONTACT_NOTIFY_TO              destinatarios separados por comas; sin él, no se avisa.
//   VEGA_CONTACT_NOTIFY_MAX             avisos como mucho por ventana (por defecto 5).
//   VEGA_CONTACT_NOTIFY_WINDOW_MINUTES  tamaño de la ventana en minutos (por defecto 60).
//   VEGA_FORMS_RETENTION_DAYS           entero positivo, opt-in; purga diaria de envíos/revisiones.
//   VEGA_FORMS_EXCLUDE_COLLECTIONS      nombres CSV literales; no marca, avisa ni purga esas bandejas.
//
// LANDMINE de la JSVM de PocketBase: cada callback corre en un runtime aislado y NO ve las
// variables ni funciones del ámbito del fichero; constantes y helpers van DENTRO del callback.
onRecordCreateRequest((e) => {
	const excluded = String($os.getenv('VEGA_FORMS_EXCLUDE_COLLECTIONS') || '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name));
	if (excluded.includes(e.record.collection().name)) return e.next();
	const recipients = String($os.getenv('VEGA_CONTACT_NOTIFY_TO') || '')
		.split(',')
		.some((address) => address.trim().length > 0);
	// Sin el campo (la colección es de antes del módulo y no se ha actualizado) no hay nada que marcar.
	const fields = e.record.collection().fields;
	const notify = fields.getByName('notifyState');
	const created = fields.getByName('created');
	if (
		e.record.collection().type !== 'base' ||
		!notify ||
		notify.type() !== 'text' ||
		!notify.hidden ||
		!created ||
		created.type() !== 'autodate'
	)
		return e.next();
	// `e.auth` es la sesión de ESTA petición: nula para el visitante. Un editor desde «Nuevo», una
	// importación (misma API, con sesión) y una migración (sin petición: este hook ni corre) no avisan.
	e.record.set('notifyState', recipients && !e.auth ? 'pending' : '');
	return e.next();
});

cronAdd('vega-contact-notify', '* * * * *', () => {
	const LOCK_KEY = 'vegaContactNotifyLock';
	const LOCK_TTL_MS = 5 * 60 * 1000;
	const RETRY_MS = 60 * 60 * 1000;
	const BATCH = 50;

	const positiveInt = (raw, fallback) => {
		const text = String(raw || '').trim();
		if (!/^[0-9]+$/.test(text)) return fallback;
		const n = parseInt(text, 10);
		return n > 0 ? n : fallback;
	};
	const escapeHtml = (value) =>
		String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	/** «YYYY-MM-DD HH:mm:ss.SSSZ», el formato en que PocketBase guarda y compara las fechas. */
	/**
	 * El error de un envío, sin nada del visitante: el servidor SMTP puede repetir en su respuesta la
	 * dirección o el texto que se le dio, y el log no es sitio para eso. Se quitan el nombre, el correo y
	 * el mensaje del registro (los de menos de 3 caracteres no, destrozarían el resto del texto) y
	 * cualquier cosa con forma de dirección.
	 */
	const describeError = (err, record) => {
		let text = String(err);
		for (const field of record.collection().fields) {
			if (!['text', 'email', 'url', 'editor', 'select'].includes(field.type())) continue;
			const raw = record.get(field.name);
			const values = Array.isArray(raw) ? raw : [raw];
			for (const secret of values)
				if (typeof secret === 'string' && secret.length >= 3)
					text = text.split(secret).join('<dato>');
		}
		return text.replace(/[^\s<>@"']+@[^\s<>@"']+/g, '<correo>').slice(0, 200);
	};
	const pbDate = (ms) => new Date(ms).toISOString().replace('T', ' ');

	const recipients = String($os.getenv('VEGA_CONTACT_NOTIFY_TO') || '')
		.split(',')
		.map((address) => address.trim())
		.filter((address) => address.length > 0);
	if (recipients.length === 0) return; // sitio sin aviso configurado
	const excluded = String($os.getenv('VEGA_FORMS_EXCLUDE_COLLECTIONS') || '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name));

	const collections = $app.findAllCollections().filter((collection) => {
		const notify = collection.fields.getByName('notifyState');
		const created = collection.fields.getByName('created');
		return (
			!excluded.includes(collection.name) &&
			collection.type === 'base' &&
			notify &&
			notify.type() === 'text' &&
			notify.hidden &&
			created &&
			created.type() === 'autodate'
		);
	});
	if (!collections.length) return;

	// Cerrojo contra el solapamiento. `getOrSet` es atómico: solo uno de dos ticks simultáneos
	// guarda su ficha; el otro recibe la del primero.
	const now = Date.now();
	const token = now + ':' + Math.random();
	const store = $app.store();
	const held = String(store.getOrSet(LOCK_KEY, () => token));
	if (held !== token) {
		if (now - parseInt(held.split(':')[0], 10) < LOCK_TTL_MS) return; // sigue en marcha
		store.set(LOCK_KEY, token); // caducado: el tick anterior se colgó, se toma el relevo
	}

	try {
		const max = positiveInt($os.getenv('VEGA_CONTACT_NOTIFY_MAX'), 5);
		const windowMs = positiveInt($os.getenv('VEGA_CONTACT_NOTIFY_WINDOW_MINUTES'), 60) * 60 * 1000;
		const settings = $app.settings();
		let manifest = {};
		try {
			let config;
			try {
				config = $app.findFirstRecordByFilter('vega', 'key = {:key}', { key: 'default' });
			} catch {
				config = $app.findRecordsByFilter('vega', '', '', 1, 0)[0];
			}
			if (config) {
				const parsed = JSON.parse(config.getString('manifest') || '{}');
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) manifest = parsed;
			}
		} catch {
			/* Sin manifiesto: se usan nombres de campos. */
		}
		for (const collection of collections) {
			const inbox = collection.name;
			const config = (manifest.collections && manifest.collections[inbox]) || {};
			const formTitle = typeof config.label === 'string' ? config.label : inbox;

			const setState = (record, state) => {
				record.set('notifyState', state);
				$app.saveNoValidate(record);
			};

			// 1. Lo que no se va a avisar nunca: envíos de un tick anterior que no terminaron
			//    (resultado desconocido) y pendientes que llevan más de una hora sin poder enviarse.
			const lost = $app.findRecordsByFilter(
				inbox,
				"notifyState = 'sending' || (notifyState = 'pending' && created < {:cutoff})",
				'created',
				BATCH,
				0,
				{ cutoff: pbDate(now - RETRY_MS) }
			);
			for (const record of lost) setState(record, 'failed');
			if (lost.length > 0) {
				$app.logger().warn('vega-contact-notify: avisos descartados', 'count', lost.length);
			}

			// 2. Los pendientes, del más antiguo al más nuevo.
			const pending = $app.findRecordsByFilter(
				inbox,
				"notifyState = 'pending'",
				'created',
				BATCH,
				0
			);
			for (const record of pending) {
				const since = pbDate(Date.now() - windowMs);
				const inWindow = (state) =>
					$app.countRecords(
						inbox,
						$dbx.hashExp({ notifyState: state }),
						$dbx.exp('created >= {:since}', { since })
					);

				let outcome = 'sent';
				let subject = 'Nuevo mensaje de contacto en ' + settings.meta.appName;
				let html;
				if (inWindow('sent') + inWindow('more') >= max) {
					// Tope de la ventana: el primer mensaje que lo pasa manda UN aviso de «hay más» y los
					// siguientes se callan hasta que la ventana corra.
					if (inWindow('more') > 0) {
						setState(record, 'capped');
						continue;
					}
					outcome = 'more';
					subject = 'Hay más mensajes de contacto en ' + settings.meta.appName;
					html =
						'<p>Se ha alcanzado el máximo de avisos (' +
						max +
						') y hay más mensajes en la bandeja. No se avisará de más hasta que pase la ventana.</p>';
				} else {
					const email = record.getString('email');
					html =
						'<p><strong>Nombre:</strong> ' +
						escapeHtml(record.getString('name')) +
						'</p><p><strong>Correo:</strong> ' +
						escapeHtml(email) +
						'</p><p><strong>Mensaje:</strong></p><p style="white-space:pre-wrap">' +
						escapeHtml(record.getString('message')) +
						'</p>';
				}

				// La compatibilidad depende también de las columnas: el asistente puede crear
				// una bandeja llamada messages con un formulario distinto al contacto histórico.
				const legacyContact =
					inbox === 'messages' &&
					['name', 'email', 'message'].every((name) => collection.fields.getByName(name)) &&
					collection.fields.every((field) =>
						[
							'id',
							'name',
							'email',
							'message',
							'read',
							'notifyState',
							'created',
							'updated'
						].includes(field.name)
					);
				if (!legacyContact) {
					subject =
						(outcome === 'sent' ? 'Nuevo envío de ' : 'Hay más envíos de ') +
						formTitle +
						' en ' +
						settings.meta.appName;
					if (outcome === 'sent')
						html = collection.fields
							.filter(
								(field) =>
									!['id', 'read', 'notifyState', 'created', 'updated'].includes(field.name) &&
									['text', 'email', 'url', 'number', 'bool', 'date', 'select'].includes(
										field.type()
									)
							)
							.map((field) => {
								const label =
									(config.fields && config.fields[field.name] && config.fields[field.name].label) ||
									field.name;
								const value = record.get(field.name);
								return (
									'<p><strong>' +
									escapeHtml(label) +
									':</strong> ' +
									escapeHtml(Array.isArray(value) ? value.join(', ') : value == null ? '' : value) +
									'</p>'
								);
							})
							.join('');
				}

				const mail = {
					from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
					to: recipients.map((address) => ({ address })),
					subject,
					html
				};
				if (outcome === 'sent' && collection.fields.getByName('email')?.type() === 'email') {
					// `MailerMessage.headers` (mapa cabecera → valor) lleva el Reply-To; sin saltos de línea.
					const replyTo = record
						.getString('email')
						.replace(/[\r\n]/g, '')
						.trim();
					if (replyTo) mail.headers = { 'Reply-To': replyTo };
				}

				setState(record, 'sending');
				try {
					$app.newMailClient().send(new MailerMessage(mail));
				} catch (err) {
					// El envío falló y se sabe: vuelve a la cola, salvo que otro tick ya lo haya tocado.
					const fresh = $app.findRecordById(inbox, record.id);
					if (fresh.getString('notifyState') === 'sending') setState(fresh, 'pending');
					$app
						.logger()
						.error(
							'vega-contact-notify: no se pudo avisar',
							'messageId',
							record.id,
							'error',
							describeError(err, record)
						);
					break; // el SMTP falla: no se prueba con el resto en este tick
				}
				const fresh = $app.findRecordById(inbox, record.id);
				if (fresh.getString('notifyState') === 'sending') setState(fresh, outcome);
			}
		}
	} finally {
		if (String(store.get(LOCK_KEY)) === token) store.remove(LOCK_KEY);
	}
});

// Retención opt-in: sin valor entero positivo no se borra nada. Sin copias nuevas del cliente.
cronAdd('vega-forms-retention', '45 3 * * *', () => {
	const excluded = String($os.getenv('VEGA_FORMS_EXCLUDE_COLLECTIONS') || '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(name));
	const raw = String($os.getenv('VEGA_FORMS_RETENTION_DAYS') || '').trim();
	const days = Number(raw);
	if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(days) || days <= 0) return;
	const cutoffMs = Date.now() - days * 86400000;
	if (!Number.isFinite(new Date(cutoffMs).getTime())) return;
	const cutoff = new Date(cutoffMs).toISOString().replace('T', ' ');
	let count = 0;
	for (const collection of $app.findAllCollections()) {
		if (excluded.includes(collection.name)) continue;
		const notify = collection.fields.getByName('notifyState');
		const created = collection.fields.getByName('created');
		if (
			collection.type !== 'base' ||
			!notify ||
			notify.type() !== 'text' ||
			!notify.hidden ||
			!created ||
			created.type() !== 'autodate'
		)
			continue;
		try {
			for (;;) {
				const rows = $app.findRecordsByFilter(
					collection.name,
					'created < {:cutoff}',
					'created',
					100,
					0,
					{ cutoff }
				);
				if (!rows.length) break;
				for (const record of rows) {
					$app.delete(record);
					count++;
				}
			}
			let revisions;
			try {
				revisions = $app.findCollectionByNameOrId('vega_revisions');
			} catch {
				continue;
			}
			if (!revisions.fields.getByName('collection') || !revisions.fields.getByName('created'))
				continue;
			for (;;) {
				const rows = $app.findRecordsByFilter(
					'vega_revisions',
					'collection = {:collection} && created < {:cutoff}',
					'created',
					100,
					0,
					{ collection: collection.name, cutoff }
				);
				if (!rows.length) break;
				for (const record of rows) {
					$app.delete(record);
					count++;
				}
			}
		} catch {
			$app
				.logger()
				.warn(
					'vega-forms-retention: no se pudo completar una bandeja',
					'collection',
					collection.name
				);
		}
	}
	if (count) $app.logger().info('vega-forms-retention: filas eliminadas', 'count', count);
});
