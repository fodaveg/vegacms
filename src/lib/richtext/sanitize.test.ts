// @vitest-environment jsdom
/**
 * Suite de `sanitize.ts` (D-P5.6/L-P5.8): HTML hostil → limpio, contenido legítimo → intacto.
 * DOMPurify necesita un `window` real (o de jsdom) para construirse — de ahí el entorno jsdom de
 * este fichero (único del repo que lo necesita; el resto de tests corren en `node`, ver
 * `vite.config.ts`).
 */
import { describe, expect, test } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml — HTML hostil', () => {
	test('<script> se elimina entero (etiqueta y contenido)', () => {
		expect(sanitizeHtml('<p>hola</p><script>alert(1)</script>')).toBe('<p>hola</p>');
	});

	test('<img onerror=...> pierde el handler pero conserva src/alt', () => {
		const out = sanitizeHtml('<img src="x.png" alt="x" onerror="alert(1)">');
		expect(out).not.toContain('onerror');
		expect(out).toContain('src="x.png"');
		expect(out).toContain('alt="x"');
	});

	test('<a href="javascript:...​"> pierde el href peligroso', () => {
		const out = sanitizeHtml('<a href="javascript:alert(1)">clic</a>');
		expect(out).not.toContain('javascript:');
	});

	test('<iframe> desaparece', () => {
		const out = sanitizeHtml(
			'<p>antes</p><iframe src="https://evil.example"></iframe><p>después</p>'
		);
		expect(out).not.toContain('iframe');
		expect(out).toContain('antes');
		expect(out).toContain('después');
	});

	test('<span style="..."> se desenvuelve: el texto sobrevive, la etiqueta y el estilo no', () => {
		const out = sanitizeHtml('<p><span style="color:red">rojo</span></p>');
		expect(out).toBe('<p>rojo</p>');
	});

	test('un atributo `on*` en una etiqueta permitida se descarta', () => {
		const out = sanitizeHtml('<p onclick="alert(1)">hola</p>');
		expect(out).toBe('<p>hola</p>');
	});

	test('un `href` colado en una etiqueta que no es <a> se descarta (allowlist POR etiqueta)', () => {
		const out = sanitizeHtml('<p href="https://example.com">hola</p>');
		expect(out).toBe('<p>hola</p>');
	});
});

