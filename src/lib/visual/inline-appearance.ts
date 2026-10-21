import type { InlineAppearance, InlineAppearanceMessage } from './inline-session';

/**
 * Colores de la pista de edición en línea que Vega manda al sitio (`editField.appearance`,
 * §"Inline editing" del contrato). El sitio no ve los tokens de Vega y su CSS no puede leerlos:
 * se resuelven AQUÍ, en el momento de entrar a editar, contra el tema que el autor tiene puesto.
 *
 * Se resuelven con una sonda (`color` = `var(--v-ol-inline)`, fondo = `var(--v-ol-inline-tint)`) y
 * no leyendo la propiedad personalizada: el valor de una custom property puede ser
 * `var(--accent-text)` o un `color-mix()`, que el sitio no sabría interpretar; el color COMPUTADO de
 * la sonda siempre sale como un color literal (`rgb(…)`, `color(srgb …)`), que es lo único que el
 * sitio acepta.
 *
 * `null` cuando el token no existe (fondo transparente o el mismo color que el contorno): el sitio
 * usa entonces su valor por defecto documentado, nunca un color inventado aquí.
 */
export function readInlineAppearance(host: Element | null | undefined): InlineAppearance | null {
	if (!host || typeof getComputedStyle !== 'function') return null;
	const probe = host.ownerDocument.createElement('span');
	probe.setAttribute('aria-hidden', 'true');
	probe.style.position = 'absolute';
	probe.style.visibility = 'hidden';
	probe.style.pointerEvents = 'none';
	probe.style.color = 'var(--v-ol-inline)';
	// El relleno NO es `--v-ol-inline-soft`: ese token se mezcla con el papel de VEGA (opaco, oscuro en
	// modo oscuro) y el sitio no cambia de tema con el admin. Sobre la página va el tinte
	// translúcido (`--v-ol-inline-tint`, el `.inl` de la lámina), que funciona sobre cualquier fondo.
	probe.style.backgroundColor = 'var(--v-ol-inline-tint)';
	host.appendChild(probe);
	try {
		const style = getComputedStyle(probe);
		const outline = style.color.trim();
		const soft = style.backgroundColor.trim();
		if (!outline || !soft || isTransparent(soft) || outline === soft) return null;
		return { outline, soft };
	} finally {
		probe.remove();
	}
}

function isTransparent(color: string): boolean {
	return color === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(color);
}

/**
 * Geometría de la pista sobre el lienzo (lámina `.inl-hint`: `margin: 10px 0 4px`, alto 28). El
 * hueco ENCIMA va en píxeles de la página, como el contorno del sitio (desplazado 4 px, grosor 2);
 * el alto de la pista y el hueco de debajo, en píxeles de pantalla, porque la pista conserva su
 * tamaño físico con cualquier zoom (`--menu-scale` en `VisualOverlay`).
 */
export const INLINE_HINT_GEOMETRY = { gap: 10, height: 28, after: 6 } as const;

/**
 * Píxeles de la PÁGINA que el sitio deja libres bajo el texto que se escribe
 * (`editField.appearance.hintSpace`) para que la pista empuje el contenido siguiente en vez de
 * taparlo, como en la lámina, donde la pista va en el flujo de la página. Entero en 0–240, el
 * rango que acepta el sitio.
 */
export function inlineHintSpace(zoom: number): number {
	const scale = Number.isFinite(zoom) && zoom > 0 ? 1 / zoom : 1;
	const { gap, height, after } = INLINE_HINT_GEOMETRY;
	return Math.min(240, Math.ceil(gap + (height + after) * scale));
}

/** `editField.appearance` completo: los colores del tema cuando los hay y siempre el hueco. */
export function inlineAppearanceMessage(
	host: Element | null | undefined,
	zoom: number
): InlineAppearanceMessage {
	return { ...(readInlineAppearance(host) ?? {}), hintSpace: inlineHintSpace(zoom) };
}
