/**
 * Field registry de P5 (D-P5.2, L-P5.1): `Record<WidgetId, WidgetComponent>` EXHAUSTIVO — TS
 * obliga a cubrir los 15 valores de `WIDGET_IDS` (`$lib/model/types`), así que un `WidgetId`
 * nuevo en P2 rompe la build aquí hasta que se le asigne un componente, en vez de un `{#if}` en
 * cascada donde un caso olvidado degrada en silencio.
 *
 * F5-a: los 14 dedicados compartían `GenericInput` (placeholder mínimo, ver su cabecera);
 * `unsupported` era el único REAL (`UnsupportedField`). **F5-b** sustituye los 10 widgets
 * escalares (`text, textarea, number, switch, email, url, datetime, select, chips, json`) por
 * componentes dedicados. **F5-d** sustituye `markdown`/`richtext` por el editor TipTap real
 * (`Markdown.svelte`/`Richtext.svelte`, `$lib/richtext/*`) — `relation, file` siguen en
 * `GenericInput` hasta F5-e/f, sin tocar `FieldRow.svelte` (su único consumidor).
 */
import type { WidgetId } from '$lib/model/types';
import type { WidgetComponent } from './types';
import GenericInput from './GenericInput.svelte';
import UnsupportedField from './UnsupportedField.svelte';
import Text from './Text.svelte';
import Textarea from './Textarea.svelte';
import NumberWidget from './Number.svelte';
import Switch from './Switch.svelte';
import Email from './Email.svelte';
import Url from './Url.svelte';
import Datetime from './Datetime.svelte';
import Select from './Select.svelte';
import Chips from './Chips.svelte';
import Json from './Json.svelte';
import Markdown from './Markdown.svelte';
import Richtext from './Richtext.svelte';

export const WIDGET_REGISTRY: Record<WidgetId, WidgetComponent> = {
	text: Text,
	textarea: Textarea,
	markdown: Markdown,
	richtext: Richtext,
	number: NumberWidget,
	switch: Switch,
	email: Email,
	url: Url,
	datetime: Datetime,
	select: Select,
	chips: Chips,
	relation: GenericInput,
	file: GenericInput,
	json: Json,
	unsupported: UnsupportedField
};
