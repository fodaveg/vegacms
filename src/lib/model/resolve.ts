/**
 * El resolutor de P2 (§2, §4, §5, §7 del contrato): fusiona esquema descubierto (P1) +
 * manifiesto (lectura TOLERANTE clave a clave) + convenciones + defaults → `ContentModel`.
 *
 * PURA y DETERMINISTA (L1): sin red, reloj ni azar; misma entrada ⇒ salida `deepEqual`, orden
 * incluido. El orden de las claves del propio `manifestRaw` NUNCA determina el resultado:
 * las claves conocidas se leen por acceso directo (`obj[nombreDeEsquema]`, nunca iterando
 * `Object.keys` del manifiesto) y las únicas listas que sí derivan de iterar claves del
 * manifiesto (huérfanas) se ordenan alfabéticamente antes de emitir warnings.
 *
 * NUNCA LANZA por contenido (L3): cualquier `manifestRaw` corrupto, hostil o de versión
 * futura degrada a warning + default. El JSON se trata como DATOS puros: solo se LEE
 * (`obj[key]`), nunca se escribe con una clave dinámica sobre un objeto real, así que no hay
 * vector de contaminación de prototipo aunque `manifestRaw` contenga una clave `__proto__`
 * (JSON.parse la deja como propiedad propia normal, nunca toca la cadena de prototipos al
 * leerla) — §8.12.
 *
 * `vega`/`vega_*` SIEMPRE `hidden: true` y fuera de `nav`, no anulable (L7, reutiliza
 * `isReservedCollectionName` de P1 en vez de reinventar el prefijo).
 */

import type { ContentType, JsonValue } from '$lib/backend/types';
import type {
	ContentModel,
	ManifestState,
	ModelWarning,
	ResolvedContentType,
	ResolvedMergedView,
	ResolvedRevisionsConfig,
	ResolvedSite
} from './types';
import {
	asJsonObject,
	readBoolean,
	readKey,
	readLocales,
	readNonNegativeInt,
	readString,
	readStringArray,
	type JsonObject
} from './resolve-readers';
import { resolveBlockTypes } from './resolve-blocks';
import { resolveLayouts } from './resolve-presentation';
import { resolveContentType } from './resolve-collection';
import { buildNav, resolveMergedView } from './resolve-nav';
import {
	manifestInvalidKey,
	manifestUnreadable,
	manifestVersionNewer,
	mergedViewNameCollision,
	orphanCollection
} from './warnings';

// Defaults de retención (`#lote-integridad`, Fase B §7): duplicados A PROPÓSITO desde
// `$lib/revisions/retention` (`DEFAULT_KEEP_PER_RECORD`/`DEFAULT_TRASH_RETENTION_DAYS`, los
// nombres canónicos con los que el contrato los fija). P2 no importa de `revisions/` —esa capa
// se construye ENCIMA del modelo (mismo estatus que `media/`), y este módulo es "puro" (L1): solo
// depende de `backend/` hacia abajo, nunca de una capa de feature hacia arriba. Mismo criterio de
// duplicación consciente que `classifyMediaFile`/`collectionFieldSpecToPbImportField` en `media/`.
const DEFAULT_REVISIONS_KEEP_PER_RECORD = 20;
const DEFAULT_REVISIONS_TRASH_DAYS = 30;

// ————— Punto de entrada —————

