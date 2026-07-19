/**
 * Tipos satélite del modelo de contenido de Vega (Parte 2, §2 del contrato).
 *
 * Fusionan el esquema descubierto por P1 (`ContentType`/`Field`, importados y NUNCA
 * redefinidos aquí) con el manifiesto declarativo y las convenciones de P2, para producir
 * `ContentModel`: la única estructura que P3/P4/P5 consumen para saber QUÉ pintar. Módulo
 * PURO (ley L1 del contrato P2): sin Svelte, sin el puerto, sin `pocketbase`.
 */

import type { ContentType, Field, FieldSubtype } from '$lib/backend/types';

// ————— Raíz —————

export interface ContentModel {
	site: ResolvedSite;
	/** TODOS los tipos descubiertos por P1, incluidos los ocultos. Mismo cardinal que P1 (L6). */
	types: ResolvedContentType[];
	/** Derivado de `types`: solo visibles, agrupados y ordenados. Lo que P3 pinta tal cual. */
	nav: NavModel;
	/** Discrepancias manifiesto↔esquema y problemas de lectura. Parte del modelo, no un log. */
	warnings: ModelWarning[];
	/** Meta de procedencia del manifiesto. */
	manifest: ManifestState;
}

export type ManifestState =
	| { status: 'absent' } // modo sin manifiesto (primera clase, sin warning)
	| { status: 'loaded'; schemaVersion: number }
	| { status: 'unreadable' }; // JSON inválido → tratado como absent + warning

export interface ResolvedSite {
	name: string; // (D+M) default 'Vega'
	defaultTheme: string | null; // (M) pass-through para P7; null = default de P7
	locale: 'es' | 'en' | null; // (M) null = P3 decide por navigator.language
}

// ————— Navegación (contrato con P3) —————

export interface NavModel {
	/** Grupos en orden de render. El primer grupo puede ser el anónimo (label null). */
	groups: NavGroup[];
}

export interface NavGroup {
	label: string | null; // null = grupo anónimo (tipos sin grupo), SIEMPRE primero
	items: NavItem[]; // en orden de render
}

export interface NavItem {
	type: string; // ContentType.name
	label: string;
	icon: string | null; // id del set de iconos de Vega; null = icono genérico de P3
	singleton: boolean; // true ⇒ P3 enruta directo a la edición, sin listado
	readonly: boolean; // pass-through (views): P4 no ofrece crear/borrar
}

// ————— Tipos resueltos —————

export interface ResolvedContentType {
	/** El ContentType de P1 INTACTO. Fuente de verdad estructural; nunca se muta. */
	schema: ContentType;
	name: string; // (D) = schema.name
	label: string; // (D+M) manifiesto > humanización (§4.8)
	labelSingular: string; // (D+M) default = label (sin heurísticas de plural)
	icon: string | null; // (M) validado contra el set si se inyecta (§4.8)
	hidden: boolean; // (D+M) `vega`/`vega_*` SIEMPRE true, no anulable (L7)
	group: string | null; // (M)
	singleton: boolean; // (M) SOLO manifiesto; jamás autodetectado (§4.6)
	readonly: boolean; // (D) = schema.readonly
	/** (D+M) nombre del campo título, o null ⇒ la UI muestra el id. Cascada §4.4. */
	titleField: string | null;
	/** (D+M) campo de publicación por convención, o null ⇒ tipo sin drafts. §4.5. */
	statusField: string | null;
	/** (M) plantilla con placeholders `{campo}`/`{id}` ya validados, o null. §4.7. */
	previewUrl: string | null;
	/** (D+M) campos en ORDEN EFECTIVO de formulario (§4.9). Mismo cardinal que schema.fields. */
	fields: ResolvedField[];
	/** (D+M) nombres de campos-columna para P4, en orden. Máx 5 por defecto (§4.10). */
	listFields: string[];
	/** (D+M) grupos de campos del formulario, en orden de render (§4.9, §4.9b). */
	fieldGroups: ResolvedFieldGroup[];
}

