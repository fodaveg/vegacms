/**
 * Ajustes del servidor que Vega edita (`ServerSettingsPort`): dirección de la app (`meta`), correo
 * saliente (`smtp`) y copias automáticas con su destino (`backups`, `backups.s3`). Es la tesis de
 * «CMS de PocketBase»: configurarlo sin el panel `/_/`, que un despliegue puede no servir.
 *
 * CONTRATO (medido contra PocketBase 0.39.9 en `tests/contract/pocketbase.settings.contract.test.ts`
 * y `tests/contract/pocketbase.server-settings.contract.test.ts`; es la fuente, no esta prosa):
 * - Solo superusuario: la sección existe ⟺ `capabilities.serverSettings`, como `administration`.
 * - `get()` NO trae los secretos (`smtp.password`, `backups.s3.secret`): la clave llega AUSENTE y
 *   Vega no puede saber si hay uno guardado. Por eso los tipos de lectura no tienen campo secreto.
 * - `update(patch)` es un PATCH que PocketBase fusiona en profundidad, por bloque y por campo: se
 *   envía SOLO lo que cambió. Omitir un secreto lo conserva; mandar `""` BORRA `smtp.password`;
 *   mandar `******` guarda los asteriscos. EXCEPCIÓN medida: `""` en `backups.s3.secret` no se
 *   persiste de verdad (el siguiente guardado lo resucita), así que Vega no ofrece quitarla. Por eso el parche de secretos solo existe como `set` (valor no vacío) o
 *   `clear` (explícito), y `buildServerSettingsPatch` nunca produce un secreto vacío salvo en `clear`.
 * - Un PATCH con un campo inválido no aplica NADA (ni los campos válidos del mismo envío) y rechaza
 *   con `VegaError 'validation'`: `fieldErrors` va con clave de ruta punteada (`backups.cron`,
 *   `backups.cronMaxKeep`, `backups.s3.endpoint`…, igual que `data.<bloque>.<campo>` en la red) y
 *   `message` trae el texto del servidor tal cual. `backups.cron` vacío es válido (desactiva las
 *   copias programadas); `cronMaxKeep: 0` se rechaza.
 * - Las pruebas (`testS3`, `testEmail`) comprueban lo GUARDADO, no lo que haya en un formulario. El
 *   servidor las contesta con 400 y el error crudo en `message` cuando falla: eso NO es una excepción
 *   del puerto sino un resultado (`{ ok: false, message }`, texto largo que la UI enseña como texto,
 *   nunca como HTML). Sin sesión válida o sin respuesta sí rechazan con `VegaError` (L2).
 * - El remitente (`meta.senderName`, `meta.senderAddress`) vive en `meta`, y `senderAddress` debe ser
 *   un email. Con `smtp.enabled` PocketBase exige `smtp.host` y un `smtp.port` válido (error de campo
 *   por ruta). Con una contraseña guardada y un servidor sin AUTH la prueba de correo falla con un
 *   texto crudo poco claro (`250 "OK"`): se enseña tal cual, como cualquier fallo de prueba.
 * - Sin medir: si las listas de ajustes se fusionan o se reemplazan. Esta sección no toca ninguna.
 */

import type { ServerSettingsPort } from './port';
import { VegaError } from './errors';

/**
 * Dirección pública que el servidor declara como suya (`meta.appURL`) y remitente de los correos
 * (`meta.senderName`, `meta.senderAddress`: en PocketBase viven en `meta`, no en `smtp`).
 */
export interface ServerMeta {
	appURL: string;
	senderName: string;
	senderAddress: string;
}

/**
 * Correo saliente (`smtp`) SIN la contraseña, que el servidor no devuelve. `authMethod` y
 * `localName` no los edita la interfaz: se declaran para que un parche de estos campos tenga tipo.
 */
export interface ServerSmtp {
	enabled: boolean;
	host: string;
	port: number;
	username: string;
	tls: boolean;
	authMethod?: string;
	localName?: string;
}

