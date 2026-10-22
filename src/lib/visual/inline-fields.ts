/**
 * Qué campos de una ficha se pueden escribir en la página: lo que la pantalla anuncia al sitio en
 * `editable` (§"Record fields, Markdown source ranges and the edit hint" del contrato), por bloque
 * y para el registro de la página.
 *
 * Son las reglas de `BlockEditor#inlineTarget` (permiso de escritura, colección no `readonly`,
 * campo que la ficha pinta, visible, no `readonly`, fuera de `structuralFields`; `text`/`textarea`
 * para texto plano y `markdown` por rangos), calculadas sin montar la ficha. Viven aquí y no en
 * `BlockEditor` por el presupuesto de bundle: `BlockEditor` va en el chunk que comparten los
 * formularios de registro, que ya estaba en su tope, y esto solo lo usa el editor visual.
 * `inline-targets.svelte.test.ts` comprueba que coincide con lo que `beginInline` acepta. Lo que
 * cambia mientras tanto (una ficha guardando) lo vuelve a comprobar `beginInline`, que manda.
 */
import type { ResolvedBlockType, ResolvedContentType, ResolvedField } from '$lib/model/types';
import { resolveBlockDataFields } from '$lib/model/block-data-form';
import { isPlainTextWidget } from './texts-mode';

/**
 * `typed`: la ficha está en modo tipado (`dataField` declarado) y sus campos son los de
 * `blockType` (ninguno si el tipo no se resolvió); si no, los de la colección.
 */
export function inlineFieldsOf(
	childType: ResolvedContentType,
	blockType: ResolvedBlockType | null,
	structuralFields: readonly string[],
	typed: boolean
): { text: string[]; source: string[] } {
	if (!childType.permissions.update || childType.readonly) return { text: [], source: [] };
	let fields: ResolvedField[] = childType.fields;
	if (typed) {
		const data = new Map(
			blockType ? resolveBlockDataFields(blockType).map((field) => [field.name, field]) : []
		);
		const columns = new Map(childType.fields.map((field) => [field.name, field]));
		fields = (blockType?.fields ?? []).flatMap((declaration) => {
			const field =
				declaration.source === 'data' ? data.get(declaration.name) : columns.get(declaration.name);
			return field ? [field] : [];
		});
	}
	const usable = fields.filter(
		(field) => !field.hidden && !field.schema.readonly && !structuralFields.includes(field.name)
	);
	return {
		text: usable.filter((field) => isPlainTextWidget(field.widget)).map((field) => field.name),
		source: usable.filter((field) => field.widget === 'markdown').map((field) => field.name)
	};
}
