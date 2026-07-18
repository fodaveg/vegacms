/**
 * `safe-uri.ts` (F5-d, hardening tras auditoría de seguridad — MUST FIX): allowlist de esquemas
 * de URI para el path Markdown de TipTap (D-P5.7/D-P5.8).
 *
 * `@tiptap/extension-link`/`@tiptap/extension-image` validan el esquema en su path HTML
 * (`renderHTML`/`parseHTML`, vía su propio `isAllowedUri`) — por eso `richtext` ya está protegido
 * ahí, y además pasa por `sanitizeHtml` (DOMPurify) como defensa en profundidad. Pero NO validan
 * nada en su path Markdown: `parseMarkdown`/`renderMarkdown` (ambas extensiones) leen/escriben
 * `attrs.href`/`attrs.src` en CRUDO. Un `[texto](javascript:alert(1))` sobrevivía tal cual el
 * round-trip MD↔editor y viajaba a `onChange`/al backend — XSS ALMACENADO para cualquier
 * consumidor aguas abajo de ese Markdown (el propio editor nunca lo ejecuta, pero el string
 * persistido sí es peligroso si algo lo renderiza después). `editor.ts` parchea `Link`/`Image`
 * con `.extend()` para enrutar su `parseMarkdown`/`renderMarkdown` a través de `safeUri`.
 */

/** Únicos esquemas permitidos en `href`/`src` del path Markdown (case-insensitive). */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * Caracteres de control ASCII (0x00-0x1F y 0x7F) + espacio en blanco: se despojan antes de buscar
 * el esquema, la ofuscación clásica `java\tscript:`/`jav\nascript:` que los navegadores toleran
 * dentro de un esquema. Construido con `String.fromCharCode` (nunca un escape `\u`/`\x` literal
 * en un regex del fuente) para evitar cualquier ambigüedad de codificación en el propio fichero.
 */
const CONTROL_AND_WHITESPACE = (() => {
	const chars: string[] = [];
	for (let code = 0; code <= 0x1f; code += 1) chars.push(String.fromCharCode(code));
	chars.push(String.fromCharCode(0x7f));
	return new Set(chars.concat([' ', '\t', '\n', '\r']));
})();

function stripControlAndWhitespace(input: string): string {
	let out = '';
	for (const ch of input) {
		if (!CONTROL_AND_WHITESPACE.has(ch)) out += ch;
	}
	return out;
}

/**
 * Decodifica entidades HTML numéricas (`&#115;`, `&#x73;`) — un esquema puede llegar ofuscado así
 * (p.ej. `java&#115;cript:`) incluso cuando `marked` NO las decodifica al extraer el token
 * (comprobado: `marked` deja el string literal `java&#115;cript:alert(1)` en `token.href`). Si
 * ese Markdown lo renderizara después un consumidor que SÍ decodifica entidades de atributo
 * (cualquier navegador), un esquema que aquí pareciera "sin scheme válido" en crudo redescubriría
 * `javascript:` tras decodificar — de ahí decodificar ANTES de comprobar el esquema.
 */
function decodeNumericEntities(input: string): string {
	return input.replace(/&#(x?)([0-9a-f]+);?/gi, (match, hex: string, digits: string) => {
		const codePoint = parseInt(digits, hex ? 16 : 10);
		return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
	});
}

/**
 * Sanea un `href`/`src` para el path Markdown. Devuelve el valor ORIGINAL (recortado de espacios
 * en los extremos) si:
 * - no tiene esquema explícito (ruta relativa `/foo`, ancla `#foo`, protocolo-relativo
 *   `//example.com`) — todas legítimas dentro de contenido editado, o
 * - su esquema (una vez decodificado y despojado de espacios/control internos) es `http:`,
 *   `https:` o `mailto:` (case-insensitive).
 *
 * Devuelve `''` en cualquier otro caso (`javascript:`, `data:`, `vbscript:`, esquemas ofuscados
 * con entidades/espacios, o cualquier otro no listado) — L11 del contrato ("degradar sin
 * crashear"): un enlace/imagen peligroso simplemente pierde su destino, nunca lanza.
 */
export function safeUri(raw: string | null | undefined): string {
	if (!raw) return '';
	const trimmed = raw.trim();
	if (trimmed === '') return '';

	const stripped = stripControlAndWhitespace(decodeNumericEntities(trimmed));

	const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(stripped);
	if (!schemeMatch) return trimmed;

	const scheme = `${schemeMatch[1].toLowerCase()}:`;
	return ALLOWED_SCHEMES.has(scheme) ? trimmed : '';
}