/** Almacén S3 (`backups.s3`) SIN la clave secreta, que el servidor no devuelve. */
export interface ServerS3 {
	enabled: boolean;
	endpoint: string;
	bucket: string;
	region: string;
	accessKey: string;
	forcePathStyle: boolean;
}

/** Copias automáticas: expresión cron en UTC (`''` = nunca), cuántas conservar (≥ 1) y su destino. */
export interface ServerBackups {
	cron: string;
	cronMaxKeep: number;
	s3: ServerS3;
}

/** Lo que `get()` devuelve: solo los bloques que la interfaz usa. */
export interface ServerSettings {
	meta: ServerMeta;
	smtp: ServerSmtp;
	backups: ServerBackups;
}

/** Un secreto nuevo. Un valor vacío no significa «borrar»: se ignora (ver `buildServerSettingsPatch`). */
interface SecretSet {
	kind: 'set';
	value: string;
}

/** Cambio de un secreto: poner uno nuevo (no vacío) o quitar el guardado. Nunca «dejarlo vacío». */
export type SecretChange = SecretSet | { kind: 'clear' };

/**
 * Lo que la persona quiere dejar así. Los campos iguales a lo guardado no viajan (ver reglas).
 *
 * `backupsS3Secret` solo admite un valor nuevo: PocketBase 0.39.9 NO persiste el borrado de
 * `backups.s3.secret` (medido en `pocketbase.server-settings.contract.test.ts`: el `""` lo quita de
 * la base, pero la memoria del servidor lo conserva y el siguiente guardado de cualquier otro campo
 * lo RESUCITA). `smtp.password` sí se borra de verdad. El tipo impide pedir lo que no se cumple.
 */
export interface ServerSettingsDraft {
	meta?: Partial<ServerMeta>;
	smtp?: Partial<ServerSmtp>;
	backups?: { cron?: string; cronMaxKeep?: number; s3?: Partial<ServerS3> };
	secrets?: { smtpPassword?: SecretChange; backupsS3Secret?: SecretSet };
}

/**
 * Cuerpo del PATCH, con la forma de la red: SOLO las claves que cambian y, para los secretos, un
 * `string` que existe únicamente si hay un valor nuevo o es el `""` explícito de «quitar».
 */
export interface ServerSettingsPatch {
	meta?: Partial<ServerMeta>;
	smtp?: Partial<ServerSmtp> & { password?: string };
	backups?: {
		cron?: string;
		cronMaxKeep?: number;
		s3?: Partial<ServerS3> & { secret?: string };
	};
}

/** Resultado de una prueba de conexión: correcta, o fallida con el texto crudo del servidor. */
export type ConnectionTestOutcome = { ok: true } | { ok: false; message: string };

/** Plantillas de correo que PocketBase sabe enviar de prueba (`POST /api/settings/test/email`). */
export type TestEmailTemplate = 'verification' | 'password-reset' | 'email-change';

/** Ver la cabecera del módulo: contrato de la sección `serverSettings` del puerto. */
export type { ServerSettingsPort };

/**
 * Sección `serverSettings` que carga su implementación la primera vez que se usa, por el mismo
 * motivo que `deferredAdministration`: solo la abre un superusuario de vez en cuando y su código no
 * debe pesar en la carga inicial. Si el `import()` falla, rechaza con `VegaError 'network'` y el
 * siguiente uso lo reintenta.
 */
export function deferredServerSettings(
	load: () => Promise<ServerSettingsPort>
): ServerSettingsPort {
	let loading: Promise<ServerSettingsPort> | null = null;
	const section = () => {
		loading ??= load().catch((err: unknown) => {
			loading = null;
			throw err instanceof VegaError
				? err
				: VegaError.network(err, 'No se pudo cargar esta parte de la aplicación');
		});
		return loading;
	};
	return {
		get: () => section().then((s) => s.get()),
		update: (patch) => section().then((s) => s.update(patch)),
		testS3: () => section().then((s) => s.testS3()),
		testEmail: (to, template) => section().then((s) => s.testEmail(to, template))
	};
}
