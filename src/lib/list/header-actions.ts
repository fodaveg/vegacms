/**
 * `header-actions.ts` (Lote 12, lámina 6 `06-listado-movil-crear-primero.html`): qué botones pinta
 * la cabecera del listado (`routes/c/[type]/+page.svelte`) y en qué forma, según el ancho y los
 * permisos. Módulo PURO: la ruta mide el ancho (`matchMedia`) y los permisos, esto solo decide.
 *
 * - En ANCHO (> 640 px) no cambia nada: Exportar, Importar y Crear, en ese orden, como siempre.
 * - En ESTRECHO (≤ 640 px, el mismo corte en el que `RecordTable` pasa el estado bajo el título):
 *   «Crear» es la PRIMERA acción (es lo que más se pulsa y hoy caía solo a una tercera línea) y las
 *   secundarias se agrupan en un botón «Más»… salvo que solo haya UNA, que se enseña como botón
 *   suelto: un menú con una sola entrada es un toque de más a cambio de nada (estado 6.3 de la
 *   lámina, colección de solo lectura).
 *
 * Por qué se decide aquí y no con `order` en CSS: con el orden de escritorio en el marcado y
 * «Crear» movido con `order`, la vista diría «Crear, Más» y el tabulador recorrería «Más, Crear»
 * (nota de la lámina). Pintar UNA rama según el ancho mantiene el orden visual y el de tabulación
 * iguales.
 */

type SecondaryAction = 'export' | 'import';

interface HeaderActionsInput {
	/** `true` por debajo del corte de 640 px. */
	narrow: boolean;
	canCreate: boolean;
	canExport: boolean;
	canImport: boolean;
}

interface HeaderActionsPlan {
	layout: 'wide' | 'narrow';
	/** Si se pinta «Crear» (en ancho va el último; en estrecho, el primero). */
	create: boolean;
	/** Acciones secundarias disponibles, en el orden de siempre (Exportar antes que Importar). */
	secondary: SecondaryAction[];
	/** Cómo se pintan las secundarias: botones sueltos, agrupadas en «Más», o nada. */
	secondaryAs: 'buttons' | 'menu' | 'none';
}

export function planHeaderActions(input: HeaderActionsInput): HeaderActionsPlan {
	const secondary: SecondaryAction[] = [];
	if (input.canExport) secondary.push('export');
	if (input.canImport) secondary.push('import');
	let secondaryAs: HeaderActionsPlan['secondaryAs'];
	if (secondary.length === 0) secondaryAs = 'none';
	else if (input.narrow && secondary.length > 1) secondaryAs = 'menu';
	else secondaryAs = 'buttons';
	return {
		layout: input.narrow ? 'narrow' : 'wide',
		create: input.canCreate,
		secondary,
		secondaryAs
	};
}
