/**
 * Vocabulario de dominio del puerto de backend de Vega.
 *
 * Estos tipos son la especificación normativa de la Parte 1 (§2 del contrato). Reglas
 * transversales:
 * - DEBEN ser serializables a JSON: nunca clases del SDK de ningún backend, nunca `Date`
 *   (las fechas viajan como string ISO 8601 UTC), salvo `File`/`Blob` en entradas de escritura.
 * - Este fichero no importa nada (ley L1/L5): es puerto puro.
 */

// ————— JSON —————

/** Valor JSON arbitrario (para el tipo de campo `json` y para config sin tipar). */
export type JsonValue =
	string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ————— Identidad y registros —————

/** Id opaco de registro. La UI NUNCA lo interpreta ni lo construye. */
export type RecordId = string;

/**
 * Referencia opaca a un fichero ya almacenado en el backend.
 * Solo se obtiene leyendo valores de campos `file`; se devuelve tal cual
 * en escrituras para "conservar este fichero". (En PB es el filename
 * almacenado, pero eso es un detalle del adaptador.)
 */
export type FileRef = string;

/** Valor normalizado de un campo, según su tipo (tabla §2.1 del contrato). */
export type FieldValue =
	| string
	| number
	| boolean
	| null
	| string[] // select múltiple
	| RecordId
	| RecordId[] // relation
	| FileRef
	| FileRef[] // file
	| JsonValue; // json (unknown estructurado)

/** Un registro leído del backend. */
export interface VegaRecord {
	id: RecordId;
	/** Nombre del ContentType al que pertenece (necesario para fileUrl). */
	type: string;
	/** Valores por nombre de campo, ya normalizados (§2.1). Incluye los readonly (autodate). */
	values: Record<string, FieldValue>;
}

/**
 * Entrada de create/update: parcial, solo los campos que se tocan.
 * Los campos `file` admiten `File` (subida nueva) además de `FileRef` (§4.4).
 */
export type RecordInput = Record<string, FieldInputValue>;
export type FieldInputValue = FieldValue | File | (File | FileRef)[] | null;

// ————— Sesión —————

export interface Session {
	/** Token opaco. La UI no lo decodifica; el adaptador sí puede (p.ej. exp del JWT). */
	token: string;
	user: { id: string; email: string };
	/** ISO 8601 UTC si el adaptador puede derivarla; null si no. */
	expiresAt: string | null;
}

export type AuthChangeReason = 'login' | 'logout' | 'expired' | 'restored';

// ————— Capacidades —————

/**
 * Ley de capacidades (contrato maestro §5): la UI consulta esto, JAMÁS "¿es PocketBase?".
 * Regla de evolución: añadir una capability nueva = default false;
 * un consumidor DEBE tratar una clave ausente como false.
 */
export interface Capabilities {
	/** subscribe() disponible. PB: true. memory: true (emulado). */
	realtime: boolean;
	/** fileUrl acepta ThumbSpec con efecto real. PB: true. memory: false. */
	thumbs: boolean;
	/**
	 * listContentTypes() lee el esquema en vivo (v1: superuser). false = modo snapshot: se sirve
	 * desde `vega.schemaSnapshot` (rol editor, L6b) porque PB reserva `GET /api/collections` a
	 * superusers.
	 */
	schemaDiscovery: boolean;
	/** Los ficheros viven adjuntos a registros (modelo PB). */
	filePerRecord: boolean;
	/** Soporte de campos file `protected` (token de acceso). v1: false en ambos adaptadores. */
	protectedFiles: boolean;
	/**
	 * `ensureCollections()` puede CREAR colecciones (v1: solo el prefijo reservado `vega_*`,
	 * Anexo A). PB: true (requiere superuser). memory: true. Adaptadores sin creación de
	 * esquema: false (regla de evolución de capabilities: ausente/false ⇒ no soportado).
	 */
	schemaBootstrap: boolean;
}

// ————— Paginación —————

export interface Page<T> {
	items: T[];
	page: number; // la página realmente devuelta (1-based)
	perPage: number;
	totalItems: number; // total tras aplicar el filtro
	totalPages: number; // ceil(totalItems / perPage); 0 si totalItems = 0 (§4.2)
}

// ————— Esquema —————

export interface ContentType {
	/** Clave estable (nombre de la colección en el backend). */
	name: string;
	/** true = solo lectura estructural (PB: colecciones `view`). create/update/delete DEBEN fallar con VegaError 'forbidden'. */
	readonly: boolean;
	/** Campos en el orden que declara el backend, EXCLUYENDO la primary key (id). */
	fields: Field[];
}

/**
 * Decoración de serialización para P5 (TipTap→HTML vs TipTap→Markdown).
 * `'markdown'` nunca lo emite un adaptador: lo aplica P2 sobre el modelo ya normalizado
 * (el puerto no interpreta convenciones Vega, ley L9).
 */
export type FieldSubtype = 'plain' | 'html' | 'markdown';

interface FieldBase {
	name: string;
	required: boolean;
	/**
	 * true = el backend gestiona el valor; escribirlo es violación de contrato (§4.3).
	 * PB: campos autodate (created/updated y cualquier otro).
	 */
	readonly: boolean;
	/** Pista del backend "este campo representa al registro" (PB: `presentable`). P4/P5 la usan para columnas y relaciones. */
	presentable: boolean;
	/** Pista del backend "no mostrar por defecto" (PB: `hidden`). El puerto la transporta; P2 decide. */
	hidden: boolean;
	/**
	 * Mejor-esfuerzo: true si el adaptador puede determinar unicidad
	 * (PB: índice UNIQUE de una sola columna). false = "no determinable", no "no único".
	 */
	unique: boolean;
}

/** Campo del dominio, unión discriminada por `type` (§2.2). */
export type Field =
	| (FieldBase & {
			type: 'text';
			subtype: 'plain' | 'markdown';
			minLength?: number;
			maxLength?: number;
			pattern?: string;
	  })
	| (FieldBase & { type: 'richtext'; subtype: 'html' })
	| (FieldBase & { type: 'number'; integer: boolean; min?: number; max?: number })
	| (FieldBase & { type: 'bool' })
	| (FieldBase & { type: 'email'; onlyDomains?: string[]; exceptDomains?: string[] })
	| (FieldBase & { type: 'url'; onlyDomains?: string[]; exceptDomains?: string[] })
	| (FieldBase & { type: 'date'; min?: string; max?: string })
	| (FieldBase & { type: 'select'; options: string[]; multiple: boolean; maxSelect?: number })
	| (FieldBase & {
			type: 'relation';
			target: string;
			multiple: boolean;
			maxSelect?: number;
			minSelect?: number;
	  })
	| (FieldBase & {
			type: 'file';
			multiple: boolean;
			maxSelect?: number;
			maxSizeBytes?: number;
			mimeTypes?: string[];
			protected: boolean;
	  })
	| (FieldBase & { type: 'json' })
	| (FieldBase & { type: 'unsupported'; backendType: string }); // p.ej. 'geoPoint'

// ————— Ficheros —————

/**
 * Especificación de miniatura, libre y best-effort (§4.4). Cada adaptador la compila a su
 * propia sintaxis (PB: `WxH`, `WxHf`, `0xH`…); esa sintaxis NUNCA sube al puerto.
 */
export interface ThumbSpec {
	width?: number;
	height?: number;
	fit?: 'crop' | 'contain';
}

// ————— Realtime —————

export interface RecordEvent {
	action: 'create' | 'update' | 'delete';
	record: VegaRecord;
}
