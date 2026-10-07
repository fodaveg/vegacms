/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — globales y tipos Go expuestos por la JSVM de PocketBase.
//
// PocketBase necesita `?token=` para autenticar la descarga nativa de copias. No se modifica
// hasta que termina el handler. El activity logger de PB 0.39.9 (-1040) registra al VOLVER:
// -1035 envuelve también auth, restricciones IP y rate limit, incluidos sus 403 y 429.
// El contrato real está en tests/contract/pocketbase.backup-log-redaction.test.ts. Revisar
// estas prioridades al actualizar PocketBase; otros hooks/sinks que registren antes no quedan
// cubiertos. El proxy tiene su propio encoder (infra/production/README.md).
routerUse(
	new Middleware(
		(e) => {
			try {
				return e.next();
			} finally {
				if (e.request.url.path.startsWith('/api/backups/')) {
					// Ninguna query de descarga aporta información necesaria al registro. Borrarla entera
					// evita conservar valores repetidos, nombres codificados o una query mal formada.
					e.request.url.rawQuery = '';
					e.request.url.forceQuery = false;
					e.request.requestURI = e.request.url.requestURI();
				}
				// Una URL de copia también puede llegar como Referer a OTRA ruta (incluso con 403).
				// Solo se retira al volver: el handler ya ha consumido la cabecera original.
				const sensitiveReferer = e.request.header.values('Referer').some((value) => {
					const query = value.indexOf('?');
					if (query === -1) return false;
					return value
						.slice(query + 1)
						.split(/[&;]/)
						.some((part) => {
							try {
								return decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')) === 'token';
							} catch {
								// Un nombre mal codificado no permite descartar que la URL sea sensible.
								return true;
							}
						});
				});
				if (sensitiveReferer) e.request.header.del('Referer');
			}
		},
		-1035,
		'vegaBackupLogRedaction'
	)
);
