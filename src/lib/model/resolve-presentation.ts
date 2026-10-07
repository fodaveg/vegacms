/** Declaraciones de presentación: tarjeta social, páginas y plantillas raíz. */
import type { ContentType, JsonValue } from '$lib/backend/types';
import type {
	ModelWarning,
	ResolvedLayout,
	ResolvedLocalization,
	ResolvedPageConfig,
	ResolvedSocialCardConfig
} from './types';
import { isRepresentableField } from './conventions';
import { validatePreviewUrlPlaceholders } from './preview-url';
import {
	asJsonObject,
	readKey,
	readPreviewUrlTemplate,
	readString,
	type JsonObject,
	type RawPageDeclaration
} from './resolve-readers';
import {
	layoutIconUnknown,
	layoutInvalid,
	pageInvalid,
	pageLayoutFieldInvalid,
	pageOnReadonly,
	pagePathNotUnique,
	socialDescriptionFieldInvalid,
	socialImageFieldInvalid,
	socialTitleFieldInvalid,
	socialUrlInvalid
} from './warnings';

// ————— Tarjeta social (social, lote "editor" Fase B) —————

/**
 * Resuelve `social` (§ tipos `ResolvedSocialCardConfig`) UNA VEZ que `socialRaw` ya se sabe un
 * objeto (`resolveContentType` solo llama a esto si `readKey` no descartó la clave entera). A
 * diferencia de `resolveBlocks`, las CUATRO piezas se leen y validan de forma INDEPENDIENTE
 * (mismo patrón que las claves de nivel de colección: un `readKey` anidado por campo, cada uno
 * con su propio `path`/warning) — ninguna invalida a las demás.
 */
export function resolveSocialCard(
	type: ContentType,
	socialRaw: JsonObject,
	resolvedTitleField: string | null,
	resolvedPreviewUrl: string | null,
	warnings: ModelWarning[]
): ResolvedSocialCardConfig {
	const base = `/collections/${type.name}/social`;

	const titleFieldRaw = readKey(
		socialRaw,
		'titleField',
		readString(1, Infinity),
		`${base}/titleField`,
		`social.titleField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let titleField = resolvedTitleField; // cascada: manifiesto > titleField del tipo (§4.4)
	if (titleFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === titleFieldRaw);
		if (field && isRepresentableField(field)) {
			titleField = titleFieldRaw;
		} else {
			warnings.push(socialTitleFieldInvalid(type.name, titleFieldRaw));
		}
	}

	const descriptionFieldRaw = readKey(
		socialRaw,
		'descriptionField',
		readString(1, Infinity),
		`${base}/descriptionField`,
		`social.descriptionField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let descriptionField: string | null = null; // SIN fallback (ver ResolvedSocialCardConfig)
	if (descriptionFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === descriptionFieldRaw);
		if (field && (field.type === 'text' || field.type === 'richtext')) {
			descriptionField = descriptionFieldRaw;
		} else {
			warnings.push(socialDescriptionFieldInvalid(type.name, descriptionFieldRaw));
		}
	}

	const imageFieldRaw = readKey(
		socialRaw,
		'imageField',
		readString(1, Infinity),
		`${base}/imageField`,
		`social.imageField de "${type.name}" no es un texto no vacío; se ignora.`,
		warnings
	);
	let imageField: string | null = null; // SIN fallback (ver ResolvedSocialCardConfig)
	if (imageFieldRaw !== undefined) {
		const field = type.fields.find((f) => f.name === imageFieldRaw);
		if (field && field.type === 'file' && !field.multiple) {
			imageField = imageFieldRaw;
		} else {
			warnings.push(socialImageFieldInvalid(type.name, imageFieldRaw));
		}
	}

	const urlTemplateRaw = readKey(
		socialRaw,
		'urlTemplate',
		readPreviewUrlTemplate,
		`${base}/urlTemplate`,
		`social.urlTemplate de "${type.name}" no es una URL http(s) con placeholders válidos; se ignora.`,
		warnings
	);
	let urlTemplate = resolvedPreviewUrl; // cascada: manifiesto > previewUrl del tipo (§4.7)
	if (urlTemplateRaw !== undefined) {
		if (validatePreviewUrlPlaceholders(urlTemplateRaw, type.fields)) {
			urlTemplate = urlTemplateRaw;
		} else {
			warnings.push(socialUrlInvalid(type.name));
		}
	}

	return { titleField, descriptionField, imageField, urlTemplate };
}

// ————— Modelo de páginas (page, tarea p1 `1dc63001`) —————

