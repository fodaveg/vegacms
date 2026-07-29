/**
 * Autoría de esquema del puerto (Anexo A del contrato P1, ampliado en el lote "esquema"): dos
 * operaciones ESTRICTAMENTE ADITIVAS —crear colecciones ausentes (`ensureCollections`) y añadir
 * campos nuevos a una colección ya existente (`addCollectionFields`)— compartidas entre `memory`
 * y `pocketbase`.
 *
 * Historia: el Anexo A nació como un bootstrap acotado A PROPÓSITO al prefijo `vega`/`vega_*`
 * (las colecciones que P2/P6 necesitan para funcionar), porque en ese momento Vega no pretendía
 * gestionar esquema de contenido ajeno — "Vega no gestiona el esquema" era la ley (L2). La
 * decisión de producto cambió: Vega es el CMS *de* PocketBase, no un CMS genérico que
 * casualmente habla con él, así que ser dueño del esquema es una pareja natural. El usuario crea
 * SU esquema de contenido (colecciones y campos) desde Vega, además de importar el que ya
 * existe. Por eso el guardarraíl de nombre se ENSANCHA: de una lista de PERMITIDOS
 * (`vega`/`vega_*`, antigua §A.4.3) a una lista de PROHIBIDOS (namespace de sistema de
 * PocketBase, `_*`, y formas que el propio servidor nunca aceptaría) — sigue viviendo aquí, en
 * el puerto y no en un adaptador, porque debe ser IDÉNTICO y compartido entre `memory` y
 * `pocketbase`.
 *
 * Lo que NO cambia: ninguna de las dos operaciones RENOMBRA ni BORRA nada, y ambas son
 * idempotentes de la misma manera (un nombre/campo que ya existe se omite tal cual, nunca se
 * reconcilia). `ensureCollections` sigue sin tocar una colección ya existente (ni sus campos) si
 * ya está — la crea o la deja intacta. `addCollectionFields` es la ÚNICA operación que SÍ toca
 * una colección existente, y solo para AÑADIR — nunca modifica un campo que ya estaba ahí (ni su
 * tipo ni sus reglas) ni lo borra. Cualquiera de las dos, sin permiso de superuser en PB, sigue
 * rechazando con `forbidden`; sin la capability correspondiente, con `backend` (ley L8).
 *
 * `isReservedCollectionName`/`checkReservedNames`/`VEGA_COLLECTION` (namespace `vega`/`vega_*`)
 * NO tienen relación con este guardarraíl: identifican las colecciones que son plomería INTERNA
 * de Vega (para excluirlas del modelo de contenido en `model/resolve.ts`/`editor-state.ts`), un
 * concepto ORTOGONAL a "qué nombres puede crear `ensureCollections`". Siguen intactas.
 */

import type { FieldError } from './errors';

/** Prefijo reservado del namespace INTERNO de Vega (`vega`/`vega_*`): identifica las colecciones
 *  propias de Vega (P2/P6), NO limita lo que `ensureCollections` puede crear (ver cabecera). */
const RESERVED_NAME = 'vega';
const RESERVED_PREFIX = 'vega_';

/**
 * Especificación de una colección a crear (§A.3, ampliado). Además de los campos, puede declarar
 * el tipo (`base` por defecto o `auth`) y las reglas de acceso que PocketBase escribirá SOLO al
 * crearla. Una colección ya existente nunca se reconcilia: conserva tipo, reglas y campos.
 *
 * `fields` usa el vocabulario Vega REDUCIDO de `CollectionFieldSpec`: NO es una API general de
 * autoría de esquema (soporta un subconjunto deliberado de tipos), pero SÍ acepta cualquier
 * nombre de colección creable — `name` ya no se restringe a `vega`/`vega_*`, ver
 * `isCreatableCollectionName`.
 */
export type CollectionType = 'base' | 'auth';
export type CollectionRule = string | null;

export const COMMON_COLLECTION_RULE_KEYS = [
	'listRule',
	'viewRule',
	'createRule',
	'updateRule',
	'deleteRule'
] as const;
export const AUTH_COLLECTION_RULE_KEYS = ['authRule', 'manageRule'] as const;
export const COLLECTION_RULE_KEYS = [
	...COMMON_COLLECTION_RULE_KEYS,
	...AUTH_COLLECTION_RULE_KEYS
] as const;

export type CommonCollectionRuleKey = (typeof COMMON_COLLECTION_RULE_KEYS)[number];
export type AuthCollectionRuleKey = (typeof AUTH_COLLECTION_RULE_KEYS)[number];
export type CollectionRuleKey = (typeof COLLECTION_RULE_KEYS)[number];

