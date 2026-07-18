/**
 * `editor.ts` (F5-d del contrato P5, D-P5.7 "extensiones TipTap v1"): la configuración de
 * extensiones TipTap COMPARTIDA por los widgets `richtext` (`Richtext.svelte`) y `markdown`
 * (`Markdown.svelte`) — un solo lugar que ambos importan, para que nunca diverjan.
 *
 * Acotada a la allowlist de saneado (`sanitize.ts`, D-P5.6): `StarterKit` trae de más para
 * nuestro vocabulario v1 (`underline`, y su propio `link` interno) — se desactivan aquí para que
 * ni el editor los produzca ni haga falta que `DOMPurify` los limpie después. `heading` se acota
 * a los niveles 1-4 (la allowlist no tiene `h5`/`h6`). `link`/`image` SÍ entran (D-P5.7): `Link`
 * se configura APARTE de `StarterKit` (con `openOnClick: false` — clicar un enlace mientras se
 * edita no debe navegar fuera del editor) para tener control propio de sus opciones; `Image`
 * v1 es solo "por URL" (sin subida/recorte, eso es F5-e/`file`). SIN tablas ni listas de tareas:
 * `StarterKit` v3 no las incluye por defecto, así que no hace falta desactivarlas explícitamente.
 *
 * **MUST FIX de la auditoría de seguridad (F5-d)**: `@tiptap/extension-link`/`-image` validan el
 * esquema del `href`/`src` en su path HTML (`renderHTML`/`parseHTML`, vía su propio
 * `isAllowedUri`) pero NO en su path Markdown (`parseMarkdown`/`renderMarkdown`, que leen/escriben
 * `attrs.href`/`attrs.src` en crudo) — un `[x](javascript:alert(1))` sobrevivía tal cual el
 * round-trip MD↔editor y llegaba a `onChange`/al backend (XSS almacenado para cualquier consumidor
 * del Markdown). `SafeLink`/`SafeImage` (abajo) parchean AMBOS extremos (parse Y render) con
 * `.extend()` — el mecanismo oficial de TipTap para sobrescribir un campo de config heredado, sin
 * tocar el paquete — para enrutar `href`/`src` por `safeUri()` (`safe-uri.ts`, allowlist
 * http/https/mailto). El path HTML sigue intacto (su propio `isAllowedUri` + `sanitizeHtml`/
 * DOMPurify de `richtext` ya lo cubrían).
 *
 * Módulo DOM-agnóstico (construir estas extensiones no toca `window`/`document`: solo objetos
 * ProseMirror/TipTap en memoria) — pero solo lo importan los widgets vía `import()` DINÁMICO
 * dentro de `onMount` (ver su cabecera): el chunk de TipTap pesa ~145 KB gzip y no debe entrar en
 * el bundle de rutas que no editan richtext/markdown.
 */
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import type {
	AnyExtension,
	JSONContent,
	MarkdownParseHelpers,
	MarkdownParseResult,
	MarkdownRendererHelpers,
	MarkdownToken
} from '@tiptap/core';
import { safeUri } from './safe-uri';

/** `Link` con su `parseMarkdown`/`renderMarkdown` reescritos para pasar `href` por `safeUri()`
 *  (ver MUST FIX de la cabecera). Misma forma que el `parseMarkdown`/`renderMarkdown` originales
 *  de `@tiptap/extension-link` — el ÚNICO cambio es envolver `href` con `safeUri`. */
const SafeLink = Link.extend({
	parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
		return helpers.applyMark('link', helpers.parseInline(token.tokens ?? []), {
			href: safeUri(token.href as string | undefined),
			title: (token.title as string | undefined) ?? null
		});
	},
	renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
		const href = safeUri(node.attrs?.href as string | undefined);
		const title = (node.attrs?.title as string | undefined) ?? '';
		const text = helpers.renderChildren(node);
		return title ? `[${text}](${href} "${title}")` : `[${text}](${href})`;
	}
});

/** `Image` con su `parseMarkdown`/`renderMarkdown` reescritos para pasar `src` por `safeUri()`
 *  (mismo MUST FIX; `Image` tiene el mismo hueco que `Link` en su path Markdown). */
const SafeImage = Image.extend({
	parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
		return helpers.createNode('image', {
			src: safeUri(token.href as string | undefined),
			title: (token.title as string | undefined) ?? null,
			alt: (token.text as string | undefined) ?? null
		});
	},
	renderMarkdown(node: JSONContent): string {
		const src = safeUri(node.attrs?.src as string | undefined);
		const alt = (node.attrs?.alt as string | undefined) ?? '';
		const title = (node.attrs?.title as string | undefined) ?? '';
		return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
	}
});

/** Extensiones base (D-P5.7), sin el añadido `Markdown` (ese lo suma `markdown.ts` para el
 *  widget `markdown` — `richtext` no lo necesita, edita/persiste HTML, no Markdown). */
export function createExtensions(): AnyExtension[] {
	return [
		StarterKit.configure({
			// `link` propio de StarterKit, desactivado: se usa la extensión `Link` de abajo, con
			// sus propias opciones (mismo patrón que documenta TipTap para personalizar el link).
			link: false,
			// Fuera de la allowlist D-P5.6 (sin `<u>`): mejor no ofrecerlo que dejar que DOMPurify
			// lo tire después silenciosamente.
			underline: false,
			// La allowlist D-P5.6 solo cubre h1-h4.
			heading: { levels: [1, 2, 3, 4] }
		}),
		SafeLink.configure({
			openOnClick: false,
			HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
		}),
		SafeImage
	];
}
