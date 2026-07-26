/**
 * Composición de las DOS mitades del control de acceso (`#lote-shell`): lo que las reglas del
 * backend conceden (`ContentType.access`, que se persiste en el snapshot del esquema y por eso
 * describe a una sesión normal) y si la sesión ACTUAL se las salta
 * (`Capabilities.accessBypass`, PB: superuser). Módulo puro, sin red y sin Svelte.
 *
 * **Esto NO es control de acceso**: la regla la sigue aplicando el backend, siempre, y un cliente
 * mentiroso no gana nada saltándose lo que aquí se calcula. Lo único que se decide aquí es qué
 * OFRECE la interfaz — que un editor no rellene un formulario entero para que el guardado muera
 * en un 403.
 *
 * Dos criterios deliberados, los dos hacia "ofrecer de más antes que esconder de más":
 * 1. `access` ausente (adaptador que no sabe leer reglas) ⇒ todo permitido. Es la misma regla de
 *    evolución que `Capabilities`: lo que no se sabe no se finge, y esconder acciones por no
 *    haber podido comprobarlas convertiría cualquier adaptador nuevo en un CMS de solo lectura.
 * 2. `'conditional'` ⇒ permitido. La expresión depende del registro y del usuario; evaluarla en
 *    cliente sería reimplementar el motor de reglas del backend y desincronizarse con él.
 */

import type { Capabilities, ContentType, TypeAccess } from './types';

/** Las cinco operaciones, ya resueltas a "¿la UI lo ofrece?". */
export interface TypePermissions {
	list: boolean;
	view: boolean;
	create: boolean;
	update: boolean;
	delete: boolean;
}

/** Todo permitido: el valor de un tipo sin `access` (y el de cualquier sesión con bypass). */
export const ALL_PERMISSIONS: TypePermissions = {
	list: true,
	view: true,
	create: true,
	update: true,
	delete: true
};

/** `true` si la UI debe ofrecer esa operación (ver los dos criterios de la cabecera). */
export function isOperationOffered(
	access: TypeAccess | undefined,
	operation: keyof TypeAccess,
	accessBypass: boolean
): boolean {
	if (accessBypass || access === undefined) return true;
	return access[operation] !== 'denied';
}

/**
 * Permisos efectivos de un `ContentType` para la sesión actual. `readonly` (colección `view`) se
 * pliega aquí dentro a propósito: para la UI, "esto es una vista del backend" y "las reglas te
 * vedan escribir" tienen la MISMA consecuencia —no ofrecer crear/editar/borrar— y tener dos
 * comprobaciones separadas en cada sitio garantiza que un día se recuerde solo una.
 * `readonly` sigue existiendo aparte para lo que sí es distinto: el rótulo "Solo lectura", que
 * describe la naturaleza de la colección, no un permiso.
 */
export function resolvePermissions(type: ContentType, accessBypass: boolean): TypePermissions {
	const writable = !type.readonly;
	return {
		list: isOperationOffered(type.access, 'list', accessBypass),
		view: isOperationOffered(type.access, 'view', accessBypass),
		create: writable && isOperationOffered(type.access, 'create', accessBypass),
		update: writable && isOperationOffered(type.access, 'update', accessBypass),
		delete: writable && isOperationOffered(type.access, 'delete', accessBypass)
	};
}

/** Azúcar para llamadores que ya tienen las `Capabilities` a mano (rutas y componentes). */
export function permissionsFor(type: ContentType, capabilities: Capabilities): TypePermissions {
	return resolvePermissions(type, capabilities.accessBypass);
}
