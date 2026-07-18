/**
 * Compilación del AST de `Query` (§4.6) a la sintaxis de filtro de PocketBase, con **binding
 * de parámetros** (`pb.filter(raw, params)`), jamás concatenación de strings con el valor: un
 * valor con `'`, `"`, `||`, `&&`, `~` o `%` es *datos*, nunca sintaxis (ley L6, §4.6).
 *
 * Hallazgos de Fase 2 (verificados contra PocketBase 0.39.6 real, ver `tests/contract/pb-
 * harness/`), que el contrato dejaba sin especificar al nivel de detalle de compilación:
 * - `select`/`relation` MÚLTIPLES se guardan como columna JSON; `=`/`!=` comparan el valor
 *   contra la columna completa (nunca casan), así que la pertenencia real se hace con `~`
 *   (LIKE) — el mismo operador que el "contains" de texto. `in` sobre multi se compila como
 *   un OR de `~` por cada valor (igual semántica que `contains` en `matchesIn` de `memory`).
 * - "Vacío" en columnas multi-valuadas (`select`/`relation`/`file` con `multiple`) NO es
 *   `= ''` ni `= null` (ninguno casa): PB expone el modificador `:length`, así que se compila
 *   como `campo:length = 0` / `campo:length > 0`.
 * - Para escalares (`text`/`date`/`select` single/`relation` single), el vacío SÍ es literal
 *   `''` en el almacén (PB normaliza `null`→`''` al guardar), igual que documenta §2.1.
 * - `number` es la única excepción real: PB no tiene un NULL propio para números — un campo
 *   nunca-asignado se guarda como `0` real (verificado creando un registro sin ese campo:
 *   la respuesta trae `0`, no `null`). `empty`/`notEmpty` se compilan como `= 0`/`!= 0`: es lo
 *   más fiel posible a lo que el servidor realmente distingue, pero es una limitación conocida
 *   (un 0 explícito es indistinguible de "nunca se puso"); el dataset dorado de contrato no
 *   ejerce `empty`/`notEmpty` sobre `number` precisamente por esto.
 */

import type PocketBase from 'pocketbase';
import type { Field } from '../../types';
import type { FilterNode, Query } from '../../query';

/** `true` si `field` es `select`/`relation` con `multiple: true` (se guarda como columna JSON). */
function isMultiField(field: Field): boolean {
	return (field.type === 'select' || field.type === 'relation') && field.multiple;
}

/** Compila `query.filter` a una expresión de filtro PB con placeholders `{:pN}` y sus params. */
export function compileFilter(
	pb: PocketBase,
	fields: Field[],
	filter: FilterNode | undefined
): string | undefined {
	if (!filter) return undefined;
	const byName = new Map(fields.map((f) => [f.name, f]));
	const params: Record<string, unknown> = {};
	let counter = 0;
	const nextParam = (value: unknown): string => {
		counter += 1;
		const name = `p${counter}`;
		params[name] = value;
		return `{:${name}}`;
	};
	const raw = compileNode(filter, byName, nextParam);
	return pb.filter(raw, params);
}

function compileNode(
	node: FilterNode,
	byName: Map<string, Field>,
	nextParam: (value: unknown) => string
): string {
	if (node.kind === 'group') {
		const combinator = node.combinator === 'and' ? '&&' : '||';
		const parts = node.nodes.map((n) => `(${compileNode(n, byName, nextParam)})`);
		return parts.join(` ${combinator} `);
	}

	const field = byName.get(node.field) as Field; // ya validado por validateQuery
	const name = pbFieldExpr(node.field);

	switch (node.op) {
		case 'empty':
			return isMultiField(field)
				? `${name}:length = 0`
				: `${name} = ${literalEmpty(field, nextParam)}`;
		case 'notEmpty':
			return isMultiField(field)
				? `${name}:length > 0`
				: `${name} != ${literalEmpty(field, nextParam)}`;
		case 'eq':
			return `${name} = ${nextParam(node.value)}`;
		case 'neq':
			return `${name} != ${nextParam(node.value)}`;
		case 'gt':
			return `${name} > ${nextParam(node.value)}`;
		case 'gte':
			return `${name} >= ${nextParam(node.value)}`;
		case 'lt':
			return `${name} < ${nextParam(node.value)}`;
		case 'lte':
			return `${name} <= ${nextParam(node.value)}`;
		case 'contains':
			// Sirve tanto para "substring" de texto como "¿incluye la opción?" de select multi:
			// en ambos casos PB resuelve con `~` (verificado; ver cabecera del fichero).
			return `${name} ~ ${nextParam(node.value)}`;
		case 'in': {
			const values = node.value;
			if (values.length === 0) {
				// 'in' vacío no casa nada (§9.8): condición siempre falsa, sin pedirle nada a PB.
				return `${name} = ${nextParam('__vega_in_empty__')} && ${name} != ${nextParam('__vega_in_empty__')}`;
			}
			const op = isMultiField(field) ? '~' : '=';
			return values.map((v) => `${name} ${op} ${nextParam(v)}`).join(' || ');
		}
	}
}

/** El literal de "vacío" en el almacén PB para un campo escalar (§2.1, verificado en Fase 2). */
function literalEmpty(field: Field, nextParam: (value: unknown) => string): string {
	if (field.type === 'number') return nextParam(0); // PB no tiene NULL propio para number (ver cabecera).
	return nextParam('');
}

/** Nombre de campo tal cual lo entiende el filtro de PB (sin comillas: son identificadores). */
function pbFieldExpr(name: string): string {
	return name;
}

/**
 * Compila `query.sort` a la sintaxis `+campo,-campo` de PB (asc/desc). SIEMPRE añade `id`
 * ascendente como desempate final (ley L3, §4.2, §4.6) — incluso sin `sort` explícito, para
 * que el orden por defecto sea el mismo determinismo que `memory` (ver `adapters/memory/
 * query.ts`: allí "sin sort" también acaba siendo, en la práctica, orden por `id`).
 */
export function compileSort(sort: Query['sort']): string {
	const keys = (sort ?? []).map((s) => `${s.dir === 'asc' ? '+' : '-'}${s.field}`);
	if (!(sort ?? []).some((s) => s.field === 'id')) keys.push('+id');
	return keys.join(',');
}
