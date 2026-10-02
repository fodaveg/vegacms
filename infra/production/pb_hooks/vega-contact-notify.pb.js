/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — globales de la JSVM de PocketBase ($app, $os, $dbx, MailerMessage), sin tipos aquí.
//
// Aviso por correo de los mensajes del formulario de contacto (colección `messages`). Se copia a
// `/pb/pb_hooks/` en la imagen (`infra/production/Dockerfile`); documentado en `docs/CONFIG.md`
// («Aviso por correo de los mensajes de contacto»). Contrato probado contra el binario real en
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
//
// LANDMINE de la JSVM de PocketBase: cada callback corre en un runtime aislado y NO ve las
// variables ni funciones del ámbito del fichero; constantes y helpers van DENTRO del callback.
onRecordCreateRequest((e) => {
	const recipients = String($os.getenv('VEGA_CONTACT_NOTIFY_TO') || '')
		.split(',')
		.some((address) => address.trim().length > 0);
	// Sin el campo (la colección es de antes del módulo y no se ha actualizado) no hay nada que marcar.
	if (!e.record.collection().fields.getByName('notifyState')) return e.next();
	// `e.auth` es la sesión de ESTA petición: nula para el visitante. Un editor desde «Nuevo», una
	// importación (misma API, con sesión) y una migración (sin petición: este hook ni corre) no avisan.
	e.record.set('notifyState', recipients && !e.auth ? 'pending' : '');
	return e.next();
}, 'messages');

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
		for (const secret of [
			record.getString('name'),
			record.getString('email'),
			record.getString('message')
		]) {
			if (secret.length >= 3) text = text.split(secret).join('<dato>');
		}
		return text.replace(/[^\s<>@"']+@[^\s<>@"']+/g, '<correo>').slice(0, 200);
	};
	const pbDate = (ms) => new Date(ms).toISOString().replace('T', ' ');

	const recipients = String($os.getenv('VEGA_CONTACT_NOTIFY_TO') || '')
		.split(',')
		.map((address) => address.trim())
		.filter((address) => address.length > 0);
	if (recipients.length === 0) return; // sitio sin aviso configurado

	let collection;
	try {
		collection = $app.findCollectionByNameOrId('messages');
	} catch {
		return; // el sitio no tiene colección de mensajes
	}
	if (!collection.fields.getByName('notifyState')) return; // colección sin actualizar

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

		const setState = (record, state) => {
			record.set('notifyState', state);
			$app.saveNoValidate(record);
		};

		// 1. Lo que no se va a avisar nunca: envíos de un tick anterior que no terminaron
		//    (resultado desconocido) y pendientes que llevan más de una hora sin poder enviarse.
		const lost = $app.findRecordsByFilter(
			'messages',
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
			'messages',
			"notifyState = 'pending'",
			'created',
			BATCH,
			0
		);
		for (const record of pending) {
			const since = pbDate(Date.now() - windowMs);
			const inWindow = (state) =>
				$app.countRecords(
					'messages',
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

			const mail = {
				from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
				to: recipients.map((address) => ({ address })),
				subject,
				html
			};
			if (outcome === 'sent') {
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
				const fresh = $app.findRecordById('messages', record.id);
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
			const fresh = $app.findRecordById('messages', record.id);
			if (fresh.getString('notifyState') === 'sending') setState(fresh, outcome);
		}
	} finally {
		if (String(store.get(LOCK_KEY)) === token) store.remove(LOCK_KEY);
	}
});