type CommonCollectionRules = Partial<Record<CommonCollectionRuleKey, CollectionRule>>;
type AuthOnlyCollectionRules = Partial<Record<AuthCollectionRuleKey, CollectionRule>>;

interface CollectionSpecBase {
	/** Debe empezar por letra y contener solo letras/dígitos/`_` (`isCreatableCollectionName`);
	 *  si no, `ensureCollections` rechaza con `validation` local, sin tocar red. */
	name: string;
	/** Campos a crear. El id/system los pone el backend. */
	fields: CollectionFieldSpec[];
}

export type BaseCollectionSpec = CollectionSpecBase &
	CommonCollectionRules & {
		/** Omitido conserva el comportamiento histórico: colección `base`. */
		type?: 'base';
		authRule?: never;
		manageRule?: never;
	};

export type AuthCollectionSpec = CollectionSpecBase &
	CommonCollectionRules &
	AuthOnlyCollectionRules & {
		type: 'auth';
	};

export type CollectionSpec = BaseCollectionSpec | AuthCollectionSpec;

/** Parte común del payload de creación. Solo incluye reglas declaradas: omitir una clave deja que
 * PocketBase aplique su default vigente (las reglas comunes de una base nacen cerradas); `null`,
 * `""` y los filtros viajan sin transformación. */
export function collectionSpecCreationMetadata(
	spec: CollectionSpec
): { name: string; type: CollectionType } & Partial<Record<CollectionRuleKey, CollectionRule>> {
	const metadata: { name: string; type: CollectionType } & Partial<
		Record<CollectionRuleKey, CollectionRule>
	> = {
		name: spec.name,
		type: spec.type ?? 'base'
	};

	for (const key of COLLECTION_RULE_KEYS) {
		if (Object.prototype.hasOwnProperty.call(spec, key)) {
			metadata[key] = (spec as unknown as Record<CollectionRuleKey, CollectionRule>)[key];
		}
	}
	return metadata;
}

const AUTH_SYSTEM_FIELD_NAMES = new Set([
	'email',
	'password',
	'tokenKey',
	'verified',
	'emailVisibility'
]);

/**
 * Validación local de lo que no depende de la gramática de filtros de PocketBase: tipos
 * soportados, reglas exclusivas de `auth` y colisiones con campos de sistema de una colección
 * auth. Las cadenas de filtro se conservan verbatim y las valida el servidor.
 */
export function checkCollectionSpecAccess(specs: CollectionSpec[]): Record<string, FieldError> {
	const fieldErrors: Record<string, FieldError> = {};

	for (const declared of specs) {
		const spec = declared as unknown as CollectionSpecBase &
			Partial<Record<CollectionRuleKey, CollectionRule>> & { type?: string };
		const type = spec.type ?? 'base';

		if (type !== 'base' && type !== 'auth') {
			fieldErrors[spec.name] = {
				code: 'vega_collection_type_invalid',
				message: `La colección "${spec.name}" solo puede ser de tipo base o auth`
			};
			continue;
		}

		if (
			type === 'base' &&
			AUTH_COLLECTION_RULE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(spec, key))
		) {
			fieldErrors[spec.name] = {
				code: 'vega_auth_rule_requires_auth_collection',
				message: `La colección base "${spec.name}" no puede declarar authRule ni manageRule`
			};
			continue;
		}

		if (type !== 'auth') continue;
		for (const field of spec.fields) {
			if (!AUTH_SYSTEM_FIELD_NAMES.has(field.name)) continue;
			fieldErrors[field.name] = {
				code: 'vega_auth_system_field_conflict',
				message: `El campo "${field.name}" de "${spec.name}" colisiona con un campo de sistema de las colecciones auth`
			};
		}
	}

	return fieldErrors;
}

/**
 * Subconjunto MÍNIMO de tipos escribibles que la autoría de esquema v1 necesita (§A.3). NO es
 * una API general de autoría de esquema, pero el subconjunto ha ido creciendo con lo que el
 * producto necesita de verdad: `select` YA ENTRÓ (lote del sembrado, 29 jul 2026) con la
 * validación de opciones que era justo lo que lo dejaba fuera, y `relation` entra con un contrato
 * explícito y validación del destino contra el esquema descubierto. Que el PUERTO lo admita no
 * significa que la UI de autoría lo ofrezca: `SchemaAuthoringPanel` sigue sin exponerlo. El propio campo `file` sigue reducido a lo que el bootstrap de
 * `vega_media` (P6) usa. `required` en
 * `number`/`bool`/`date` se añadió en el lote "esquema" (antes solo lo tenían `text`/`file`) para
 * que la UI de creación de campos pueda ofrecerlo — con el aviso de la landmine de PocketBase
 * "un `number` `required` rechaza el valor 0" allí donde se ofrece marcarlo (`SchemaAuthoringPanel.svelte`).
 */
