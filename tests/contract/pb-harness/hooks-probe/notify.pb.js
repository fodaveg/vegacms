/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — globales de la JSVM de PocketBase ($app, $dbx, Record, MailerMessage), sin tipos aquí.
// Hook de SONDA (no es producto): aviso por correo al crear un `messages`, con límite de frecuencia.
// Lo carga `tests/contract/pocketbase.hooks-probe.test.ts` con `--hooksDir`.
//
// LANDMINE de la JSVM de PocketBase: cada callback corre en un runtime aislado y NO ve las
// variables del ámbito del fichero; constantes y helpers van DENTRO del callback (o por require).
onRecordAfterCreateSuccess((e) => {
	const MAX_AVISOS = 3;
	const VENTANA_MS = 60 * 1000;

	// `created` se guarda como «YYYY-MM-DD HH:mm:ss.SSSZ»; se compara como texto.
	const desde = new Date(Date.now() - VENTANA_MS).toISOString().replace('T', ' ');
	const recientes = $app.countRecords(
		'outbox',
		$dbx.hashExp({ kind: 'notified' }),
		$dbx.exp('created >= {:desde}', { desde })
	);

	const outbox = $app.findCollectionByNameOrId('outbox');
	const row = new Record(outbox);
	row.set('messageId', e.record.id);

	if (recientes >= MAX_AVISOS) {
		row.set('kind', 'throttled');
		$app.save(row);
		return e.next();
	}

	const message = new MailerMessage({
		from: {
			address: $app.settings().meta.senderAddress,
			name: $app.settings().meta.senderName
		},
		to: [{ address: 'editor@example.test' }],
		subject: 'Nuevo mensaje de contacto',
		html: '<p>' + e.record.getString('name') + ' ha escrito.</p>'
	});
	$app.newMailClient().send(message);

	row.set('kind', 'notified');
	$app.save(row);
	return e.next();
}, 'messages');