/**
 * Un grupo de campos del formulario ya resuelto (§4.9b): además del nombre/orden que ya daba
 * §4.9, lleva `columns` — la rejilla responsive de N columnas que `RecordForm.svelte` pinta para
 * ESE grupo (feature genérica "editor bilingüe emparejado", pero aplicable a cualquier par/trío
 * de campos que convenga ver lado a lado: p.ej. `titleEs`|`titleEn`). `columns: 1` (el default,
 * también el valor SIEMPRE del grupo anónimo — no hay clave de manifiesto de la que heredarlo) es
 * el layout apilado de siempre; P2 no cambia nada más para un manifiesto que no declara la forma
 * objeto de `fieldGroups` (compatibilidad hacia atrás total, §4.9b).
 */
export interface ResolvedFieldGroup {
	/** Nombre del grupo, o `null` para el grupo anónimo (campos sin `group`, siempre primero). */
	name: string | null;
	/** (M) columnas de la rejilla del grupo (1-3, default 1). >1 colapsa a 1 en viewports estrechos. */
	columns: 1 | 2 | 3;
}

export interface ResolvedField {
	/** El Field de P1 INTACTO (tipo real, config, required, readonly, presentable, hidden…). */
	schema: Field;
	name: string; // (D) = schema.name
	label: string; // (D+M) manifiesto > humanización
	help: string | null; // (M)
	placeholder: string | null; // (M)
	hidden: boolean; // (D+M) default = schema.hidden
	group: string | null; // (M) referencia a fieldGroups
	/** (D+M) QUÉ widget pinta P5. Vocabulario cerrado §4.2; override incompatible ⇒ default + warning. */
	widget: WidgetId;
	/** (D+M) subtype EFECTIVO. 'markdown' ⟺ widget 'markdown' (L9). Es lo que P5 consume, no schema.subtype. */
	subtype: FieldSubtype | null; // null para tipos sin subtype (number, bool…)
	/** (D+M) candidato a columna en P4. Defaults por tipo en §4.10. */
	listable: boolean;
}

// ————— Widgets (vocabulario CERRADO v1, §4.2/L8) —————

export type WidgetId =
	| 'text'
	| 'textarea'
	| 'markdown'
	| 'richtext'
	| 'number'
	| 'switch'
	| 'email'
	| 'url'
	| 'datetime'
	| 'select'
	| 'chips'
	| 'relation'
	| 'file'
	| 'json'
	| 'unsupported';

/** Vocabulario cerrado como valor runtime (L8): base de la aserción global "ningún WidgetId
 *  fuera de esta lista" en los tests, y utilizable por P5 para iterar sus implementaciones. */
export const WIDGET_IDS: readonly WidgetId[] = [
	'text',
	'textarea',
	'markdown',
	'richtext',
	'number',
	'switch',
	'email',
	'url',
	'datetime',
	'select',
	'chips',
	'relation',
	'file',
	'json',
	'unsupported'
];

// ————— Warnings —————

export type WarningCode =
	| 'manifest-unreadable' // JSON no parseable o raíz no-objeto
	| 'manifest-version-newer' // schemaVersion > soportada; se leyó lo conocido
	| 'manifest-invalid-key' // clave conocida con tipo/valor inválido → ignorada
	| 'orphan-collection' // colección del manifiesto que no existe en el esquema
	| 'orphan-field' // campo del manifiesto que no existe en el tipo
	| 'widget-incompatible' // override imposible para el tipo real → default
	| 'title-field-invalid' // titleField inexistente o no representable → cascada
	| 'status-field-invalid' // statusField que no cumple la convención → null
	| 'preview-url-invalid' // placeholder desconocido o no escalar → null
	| 'list-field-unknown' // listFields con campo inexistente → se omite
	| 'icon-unknown' // icono fuera del set → null
	| 'singleton-invalid' // singleton sobre un tipo readonly (view) → ignorado
	| 'multiple-vega-records'; // la colección vega tiene >1 registros (lo emite load, §6.2)

export interface ModelWarning {
	code: WarningCode;
	/** Mensaje humano en español, accionable ("el campo X del manifiesto no existe en 'posts'"). */
	message: string;
	collection?: string;
	field?: string;
	/** JSON Pointer a la clave del manifiesto que lo causó, si aplica (p.ej. '/collections/posts/fields/body/widget'). */
	path?: string;
}