export type CollectionFieldSpec =
	| { name: string; type: 'json' }
	| { name: string; type: 'text'; required?: boolean; max?: number; unique?: true }
	| {
			name: string;
			type: 'select';
			options: string[];
			multiple: boolean;
			required?: boolean;
	  }
	| {
			name: string;
			type: 'file';
			required?: boolean;
			multiple?: boolean;
			maxSizeBytes?: number;
			mimeTypes?: string[];
			// Tamaños de miniatura (sintaxis PB `WxH`/`WxHf`) que PB debe PRE-GENERAR. Opcional
			// (el Anexo A no lo requería): PB solo sirve miniaturas para los tamaños listados
			// aquí, cualquier otro tamaño solicitado devuelve el original completo EN SILENCIO
			// (200, sin imagen rota) — landmine caracterizada en el shakedown C1 (2026-07-19).
			thumbs?: string[];
	  }
	| { name: string; type: 'bool'; required?: boolean }
	| { name: string; type: 'number'; required?: boolean }
	| { name: string; type: 'date'; required?: boolean }
	| {
			name: string;
			type: 'relation';
			/** Nombre estable de una colección ya presente en el esquema descubierto. */
			target: string;
			required?: boolean;
			/** `true` compila a `maxSelect: 99`; `false`, a relación simple (`maxSelect: 1`). */
			multiple: boolean;
			/**
			 * Semántica PocketBase: al borrar relaciones, borra también el registro propietario
			 * cuando ya no le queda ningún destino enlazado. Es una decisión explícita porque
			 * cambia el comportamiento destructivo del esquema.
			 */
			cascadeDelete: boolean;
	  }
	// Micro-enmienda FIRMADA al Anexo A (contrato P6 §9): sin un campo de fecha, no hay forma de
	// "ordenar por más reciente" (los ids que genera PB no son ordenables por tiempo). Coste
	// mínimo: lectura (`mapField`, `schema.ts`) y auto-relleno (`defaultReadonlyValue`, adaptador
	// `memory`) YA existían para `autodate` antes de esta enmienda. `onUpdate` por defecto es
	// `false` (solo se auto-puebla al crear, el caso de uso de P6 — "creado el").
	| { name: string; type: 'autodate'; onUpdate?: boolean };

type RuntimeCollectionFieldSpec = {
	name: string;
	type: string;
	options?: unknown;
	multiple?: unknown;
	unique?: unknown;
};

/**
 * Valida las restricciones que el tipo estático no puede proteger cuando el spec llega desde
 * JSON/runtime. Es pura y compartida: ambos adaptadores la ejecutan antes de tocar esquema.
 */
export function checkCollectionFieldSpecs(
	fields: CollectionFieldSpec[]
): Record<string, FieldError> {
	const fieldErrors: Record<string, FieldError> = {};

	for (const declared of fields) {
		const field = declared as unknown as RuntimeCollectionFieldSpec;

		if (field.type !== 'text' && field.unique !== undefined) {
			fieldErrors[field.name] = {
				code: 'vega_unique_text_only',
				message: `El campo "${field.name}" solo puede declarar unique cuando es de tipo text`
			};
			continue;
		}
		if (field.type === 'text' && field.unique !== undefined && field.unique !== true) {
			fieldErrors[field.name] = {
				code: 'vega_unique_invalid',
				message: `La marca unique del campo "${field.name}" solo admite el valor true`
			};
			continue;
		}
		if (field.type !== 'select') continue;

		if (!Array.isArray(field.options) || field.options.length === 0) {
			fieldErrors[field.name] = {
				code: 'vega_select_options_required',
				message: `El select "${field.name}" debe declarar al menos una opción`
			};
			continue;
		}
		if (typeof field.multiple !== 'boolean') {
			fieldErrors[field.name] = {
				code: 'vega_select_multiple_required',
				message: `El select "${field.name}" debe declarar multiple como boolean`
			};
			continue;
		}

		const seen = new Set<string>();
		for (const option of field.options) {
			if (typeof option !== 'string' || option.length === 0 || option.trim() !== option) {
				fieldErrors[field.name] = {
					code: 'vega_select_option_invalid',
					message: `Las opciones de "${field.name}" deben ser strings no vacíos y sin espacios al principio ni al final`
				};
				break;
			}
			if (seen.has(option)) {
				fieldErrors[field.name] = {
					code: 'vega_select_option_duplicate',
					message: `La opción "${option}" está repetida en el select "${field.name}"`
				};
				break;
			}
			seen.add(option);
		}
	}

	return fieldErrors;
}