/**
 * Resuelve `page` (§ tipos `ResolvedPageConfig`, modelo de páginas — tarea p1 `1dc63001`; ruta
 * BILINGÜE, encargo "la ruta pública de una página puede ser bilingüe") UNA VEZ que `raw` ya se
 * sabe una declaración con forma válida (`readPageDeclaration` ya exigió un `pathField` de texto
 * no vacío; `raw === undefined` — clave ausente, o presente con forma inválida, ya avisado por
 * `readKey` — ⇒ `null` sin warning nuevo, igual que el resto de capacidades opt-in).
 *
 * `pathField` prueba DOS resoluciones, EN ESTE ORDEN y nunca al revés (es la regla que hace esto
 * ADITIVO, ver la cabecera de `ResolvedPageConfig`):
 * 1. Columna FÍSICA `text` de este tipo — el caso de siempre. Si resuelve, listo: mismo camino,
 *    mismo resultado, mismo warning que antes de este encargo, byte a byte.
 * 2. Solo si (1) no resolvió: campo LÓGICO de `localization.fields` (bilingüe) cuyas columnas
 *    físicas, TODAS, sean `text` real de este tipo — `resolveLocalization` ya garantiza que todas
 *    comparten `schema.type` entre sí, pero no que ese tipo compartido sea `text` (podría ser un
 *    grupo traducible de `number`, por ejemplo), así que aquí SÍ hace falta comprobarlo.
 *
 * Si NINGUNA de las dos resuelve, `page` ENTERA cae a `null` (`page-invalid`, mismo criterio "todo
 * o nada" que las tres piezas de `resolveBlocks`) — sin ruta pública no hay página que servir, así
 * que no hay "página a medias" posible aquí.
 *
 * La unicidad (§4b de la tarea) la impone PocketBase, no Vega: cada columna física implicada
 * (una si es física, una por idioma si es lógica) aporta su `Field.unique` a `pathFieldUnique`
 * (`true` solo si TODAS lo son) y dispara su PROPIO `page-path-not-unique` si no lo es — ninguna
 * invalida la capacidad, la colección sigue siendo de páginas.
 *
 * `layoutField` (opcional, NUNCA bilingüe — ver `ResolvedPageConfig.layoutField`) se resuelve
 * DESPUÉS y de forma independiente: una declaración inválida solo lo deja en `null` con su propio
 * `page-layout-field-invalid`, nunca toca `pathField`.
 *
 * Un tipo de SOLO LECTURA (vista) se descarta ANTES que nada (`pageOnReadonly`, mismo criterio que
 * `singleton` sobre una vista): no es solo que no se pueda editar, es que una vista tampoco puede
 * tener índices, así que llegar hasta la comprobación de unicidad emitiría `page-path-not-unique`
 * y mandaría al usuario a crear un índice único que en una vista no puede existir. El orden de
 * estas dos comprobaciones ES la diferencia entre avisar de la causa y avisar de un síntoma.
 */
export function resolvePage(
	type: ContentType,
	raw: RawPageDeclaration | undefined,
	localization: ResolvedLocalization | null,
	warnings: ModelWarning[]
): ResolvedPageConfig | null {
	if (raw === undefined) return null;

	if (type.readonly) {
		warnings.push(pageOnReadonly(type.name));
		return null;
	}

	// 1. Columna física (el caso de siempre, EXACTAMENTE igual que antes de la ruta bilingüe).
	const pathFieldSchema = type.fields.find((f) => f.name === raw.pathFieldRaw);
	if (pathFieldSchema && pathFieldSchema.type === 'text') {
		const pathFieldUnique = pathFieldSchema.unique;
		if (!pathFieldUnique) warnings.push(pagePathNotUnique(type.name, raw.pathFieldRaw));
		const layoutField = resolvePageLayoutField(type, raw.layoutFieldRaw, warnings);
		return { pathField: raw.pathFieldRaw, pathFieldUnique, layoutField, localizedPath: null };
	}

	// 2. Campo lógico de localizedFields (bilingüe), SOLO si (1) no resolvió.
	const logical = localization?.fields.find((f) => f.name === raw.pathFieldRaw) ?? null;
	if (logical) {
		const physicalByLocale = logical.fields;
		const columnsAreText = localization!.locales.every((locale) => {
			const physicalField = type.fields.find((f) => f.name === physicalByLocale[locale.id]);
			return physicalField?.type === 'text';
		});
		if (columnsAreText) {
			let pathFieldUnique = true;
			for (const locale of localization!.locales) {
				const physicalName = physicalByLocale[locale.id];
				const physicalField = type.fields.find((f) => f.name === physicalName)!;
				if (!physicalField.unique) {
					pathFieldUnique = false;
					warnings.push(pagePathNotUnique(type.name, physicalName));
				}
			}
			const layoutField = resolvePageLayoutField(type, raw.layoutFieldRaw, warnings);
			return {
				pathField: raw.pathFieldRaw,
				pathFieldUnique,
				layoutField,
				localizedPath: {
					defaultLocale: localization!.defaultLocale,
					fields: { ...physicalByLocale }
				}
			};
		}
	}

	// Ni física ni lógica: sin ruta pública no hay página que servir.
	warnings.push(pageInvalid(type.name, raw.pathFieldRaw));
	return null;
}