/** API pública de P2 (§2). PURA y DETERMINISTA (L1). Nunca lanza por contenido (L3). */
export function resolveContentModel(input: {
	types: ContentType[];
	manifestRaw: JsonValue | null;
	knownIcons?: readonly string[];
	/**
	 * `Capabilities.accessBypass` de la sesión (`#lote-shell`): `true` = salta las reglas de acceso
	 * del backend (PB: superuser) ⇒ `permissions` sale todo en `true` y la UI se comporta EXACTA-
	 * MENTE como antes de este lote. Omitirlo equivale a `false`, que es lo restrictivo… salvo que
	 * los tipos tampoco declaren `access` (adaptador que no lee reglas), en cuyo caso también sale
	 * todo permitido: los dos caminos por los que "no se sabe" acaban en "no se restringe nada".
	 */
	accessBypass?: boolean;
}): ContentModel {
	const warnings: ModelWarning[] = [];
	const { manifest, doc } = readManifestDoc(input.manifestRaw, warnings);

	const site = resolveSite(doc, warnings);
	const revisions = resolveRevisions(doc, warnings);
	// `blockTypes` (RAÍZ, vocabulario de tipos de bloque `#4cfd4f7f`): no depende de `types`/
	// `collectionsRaw` (ni al revés — ningún `collections.<c>.blocks` lo referencia todavía a nivel
	// de VALIDACIÓN, solo por convención de nombre en el manifiesto real), así que se resuelve aquí
	// mismo, junto al resto de claves de raíz independientes de la sesión de esquema.
	const blockTypes = resolveBlockTypes(doc, input.knownIcons, warnings);
	// `layouts` (RAÍZ, modelo de páginas p1 `1dc63001`): mismo motivo e independencia que
	// `blockTypes` de arriba — no depende de `types`/`collectionsRaw`, así que se resuelve aquí
	// mismo, junto al resto de vocabularios de raíz.
	const layouts = resolveLayouts(doc, input.knownIcons, warnings);
	const locales = readKey(
		doc,
		'locales',
		readLocales,
		'/locales',
		'locales debe declarar default y una lista available de idiomas únicos que incluya el idioma por defecto; se ignora.',
		warnings
	);

	const navRaw = readKey(
		doc,
		'nav',
		asJsonObject,
		'/nav',
		'nav no es un objeto; se ignora.',
		warnings
	);
	const declaredNavGroups =
		readKey(
			navRaw,
			'groups',
			readStringArray(1),
			'/nav/groups',
			'nav.groups no es un array de strings no vacíos; se ignora.',
			warnings
		) ?? [];

	const collectionsRaw =
		readKey(
			doc,
			'collections',
			asJsonObject,
			'/collections',
			'collections no es un objeto; se ignora.',
			warnings
		) ?? {};

	const typeNames = new Set(input.types.map((t) => t.name));
	for (const name of Object.keys(collectionsRaw)
		.filter((n) => !typeNames.has(n))
		.sort((a, b) => a.localeCompare(b))) {
		warnings.push(orphanCollection(name));
	}

	const navOrderByType = new Map<string, number | undefined>();
	// `typesByName` (blocks, lote "editor" Fase A): mapa de TODOS los tipos crudos de P1 por
	// nombre, para que `resolveBlocks` pueda mirar el esquema de una colección hija DISTINTA de la
	// que se está resolviendo — construido una vez aquí, no dentro del `map` (evita reconstruirlo
	// por cada tipo).
	const typesByName = new Map(input.types.map((t) => [t.name, t]));
	const resolvedTypes: ResolvedContentType[] = input.types.map((type) =>
		resolveContentType(
			type,
			collectionsRaw[type.name],
			locales,
			input.knownIcons,
			navOrderByType,
			typesByName,
			input.accessBypass ?? false,
			warnings
		)
	);

	const resolvedTypesByName = new Map(resolvedTypes.map((t) => [t.name, t]));
	// Colisión de namespace con collections (L7e): si `mergedViews.<id>` coincide con el `name` de
	// una colección del esquema, gana la colección — `id` sigue siendo el nombre reservado de esa
	// ruta (`/c/:type`), aunque la colección esté `hidden`. Se comprueba contra `typeNames` (TODAS
	// las colecciones descubiertas, no solo las visibles) y se resuelve ANTES de `resolveMergedView`
	// para no colar warnings de una vista que de todos modos se va a descartar entera.
	const mergedViewsRaw =
		readKey(
			doc,
			'mergedViews',
			asJsonObject,
			'/mergedViews',
			'mergedViews no es un objeto; se ignora.',
			warnings
		) ?? {};
	const mergedViews: ResolvedMergedView[] = [];
	for (const [id, viewRawValue] of Object.entries(mergedViewsRaw)) {
		if (typeNames.has(id)) {
			warnings.push(mergedViewNameCollision(id));
			continue;
		}
		const resolved = resolveMergedView(
			id,
			viewRawValue,
			resolvedTypesByName,
			input.knownIcons,
			warnings
		);
		if (resolved) mergedViews.push(resolved);
	}

	// Resuelto DESPUÉS de `mergedViews` (a diferencia de L7a/L7b): desde L7c, `nav` pliega
	// colecciones visibles + vistas fusionadas en una sola pasada de `orderByGroups` (ver
	// `buildNav`), así que necesita las dos listas ya resueltas.
	const nav = buildNav(resolvedTypes, navOrderByType, declaredNavGroups, mergedViews);

	return {
		site,
		revisions,
		types: resolvedTypes,
		nav,
		mergedViews,
		blockTypes,
		layouts,
		warnings,
		manifest
	};
}

