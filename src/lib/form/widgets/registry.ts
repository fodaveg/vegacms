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
 * (`Markdown.svelte`/`Richtext.svelte`, `$lib/richtext/*`). **F5-e** sustituye `relation` por
 * `Relation.svelte` (búsqueda por título + degradado sin `titleField`, `relation-search.ts`).
 * **F5-f** sustituye `file` por `FileInput.svelte` (subida directa + drag&drop, preview, distingue
 * imagen/otro por mime — Audit Finding 4, `file-value.ts`): con esto los 14 dedicados son TODOS
 * reales; solo queda `unsupported`, que ya lo era desde F5-a.
 */
import type { WidgetId } from '$lib/model/types';
import type { WidgetComponent } from './types';
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
import Relation from './Relation.svelte';
import FileInput from './FileInput.svelte';

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
	relation: Relation,
	file: FileInput,
	json: Json,
	unsupported: UnsupportedField
};