function quoteSqlIdentifier(identifier: string): string {
	return `\`${identifier.replaceAll('`', '``')}\``;
}

/** Nombre globalmente inequívoco incluso si colección/campo contienen `_`. */
export function uniqueIndexName(collectionName: string, fieldName: string): string {
	return `idx_vega_unique_${collectionName.length}_${collectionName}_${fieldName.length}_${fieldName}`;
}

/** Definiciones SQL exactas que PocketBase espera en `Collection.indexes`. */
export function collectionUniqueIndexes(
	collectionName: string,
	fields: CollectionFieldSpec[]
): string[] {
	return fields.flatMap((field) => {
		if (field.type !== 'text' || field.unique !== true) return [];
		const indexName = uniqueIndexName(collectionName, field.name);
		return [
			`CREATE UNIQUE INDEX ${quoteSqlIdentifier(indexName)} ON ${quoteSqlIdentifier(collectionName)} (${quoteSqlIdentifier(field.name)})`
		];
	});
}

export interface EnsureResult {
	/** Nombres de las colecciones efectivamente creadas en esta llamada (orden de `specs`). */
	created: string[];
	/** Nombres que ya existían y se omitieron. */
	skipped: string[];
}

/**
 * Resultado de `addCollectionFields` (mitad 2 del lote "esquema"): simétrico a `EnsureResult`,
 * pero a nivel de CAMPO en vez de colección.
 */
export interface AddFieldsResult {
	/** Nombres de los campos efectivamente añadidos en esta llamada (orden de `fields`). */
	added: string[];
	/** Nombres que ya existían en la colección y se omitieron SIN tocarlos. */
	skipped: string[];
}

/**
 * Especificación canónica v1 de la colección `vega` (§A.5), para que P2 no la reinvente.
 * `vega_media`: el esquema DETALLADO lo fija el contrato de P6; aquí solo queda el gancho
 * (no se declara una constante para ella en P1).
 */
export const VEGA_COLLECTION: CollectionSpec = {
	name: 'vega',
	fields: [
		// Opcional en el bootstrap generico para poder abrir instalaciones v1 con
		// registros historicos sin clave; el contrato de proyecto recomienda
		// hacerlo required + UNIQUE en PocketBase y Vega lo escribe al guardar.
		{ name: 'key', type: 'text', max: 64 },
		{ name: 'manifestVersion', type: 'number' },
		{ name: 'manifest', type: 'json' },
		// L6b (rol editor): snapshot cacheado del `ContentType[]` que un superuser deja al
		// guardar desde `/settings` (`saveManifest`, `model/load.ts`). Aditivo: un registro
		// `vega` creado ANTES de esta enmienda simplemente no lo tiene — se trata como "sin
		// snapshot" (ver `fetchAllContentTypes` del adaptador pocketbase), nunca rompe.
		{ name: 'schemaSnapshot', type: 'json' }
	]
};

/** Identidad canónica del contrato de proyecto v1. No se elige "el primer"
 * registro: cada instalación publica exactamente este registro estable. */
export const VEGA_PROJECT_KEY_FIELD = 'key';
export const VEGA_PROJECT_KEY = 'default';
export const VEGA_MANIFEST_VERSION_FIELD = 'manifestVersion';

/**
 * `true` si `name` cae dentro del namespace INTERNO de Vega: `'vega'` o `/^vega_/`. Identifica
 * las colecciones que son plomería de Vega (P2/P6) para EXCLUIRLAS del modelo de contenido
 * (`model/resolve.ts`, `editor-state.ts`) — no tiene relación con qué puede CREAR
 * `ensureCollections` (ver `isCreatableCollectionName`, cabecera del fichero).
 */
export function isReservedCollectionName(name: string): boolean {
	return name === RESERVED_NAME || name.startsWith(RESERVED_PREFIX);
}

/**
 * Guardarraíl histórico del namespace interno (antiguo §A.4.3): cualquier `spec.name` fuera de
 * `{'vega'} ∪ {vega_*}` produce un `FieldError`. Ya NO lo usa `ensureCollections` (ver
 * `checkCreatableCollectionNames`, más abajo) — se conserva porque sigue siendo la forma en que
 * P6 (`media-collection.test.ts`) comprueba que `VEGA_MEDIA_COLLECTION` cae dentro del namespace
 * reservado, un chequeo real y distinto de "¿es un nombre creable?".
 */