// ————— Manifiesto raíz —————

function readManifestDoc(
	manifestRaw: JsonValue | null,
	warnings: ModelWarning[]
): { manifest: ManifestState; doc: JsonObject } {
	if (manifestRaw === null) {
		return { manifest: { status: 'absent' }, doc: {} };
	}

	const doc = asJsonObject(manifestRaw);
	if (!doc) {
		warnings.push(manifestUnreadable());
		return { manifest: { status: 'absent' }, doc: {} };
	}

	let schemaVersion = 1;
	if ('schemaVersion' in doc) {
		const raw = doc.schemaVersion;
		if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
			schemaVersion = raw;
			if (raw > 1) warnings.push(manifestVersionNewer(raw));
		} else {
			warnings.push(
				manifestInvalidKey('/schemaVersion', 'schemaVersion no es un entero >= 1; se asume 1.')
			);
		}
	}

	return { manifest: { status: 'loaded', schemaVersion }, doc };
}

function resolveSite(doc: JsonObject, warnings: ModelWarning[]): ResolvedSite {
	const siteRaw = readKey(
		doc,
		'site',
		asJsonObject,
		'/site',
		'site no es un objeto; se ignora.',
		warnings
	);

	const name =
		readKey(
			siteRaw,
			'name',
			readString(1, 60),
			'/site/name',
			'site.name no es un texto de 1 a 60 caracteres; se ignora.',
			warnings
		) ?? 'Vega';
	const defaultTheme =
		readKey(
			siteRaw,
			'defaultTheme',
			readString(1, Infinity),
			'/site/defaultTheme',
			'site.defaultTheme no es un texto no vacío; se ignora.',
			warnings
		) ?? null;
	const locale =
		readKey(
			siteRaw,
			'locale',
			(raw) => (raw === 'es' || raw === 'en' ? raw : undefined),
			'/site/locale',
			'site.locale debe ser "es" o "en"; se ignora.',
			warnings
		) ?? null;

	return { name, defaultTheme, locale };
}

/**
 * Resuelve `revisions` (§ tipos `ResolvedRevisionsConfig`, `#lote-integridad` Fase B §7): las
 * tres claves son independientes (mismo criterio que `site`), cada una cae a su default si está
 * ausente o no pasa `readBoolean`/`readNonNegativeInt` (con warning `manifest-invalid-key` en ese
 * segundo caso, vía `readKey`) — nunca invalida las otras dos.
 */
function resolveRevisions(doc: JsonObject, warnings: ModelWarning[]): ResolvedRevisionsConfig {
	const revisionsRaw = readKey(
		doc,
		'revisions',
		asJsonObject,
		'/revisions',
		'revisions no es un objeto; se ignora.',
		warnings
	);

	const enabled =
		readKey(
			revisionsRaw,
			'enabled',
			readBoolean,
			'/revisions/enabled',
			'revisions.enabled no es booleano; se ignora.',
			warnings
		) ?? true;
	const keepPerRecord =
		readKey(
			revisionsRaw,
			'keepPerRecord',
			readNonNegativeInt,
			'/revisions/keepPerRecord',
			'revisions.keepPerRecord no es un entero >= 0; se ignora.',
			warnings
		) ?? DEFAULT_REVISIONS_KEEP_PER_RECORD;
	const trashDays =
		readKey(
			revisionsRaw,
			'trashDays',
			readNonNegativeInt,
			'/revisions/trashDays',
			'revisions.trashDays no es un entero >= 0; se ignora.',
			warnings
		) ?? DEFAULT_REVISIONS_TRASH_DAYS;

	return { enabled, keepPerRecord, trashDays };
}
