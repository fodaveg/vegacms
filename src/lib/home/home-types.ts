/**
 * Qué tipos de contenido enseña la portada (`/`), leído del modelo ya resuelto. Módulo puro.
 */

import type { ContentModel, ResolvedContentType } from '$lib/model/types';

/**
 * Los tipos del menú lateral, EN SU ORDEN (grupos y elementos tal como los pinta `Sidebar`). Las
 * vistas fusionadas no son un tipo y no salen. Es la base de los accesos a crear y de las
 * tarjetas de pendientes: lo que la portada ofrece es lo mismo que el menú, en el mismo orden.
 */
export function navContentTypes(model: ContentModel): ResolvedContentType[] {
	const result: ResolvedContentType[] = [];
	for (const group of model.nav.groups) {
		for (const item of group.items) {
			if (item.kind !== 'collection') continue;
			const type = model.types.find((candidate) => candidate.name === item.type);
			if (type && !result.includes(type)) result.push(type);
		}
	}
	return result;
}

/**
 * Tipos para los que la portada pinta un acceso a crear: los del menú en los que esta sesión
 * PUEDE crear (`permissions.create`, el mismo dato con el que el listado decide si pinta
 * «Crear»). Los singleton no salen: no se crean, se editan.
 */
export function creatableTypes(model: ContentModel): ResolvedContentType[] {
	return navContentTypes(model).filter((type) => !type.singleton && type.permissions.create);
}
