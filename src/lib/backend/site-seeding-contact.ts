/**
 * Módulo de sembrado `contacto`: la colección `messages`, la bandeja de un formulario de contacto
 * del sitio, y su entrada de manifiesto.
 *
 * QUIÉN ESCRIBE Y QUIÉN LEE. El visitante crea el mensaje SIN SESIÓN, desde el formulario del
 * sitio; solo los editores lo listan, lo ven, lo marcan como leído y lo borran. La creación pública
 * la acota `CONTACT_CREATE_RULE`, medida contra PocketBase real en
 * `tests/contract/pocketbase.contact-rule-probe.test.ts`.
 *
 * LO QUE VEGA NO GESTIONA y hay que configurar en PocketBase: el límite de peticiones por IP y
 * los orígenes permitidos (CORS). Una colección con creación pública sin límite de frecuencia es
 * un buzón abierto (ver `docs/POCKETBASE-INTEGRATION.md`, «Módulos de sembrado»).
 */

import { SITE_SEED_EDITOR_ACCESS_RULE, type SiteSeedModule } from './site-seeding';
import type { CollectionSpec } from './collections';
import type { JsonValue } from './types';

/**
 * Regla de creación PÚBLICA de `messages`. Dos condiciones, las dos sobre el cuerpo de la petición:
 *
 * - `@request.body.website = ""`: campo trampa. `website` NO es un campo de la colección (así que
 *   no se guarda ni hay que ocultarlo); el formulario del sitio lo pinta escondido y una persona
 *   lo deja vacío. PocketBase deja leer del cuerpo una clave que no es campo, y una clave ausente
 *   compara igual a `""`: vale tanto el formulario que lo manda vacío como el que no lo manda.
 * - `@request.body.read != true`: nadie de fuera crea un mensaje ya marcado como leído.
 *
 * TRAMPAS MEDIDAS (PocketBase 0.39.9), por si alguien quiere «simplificarla»:
 * - `@request.body.read = false` rechaza el envío normal: con la clave ausente es falso.
 * - `@request.body.website:isset = false` rechaza el campo vacío que manda un formulario real.
 *
 * El rechazo de la regla es un 400 genérico («Failed to create record.»), sin detalle de qué
 * condición falló: el componente del sitio trata cualquier 400 como «no se pudo enviar».
 */
export const CONTACT_CREATE_RULE = '@request.body.website = "" && @request.body.read != true';

/** Tope del texto del mensaje. Se rechaza en el servidor con un 400 que sí nombra el campo. */
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;

const MESSAGES_COLLECTION: CollectionSpec = {
	name: 'messages',
	listRule: SITE_SEED_EDITOR_ACCESS_RULE,
	viewRule: SITE_SEED_EDITOR_ACCESS_RULE,
	createRule: CONTACT_CREATE_RULE,
	updateRule: SITE_SEED_EDITOR_ACCESS_RULE,
	deleteRule: SITE_SEED_EDITOR_ACCESS_RULE,
	fields: [
		{ name: 'name', type: 'text', required: true, max: 200 },
		{ name: 'email', type: 'email', required: true },
		{ name: 'message', type: 'text', required: true, max: CONTACT_MESSAGE_MAX_LENGTH },
		{ name: 'read', type: 'bool' },
		// Solo fecha de llegada: un mensaje no se edita, se marca como leído.
		{ name: 'created', type: 'autodate' }
	]
};

const CONTACT_MANIFEST: JsonValue = {
	nav: { groups: ['Sitio'] },
	collections: {
		messages: {
			label: 'Mensajes',
			labelSingular: 'Mensaje',
			icon: 'archive',
			group: 'Sitio',
			order: 4,
			titleField: 'name',
			subtitleField: 'email',
			listFields: ['name', 'email', 'created', 'read'],
			// `name` no lleva etiqueta: la pone el catálogo en el idioma de quien edita.
			fields: {
				email: { label: 'Correo' },
				message: { label: 'Mensaje', widget: 'textarea' },
				read: { label: 'Leído' },
				created: { label: 'Fecha' }
			}
		}
	}
};

export const SITE_SEED_CONTACT_MODULE: SiteSeedModule = {
	id: 'contacto',
	collections: [MESSAGES_COLLECTION],
	manifest: CONTACT_MANIFEST
};
