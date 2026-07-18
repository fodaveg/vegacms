/**
 * Field registry de P5 (D-P5.2, L-P5.1): `Record<WidgetId, WidgetComponent>` EXHAUSTIVO — TS
 * obliga a cubrir los 15 valores de `WIDGET_IDS` (`$lib/model/types`), así que un `WidgetId`
 * nuevo en P2 rompe la build aquí hasta que se le asigne un componente, en vez de un `{#if}` en
 * cascada donde un caso olvidado degrada en silencio.
 *
 * F5-a: los 14 dedicados comparten `GenericInput` (placeholder mínimo, ver su cabecera);
 * `unsupported` es el único REAL (`UnsupportedField`). F5-b sustituye cada entrada dedicada una
 * a una sin tocar el resto del registry ni a `FieldRow.svelte` (su único consumidor).
 */
import type { WidgetId } from '$lib/model/types';
import type { WidgetComponent } from './types';
import GenericInput from './GenericInput.svelte';
import UnsupportedField from './UnsupportedField.svelte';

export const WIDGET_REGISTRY: Record<WidgetId, WidgetComponent> = {
	text: GenericInput,
	textarea: GenericInput,
	markdown: GenericInput,
	richtext: GenericInput,
	number: GenericInput,
	switch: GenericInput,
	email: GenericInput,
	url: GenericInput,
	datetime: GenericInput,
	select: GenericInput,
	chips: GenericInput,
	relation: GenericInput,
	file: GenericInput,
	json: GenericInput,
	unsupported: UnsupportedField
};
