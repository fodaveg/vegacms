/**
 * Edición pura de `tags` (Fase P6·6b): lista LIBRE de strings (campo `json`, D-P6.1 §3) — a
 * diferencia de `select`/`chips` (F5-b), aquí NO hay `options` cerradas, así que no se reutiliza
 * `toggleValue` de `select-value.ts` (esa función alterna presencia en un conjunto de opciones
 * FIJAS; esto añade/quita valores arbitrarios que el usuario teclea). `MediaDetail.svelte` es el
 * único consumidor: cablea DOM↔estas funciones, igual que `file-value.ts`↔`FileInput.svelte`.
 */

/** Normaliza una entrada de texto a un tag válido: recorta espacios; `''` tras recortar = no es
 *  un tag (el llamador no debe añadirlo). NUNCA transforma mayúsculas/minúsculas — el usuario
 *  decide la grafía de su propia etiqueta. */
export function normalizeTagInput(raw: string): string {
	return raw.trim();
}

/** Añade `raw` a `tags` si, tras normalizar, no es vacío y no está YA presente (comparación
 *  exacta, sin normalizar mayúsculas: "Foto" y "foto" son tags distintos a propósito — el campo
 *  es texto libre, no un `select`). Nunca muta `tags`; `raw` vacío o duplicado es un no-op (misma
 *  lista, nueva referencia solo si de verdad cambia algo). */
export function addTag(tags: string[], raw: string): string[] {
	const tag = normalizeTagInput(raw);
	if (tag === '' || tags.includes(tag)) return tags;
	return [...tags, tag];
}

/** Quita `tag` de `tags` (comparación exacta). Nunca muta `tags`. */
export function removeTag(tags: string[], tag: string): string[] {
	return tags.filter((existing) => existing !== tag);
}

/** `true` si `a`/`b` contienen los MISMOS tags en el MISMO orden — el orden importa (es la lista
 *  tal cual la ve el usuario, no un conjunto), así que un reordenamiento SÍ cuenta como cambio
 *  para el guard de "cambios sin guardar" de `MediaDetail`. */
export function tagsEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((tag, i) => tag === b[i]);
}
