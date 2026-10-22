/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// require es el cargador nativo de la JSVM: no admite imports ESM.
// @ts-nocheck — globales de la JSVM de PocketBase.
// Registro de peticiones con sesión; no es una auditoría transaccional. Cada callback carga
// sus helpers: la JSVM no comparte el ámbito del fichero entre callbacks.
onBootstrap((event) => {
	event.next();
	try {
		require(`${__hooks}/vega-activity-lib.js`).bootstrap(event.app);
	} catch {
		event.app.logger().warn('vega-activity: arranque fallido; registro desactivado');
	}
});

onRecordCreateRequest((event) => {
	let activity;
	try {
		activity = require(`${__hooks}/vega-activity-lib.js`);
	} catch {
		event.app.logger().warn('vega-activity: helper no disponible');
		return event.next();
	}
	activity.request(event, 'create');
});
onRecordUpdateRequest((event) => {
	let activity;
	try {
		activity = require(`${__hooks}/vega-activity-lib.js`);
	} catch {
		event.app.logger().warn('vega-activity: helper no disponible');
		return event.next();
	}
	activity.request(event, 'update');
});
onRecordDeleteRequest((event) => {
	let activity;
	try {
		activity = require(`${__hooks}/vega-activity-lib.js`);
	} catch {
		event.app.logger().warn('vega-activity: helper no disponible');
		return event.next();
	}
	activity.request(event, 'delete');
});
onRecordAfterDeleteSuccess((event) => {
	event.next();
	try {
		require(`${__hooks}/vega-activity-lib.js`).anonymize(event);
	} catch {
		event.app.logger().warn('vega-activity: no se pudo anonimizar la cuenta');
	}
});
cronAdd('vega-activity-prune', '30 3 * * *', () => {
	try {
		require(`${__hooks}/vega-activity-lib.js`).prune($app);
	} catch {
		$app.logger().warn('vega-activity: poda fallida');
	}
});
