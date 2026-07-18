/**
 * `sanitize.ts` (F5-d del contrato P5, D-P5.6/L-P5.8 "richtext seguro"): la allowlist ÚNICA y
 * versionada de HTML permitido en un campo `richtext` (`field.subtype==='html'`), y la función
 * `sanitizeHtml` que la aplica vía DOMPurify.
 *
 * La allowlist es EXACTA (D-P5.6, no "razonable"): `p, h1, h2, h3, h4, strong, em, s, code, pre,
 * blockquote, ul, ol, li, a[href rel target], img[src alt], hr, br`. Cualquier otra etiqueta
 * (`script, style, iframe, span`…) se elimina — DOMPurify, al no estar en `ALLOWED_TAGS`, la
 * "desenvuelve" (mantiene el texto/hijos, descarta la etiqueta), salvo las de contenido peligroso
 * (`script`/`style`), que DOMPurify borra ENTERAS por defecto (etiqueta + contenido). Cualquier
 * atributo `on*` (handlers) se descarta siempre por defecto de DOMPurify; los esquemas peligrosos
 * (`javascript:`, `data:` en `href`/`src`) los bloquea su propio validador de URIs.
 *
 * Los atributos SÍ están acotados por etiqueta (no solo por la lista global de DOMPurify): un
 * `<p href="...">` inyectado a mano perdería igualmente ese `href`, aunque `href` esté en la lista
 * global (la necesita `<a>`). Se implementa con el hook `uponSanitizeAttribute`, la única forma
 * que ofrece DOMPurify de decidir "por etiqueta" — su `ALLOWED_ATTR` es global, no por-tag.
 *
 * Llamado en DOS puntos del widget `Richtext.svelte` (defensa en profundidad, D-P5.6 "ambos"):
 * al leer/montar el HTML entrante en el editor, y de nuevo dentro de `onUpdate` antes de invocar
 * `onChange` (ese valor es justo lo que acaba viajando al backend al guardar) — nunca se confía
 * en que el HTML ya almacenado esté limpio.
 *
 * **Endurecimientos tras auditoría de seguridad (F5-d)**:
 * - `data:` en `img[src]`: DOMPurify lo permite por defecto (a diferencia de `href`, donde SÍ lo
 *   bloquea su propio validador de URIs — comprobado). Un `data:` en `src` es inerte para XSS
 *   directo (el navegador no ejecuta un SVG-vía-`<img>` como documento), pero contradice la
 *   intención de la allowlist ("solo imágenes por URL", D-P5.7) y abre la puerta a fugas de
 *   tamaño/fingerprinting o a que un futuro cambio de `renderHTML` lo convierta en explotable — se
 *   rechaza explícitamente en `uponSanitizeAttribute`.
 * - `a[target]` sin `rel="noopener noreferrer"` (reverse tabnabbing, `window.opener` de la pestaña
 *   nueva puede navegar la ORIGINAL): el editor ya inyecta `rel`/`target` al crear un enlace
 *   (`editor.ts`), pero el saneado debe cubrir HTML que entre por OTRAS vías (paste, API, un
 *   valor ya persistido de antes de este endurecimiento) — `afterSanitizeAttributes` fuerza los
 *   tokens que falten, preservando cualquier otro token de `rel` ya presente (p.ej. `nofollow`).
 */
import DOMPurify from 'dompurify';

/** Vocabulario CERRADO de etiquetas (D-P5.6), en el orden en que lo enuncia el contrato. */
export const ALLOWED_TAGS = [
	'p',
	'h1',
	'h2',
	'h3',
	'h4',
	'strong',
	'em',
	's',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'a',
	'img',
	'hr',
	'br'
] as const;

type AllowedTag = (typeof ALLOWED_TAGS)[number];

/** Atributos permitidos, ÚNICAMENTE en la etiqueta que los declara (D-P5.6). Cualquier etiqueta
 *  ausente de esta tabla (la mayoría) no admite NINGÚN atributo. */
const ALLOWED_ATTR_BY_TAG: Partial<Record<AllowedTag, readonly string[]>> = {
	a: ['href', 'rel', 'target'],
	img: ['src', 'alt']
};

/** Lista global que exige la propia API de DOMPurify (unión de todas las tablas de arriba); el
 *  hook de abajo es quien de verdad restringe CADA atributo a su etiqueta. */
const ALLOWED_ATTR = Array.from(new Set(Object.values(ALLOWED_ATTR_BY_TAG).flat()));

/** Tokens de `rel` exigidos en todo `a[target]` (reverse tabnabbing). */
const REQUIRED_REL_TOKENS = ['noopener', 'noreferrer'] as const;

let hookInstalled = false;

/** Instala los hooks de saneado una única vez (module-level, `DOMPurify.addHook` es global a la
 *  instancia importada): llamadas repetidas a `sanitizeHtml` no los duplican. */
function ensureHooks(): void {
	if (hookInstalled) return;

	DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
		const tag = node.tagName?.toLowerCase() as AllowedTag | undefined;
		const allowed = tag ? ALLOWED_ATTR_BY_TAG[tag] : undefined;
		if (!allowed || !allowed.includes(data.attrName)) {
			data.keepAttr = false;
			return;
		}
		// Endurecimiento: `data:` en `img[src]` (ver cabecera) — DOMPurify lo permite por defecto,
		// aquí se rechaza explícitamente pese a que la etiqueta/atributo SÍ están en la allowlist.
		if (tag === 'img' && data.attrName === 'src' && /^\s*data:/i.test(data.attrValue)) {
			data.keepAttr = false;
		}
	});

	// Endurecimiento: `a[target]` sin `rel="noopener noreferrer"` (ver cabecera) — corre DESPUÉS
	// de sanear atributos, así que puede fijar `rel` sin que el propio hook de arriba lo descarte
	// (`rel` ya está en la allowlist de `<a>`, esto solo añade los tokens que falten).
	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName !== 'A' || !node.hasAttribute('target')) return;
		const current = (node.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean);
		for (const token of REQUIRED_REL_TOKENS) {
			if (!current.includes(token)) current.push(token);
		}
		node.setAttribute('rel', current.join(' '));
	});

	hookInstalled = true;
}

/**
 * Sanea `html` contra la allowlist de D-P5.6. Entrada `''`/hostil da como resultado texto o
 * marcado limpio, nunca lanza (L11, "degradar sin crashear" — un HTML irrecuperable simplemente
 * queda vacío o reducido a su texto).
 */
export function sanitizeHtml(html: string): string {
	ensureHooks();
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [...ALLOWED_TAGS],
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false
	});
}