/**
 * Resuelve `page.layoutField` (§ `ResolvedPageConfig.layoutField`): campo `text` real de ESTE
 * tipo, o `null` si la clave no se declaró (opt-in, sin warning) o no resuelve (`page-layout-
 * field-invalid`, SIN afectar a `pathField` — ver la cabecera de `resolvePage`).
 */
function resolvePageLayoutField(
	type: ContentType,
	layoutFieldRaw: JsonValue | undefined,
	warnings: ModelWarning[]
): string | null {
	if (layoutFieldRaw === undefined) return null;

	if (typeof layoutFieldRaw === 'string' && layoutFieldRaw.length > 0) {
		const field = type.fields.find((f) => f.name === layoutFieldRaw);
		if (field && field.type === 'text') return layoutFieldRaw;
	}

	warnings.push(pageLayoutFieldInvalid(type.name));
	return null;
}

// ————— Vocabulario de plantillas de página (layouts, RAÍZ, tarea p1 `1dc63001`) —————

/**
 * Patrón de la clave de un layout (`layouts.<l>`): MISMO patrón que `BLOCK_TYPE_NAME_PATTERN`
 * (minúsculas/dígitos/guiones, empezando por letra) y por el MISMO motivo — viaja tal cual al
 * nombre de plantilla Astro. Constante PROPIA en vez de reusar la de `blockTypes`: son dos
 * vocabularios de la raíz conceptualmente independientes (un sitio puede añadir un tipo de
 * bloque sin tocar sus plantillas, y viceversa), aunque compartan la misma forma de clave.
 */
const LAYOUT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Resuelve `layouts` (RAÍZ del manifiesto, § `ContentModel.layouts`): un layout por clave, en
 * ORDEN de declaración del manifiesto (mismo criterio que `resolveBlockTypes`: es el orden en que
 * la UI listaría las plantillas disponibles, no un efecto secundario de cómo JS itera un objeto).
 * Un layout que no sobrevive `resolveLayout` simplemente no aparece en el resultado
 * (`layout-invalid`).
 */
export function resolveLayouts(
	doc: JsonObject,
	knownIcons: readonly string[] | undefined,
	warnings: ModelWarning[]
): ResolvedLayout[] {
	const layoutsRaw = readKey(
		doc,
		'layouts',
		asJsonObject,
		'/layouts',
		'layouts no es un objeto; se ignora.',
		warnings
	);
	if (!layoutsRaw) return [];

	const result: ResolvedLayout[] = [];
	for (const [name, rawValue] of Object.entries(layoutsRaw)) {
		const resolved = resolveLayout(name, rawValue, knownIcons, warnings);
		if (resolved) result.push(resolved);
	}
	return result;
}

/**
 * Resuelve un layout (§ `ResolvedLayout`). Tres comprobaciones EXCLUYENTES, la primera que falla
 * descarta el layout entero de inmediato (mismo criterio "un solo síntoma" que `resolveBlockType`):
 * patrón de la clave → forma objeto → `label`. `icon` es la ÚNICA pieza que NO puede tumbar el
 * layout (opcional, mismo criterio que `icon` de una colección/tipo de bloque): una forma
 * inválida o fuera de `knownIcons` solo lo deja en `null`.
 */
function resolveLayout(
	name: string,
	rawValue: JsonValue,
	knownIcons: readonly string[] | undefined,
	warnings: ModelWarning[]
): ResolvedLayout | null {
	if (!LAYOUT_NAME_PATTERN.test(name)) {
		warnings.push(layoutInvalid(name, 'name'));
		return null;
	}

	const obj = asJsonObject(rawValue);
	if (!obj) {
		warnings.push(layoutInvalid(name, 'shape'));
		return null;
	}

	// `label`: a mano (sin `readKey`) a propósito, mismo motivo que `resolveBlockType`: cualquier
	// forma inválida descarta el layout ENTERO con el mismo `layout-invalid`, así que un
	// `manifest-invalid-key` adicional por el mismo problema solo sería ruido.
	const rawLabel = obj.label;
	const label =
		typeof rawLabel === 'string' && rawLabel.length >= 1 && rawLabel.length <= 60
			? rawLabel
			: undefined;
	if (label === undefined) {
		warnings.push(layoutInvalid(name, 'label'));
		return null;
	}

	const iconCandidate = readKey(
		obj,
		'icon',
		readString(1, Infinity),
		`/layouts/${name}/icon`,
		`icon de layouts.${name} no es un texto no vacío; se ignora.`,
		warnings
	);
	let icon: string | null = null;
	if (iconCandidate !== undefined) {
		if (knownIcons && !knownIcons.includes(iconCandidate)) {
			warnings.push(layoutIconUnknown(name, iconCandidate));
		} else {
			icon = iconCandidate;
		}
	}

	return { name, label, icon };
}