export function checkReservedNames(specs: CollectionSpec[]): Record<string, FieldError> {
	const fieldErrors: Record<string, FieldError> = {};
	for (const spec of specs) {
		if (!isReservedCollectionName(spec.name)) {
			fieldErrors[spec.name] = {
				code: 'vega_reserved_prefix_required',
				message: `El nombre "${spec.name}" debe ser "vega" o empezar por "vega_"`
			};
		}
	}
	return fieldErrors;
}

/**
 * Patrón de nombre de colección aceptado por PocketBase: identificador que empieza por una
 * letra y contiene solo letras/dígitos/`_` en adelante. Un nombre que empieza por `_` es
 * namespace DE SISTEMA de PocketBase (`_superusers`, `_authOrigins`, `_externalAuths`…) — PB lo
 * rechaza para colecciones normales; validarlo aquí también falla LOCAL, sin tocar red (antigua
 * §A.4.3, ahora generalizada: de lista de permitidos a lista de prohibidos, ver cabecera).
 */
const CREATABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** `true` si `name` es un nombre de colección que `ensureCollections` puede intentar crear
 *  (validación LOCAL, best-effort — el servidor sigue siendo la autoridad final). */
export function isCreatableCollectionName(name: string): boolean {
	return CREATABLE_NAME_PATTERN.test(name);
}

/**
 * `true` si un HUMANO puede crear `name` desde la interfaz de autoría de esquema
 * (`model/editor/SchemaAuthoringPanel.svelte`). Más estricto que `isCreatableCollectionName`: le
 * resta el namespace interno de Vega.
 *
 * La distinción NO es cosmética y por eso son dos funciones y no una. `ensureCollections` tiene
 * que seguir aceptando `vega`/`vega_*`, porque los que las crean son los bootstraps internos
 * (`backend/site-seeding.ts` prepara el proyecto completo; `model/load.ts#saveManifest` crea
 * `vega`; `media/media-collection.ts#ensureMediaCollection` crea `vega_media`). Endurecer el
 * guardarraíl del PUERTO rompería justamente a sus llamadores legítimos.
 *
 * El agujero que cierra esto es real y tiene secuencia de repro: ambos bootstraps son PEREZOSOS
 * (no corren al iniciar sesión, sino al guardar el manifiesto y al entrar en `/media`). Un
 * superuser que escriba `vega` o `vega_media` en el formulario de autoría ANTES de que ocurra
 * cualquiera de las dos cosas se crea la colección con el esquema equivocado — y el bootstrap
 * real, al encontrarla ya existente, la SALTA en silencio (`skipped`, no error). Resultado:
 * manifiesto o biblioteca de medios rotos de forma permanente y sin un solo aviso.
 */
export function isUserAuthorableCollectionName(name: string): boolean {
	return isCreatableCollectionName(name) && !isReservedCollectionName(name);
}

/**
 * Guardarraíl de `ensureCollections` (reemplaza al antiguo `checkReservedNames` en ese punto de
 * uso): cualquier `spec.name` que no case con `isCreatableCollectionName` produce un
 * `FieldError`, ANTES de que el adaptador toque red. Compartido entre `memory` y `pocketbase`
 * para que el rechazo sea IDÉNTICO (misma razón que el guardarraíl histórico).
 */
export function checkCreatableCollectionNames(specs: CollectionSpec[]): Record<string, FieldError> {
	const fieldErrors: Record<string, FieldError> = {};
	for (const spec of specs) {
		if (!isCreatableCollectionName(spec.name)) {
			fieldErrors[spec.name] = {
				code: 'vega_invalid_collection_name',
				message: `El nombre "${spec.name}" debe empezar por una letra y contener solo letras, números o guion bajo`
			};
		}
	}
	return fieldErrors;
}

/**
 * Valida los destinos de todos los campos `relation` antes de tocar esquema. `availableTargets`
 * procede del esquema descubierto por cada adaptador (PB real o el mapa de `memory`), no del
 * texto que escribió el operador: así un nombre plausible pero inexistente falla localmente con
 * `validation` en vez de llegar como payload inválido al backend.
 */
export function checkRelationTargets(
	fields: CollectionFieldSpec[],
	availableTargets: Iterable<string>
): Record<string, FieldError> {
	const available = new Set(availableTargets);
	const fieldErrors: Record<string, FieldError> = {};
	for (const field of fields) {
		if (field.type === 'relation' && !available.has(field.target)) {
			fieldErrors[field.name] = {
				code: 'vega_relation_target_not_found',
				message: `La colección destino "${field.target}" del campo "${field.name}" no existe en el esquema disponible`
			};
		}
	}
	return fieldErrors;
}
