import type { InlineAppearance } from './inline-session';

/**
 * Colores de la pista de edición en línea que Vega manda al sitio (`editField.appearance`,
 * §"Inline editing" del contrato). El sitio no ve los tokens de Vega y su CSS no puede leerlos:
 * se resuelven AQUÍ, en el momento de entrar a editar, contra el tema que el autor tiene puesto.
 *
 * Se resuelven con una sonda (`color` = `var(--v-ol-inline)`, fondo = ese color al 14 %) y no leyendo la
 * propiedad personalizada: el valor de una custom property puede ser `var(--accent-text)` o un
 * `color-mix()`, que el sitio no sabría interpretar; el color COMPUTADO de la sonda siempre sale
 * como un color literal (`rgb(…)`, `color(srgb …)`), que es lo único que el sitio acepta.
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
	// modo oscuro) y el sitio no cambia de tema con el admin. Sobre la página va el mismo naranja
	// translúcido de la lámina (`.inl`, 12–16 %), que funciona sobre cualquier fondo del sitio.
	probe.style.backgroundColor = 'color-mix(in srgb, var(--v-ol-inline) 14%, transparent)';
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
