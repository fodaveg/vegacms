/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — globales de la JSVM de PocketBase ($app, $os, $dbx, MailerMessage), sin tipos aquí.
//
// Aviso por correo al llegar un mensaje del formulario de contacto (colección `messages`).
// Se copia a `/pb/pb_hooks/` en la imagen (`infra/production/Dockerfile`); documentado en
// `docs/CONFIG.md` («Aviso por correo de los mensajes de contacto»). Contrato probado contra el
// binario real en `tests/contract/pocketbase.contact-notify-hook.test.ts`.
//
// Configuración, por entorno del proceso de PocketBase:
//   VEGA_CONTACT_NOTIFY_TO              destinatarios separados por comas; sin él, no se avisa.
//   VEGA_CONTACT_NOTIFY_MAX             avisos como mucho por ventana (por defecto 5).
//   VEGA_CONTACT_NOTIFY_WINDOW_MINUTES  tamaño de la ventana en minutos (por defecto 60).
//
// LANDMINE de la JSVM de PocketBase: cada callback corre en un runtime aislado y NO ve las
// variables ni funciones del ámbito del fichero; constantes y helpers van DENTRO del callback.
onRecordAfterCreateSuccess((e) => {
	const id = e.record.id;

	const notify = () => {
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

		const recipients = String($os.getenv('VEGA_CONTACT_NOTIFY_TO') || '')
			.split(',')
			.map((address) => address.trim())
			.filter((address) => address.length > 0);
		if (recipients.length === 0) return; // sitio sin aviso configurado

		const max = positiveInt($os.getenv('VEGA_CONTACT_NOTIFY_MAX'), 5);
		const windowMinutes = positiveInt($os.getenv('VEGA_CONTACT_NOTIFY_WINDOW_MINUTES'), 60);

		// El mensaje ya está guardado, así que el recuento lo incluye: se avisa mientras haya
		// como mucho `max` mensajes en la ventana. `created` se guarda como
		// «YYYY-MM-DD HH:mm:ss.SSSZ» y se compara como texto. Sin bloqueo entre contar y enviar:
		// dos altas simultáneas pueden dejar pasar un aviso de más.
		const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString().replace('T', ' ');
		const inWindow = $app.countRecords('messages', $dbx.exp('created >= {:since}', { since }));
		if (inWindow > max) return;

		const settings = $app.settings();
		const name = e.record.getString('name');
		const email = e.record.getString('email');
		const body = e.record.getString('message');
		const siteName = settings.meta.appName;

		const mail = {
			from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
			to: recipients.map((address) => ({ address })),
			subject: 'Nuevo mensaje de contacto en ' + siteName,
			html:
				'<p><strong>Nombre:</strong> ' +
				escapeHtml(name) +
				'</p><p><strong>Correo:</strong> ' +
				escapeHtml(email) +
				'</p><p><strong>Mensaje:</strong></p><p style="white-space:pre-wrap">' +
				escapeHtml(body) +
				'</p>'
		};
		// `MailerMessage.headers` (mapa cabecera → valor) lleva el Reply-To; sin saltos de línea.
		const replyTo = email.replace(/[\r\n]/g, '').trim();
		if (replyTo) mail.headers = { 'Reply-To': replyTo };

		$app.newMailClient().send(new MailerMessage(mail));
	};

	try {
		notify();
	} catch {
		// El mensaje ya está guardado: un fallo de SMTP o de configuración no puede romper el
		// alta del visitante. Solo el id del registro, ningún dato del visitante.
		$app.logger().error('vega-contact-notify: no se pudo avisar', 'messageId', id);
	}
	return e.next();
}, 'messages');