describe('sanitizeHtml — contenido legítimo preservado', () => {
	test('encabezados h1-h4, párrafos, marcas inline', () => {
		const html =
			'<h1>Título</h1><h4>Subtítulo</h4><p><strong>negrita</strong> <em>cursiva</em> <s>tachado</s> <code>código</code></p>';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('listas anidadas, blockquote, hr, br', () => {
		const html =
			'<ul><li>uno<ol><li>anidado</li></ol></li></ul><blockquote>cita</blockquote><hr><br>';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('bloque de código preformateado', () => {
		const html = '<pre><code>const x = 1;</code></pre>';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('enlace con href/rel/target intactos', () => {
		const html =
			'<a href="https://example.com" rel="noopener noreferrer" target="_blank">enlace</a>';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('imagen con src/alt intactos', () => {
		const html = '<img src="https://example.com/foto.png" alt="una foto">';
		expect(sanitizeHtml(html)).toBe(html);
	});
});

/**
 * Endurecimientos añadidos tras la auditoría de seguridad de F5-d (ver cabecera del módulo):
 * `data:` en `img[src]` (DOMPurify lo permite por defecto) y `a[target]` sin
 * `rel="noopener noreferrer"` (reverse tabnabbing) — ninguno de los dos es HTML "obviamente
 * hostil" (no ejecuta nada por sí mismo), por eso tienen su propio bloque, distinto del de arriba.
 */
describe('sanitizeHtml — endurecimientos tras auditoría de seguridad', () => {
	test('`data:` en img src se descarta (aunque `src` esté en la allowlist de <img>)', () => {
		const out = sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="x">');
		expect(out).not.toContain('data:');
		expect(out).toContain('alt="x"');
	});

	test('`data:` en img src con mayúsculas/espacios también se descarta', () => {
		const out = sanitizeHtml('<img src="  DATA:text/html,<script>1</script>" alt="x">');
		expect(out).not.toContain('data:');
		expect(out.toLowerCase()).not.toContain('data:');
	});

	test('img con src http/https normal sobrevive intacto', () => {
		const html = '<img src="https://example.com/x.png" alt="x">';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('a[target] SIN rel se fuerza a rel="noopener noreferrer"', () => {
		const out = sanitizeHtml('<a href="https://example.com" target="_blank">clic</a>');
		expect(out).toBe(
			'<a href="https://example.com" target="_blank" rel="noopener noreferrer">clic</a>'
		);
	});

	test('a[target] con un rel PARCIAL conserva ese token y añade los que faltan', () => {
		const out = sanitizeHtml(
			'<a href="https://example.com" target="_blank" rel="nofollow">clic</a>'
		);
		expect(out).toContain('rel="nofollow noopener noreferrer"');
	});

	test('a[target] que YA trae ambos tokens no los duplica', () => {
		const html = '<a href="https://example.com" target="_blank" rel="noopener noreferrer">clic</a>';
		expect(sanitizeHtml(html)).toBe(html);
	});

	test('a SIN target no se toca (no se le inventa un rel)', () => {
		const html = '<a href="https://example.com">clic</a>';
		expect(sanitizeHtml(html)).toBe(html);
	});
});

/**
 * Vectores mXSS y "raros" añadidos como REGRESIÓN por la auditoría de seguridad de F5-d: fijan el
 * comportamiento ACTUAL (ya correcto con la allowlist + los dos hooks de arriba) para que una
 * subida de versión de DOMPurify que lo rompiera se detecte aquí, no en producción. Los mXSS
 * clásicos (`<svg><style>`, `<mglyph><style>`, `<noscript>`) explotan diferencias entre cómo un
 * parser DOM y un serializador interpretan el mismo árbol; DOMPurify los neutraliza de fábrica.
 */
describe('sanitizeHtml — regresión mXSS / vectores adicionales (auditoría de seguridad)', () => {
	test('mXSS clásico: <svg><style>...<image href=... onerror=...> queda vacío', () => {
		const out = sanitizeHtml(
			'<svg><style>{}</style><a href="/x"><image href="x" onerror="alert(1)"//></a></svg>'
		);
		expect(out).not.toContain('onerror');
		expect(out).not.toContain('<svg');
		expect(out).not.toContain('<image');
	});

	test('mXSS clásico: <math><mtext><table><mglyph><style>...<img onerror=...> queda vacío', () => {
		const out = sanitizeHtml(
			'<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>'
		);
		expect(out).not.toContain('onerror');
		expect(out).not.toContain('<img');
	});

	test('<noscript> con atributo que "escapa" hacia HTML hostil: se desenvuelve sin ejecutar nada', () => {
		const out = sanitizeHtml(
			'<noscript><p title="</noscript><img src=x onerror=alert(1)>">hola</p></noscript>'
		);
		expect(out).not.toContain('onerror');
		expect(out).not.toContain('noscript');
		expect(out).toContain('hola');
	});

	test('`javascript:` ofuscado con entidad decimal en href se descarta', () => {
		const out = sanitizeHtml('<a href="java&#115;cript:alert(1)">x</a>');
		expect(out.toLowerCase()).not.toContain('javascript:');
	});

	test('`javascript:` ofuscado con entidad hexadecimal en href se descarta', () => {
		const out = sanitizeHtml('<a href="jav&#x61;script:alert(1)">x</a>');
		expect(out.toLowerCase()).not.toContain('javascript:');
	});

	test('`javascript:` ofuscado con tab (entidad) en href se descarta', () => {
		const out = sanitizeHtml('<a href="java&#9;script:alert(1)">x</a>');
		expect(out.toLowerCase()).not.toContain('javascript:');
	});

	test('`srcset` (fuera de la allowlist de <img>) se descarta', () => {
		const out = sanitizeHtml(
			'<img src="https://example.com/a.png" srcset="https://evil.example/x.png 1x">'
		);
		expect(out).not.toContain('srcset');
		expect(out).toContain('src="https://example.com/a.png"');
	});

	test('`formaction` (fuera de toda allowlist) se descarta', () => {
		const out = sanitizeHtml('<p formaction="javascript:alert(1)">x</p>');
		expect(out).toBe('<p>x</p>');
	});

	test('<base href> (fuera de la allowlist) desaparece; el resto del documento sobrevive', () => {
		const out = sanitizeHtml('<base href="https://evil.example/"><a href="/x">x</a>');
		expect(out).not.toContain('<base');
		expect(out).toContain('<a href="/x">x</a>');
	});
});
