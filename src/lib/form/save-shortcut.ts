/**
 * Etiqueta del atajo de guardar que pinta el botón «Guardar»: «⌘S» en Mac/iOS y «Ctrl S» en el
 * resto. El atajo en sí responde a las dos teclas (⌘S y Ctrl+S, ver cabecera de `RecordForm`);
 * esto solo decide qué se anuncia.
 */

/** ¿Es una plataforma Apple (la del ⌘)? Casa por `platform` (`MacIntel`, `iPhone`, `iPad`…). */
export function isApplePlatform(platform: string): boolean {
	return /^(mac|iphone|ipad|ipod)/i.test(platform.trim());
}

/** «⌘S» para una plataforma Apple, «Ctrl S» para cualquier otra (también si se desconoce). */
export function saveShortcutLabel(platform: string): string {
	return isApplePlatform(platform) ? '⌘S' : 'Ctrl S';
}

/** Plataforma del navegador actual (`''` sin `navigator`, p. ej. en SSR/tests de nodo). */
export function currentPlatform(): string {
	if (typeof navigator === 'undefined') return '';
	const withData = navigator as Navigator & { userAgentData?: { platform?: string } };
	return withData.userAgentData?.platform || navigator.platform || '';
}
